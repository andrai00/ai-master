import "server-only";
import PDFParser from "pdf2json";
import mammoth from "mammoth";

export interface IParsedFile {
  text: string;
  size: number;
  filename: string;
}

const MAX_TEXT_SIZE = 25 * 1024 * 1024;

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

function isAllowed(ext: string): boolean {
  return [".pdf", ".txt", ".md", ".docx"].includes(ext);
}

async function parsePdf(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();

    parser.on("pdfParser_dataReady", (data: { Pages: Array<{ Texts: Array<{ R: Array<{ T: string }> }> }> }) => {
      const lines: string[] = [];
      for (const page of data?.Pages ?? []) {
        for (const text of page?.Texts ?? []) {
          const decoded = decodeURIComponent(
            text.R.map((r) => r.T).join("")
          );
          lines.push(decoded);
        }
        lines.push(""); // page separator
      }
      resolve(lines.join("\n"));
    });

    parser.on("pdfParser_dataError", (err: unknown) => {
      reject(err instanceof Error ? err : new Error("PDF parse failed"));
    });

    parser.parseBuffer(buffer);
  });
}

export async function parseFile(buffer: Buffer, filename: string): Promise<IParsedFile> {
  const ext = getExtension(filename);
  if (!isAllowed(ext)) {
    throw new Error(`Unsupported file type: ${ext}. Allowed: .pdf, .txt, .md, .docx`);
  }

  let text: string;

  if (ext === ".pdf") {
    text = await parsePdf(buffer);
  } else if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else {
    text = new TextDecoder("utf-8").decode(buffer);
  }

  if (text.length > MAX_TEXT_SIZE) {
    throw new Error(`File too large after parsing: ${text.length} bytes (max ${MAX_TEXT_SIZE})`);
  }

  return { text, size: text.length, filename };
}
