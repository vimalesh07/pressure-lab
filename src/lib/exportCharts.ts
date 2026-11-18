/**
 * SVG diagrams for player exports (PDF embeds the SVG, Word embeds a PNG rendered from it):
 * heatmap grid, feature radar, normal-vs-pressure bars, and the method flow chart.
 * Pure string builders: no React, no DOM needed (except svgToPng).
 */
import type { PlayerProfile } from "./types";

const ROSE = "#B23A62";
const BLUE = "#4A73A8";
const INK = "#2B2118";
const MUTED = "#7A6A58";
const LINE = "#E3D8C6";
const FONT = "Segoe UI, Calibri, Arial, sans-serif";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function perfFill(v: number) {
  const d = Math.max(-1, Math.min(1, (v - 100) / 50));
  return d >= 0 ? `rgba(74,115,168,${(0.15 + d * 0.75).toFixed(2)})` : `rgba(178,58,98,${(0.15 - d * 0.75).toFixed(2)})`;
}

/** Weakness heatmap as a coloured grid (low-sample cells hatched grey). */
export function heatmapSvg(p: PlayerProfile) {
  const h = p.heatmap;
  const W = 640;
  const labW = 150;
  const cw = (W - labW - 10) / h.cols.length;
  const ch = 38;
  const top = 46;
  const H = top + h.rows.length * (ch + 6) + 40;
  const cell = (r: string, c: string) => h.cells.find((x) => x.row === r && x.col === c);
  let g = `<defs><pattern id="hx" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#F4EFE7"/><line x1="0" y1="0" x2="0" y2="7" stroke="#D8CCBA" stroke-width="2"/></pattern></defs>`;
  g += `<text x="0" y="16" font-size="13" font-weight="700" fill="${INK}">Weakness map · ${esc(h.rowLabel)} × ${esc(h.colLabel)}</text>`;
  g += `<text x="0" y="33" font-size="10.5" fill="${MUTED}">Pressure run index (100 = as expected). Hatched = under ${h.minBalls} balls.</text>`;
  h.cols.forEach((c, j) => {
    g += `<text x="${labW + j * cw + cw / 2}" y="${top - 4}" font-size="10.5" font-weight="700" fill="${MUTED}" text-anchor="middle">${esc(c.toUpperCase())}</text>`;
  });
  h.rows.forEach((r, i) => {
    const y = top + 4 + i * (ch + 6);
    g += `<text x="0" y="${y + ch / 2 + 4}" font-size="11.5" fill="${INK}">${esc(r)}</text>`;
    h.cols.forEach((c, j) => {
      const x = labW + j * cw;
      const v = cell(r, c);
      const low = !v || v.value === null || v.balls < h.minBalls;
      g += `<rect x="${x + 2}" y="${y}" width="${cw - 4}" height="${ch}" rx="7" fill="${low ? "url(#hx)" : perfFill(v!.value!)}" stroke="#EADFCB"/>`;
      const label = !v || v.value === null ? "–" : `${v.value}`;
      g += `<text x="${x + cw / 2}" y="${y + ch / 2 + 4}" font-size="12.5" font-weight="700" fill="${low ? MUTED : INK}" text-anchor="middle">${label}${v && v.value !== null && !low && v.value < 85 ? " ▼" : ""}</text>`;
      if (v && v.balls) g += `<text x="${x + 8}" y="${y + 11}" font-size="8.5" fill="${MUTED}">n=${v.balls}</text>`;
    });
  });
  const ly = H - 18;
  g += `<rect x="0" y="${ly - 8}" width="14" height="10" rx="2" fill="${perfFill(55)}"/><text x="18" y="${ly + 1}" font-size="10" fill="${MUTED}">weaker</text>`;
  g += `<rect x="70" y="${ly - 8}" width="14" height="10" rx="2" fill="${perfFill(145)}"/><text x="88" y="${ly + 1}" font-size="10" fill="${MUTED}">stronger</text>`;
  g += `<rect x="150" y="${ly - 8}" width="14" height="10" rx="2" fill="url(#hx)"/><text x="168" y="${ly + 1}" font-size="10" fill="${MUTED}">low sample</text>`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">${g}</svg>`, w: W, h: H };
}

/** Feature radar: player vs peer average (50). */
export function radarSvg(p: PlayerProfile) {
  const W = 520;
  const H = 400;
  const cx = W / 2;
  const cy = 215;
  const R = 140;
  const n = p.radar.length;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * (R * v) / 100, cy + Math.sin(a) * (R * v) / 100];
  };
  let g = `<text x="0" y="16" font-size="13" font-weight="700" fill="${INK}">Feature scores (percentile vs role peers)</text>`;
  for (const ring of [25, 50, 75, 100]) {
    g += `<polygon points="${p.radar.map((_, i) => pt(i, ring).join(",")).join(" ")}" fill="none" stroke="${LINE}" stroke-width="${ring === 50 ? 1.6 : 1}"/>`;
  }
  p.radar.forEach((f, i) => {
    const [x, y] = pt(i, 100);
    g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${LINE}"/>`;
    const [lx, ly] = pt(i, 122);
    g += `<text x="${lx}" y="${ly + 4}" font-size="10" fill="${MUTED}" text-anchor="middle">${esc(f.feature)}</text>`;
  });
  g += `<polygon points="${p.radar.map((f, i) => pt(i, f.peerAvg).join(",")).join(" ")}" fill="rgba(74,115,168,0.10)" stroke="${BLUE}" stroke-dasharray="4 3"/>`;
  g += `<polygon points="${p.radar.map((f, i) => pt(i, f.score).join(",")).join(" ")}" fill="rgba(178,58,98,0.22)" stroke="${ROSE}" stroke-width="2"/>`;
  p.radar.forEach((f, i) => {
    const [x, y] = pt(i, f.score);
    g += `<circle cx="${x}" cy="${y}" r="3.5" fill="${ROSE}"/>`;
  });
  g += `<rect x="0" y="${H - 18}" width="14" height="4" fill="${ROSE}"/><text x="18" y="${H - 13}" font-size="10" fill="${MUTED}">${esc(p.name)}</text>`;
  g += `<rect x="150" y="${H - 18}" width="14" height="4" fill="${BLUE}"/><text x="168" y="${H - 13}" font-size="10" fill="${MUTED}">peer average (50)</text>`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">${g}</svg>`, w: W, h: H };
}

/** Normal vs pressure: paired bars per metric (each pair scaled to its own max). */
export function comparisonSvg(p: PlayerProfile) {
  const rows = p.comparison.filter((m) => m.normal !== null && m.pressure !== null);
  const W = 640;
  const rowH = 34;
  const top = 34;
  const H = top + rows.length * rowH + 26;
  const labW = 210;
  const barW = W - labW - 90;
  let g = `<text x="0" y="16" font-size="13" font-weight="700" fill="${INK}">Normal vs pressure</text>`;
  rows.forEach((m, i) => {
    const y = top + i * rowH;
    const mx = Math.max(Math.abs(m.normal!), Math.abs(m.pressure!)) || 1;
    g += `<text x="0" y="${y + 14}" font-size="11" fill="${INK}">${esc(m.label)}</text>`;
    g += `<rect x="${labW}" y="${y + 3}" width="${(barW * Math.abs(m.normal!)) / mx}" height="9" rx="4" fill="${BLUE}"/>`;
    g += `<rect x="${labW}" y="${y + 15}" width="${(barW * Math.abs(m.pressure!)) / mx}" height="9" rx="4" fill="${ROSE}"/>`;
    const f = (v: number) => (m.unit === "%" ? `${v.toFixed(1)}%` : m.unit === "rpo" ? v.toFixed(2) : v.toFixed(1));
    g += `<text x="${labW + barW + 8}" y="${y + 11}" font-size="10" fill="${BLUE}">${f(m.normal!)}</text>`;
    g += `<text x="${labW + barW + 8}" y="${y + 24}" font-size="10" fill="${ROSE}">${f(m.pressure!)}</text>`;
  });
  g += `<rect x="0" y="${H - 14}" width="14" height="8" rx="3" fill="${BLUE}"/><text x="18" y="${H - 7}" font-size="10" fill="${MUTED}">normal balls</text>`;
  g += `<rect x="110" y="${H - 14}" width="14" height="8" rx="3" fill="${ROSE}"/><text x="128" y="${H - 7}" font-size="10" fill="${MUTED}">pressure balls</text>`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">${g}</svg>`, w: W, h: H };
}

/** The rating pipeline as a flow chart (also shown on the Method page). */
export const FLOW_STEPS: { t: string; d: string }[] = [
  { t: "Ball-by-ball data", d: "IPL + T20I 2022–26, A-team cups removed" },
  { t: "Win-probability model", d: "Logistic regression + isotonic, exact end-game DP" },
  { t: "Leverage × stakes", d: "Expected WP swing per ball × match stakes" },
  { t: "Pressure balls", d: "Top 20% per side (batting / bowling)" },
  { t: "Expected runs & wickets", d: "State cell × opponent tier & Elo (Poisson GLM)" },
  { t: "Player components", d: "Runs / outs / WPA above expected, consistency, layers" },
  { t: "Shrink + weight", d: "Empirical Bayes, normal-skill prior, recency, reliability" },
  { t: "Rating 0–100 & top 10", d: "100·Φ(z/2), eligibility, 1,000 bootstrap resamples" },
];

export function flowSvg() {
  const W = 640;
  const bw = 280;
  const bh = 46;
  const gap = 22;
  const colX = [10, W - bw - 10];
  const perCol = 4;
  const H = 34 + perCol * (bh + gap) + 6;
  let g = `<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${ROSE}"/></marker></defs>`;
  g += `<text x="0" y="16" font-size="13" font-weight="700" fill="${INK}">How the Pressure Rating is built</text>`;
  const pos = FLOW_STEPS.map((_, i) => ({ x: colX[Math.floor(i / perCol)], y: 34 + (i % perCol) * (bh + gap) }));
  FLOW_STEPS.forEach((s, i) => {
    const { x, y } = pos[i];
    g += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="12" fill="${i === FLOW_STEPS.length - 1 ? "#FBEAF0" : "#FFFBF4"}" stroke="${i === FLOW_STEPS.length - 1 ? ROSE : "#E3D3BE"}"/>`;
    g += `<circle cx="${x + 18}" cy="${y + bh / 2}" r="10" fill="${ROSE}"/><text x="${x + 18}" y="${y + bh / 2 + 4}" font-size="10.5" font-weight="700" fill="white" text-anchor="middle">${i + 1}</text>`;
    g += `<text x="${x + 36}" y="${y + 19}" font-size="12" font-weight="700" fill="${INK}">${esc(s.t)}</text>`;
    g += `<text x="${x + 36}" y="${y + 35}" font-size="9.5" fill="${MUTED}">${esc(s.d)}</text>`;
    if (i < FLOW_STEPS.length - 1) {
      const a = pos[i];
      const b = pos[i + 1];
      if (a.x === b.x) g += `<line x1="${a.x + bw / 2}" y1="${a.y + bh}" x2="${b.x + bw / 2}" y2="${b.y - 2}" stroke="${ROSE}" stroke-width="1.6" marker-end="url(#ar)"/>`;
      else g += `<path d="M${a.x + bw},${a.y + bh / 2} C${a.x + bw + 30},${a.y + bh / 2} ${b.x - 30},${b.y + bh / 2} ${b.x - 2},${b.y + bh / 2}" fill="none" stroke="${ROSE}" stroke-width="1.6" marker-end="url(#ar)"/>`;
    }
  });
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">${g}</svg>`, w: W, h: H };
}

/** Render an SVG string to PNG bytes (browser only) for the Word export. */
export async function svgToPng(svg: string, w: number, h: number, scale = 2): Promise<Uint8Array> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("diagram render failed"));
      img.src = url;
    });
    const c = document.createElement("canvas");
    c.width = w * scale;
    c.height = h * scale;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
