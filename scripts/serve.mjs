/** Serves the static export in ./out at http://localhost:4173 (no extra packages needed). */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

const ROOT = resolve(process.cwd(), "out");
const PORT = Number(process.env.PORT ?? 4173);
if (!existsSync(ROOT)) {
  console.error("No ./out folder. Run `npm run build` first.");
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = resolve(ROOT, "." + urlPath);
  const outside = file !== ROOT && !file.startsWith(ROOT + sep); // block path traversal
  if (!outside && existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  let status = 200;
  if (outside || !existsSync(file)) {
    file = join(ROOT, "404.html");
    status = 404;
  }
  res.writeHead(status, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`Pressure Lab running at http://localhost:${PORT}`));
