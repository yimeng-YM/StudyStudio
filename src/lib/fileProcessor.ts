import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export interface ProcessedFile {
  text: string;
  images?: string[]; // Base64 strings
}

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

function readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

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
