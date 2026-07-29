const { parentPort, workerData } = require('worker_threads');
const PDFParser = require('pdf2json');

const { buffer: bufferBase64 } = workerData;
const buffer = Buffer.from(bufferBase64, 'base64');
const parser = new PDFParser();
const startTime = Date.now();

const progress = setInterval(() => {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  parentPort?.postMessage({ type: 'progress', elapsed });
}, 5000);

parser.on('pdfParser_dataReady', (data) => {
  clearInterval(progress);
  const lines = [];
  for (const page of data?.Pages ?? []) {
    for (const text of page?.Texts ?? []) {
      const decoded = (() => {
        try {
          return decodeURIComponent(text.R.map((r) => r.T).join(''));
        } catch {
          return text.R.map((r) => r.T).join('');
        }
      })();
      lines.push(decoded);
    }
    lines.push('');
  }
  parentPort?.postMessage({ type: 'done', text: lines.join('\n') });
});

parser.on('pdfParser_dataError', (err) => {
  clearInterval(progress);
  const msg = err instanceof Error ? err.message : String(err);
  parentPort?.postMessage({ type: 'error', message: msg });
});

parser.parseBuffer(buffer);
