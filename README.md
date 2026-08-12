# Local Search Service

一个可独立运行、也可直接迁移成单独仓库的本地搜索服务。它通过 SearXNG 提供网页与图片搜索，通过 Trafilatura 和 Playwright 提供安全的网页正文提取，并使用 SQLite 缓存结果。

服务不依赖 StudyStudio 的前端代码。整个 `search/` 目录复制到新目录后，仍可独立安装、测试和启动。

## 功能

- 通用网页搜索与图片搜索
- 静态网页正文转 Markdown
- JavaScript 页面 Playwright Chromium 兜底
- SQLite TTL 缓存
- 限制协议、端口、DNS 解析结果和重定向的 SSRF 防护
- 严格的浏览器 Origin 与 Host 白名单
- OpenAPI 文档与健康检查

## Windows 一键启动

前置条件：

- Python 3.11 或更高版本
- Docker Desktop

直接双击 `start.bat`，或在 PowerShell 中运行。启动窗口会持续显示 API 访问日志；关闭该窗口时，启动器会同时停止本地 API 和 SearXNG，因此使用搜索功能期间请保持窗口打开：

```powershell
.\start.ps1
```

启动器会自动完成以下操作：

1. 启动 `docker-compose.yml` 中的 SearXNG。
2. 创建本目录下的 `.venv`。
3. 安装 Python 依赖与 Playwright Chromium。
4. 在 `http://127.0.0.1:17890` 启动 API。

仅检查环境和应用导入，不持续运行服务：

```powershell
.\start.ps1 -VerifyOnly
```

停止 API 时默认同时停止 SearXNG；如需保留容器：

```powershell
.\start.ps1 -KeepSearxng
```

## 手动启动

Windows PowerShell：

```powershell
docker compose up -d
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m playwright install chromium
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 17890
```

Linux/macOS：

```bash
docker compose up -d
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
./.venv/bin/python -m playwright install chromium
./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 17890
```

## API

服务启动后可打开 `http://127.0.0.1:17890/docs` 调试完整 OpenAPI。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/health` | API、SearXNG 与浏览器兜底状态 |
| `POST` | `/api/web/search` | 网页搜索 |
| `POST` | `/api/web/images` | 图片搜索 |
| `POST` | `/api/web/extract` | 提取公开网页正文 |
| `GET` | `/api/web/search` | 网页搜索（查询参数，用于手机浏览器的无预检局域网请求） |
| `GET` | `/api/web/images` | 图片搜索（查询参数，用于手机浏览器的无预检局域网请求） |
| `GET` | `/api/web/extract` | 提取公开网页正文（查询参数，用于手机浏览器的无预检局域网请求） |

搜索请求：

```json
{
  "query": "local first software",
  "max_results": 5
}
```

网页提取请求：

```json
{
  "url": "https://example.com/article",
  "max_chars": 16000
}
```

PowerShell 示例：

```powershell
$body = @{ query = "local first software"; max_results = 5 } | ConvertTo-Json
Invoke-RestMethod `
  -Uri "http://127.0.0.1:17890/api/web/search" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

## 配置

复制 `.env.example` 为 `.env` 后再运行 `start.ps1`。进程中已存在的环境变量优先于 `.env`。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `LOCAL_SEARCH_HOST` | `127.0.0.1` | API 监听地址 |
| `LOCAL_SEARCH_PORT` | `17890` | API 监听端口 |
| `LOCAL_SEARCH_ALLOWED_ORIGINS` | 本机 5173/17890 Origin | 允许调用 API 的精确浏览器 Origin，逗号分隔 |
| `LOCAL_SEARCH_ADDITIONAL_ORIGINS` | 空 | 追加 Origin，不覆盖基础白名单 |
| `LOCAL_SEARCH_ALLOWED_HOSTS` | 本机 Host | FastAPI 允许的 Host，逗号分隔 |
| `LOCAL_SEARCH_CACHE_PATH` | `data/web-cache.sqlite3` | SQLite 缓存路径 |
| `SEARXNG_PORT` | `17891` | SearXNG 本机端口 |
| `SEARXNG_URL` | `http://127.0.0.1:17891` | 可选的 SearXNG 地址 |
| `LOCAL_SEARCH_CACHE_TTL` | `300` | 搜索缓存秒数 |
| `LOCAL_EXTRACT_CACHE_TTL` | `86400` | 网页提取缓存秒数 |
| `LOCAL_SEARCH_REQUEST_TIMEOUT` | `20` | HTTP 请求超时秒数 |
| `LOCAL_SEARCH_BROWSER_TIMEOUT` | `30` | 浏览器渲染超时秒数 |
| `LOCAL_SEARCH_MAX_DOWNLOAD_BYTES` | `5242880` | 单个网页最大下载字节数 |
| `LOCAL_SEARCH_BROWSER_FALLBACK` | `true` | 是否启用 Playwright 兜底 |
| `LOCAL_SEARCH_TRUST_ENV_PROXY` | `false` | HTTP 客户端是否读取系统代理变量 |

兼容迁移期间仍识别原有 `STUDYSTUDIO_*` 环境变量，但新的独立部署应使用 `LOCAL_SEARCH_*`。

默认只监听回环地址。若要向局域网开放，需要同时调整监听地址、Docker 绑定地址、Origin 白名单、Host 白名单和主机防火墙；不要把本服务直接暴露到公网。

## 开发与测试

```powershell
.\test.ps1
```

测试启动器不需要 Docker，会自动准备 `.venv` 和开发依赖。也可以手动安装 `requirements-dev.txt` 后运行 `python -m pytest`。测试覆盖缓存、搜索结果规范化与去重、服务边界配置、CORS/Host 策略、网页静态提取及 SSRF 防护。

## 独立成仓库

最简单的方式是把本目录复制为新仓库根目录：

```powershell
Copy-Item -Recurse .\search C:\path\to\local-search-service
Set-Location C:\path\to\local-search-service
git init
git add .
git commit -m "Initial local search service"
```

如需保留当前 Git 历史，可在安装 `git-filter-repo` 后从仓库副本执行：

```powershell
git filter-repo --path search/ --path-rename search/:
```
