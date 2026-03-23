/**
 * 增强的文件读取工具
 * 支持多种文件格式：PDF, DOCX, XLSX, 图片
 */

import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import sharp from 'sharp';

// pdf-parse dynamic import for ESM compatibility
const pdfParse: any = require('pdf-parse');

// ==================== PDF 读取 ====================

export interface PdfResult {
  text: string;
  pages: number;
  info?: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    creationDate?: Date;
  };
}

export async function readPdf(filePath: string): Promise<PdfResult> {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);

  return {
    text: data.text,
    pages: data.numpages,
    info: {
      title: data.info?.Title,
      author: data.info?.Author,
      subject: data.info?.Subject,
      creator: data.info?.Creator,
      creationDate: data.info?.CreationDate ? new Date(data.info.CreationDate) : undefined
    }
  };
}

// ==================== DOCX 读取 ====================

export interface DocxResult {
  text: string;
  html?: string;
  messages?: string[];
}

export async function readDocx(filePath: string): Promise<DocxResult> {
  const result = await mammoth.extractRawText({ path: filePath });
  const htmlResult = await mammoth.convertToHtml({ path: filePath });

  return {
    text: result.value,
    html: htmlResult.value,
    messages: result.messages.map(m => m.message)
  };
}

// ==================== XLSX 读取 ====================

export interface XlsxResult {
  sheets: { name: string; data: any[][] }[];
  sheetNames: string[];
}

export async function readXlsx(filePath: string): Promise<XlsxResult> {
  const workbook = XLSX.readFile(filePath);
  const sheets = workbook.SheetNames.map(name => ({
    name,
    data: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }) as any[][]
  }));

  return {
    sheets,
    sheetNames: workbook.SheetNames
  };
}

export async function readXlsxAsJson(filePath: string, sheetName?: string): Promise<any[]> {
  const workbook = XLSX.readFile(filePath);
  const sheet = sheetName
    ? workbook.Sheets[sheetName]
    : workbook.Sheets[workbook.SheetNames[0]];

  return XLSX.utils.sheet_to_json(sheet);
}

export async function writeXlsx(filePath: string, data: any[][], sheetName: string = 'Sheet1'): Promise<void> {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filePath);
}

// ==================== 图片处理 ====================

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  size: number;
  channels: number;
  hasAlpha: boolean;
  density?: { x: number; y: number };
}

export async function getImageInfo(filePath: string): Promise<ImageInfo> {
  const metadata = await sharp(filePath).metadata();
  const stat = fs.statSync(filePath);

  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || 'unknown',
    size: stat.size,
    channels: metadata.channels || 3,
    hasAlpha: metadata.hasAlpha || false,
    density: metadata.density ? { x: metadata.density, y: metadata.density } : undefined
  };
}

export interface ImageResizeOptions {
  width?: number;
  height?: number;
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  quality?: number;
}

export async function resizeImage(
  inputPath: string,
  outputPath: string,
  options: ImageResizeOptions
): Promise<void> {
  let image = sharp(inputPath);

  if (options.width || options.height) {
    image = image.resize(options.width, options.height, {
      fit: 'inside',
      withoutEnlargement: true
    });
  }

  switch (options.format) {
    case 'jpeg':
      image = image.jpeg({ quality: options.quality || 80 });
      break;
    case 'png':
      image = image.png({ quality: options.quality || 80 });
      break;
    case 'webp':
      image = image.webp({ quality: options.quality || 80 });
      break;
    case 'avif':
      image = image.avif({ quality: options.quality || 80 });
      break;
  }

  await image.toFile(outputPath);
}

export async function imageToBase64(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const buffer = await sharp(filePath).toBuffer();
  const base64 = buffer.toString('base64');
  return `data:image/${ext};base64,${base64}`;
}

// ==================== 通用文件读取 ====================

export async function readFileAuto(filePath: string): Promise<{ type: string; content: any }> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.pdf':
      return { type: 'pdf', content: await readPdf(filePath) };
    case '.docx':
      return { type: 'docx', content: await readDocx(filePath) };
    case '.xlsx':
    case '.xls':
      return { type: 'xlsx', content: await readXlsx(filePath) };
    case '.jpg':
    case '.jpeg':
    case '.png':
    case '.webp':
    case '.gif':
      return { type: 'image', content: await getImageInfo(filePath) };
    default:
      return { type: 'text', content: fs.readFileSync(filePath, 'utf-8') };
  }
}