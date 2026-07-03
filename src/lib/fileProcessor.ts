import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

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
