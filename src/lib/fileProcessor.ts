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
 * 使用 mammoth 库将 DOCX 转换为 HTML，然后提取纯文本并尝试从中解析出内嵌的图片。
 *
 * @param file - DOCX 格式的 File 对象
 * @returns 解析后的 ProcessedFile，包含提取出的文档文本以及可能的 Base64 图片数组
 */
async function processDocx(file: File): Promise<ProcessedFile> {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const text = result.value.replace(/<[^>]*>/g, '\n'); 
    
    const images: string[] = [];
    const imgRegex = /<img[^>]+src="([^">]+)"/g;
    let match;
    while ((match = imgRegex.exec(result.value)) !== null) {
      if (match[1].startsWith('data:image')) {
        images.push(match[1]);
      }
    }

    return { 
        text: `--- DOCX: ${file.name} ---\n${text}\n--- End DOCX ---`, 
        images: images.length > 0 ? images : undefined 
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
