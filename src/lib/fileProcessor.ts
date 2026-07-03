import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
// pdfjs worker 以 ?url 形式引用：Vite 只把 worker 作为独立资源发出并返回其 URL，
// 不会把 worker 代码并入主 bundle；浏览器仅在真正解析 PDF 时才按需拉取。
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * 表示处理后的文件结果接口
 */
export interface ProcessedFile {
  /** 提取出的纯文本内容，通常包含文件元数据头部 */
  text: string;
  /** 提取出的图片数据，格式为 Base64 字符串数组 */
  images?: string[];
}

/**
 * 统一的文件处理入口函数。
 * 根据文件扩展名或 MIME 类型，将上传的文件解析为统一的文本和图像数据，
 * 以便后续供大模型或系统其他模块使用。
 *
 * @param file - 用户上传的原始 File 对象
 * @returns 解析完成后的 ProcessedFile 对象，包含文本和可选的图片数据
 */
export async function processFile(file: File): Promise<ProcessedFile> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const metadata = `<<<FILE_METADATA=${JSON.stringify({
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      type: extension
  })}>>>\n`;

  if (extension === 'docx') {
    const res = await processDocx(file);
    return { ...res, text: metadata + res.text };
  } else if (extension === 'xlsx' || extension === 'xls') {
    const res = await processExcel(file);
    return { ...res, text: metadata + res.text };
  } else if (extension === 'pdf') {
    const res = await processPdf(file);
    return { ...res, text: metadata + res.text };
  } else if (extension === 'pptx') {
    const res = await processPptx(file);
    return { ...res, text: metadata + res.text };
  } else if (['txt', 'html', 'md', 'csv', 'json', 'js', 'ts', 'tsx', 'css', 'py'].includes(extension || '')) {
    const text = await file.text();
    return { text: `${metadata}--- File: ${file.name} ---\n${text}\n--- End File ---` };
  } else if (file.type.startsWith('image/')) {
    const base64 = await readFileAsDataURL(file);
    return { 
        text: '', // Don't show text for images to keep UI clean
        images: [base64]
    };
  }

  // Fallback for others
  return { text: `[File uploaded: ${file.name} (Type: ${file.type})]` };
}

/**
 * 将文件读取为 Base64 格式的 Data URL。
 * 主要用于将前端本地图片等文件直接转换为可供 <img> 标签或大语言模型读取的字符串形式。
 *
 * @param file - 需要转换的原始 File 对象
 * @returns 返回一个包含 Base64 字符串的 Promise
 */
function readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * 处理 DOCX 格式的 Word 文档。
 * 使用 mammoth 库将 DOCX 转换为 HTML，再按文档顺序遍历 DOM 提取纯文本，
 * 并在每张内嵌图片的原始位置插入编号占位符 `[图片 N]`，同时按顺序收集图片数据。
 *
 * 这样保留图片在原文档中的相对位置，使 AI 能将后续 image_url 部分与正文中的
 * `[图片 N]` 占位符按顺序对应，理解每张图片出现在文档的哪个位置。
 *
 * @param file - DOCX 格式的 File 对象
 * @returns 解析后的 ProcessedFile，包含文档文本（含图片位置占位符）及按顺序的 Base64 图片数组
 */
async function processDocx(file: File): Promise<ProcessedFile> {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const doc = new DOMParser().parseFromString(result.value, 'text/html');

    const images: string[] = [];
    const pieces: string[] = [];
    let imgCounter = 0;

    // 视为块级元素：遍历其子节点前后各补一个换行，保留段落结构
    const BLOCK_TAGS = new Set([
      'p', 'div', 'section', 'article', 'header', 'footer',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'table',
      'ul', 'ol', 'blockquote', 'pre', 'figure',
    ]);

    const walk = (node: Node): void => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          pieces.push(child.textContent || '');
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as Element;
          const tag = el.tagName.toLowerCase();
          if (tag === 'img') {
            const src = el.getAttribute('src') || '';
            if (src.startsWith('data:image')) {
              imgCounter++;
              images.push(src);
              // 在图片原始位置插入编号占位符，便于 AI 定位
              pieces.push(`\n[图片 ${imgCounter}]\n`);
            }
          } else if (tag === 'br') {
            pieces.push('\n');
          } else {
            const isBlock = BLOCK_TAGS.has(tag);
            if (isBlock) pieces.push('\n');
            walk(el);
            if (isBlock) pieces.push('\n');
          }
        }
      });
    };
    walk(doc.body);

    // 合并片段并规整连续空行
    const text = pieces.join('').replace(/\n{3,}/g, '\n\n').trim();

    return {
      text: `--- DOCX: ${file.name} ---\n${text}\n--- End DOCX ---`,
      images: images.length > 0 ? images : undefined,
    };
  } catch (e) {
    console.error("Docx parsing error", e);
    return { text: `[Error parsing DOCX ${file.name}]` };
  }
}

/**
 * 处理 Excel 文件（XLSX / XLS）。
 * 使用 xlsx 库读取所有工作表（Sheet），并将其逐一转换为 CSV 格式的纯文本，
 * 最后将所有工作表的数据拼接到一个字符串中。
 *
 * @param file - Excel 格式的 File 对象
 * @returns 解析后的 ProcessedFile，包含所有工作表转换而成的 CSV 格式纯文本
 */
async function processExcel(file: File): Promise<ProcessedFile> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer);
  let text = `--- Excel: ${file.name} ---\n`;
  
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    text += `Sheet: ${sheetName}\n${csv}\n\n`;
  });
  
  text += "--- End Excel ---";
  return { text };
}

/** 标记 pdfjs worker 是否已配置，避免每次解析重复设置 */
let pdfWorkerConfigured = false;

/**
 * 处理 PDF 文档。
 * 使用 pdfjs-dist 逐页提取文本并附 [Page N] 分页标记；对文本字符稀少的页
 * （疑似扫描件 / 纯图片页）渲染为 JPEG 图片并插入 [图片 N] 占位符，
 * 使 AI 能看到该页的版式与图片在原文档中的位置。
 *
 * pdfjs 核心库以动态 import 按需加载（不拖大主 bundle）；worker 通过 ?url 引用，
 * 浏览器仅在真正解析 PDF 时才拉取。若 worker 加载失败，pdfjs 会自动回退到主线程
 * 伪 worker（较慢但可用），保证文本提取不会整体失败。
 *
 * @param file - PDF 格式的 File 对象
 * @returns 解析后的 ProcessedFile
 */
async function processPdf(file: File): Promise<ProcessedFile> {
  const arrayBuffer = await file.arrayBuffer();
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const pdfjsLib = await import('pdfjs-dist');
    if (!pdfWorkerConfigured) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      pdfWorkerConfigured = true;
    }

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    cleanup = () => loadingTask.destroy();
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;

    const images: string[] = [];
    const pageBlocks: string[] = [];
    let imgCounter = 0;
    // 限制渲染为图片的页数，控制体积与 token 消耗
    const MAX_RENDERED_PAGES = 8;
    // 文本字符数低于此阈值的页视为图片页，渲染为图片以保留版式
    const TEXT_MIN_CHARS = 15;

    for (let n = 1; n <= numPages; n++) {
      const page = await pdf.getPage(n);
      const textContent = await page.getTextContent();
      let pageText = '';
      for (const item of textContent.items) {
        if ('str' in item) {
          pageText += item.str;
          if (item.hasEOL) pageText += '\n';
        }
      }
      pageText = pageText.replace(/\n{3,}/g, '\n\n').trim();

      let pageSlot: string;
      if (pageText.length < TEXT_MIN_CHARS && images.length < MAX_RENDERED_PAGES) {
        // 文本稀少，渲染整页为图片以保留版式与图片位置
        try {
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, viewport }).promise;
          imgCounter++;
          images.push(canvas.toDataURL('image/jpeg', 0.8));
          pageSlot = pageText ? `${pageText}\n[图片 ${imgCounter}]` : `[图片 ${imgCounter}]`;
        } catch (renderErr) {
          console.error('PDF page render error', renderErr);
          pageSlot = pageText || '[此页渲染失败]';
        }
      } else if (pageText.length < TEXT_MIN_CHARS) {
        // 超出渲染页数上限，仅占位提示
        pageSlot = pageText || '[图片页，已达渲染上限，未渲染]';
      } else {
        pageSlot = pageText;
      }

      pageBlocks.push(`[Page ${n}]\n${pageSlot}`);
    }

    const text = `--- PDF: ${file.name} ---\n${pageBlocks.join('\n\n')}\n--- End PDF ---`;
    return {
      text,
      images: images.length > 0 ? images : undefined,
    };
  } catch (e) {
    console.error('PDF parsing error', e);
    return { text: `[Error parsing PDF ${file.name}]` };
  } finally {
    try {
      await cleanup?.();
    } catch {
      /* 忽略销毁时的错误 */
    }
  }
}

/**
 * 处理 PPTX 格式的 PowerPoint 演示文稿。
 * PPTX 为 OOXML（zip + XML），用 jszip 解压后按幻灯片顺序：
 *  - 提取每页文本（<a:t>）；
 *  - 在每张图片原始位置插入 [图片 N] 占位符（<a:blip r:embed> 经 rels 解析到 media），
 *    并按顺序收集可在浏览器显示的栅格图片（PNG/JPEG 等），跳过 EMF/WMF 等矢量格式。
 * 与 docx 一致，AI 据此理解每张图片出现在哪一页的哪个位置。
 *
 * jszip 以动态 import 按需加载，避免拖大主 bundle。
 *
 * @param file - PPTX 格式的 File 对象
 * @returns 解析后的 ProcessedFile
 */
async function processPptx(file: File): Promise<ProcessedFile> {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 收集 slide 文件并按页码排序
    const slidePaths = Object.keys(zip.files)
      .filter(p => /^ppt\/slides\/slide(\d+)\.xml$/.test(p))
      .sort((a, b) => slideNumberOf(a) - slideNumberOf(b));

    const images: string[] = [];
    const slideBlocks: string[] = [];
    let imgCounter = 0;
    const MAX_IMAGES = 20;

    for (const slidePath of slidePaths) {
      const slideNum = slideNumberOf(slidePath);
      const xml = await zip.file(slidePath)!.async('string');
      const relsXml = await zip.file(`ppt/slides/_rels/slide${slideNum}.xml.rels`)?.async('string');
      const ridToMedia = parsePptxRels(relsXml);

      const { text: slideText, mediaTargets, imgCount } = extractPptxSlideText(xml, ridToMedia, imgCounter, MAX_IMAGES);
      imgCounter = imgCount;

      // 加载该页引用的图片为 base64 data URL
      for (const target of mediaTargets) {
        const mediaFile = zip.file(target);
        if (mediaFile) {
          const b64 = await mediaFile.async('base64');
          const ext = target.split('.').pop()?.toLowerCase() || '';
          const mime = mimeFromExt(ext);
          if (mime) images.push(`data:${mime};base64,${b64}`);
        }
      }

      slideBlocks.push(`[Slide ${slideNum}]\n${slideText}`);
    }

    const text = `--- PPTX: ${file.name} ---\n${slideBlocks.join('\n\n')}\n--- End PPTX ---`;
    return {
      text,
      images: images.length > 0 ? images : undefined,
    };
  } catch (e) {
    console.error('PPTX parsing error', e);
    return { text: `[Error parsing PPTX ${file.name}]` };
  }
}

/** 从 ppt/slides/slideN.xml 路径中提取页码 N */
function slideNumberOf(path: string): number {
  const m = path.match(/slide(\d+)\.xml$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** 解析 slide 的 .rels，返回 rId → 包内 media 路径（仅 image 关系） */
function parsePptxRels(relsXml?: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (!relsXml) return map;
  const doc = new DOMParser().parseFromString(relsXml, 'application/xml');
  const rels = doc.getElementsByTagName('Relationship');
  for (let i = 0; i < rels.length; i++) {
    const rel = rels[i];
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    const type = rel.getAttribute('Type') || '';
    if (id && target && type.indexOf('/image') !== -1) {
      map[id] = resolvePptxMediaPath(target);
    }
  }
  return map;
}

/** 将 rels 中的相对 Target（如 ../media/image1.png）解析为包内绝对路径（如 ppt/media/image1.png） */
function resolvePptxMediaPath(target: string): string {
  // rels 相对于 ppt/slides/ 目录
  const stack = ['ppt', 'slides'];
  for (const seg of target.split('/')) {
    if (seg === '..') stack.pop();
    else if (seg === '.' || seg === '') continue;
    else stack.push(seg);
  }
  return stack.join('/');
}

/**
 * 按文档顺序遍历 slide XML，提取 <a:t> 文本，并在 <a:blip r:embed> 处插入 [图片 N] 占位符。
 * 仅对可在浏览器显示的栅格图片编号；矢量格式（emf/wmf）或超上限时仅标注位置不编号，
 * 保证 [图片 N] 编号与最终 image_url 部分一一对应。
 */
function extractPptxSlideText(
  xml: string,
  ridToMedia: Record<string, string>,
  startCounter: number,
  maxImages: number
): { text: string; mediaTargets: string[]; imgCount: number } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const pieces: string[] = [];
  const mediaTargets: string[] = [];
  let counter = startCounter;
  const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  const walk = (node: Node): void => {
    node.childNodes.forEach((child) => {
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as Element;
      const name = el.nodeName;
      if (name === 'a:t') {
        pieces.push(el.textContent || '');
      } else if (name === 'a:blip') {
        const rid = el.getAttribute('r:embed') || el.getAttributeNS(REL_NS, 'embed');
        const target = rid ? ridToMedia[rid] : null;
        const ext = target ? (target.split('.').pop() || '').toLowerCase() : '';
        const renderable = target ? !!mimeFromExt(ext) : false;
        if (target && renderable && counter - startCounter < maxImages) {
          counter++;
          mediaTargets.push(target);
          pieces.push(`\n[图片 ${counter}]\n`);
        } else if (target && renderable) {
          pieces.push(`\n[图片（已达上限，未加载）]\n`);
        } else if (target) {
          pieces.push(`\n[矢量图片，浏览器无法显示]\n`);
        }
      } else if (name === 'a:p') {
        pieces.push('\n');
        walk(el);
        pieces.push('\n');
      } else {
        walk(el);
      }
    });
  };
  walk(doc.documentElement);

  const text = pieces.join('').replace(/\n{3,}/g, '\n\n').trim();
  return { text, mediaTargets, imgCount: counter };
}

/** 常见图片扩展名 → MIME；矢量格式（emf/wmf）返回 null（浏览器无法渲染） */
function mimeFromExt(ext: string): string | null {
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'bmp': return 'image/bmp';
    case 'webp': return 'image/webp';
    case 'tif': case 'tiff': return 'image/tiff';
    default: return null;
  }
}
