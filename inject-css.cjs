const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "dist");
const htmlPath = path.join(distDir, "index.html");

if (!fs.existsSync(htmlPath)) {
  console.error("index.html not found in dist!");
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, "utf8");

// Find CSS file in assets
const assetsDir = path.join(distDir, "assets");
const files = fs.readdirSync(assetsDir);
const cssFile = files.find(f => f.endsWith(".css"));

if (!cssFile) {
  console.error("No CSS file found in dist/assets!");
  process.exit(1);
}

const cssPath = path.join(assetsDir, cssFile);
const cssContent = fs.readFileSync(cssPath, "utf8");

// Remove the CSS link tag from html
const linkRegex = /<link[^>]*rel="stylesheet"[^>]*href="\/assets\/index[^"]*\.css"[^>]*>/;
const linkRegex2 = /<link[^>]*href="\/assets\/index[^"]*\.css"[^>]*rel="stylesheet"[^>]*>/;
html = html.replace(linkRegex, "").replace(linkRegex2, "");

// Inject the style tag inside head
const headCloseTag = "</head>";
const styleTag = `<style>${cssContent}</style>`;
html = html.replace(headCloseTag, `${styleTag}${headCloseTag}`);

fs.writeFileSync(htmlPath, html, "utf8");
console.log("Successfully inlined CSS into dist/index.html!");
