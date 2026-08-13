package cn.mengstudystudio.app;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.parser.Parser;
import org.jsoup.select.Elements;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.IDN;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import fi.iki.elonen.NanoHTTPD;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.ResponseBody;

/**
 * Android-native implementation of StudyStudio's loopback search API.
 *
 * The desktop build keeps using the FastAPI/SearXNG service. The Android app
 * cannot host Docker or Playwright, so it exposes the same GET endpoints from
 * an in-process server backed by HTTPS search pages and on-device HTML parsing.
 */
public final class LocalSearchGateway extends NanoHTTPD {
    private static final String TAG = "StudyStudioSearch";
    private static final int PORT = 17890;
    private static final int MAX_PAGE_BYTES = 5 * 1024 * 1024;
    private static final Response.IStatus BAD_GATEWAY = new Response.IStatus() {
        @Override public int getRequestStatus() { return 502; }
        @Override public String getDescription() { return "502 Bad Gateway"; }
    };
    private static final long SEARCH_CACHE_MS = TimeUnit.MINUTES.toMillis(5);
    private static final long EXTRACT_CACHE_MS = TimeUnit.HOURS.toMillis(24);
    private static final Set<String> ALLOWED_ORIGINS = Collections.unmodifiableSet(
        new HashSet<>(Arrays.asList("http://localhost", "https://localhost", "capacitor://localhost"))
    );

    private static volatile LocalSearchGateway instance;

    private final OkHttpClient http;
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    private LocalSearchGateway(Context context) {
        super("127.0.0.1", PORT);
        http = new OkHttpClient.Builder()
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .callTimeout(35, TimeUnit.SECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            .build();
    }

    public static void ensureStarted(Context context) {
        if (instance != null && instance.isAlive()) return;
        synchronized (LocalSearchGateway.class) {
            if (instance != null && instance.isAlive()) return;
            LocalSearchGateway gateway = new LocalSearchGateway(context.getApplicationContext());
            try {
                gateway.start(SOCKET_READ_TIMEOUT, false);
                instance = gateway;
                Log.i(TAG, "Native search gateway listening on 127.0.0.1:" + PORT);
            } catch (IOException error) {
                Log.e(TAG, "Unable to start native search gateway", error);
            }
        }
    }

    @Override
    public Response serve(IHTTPSession session) {
        String origin = session.getHeaders().get("origin");
        if (origin != null && !ALLOWED_ORIGINS.contains(origin)) {
            return json(Response.Status.FORBIDDEN, error("该页面来源无权访问应用内搜索服务"), null);
        }
        if (Method.OPTIONS.equals(session.getMethod())) {
            Response response = newFixedLengthResponse(Response.Status.NO_CONTENT, MIME_PLAINTEXT, "");
            addCors(response, origin);
            response.addHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
            response.addHeader("Access-Control-Allow-Headers", "Content-Type");
            return response;
        }
        if (!Method.GET.equals(session.getMethod())) {
            return json(Response.Status.METHOD_NOT_ALLOWED, error("Android 应用内搜索 API 仅接受 GET 请求"), origin);
        }

        try {
            switch (session.getUri()) {
                case "/api/health":
                    return json(Response.Status.OK, health(), origin);
                case "/api/web/search":
                    return json(Response.Status.OK, search(required(session, "query", 500), limit(session, "max_results", 5, 10), false), origin);
                case "/api/web/images":
                    return json(Response.Status.OK, search(required(session, "query", 500), limit(session, "max_results", 6, 10), true), origin);
                case "/api/web/extract":
                    return json(Response.Status.OK, extract(required(session, "url", 4096), limit(session, "max_chars", 16_000, 40_000)), origin);
                default:
                    return json(Response.Status.NOT_FOUND, error("未找到该应用内 API"), origin);
            }
        } catch (BadRequest error) {
            return json(Response.Status.BAD_REQUEST, error(error.getMessage()), origin);
        } catch (UpstreamError error) {
            JSONObject body = error(error.getMessage());
            if (error.subject != null) put(body, error.subjectKey, error.subject);
            return json(BAD_GATEWAY, body, origin);
        } catch (Exception error) {
            Log.e(TAG, "Unhandled gateway error", error);
            return json(Response.Status.INTERNAL_ERROR, error("应用内搜索服务发生错误，请稍后重试"), origin);
        }
    }

    private JSONObject health() {
        JSONObject body = new JSONObject();
        put(body, "status", "ok");
        put(body, "gateway", true);
        put(body, "native_search", true);
        put(body, "searxng", false);
        put(body, "search_engine", "android-native");
        put(body, "browser_fallback", false);
        return body;
    }

    private JSONObject search(String query, int maximum, boolean images) throws UpstreamError {
        String kind = images ? "images" : "search";
        String key = kind + "\u0000" + query.toLowerCase(Locale.ROOT) + "\u0000" + maximum;
        JSONObject cached = cacheGet(key);
        if (cached != null) return cached;

        JSONObject result = images ? searchBingImages(query, maximum) : searchWeb(query, maximum);
        cachePut(key, result, SEARCH_CACHE_MS);
        return result;
    }

    private JSONObject searchWeb(String query, int maximum) throws UpstreamError {
        JSONArray results = new JSONArray();
        Set<String> seen = new HashSet<>();
        String backend = "bing";
        Exception bingFailure = null;
        try {
            HttpUrl url = new HttpUrl.Builder()
                .scheme("https").host("www.bing.com").addPathSegment("search")
                .addQueryParameter("q", query).addQueryParameter("count", String.valueOf(maximum + 3)).build();
            Document page = fetchDocument(url.toString(), false);
            for (Element item : page.select("li.b_algo")) {
                Element link = item.selectFirst("h2 a[href]");
                if (link == null) continue;
                String href = link.absUrl("href");
                if (!isPublicResultUrl(href) || !seen.add(href)) continue;
                Element snippetNode = item.selectFirst(".b_caption p, p");
                results.put(webResult(link.text(), href, snippetNode == null ? "" : snippetNode.text()));
                if (results.length() >= maximum) break;
            }
        } catch (Exception error) {
            bingFailure = error;
            Log.w(TAG, "Bing search failed; trying DuckDuckGo", error);
        }

        if (results.length() == 0) {
            backend = "bing-rss";
            try {
                HttpUrl rssUrl = new HttpUrl.Builder()
                    .scheme("https").host("www.bing.com").addPathSegment("search")
                    .addQueryParameter("q", query).addQueryParameter("format", "rss").build();
                FetchedPage rssPage = fetchPage(rssUrl.toString(), false);
                Document feed = Jsoup.parse(
                    new ByteArrayInputStream(rssPage.body),
                    StandardCharsets.UTF_8.name(),
                    rssPage.url,
                    Parser.xmlParser()
                );
                for (Element item : feed.select("item")) {
                    String href = item.select("link").text().trim();
                    if (!isPublicResultUrl(href) || !seen.add(href)) continue;
                    results.put(webResult(
                        item.select("title").text(),
                        href,
                        Jsoup.parse(item.select("description").text()).text()
                    ));
                    if (results.length() >= maximum) break;
                }
            } catch (Exception error) {
                Log.w(TAG, "Bing RSS search failed; trying DuckDuckGo", error);
            }
        }

        if (results.length() == 0) {
            backend = "duckduckgo";
            try {
                HttpUrl url = new HttpUrl.Builder()
                    .scheme("https").host("html.duckduckgo.com").addPathSegment("html")
                    .addQueryParameter("q", query).build();
                Document page = fetchDocument(url.toString(), false);
                for (Element item : page.select(".result")) {
                    Element link = item.selectFirst("a.result__a[href]");
                    if (link == null) continue;
                    String href = unwrapDuckDuckGo(link.absUrl("href"));
                    if (!isPublicResultUrl(href) || !seen.add(href)) continue;
                    Element snippetNode = item.selectFirst(".result__snippet");
                    results.put(webResult(link.text(), href, snippetNode == null ? "" : snippetNode.text()));
                    if (results.length() >= maximum) break;
                }
            } catch (Exception error) {
                String detail = bingFailure == null ? error.getMessage() : bingFailure.getMessage() + "; " + error.getMessage();
                throw new UpstreamError("设备无法连接网页搜索源：" + cleanMessage(detail), "query", query);
            }
        }

        JSONObject body = resultEnvelope(query, results, "android-native-" + backend);
        if (results.length() == 0) put(body, "message", "未找到相关结果，可尝试更换关键词");
        return body;
    }

    private JSONObject searchBingImages(String query, int maximum) throws UpstreamError {
        try {
            HttpUrl url = new HttpUrl.Builder()
                .scheme("https").host("www.bing.com").addPathSegment("images").addPathSegment("search")
                .addQueryParameter("q", query).addQueryParameter("count", String.valueOf(maximum + 5)).build();
            Document page = fetchDocument(url.toString(), false);
            JSONArray results = new JSONArray();
            Set<String> seen = new HashSet<>();
            for (Element link : page.select("a.iusc[m]")) {
                JSONObject metadata;
                try {
                    metadata = new JSONObject(link.attr("m"));
                } catch (JSONException ignored) {
                    continue;
                }
                String imageUrl = metadata.optString("murl").trim();
                if (!isPublicResultUrl(imageUrl) || !seen.add(imageUrl)) continue;
                JSONObject item = new JSONObject();
                put(item, "title", clip(metadata.optString("t"), 300, "(无标题)"));
                put(item, "imageUrl", imageUrl);
                put(item, "sourceUrl", metadata.optString("purl"));
                results.put(item);
                if (results.length() >= maximum) break;
            }
            JSONObject body = resultEnvelope(query, results, "android-native-bing-images");
            if (results.length() == 0) put(body, "message", "未找到相关图片，可尝试更换关键词");
            return body;
        } catch (Exception error) {
            throw new UpstreamError("设备无法连接图片搜索源：" + cleanMessage(error.getMessage()), "query", query);
        }
    }

    private JSONObject extract(String rawUrl, int maximum) throws BadRequest, UpstreamError {
        String target = rawUrl.matches("(?i)^https?://.*") ? rawUrl : "https://" + rawUrl;
        try {
            validatePublicUrl(target);
        } catch (IOException error) {
            throw new BadRequest(error.getMessage());
        }
        String key = "extract\u0000" + target;
        JSONObject cached = cacheGet(key);
        if (cached != null) {
            put(cached, "cached", true);
            return clipExtraction(cached, maximum);
        }
        try {
            FetchedPage fetched = fetchPage(target);
            Document document = Jsoup.parse(new ByteArrayInputStream(fetched.body), null, fetched.url);
            document.select("script,style,noscript,nav,footer,form,button,svg,iframe,canvas").remove();
            Element root = chooseArticleRoot(document);
            String content = toMarkdown(root);
            if (content.length() < 120) {
                throw new UpstreamError("网页没有可提取的静态正文；该页面可能需要登录或 JavaScript 渲染", "url", target);
            }
            JSONObject stored = new JSONObject();
            put(stored, "url", fetched.url);
            put(stored, "title", document.title().trim());
            put(stored, "content", content);
            put(stored, "backend", "android-native");
            put(stored, "rendered", false);
            put(stored, "cached", false);
            JSONArray images = extractImages(document, fetched.url, 20);
            if (images.length() > 0) put(stored, "images", images);
            cachePut(key, stored, EXTRACT_CACHE_MS);
            return clipExtraction(stored, maximum);
        } catch (UpstreamError error) {
            throw error;
        } catch (Exception error) {
            throw new UpstreamError("读取网页失败：" + cleanMessage(error.getMessage()), "url", target);
        }
    }

    private JSONObject clipExtraction(JSONObject source, int maximum) {
        JSONObject result = cloneJson(source);
        String full = source.optString("content");
        String clipped = full.length() > maximum ? full.substring(0, maximum) : full;
        put(result, "content", clipped);
        put(result, "chars", clipped.length());
        put(result, "full_chars", full.length());
        put(result, "truncated", full.length() > maximum);
        return result;
    }

    private Document fetchDocument(String url, boolean validateTarget) throws IOException {
        FetchedPage page = fetchPage(url, validateTarget);
        return Jsoup.parse(new ByteArrayInputStream(page.body), null, page.url);
    }

    private FetchedPage fetchPage(String startUrl) throws IOException {
        return fetchPage(startUrl, true);
    }

    private FetchedPage fetchPage(String startUrl, boolean validateTarget) throws IOException {
        String current = startUrl;
        for (int redirects = 0; redirects <= 5; redirects++) {
            if (validateTarget) validatePublicUrl(current);
            Request request = new Request.Builder()
                .url(current)
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36")
                .header("Accept", "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1")
                .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.7")
                .build();
            try (okhttp3.Response response = http.newCall(request).execute()) {
                if (isRedirect(response.code())) {
                    String location = response.header("Location");
                    if (isBlank(location)) throw new IOException("网页重定向缺少 Location");
                    HttpUrl resolved = response.request().url().resolve(location);
                    if (resolved == null) throw new IOException("网页返回了无效重定向地址");
                    current = resolved.toString();
                    continue;
                }
                if (!response.isSuccessful()) throw new IOException("HTTP " + response.code());
                String contentType = response.header("Content-Type", "").toLowerCase(Locale.ROOT);
                if (validateTarget && !isBlank(contentType)
                    && !contentType.contains("text/html") && !contentType.contains("application/xhtml+xml")
                    && !contentType.contains("text/plain")) {
                    throw new IOException("不支持的网页类型：" + contentType.split(";", 2)[0]);
                }
                ResponseBody body = response.body();
                if (body == null) throw new IOException("网页响应为空");
                long declared = body.contentLength();
                if (declared > MAX_PAGE_BYTES) throw new IOException("网页超过 5 MB 上限");
                return new FetchedPage(response.request().url().toString(), readLimited(body.byteStream(), MAX_PAGE_BYTES));
            }
        }
        throw new IOException("网页重定向次数过多");
    }

    private static byte[] readLimited(InputStream input, int maximum) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream(Math.min(maximum, 64 * 1024));
        byte[] buffer = new byte[16 * 1024];
        int total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            total += read;
            if (total > maximum) throw new IOException("网页超过 5 MB 上限");
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    private static void validatePublicUrl(String value) throws IOException {
        final URI uri;
        try {
            uri = new URI(value);
        } catch (URISyntaxException error) {
            throw new IOException("目标网址格式无效");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) throw new IOException("仅支持 http:// 或 https:// 网页");
        if (uri.getUserInfo() != null) throw new IOException("目标网址不能包含用户名或密码");
        String host = uri.getHost();
        if (isBlank(host)) throw new IOException("目标网址缺少主机名");
        String asciiHost = IDN.toASCII(host).toLowerCase(Locale.ROOT);
        if (asciiHost.equals("localhost") || asciiHost.endsWith(".localhost") || asciiHost.endsWith(".local")
            || asciiHost.endsWith(".internal") || asciiHost.endsWith(".home.arpa")) {
            throw new IOException("出于安全原因，不能读取本机或局域网主机");
        }
        int port = uri.getPort() == -1 ? (scheme.equals("https") ? 443 : 80) : uri.getPort();
        if (port != 80 && port != 443) throw new IOException("仅允许访问标准 Web 端口 80 和 443");
        InetAddress[] addresses = InetAddress.getAllByName(asciiHost);
        if (addresses.length == 0) throw new IOException("无法解析目标主机");
        for (InetAddress address : addresses) {
            if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress() || isUniqueLocalV6(address)) {
                throw new IOException("出于安全原因，不能读取本机、局域网或保留地址");
            }
        }
    }

    private static boolean isUniqueLocalV6(InetAddress address) {
        if (!(address instanceof Inet6Address)) return false;
        byte first = address.getAddress()[0];
        return (first & 0xfe) == 0xfc;
    }

    private static Element chooseArticleRoot(Document document) {
        Element best = null;
        int bestLength = 0;
        for (Element candidate : document.select("article,main,[role=main],.article,.post,.content")) {
            int length = candidate.text().length();
            if (length > bestLength) {
                best = candidate;
                bestLength = length;
            }
        }
        return best != null && bestLength >= 120 ? best : document.body();
    }

    private static String toMarkdown(Element root) {
        if (root == null) return "";
        StringBuilder output = new StringBuilder();
        Elements blocks = root.select("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,table");
        for (Element block : blocks) {
            if (hasSelectedAncestor(block, root)) continue;
            String text = block.text().replaceAll("\\s+", " ").trim();
            if (text.isEmpty()) continue;
            String tag = block.tagName();
            if (tag.matches("h[1-6]")) {
                int level = Character.digit(tag.charAt(1), 10);
                for (int index = 0; index < level; index++) output.append('#');
                output.append(' ').append(text).append("\n\n");
            } else if (tag.equals("li")) {
                output.append("- ").append(text).append('\n');
            } else if (tag.equals("blockquote")) {
                output.append("> ").append(text).append("\n\n");
            } else if (tag.equals("pre")) {
                output.append("```\n").append(block.wholeText().trim()).append("\n```\n\n");
            } else if (tag.equals("table")) {
                for (Element row : block.select("tr")) {
                    List<String> cells = row.select("th,td").eachText();
                    if (!cells.isEmpty()) {
                        for (int index = 0; index < cells.size(); index++) {
                            if (index > 0) output.append(" | ");
                            output.append(cells.get(index));
                        }
                        output.append('\n');
                    }
                }
                output.append('\n');
            } else {
                output.append(text).append("\n\n");
            }
        }
        if (output.length() == 0) output.append(root.text());
        return output.toString().replaceAll("\\n{3,}", "\n\n").trim();
    }

    private static boolean hasSelectedAncestor(Element element, Element root) {
        Element parent = element.parent();
        while (parent != null && parent != root) {
            String tag = parent.tagName();
            if (tag.matches("h[1-6]|p|li|blockquote|pre|table")) return true;
            parent = parent.parent();
        }
        return false;
    }

    private static JSONArray extractImages(Document document, String baseUrl, int maximum) {
        JSONArray output = new JSONArray();
        Set<String> seen = new LinkedHashSet<>();
        for (Element image : document.select("img[src],img[data-src]")) {
            String raw = image.hasAttr("src") ? image.attr("src") : image.attr("data-src");
            try {
                String absolute = new URI(baseUrl).resolve(raw).toString();
                if (isPublicResultUrl(absolute) && seen.add(absolute)) output.put(absolute);
            } catch (Exception ignored) {
                // Skip malformed image URLs without failing article extraction.
            }
            if (output.length() >= maximum) break;
        }
        return output;
    }

    private static JSONObject webResult(String title, String url, String snippet) {
        JSONObject item = new JSONObject();
        put(item, "title", clip(title, 300, "(无标题)"));
        put(item, "url", url);
        put(item, "snippet", clip(snippet, 400, ""));
        return item;
    }

    private static JSONObject resultEnvelope(String query, JSONArray results, String backend) {
        JSONObject body = new JSONObject();
        put(body, "query", query);
        put(body, "count", results.length());
        put(body, "results", results);
        put(body, "backend", backend);
        return body;
    }

    private static String unwrapDuckDuckGo(String url) {
        try {
            URI uri = new URI(url);
            if (!uri.getHost().endsWith("duckduckgo.com")) return url;
            String query = uri.getRawQuery();
            if (query == null) return url;
            for (String part : query.split("&")) {
                int separator = part.indexOf('=');
                if (separator > 0 && part.substring(0, separator).equals("uddg")) {
                    return URLDecoder.decode(part.substring(separator + 1), StandardCharsets.UTF_8.name());
                }
            }
        } catch (Exception ignored) {
            // Keep the original URL when an unexpected redirect format is returned.
        }
        return url;
    }

    private static boolean isPublicResultUrl(String url) {
        return url != null && url.matches("(?i)^https?://.+");
    }

    private static boolean isRedirect(int status) {
        return status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
    }

    private static String required(IHTTPSession session, String name, int maximum) throws BadRequest {
        List<String> values = session.getParameters().get(name);
        String value = values == null || values.isEmpty() ? "" : values.get(0).trim();
        if (value.isEmpty()) throw new BadRequest("缺少参数 " + name);
        if (value.length() > maximum) throw new BadRequest("参数 " + name + " 过长");
        return value;
    }

    private static int limit(IHTTPSession session, String name, int fallback, int maximum) throws BadRequest {
        List<String> values = session.getParameters().get(name);
        if (values == null || values.isEmpty() || isBlank(values.get(0))) return fallback;
        try {
            int value = Integer.parseInt(values.get(0));
            if (name.equals("max_chars")) return Math.max(1_000, Math.min(value, maximum));
            return Math.max(1, Math.min(value, maximum));
        } catch (NumberFormatException error) {
            throw new BadRequest("参数 " + name + " 必须是整数");
        }
    }

    private JSONObject cacheGet(String key) {
        CacheEntry entry = cache.get(key);
        if (entry == null) return null;
        if (entry.expiresAt <= System.currentTimeMillis()) {
            cache.remove(key);
            return null;
        }
        return cloneJson(entry.value);
    }

    private void cachePut(String key, JSONObject value, long ttlMs) {
        cache.put(key, new CacheEntry(cloneJson(value), System.currentTimeMillis() + ttlMs));
        if (cache.size() > 128) {
            long now = System.currentTimeMillis();
            cache.entrySet().removeIf(item -> item.getValue().expiresAt <= now);
        }
    }

    private Response json(Response.IStatus status, JSONObject body, String origin) {
        Response response = newFixedLengthResponse(status, "application/json; charset=utf-8", body.toString());
        response.addHeader("Cache-Control", "no-store");
        response.addHeader("X-Content-Type-Options", "nosniff");
        addCors(response, origin);
        return response;
    }

    private static void addCors(Response response, String origin) {
        if (origin != null && ALLOWED_ORIGINS.contains(origin)) {
            response.addHeader("Access-Control-Allow-Origin", origin);
            response.addHeader("Vary", "Origin");
        }
    }

    private static JSONObject error(String message) {
        JSONObject body = new JSONObject();
        put(body, "error", message);
        return body;
    }

    private static String clip(String value, int maximum, String fallback) {
        String text = value == null ? "" : value.replaceAll("\\s+", " ").trim();
        if (text.isEmpty()) return fallback;
        return text.length() > maximum ? text.substring(0, maximum) + "…" : text;
    }

    private static String cleanMessage(String message) {
        return isBlank(message) ? "未知网络错误" : clip(message, 240, "未知网络错误");
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private static void put(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static JSONObject cloneJson(JSONObject source) {
        try {
            return new JSONObject(source.toString());
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static final class CacheEntry {
        final JSONObject value;
        final long expiresAt;

        CacheEntry(JSONObject value, long expiresAt) {
            this.value = value;
            this.expiresAt = expiresAt;
        }
    }

    private static final class FetchedPage {
        final String url;
        final byte[] body;

        FetchedPage(String url, byte[] body) {
            this.url = url;
            this.body = body;
        }
    }

    private static final class BadRequest extends Exception {
        BadRequest(String message) {
            super(message);
        }
    }

    private static final class UpstreamError extends Exception {
        final String subjectKey;
        final String subject;

        UpstreamError(String message, String subjectKey, String subject) {
            super(message);
            this.subjectKey = subjectKey;
            this.subject = subject;
        }
    }
}
