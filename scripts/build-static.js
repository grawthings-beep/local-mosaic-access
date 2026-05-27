const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist");

const entries = [
  "index.html",
  "styles.css",
  "app.js",
  "sw.js",
  "manifest.webmanifest",
  "_headers",
  ".nojekyll",
  "models",
  "vendor"
];

function copyEntry(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(outDir, relativePath);

  if (!fs.existsSync(source)) {
    throw new Error(`Missing build input: ${relativePath}`);
  }

  copyRecursive(source, target);
}

function copyRecursive(source, target) {
  const stats = fs.statSync(source);

  if (stats.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });

    for (const child of fs.readdirSync(source)) {
      copyRecursive(path.join(source, child), path.join(target, child));
    }

    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const entry of entries) {
  copyEntry(entry);
}

inlineCriticalAssets();

console.log(`Static assets copied to ${path.relative(root, outDir)}`);

function inlineCriticalAssets() {
  const indexPath = path.join(outDir, "index.html");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const app = fs
    .readFileSync(path.join(root, "app.js"), "utf8")
    .replace(/<\/script/gi, "<\\/script");

  let html = fs.readFileSync(indexPath, "utf8");
  html = html.replace(
    /<link rel="stylesheet" href="\.\/styles\.css" \/>/,
    `<style>\n${css}\n</style>`,
  );
  html = html.replace(
    /<script src="\.\/app\.js\?v=\d+"><\/script>/,
    `<script>\n${app}\n</script>`,
  );
  fs.writeFileSync(indexPath, html);
}
