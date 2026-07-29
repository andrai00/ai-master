import "server-only";
import { Worker } from "worker_threads";
import { join } from "path";
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

function getWorkerPath(): string {
  return join(process.cwd(), "src", "shared", "lib", "agents", "file-parser.worker.js");
}

async function parsePdfViaWorker(buffer: Buffer, onProgress?: (elapsed: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(getWorkerPath(), {
      workerData: { buffer: buffer.toString("base64") },
    });

    worker.on("message", (msg: { type: string; text?: string; elapsed?: number; message?: string }) => {
      if (msg.type === "progress") {
        onProgress?.(msg.elapsed ?? 0);
      } else if (msg.type === "done") {
        resolve(msg.text ?? "");
        void worker.terminate();
      } else if (msg.type === "error") {
        reject(new Error(msg.message ?? "errors.pdfParseFailed"));
        void worker.terminate();
      }
    });

    worker.on("error", (err) => {
      reject(new Error(`errors.pdfParseFailed: ${err.message}`));
      void worker.terminate();
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`errors.pdfParseFailed: worker exited with code ${code}`));
      }
    });
  });
}

export async function parseFile(buffer: Buffer, filename: string, onProgress?: (elapsed: number) => void): Promise<IParsedFile> {
  const ext = getExtension(filename);
  if (!isAllowed(ext)) {
    throw new Error("errors.unsupportedFileType");
  }

  let text: string;

  if (ext === ".pdf") {
    console.log(`[file-parser] Starting PDF parse via worker: ${filename} (${buffer.length} bytes)`);
    text = await parsePdfViaWorker(buffer, onProgress);
    console.log(`[file-parser] PDF parse done: ${text.length} chars`);
  } else if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else {
    text = new TextDecoder("utf-8").decode(buffer);
  }

  if (text.length > MAX_TEXT_SIZE) {
    throw new Error("errors.parsedFileTooLarge");
  }

  return { text, size: text.length, filename };
}
