/**
 * Captures every screen at 1440×900 into /screenshots.
 *   npm run build && npm run screenshots
 * Uses an installed Chrome or Edge via playwright-core (set CHROME_PATH to override).
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";

const ROOT = join(process.cwd(), "out");
const OUT = join(process.cwd(), "screenshots");
mkdirSync(OUT, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain", ".ico": "image/x-icon" };
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  let file = join(ROOT, p);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) file = join(ROOT, "404.html");
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4173, r));

const candidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const executablePath = candidates.find((c) => existsSync(c));
if (!executablePath) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");

const SHOTS = [
  ["01-overview", "/"],
  ["02-leaderboards-batters", "/leaderboards/?tab=batters"],
  ["02b-leaderboards-bowlers", "/leaderboards/?tab=bowlers"],
  ["03-player-profile", `/player/?id=${JSON.parse(readFileSync(join(process.cwd(), "public", "data", "leaderboard_batters.json"), "utf8")).views[0].rows[0]?.playerId ?? ""}`],
  ["04-match-replay", "/replay/"],
  ["05-matchup-arena", "/matchups/"],
  ["06-scouting-room", "/scouting/"],
  ["07-method", "/method/"],
];

const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark" });
for (const [name, path] of SHOTS) {
  const page = await ctx.newPage();
  await page.goto(`http://localhost:4173${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2600); // let count-ups and chart draw-ins finish
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  if (process.env.FULL) await page.screenshot({ path: join(OUT, `${name}-full.png`), fullPage: true });
  console.log("captured", name);
  await page.close();
}
await browser.close();
server.close();
