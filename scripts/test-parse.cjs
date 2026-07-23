// Quick PDF parsing test — run: node scripts/test-parse.cjs
const PDFParser = require("pdf2json");
const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "test.pdf");
const buffer = fs.readFileSync(filePath);

console.log(`File: ${filePath}`);
console.log(`Size: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
console.log("Starting parse...");

const start = Date.now();
const progress = setInterval(() => {
  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`  ... ${elapsed}s`);
}, 5000);

const parser = new PDFParser();
parser.on("pdfParser_dataReady", (data) => {
  clearInterval(progress);
  const elapsed = (Date.now() - start) / 1000;
  const pages = data.Pages?.length ?? 0;
  
  // Count text items
  let textLen = 0;
  let errors = 0;
  for (const page of data.Pages ?? []) {
    for (const text of page.Texts ?? []) {
      try {
        textLen += decodeURIComponent(text.R.map(r => r.T).join("")).length;
      } catch {
        errors++;
        textLen += text.R.map(r => r.T).join("").length;
      }
    }
  }
  
  console.log(`\nDONE: ${pages} pages, ${textLen} chars, ${errors} decode errors, ${elapsed.toFixed(1)}s`);
  
  // Show first page text preview
  if (data.Pages?.[0]?.Texts) {
    const firstPageText = data.Pages[0].Texts.slice(0, 5).map(t => {
      try { return decodeURIComponent(t.R.map(r => r.T).join("")); }
      catch { return t.R.map(r => r.T).join(""); }
    }).join("\n");
    console.log(`\nFirst page preview:\n${firstPageText.slice(0, 500)}`);
  }
});

parser.on("pdfParser_dataError", (err) => {
  clearInterval(progress);
  console.error("ERROR:", err);
});

parser.parseBuffer(buffer);
