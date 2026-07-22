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
    const startTime = Date.now();

    // Progress indicator
    const progress = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[file-parser] Still parsing PDF... ${elapsed}s elapsed`);
    }, 5000);

    const cleanup = () => {
      clearTimeout(timeout);
      clearInterval(progress);
    };

    // Timeout: 120s for large PDFs
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("PDF parsing timed out after 120s. The file might be too complex or corrupted."));
    }, 120_000);

    parser.on("pdfParser_dataReady", (data: { Pages: Array<{ Texts: Array<{ R: Array<{ T: string }> }> }> }) => {
      cleanup();
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[file-parser] PDF parse done: ${data.Pages?.length ?? 0} pages, ${elapsed}s`);
      const lines: string[] = [];
      for (const page of data?.Pages ?? []) {
        for (const text of page?.Texts ?? []) {
          const decoded = decodeURIComponent(
            text.R.map((r) => r.T).join("")
          );
          lines.push(decoded);
        }
        lines.push("");
      }
      resolve(lines.join("\n"));
    });

    parser.on("pdfParser_dataError", (err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error("PDF parse failed"));
    });

    try {
      parser.parseBuffer(buffer);
    } catch (err: unknown) {
      clearTimeout(timeout);
      reject(err instanceof Error ? err : new Error("PDF parse failed"));
    }
  });
}

export async function parseFile(buffer: Buffer, filename: string): Promise<IParsedFile> {
  const ext = getExtension(filename);
  if (!isAllowed(ext)) {
    throw new Error(`Unsupported file type: ${ext}. Allowed: .pdf, .txt, .md, .docx`);
  }

  let text: string;

  if (ext === ".pdf") {
    console.log(`[file-parser] Starting PDF parse: ${filename} (${buffer.length} bytes)`);
    text = await parsePdf(buffer);
    console.log(`[file-parser] PDF parse done: ${text.length} chars`);
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
