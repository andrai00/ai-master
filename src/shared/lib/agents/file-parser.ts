import "server-only";

// pdf-parse is a CJS module without a proper default export for ESM
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string; numpages: number; info: unknown }>;
import mammoth from "mammoth";

export interface IParsedFile {
  text: string;
  size: number;
  filename: string;
}

const MAX_TEXT_SIZE = 25 * 1024 * 1024; // 25MB parsed text limit

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

function isAllowed(ext: string): boolean {
  return [".pdf", ".txt", ".md", ".docx"].includes(ext);
}

export async function parseFile(buffer: Buffer, filename: string): Promise<IParsedFile> {
  const ext = getExtension(filename);
  if (!isAllowed(ext)) {
    throw new Error(`Unsupported file type: ${ext}. Allowed: .pdf, .txt, .md, .docx`);
  }

  let text: string;

  if (ext === ".pdf") {
    const data = await pdfParse(buffer);
    text = data.text;
  } else if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
    if (result.messages.length > 0) {
      console.warn(`[file-parser] mammoth warnings for ${filename}:`, result.messages);
    }
  } else {
    // .txt, .md — just decode
    text = new TextDecoder("utf-8").decode(buffer);
  }

  if (text.length > MAX_TEXT_SIZE) {
    throw new Error(`File too large after parsing: ${text.length} bytes (max ${MAX_TEXT_SIZE})`);
  }

  return { text, size: text.length, filename };
}
