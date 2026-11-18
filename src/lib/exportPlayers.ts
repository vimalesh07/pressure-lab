/**
 * Player export: builds Word (.docx), PDF (print), CSV and JSON files from player profiles,
 * entirely in the browser (the site is a static export, there is no server).
 */
import type { ComparisonMetric, Kpis, PlayerProfile } from "./types";
import { comparisonSvg, flowSvg, heatmapSvg, radarSvg, svgToPng } from "./exportCharts";

export type ExportFormat = "docx" | "pdf" | "csv" | "json";
export type ExportSection = "summary" | "comparison" | "radar" | "matchups" | "consistency" | "heatmap" | "moments" | "flow";

export const SECTIONS: { id: ExportSection; label: string; hint: string }[] = [
  { id: "summary", label: "Summary", hint: "Rating, 90% interval, rank, pressure balls, matches" },
  { id: "comparison", label: "Normal vs pressure", hint: "Key stats in both situations" },
  { id: "radar", label: "Feature scores", hint: "Percentile vs peers for each model feature" },
  { id: "matchups", label: "Matchups", hint: "Pressure balls vs Elite / Strong / Normal tiers" },
  { id: "consistency", label: "Season record", hint: "Pressure innings and average match score per season" },
  { id: "heatmap", label: "Heatmap", hint: "Performance by opponent type x phase" },
  { id: "moments", label: "Signature moments", hint: "Three biggest pressure contributions" },
  { id: "flow", label: "Method flow chart", hint: "Diagram of how the rating is built" },
];

export const FORMATS: { id: ExportFormat; label: string; ext: string; hint: string }[] = [
  { id: "docx", label: "Word", ext: ".docx", hint: "Editable document, one player per page" },
  { id: "pdf", label: "PDF", ext: ".pdf", hint: "Opens the print dialog: choose “Save as PDF”" },
  { id: "csv", label: "Excel", ext: ".csv", hint: "One row per player (CSV), opens in Excel or Google Sheets" },
  { id: "json", label: "JSON", ext: ".json", hint: "Raw profile data for analysts and tools" },
];

export interface ExportMeta {
  kpis?: Kpis;
}

/* ------------------------------------------------------------------ helpers */

const signed = (n: number, d = 1) => `${n > 0 ? "+" : n < 0 ? "-" : "±"}${Math.abs(n).toFixed(d)}`;

function fmtMetric(m: ComparisonMetric, v: number | null) {
  if (v === null) return "–";
  if (m.unit === "%") return `${v.toFixed(1)}%`;
  if (m.unit === "rpo") return v.toFixed(2);
  if (m.unit === "wpa") return `${signed(v, 2)} pts`;
  return v.toFixed(2);
}

function metricChange(m: ComparisonMetric) {
  if (m.normal === null || m.pressure === null) return "–";
  if (m.unit === "wpa") return `${signed(m.pressure - m.normal, 2)} pts`;
  if (!m.normal) return "–";
  return `${signed(((m.pressure - m.normal) / Math.abs(m.normal)) * 100)}%`;
}

function metricGood(m: ComparisonMetric) {
  if (m.normal === null || m.pressure === null) return true;
  const d = m.pressure - m.normal;
  return m.better === "higher" ? d >= 0 : d <= 0;
}

function seasonRows(p: PlayerProfile) {
  return p.consistency.map((s) => {
    const n = s.innings.length;
    const balls = s.innings.reduce((a, x) => a + x.balls, 0);
    const avg = n ? s.innings.reduce((a, x) => a + x.score, 0) / n : 0;
    const best = n ? Math.max(...s.innings.map((x) => x.score)) : 0;
    const above = n ? (s.innings.filter((x) => x.score >= 50).length / n) * 100 : 0;
    return { season: s.season, innings: n, balls, avg, best, above };
  });
}

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** rank 0 = below the eligibility rules (profile exists, not on the leaderboard). */
export function rankText(p: PlayerProfile, long = false) {
  if (p.rank <= 0) return "Unranked (below eligibility)";
  return long ? `#${p.rank} of ${p.rankOf} ${p.discipline === "batting" ? "batters" : "bowlers"}` : `#${p.rank} / ${p.rankOf}`;
}

const today = () => new Date().toISOString().slice(0, 10);

export function fileBase(profiles: PlayerProfile[]) {
  if (profiles.length === 1) return `PressureLab_${profiles[0].name.replace(/[^A-Za-z0-9]+/g, "_")}`;
  return `PressureLab_${profiles.length}_players_${today()}`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Every section as plain rows, shared by Word and PDF so both always match. */
interface Block {
  title: string;
  note?: string;
  head: string[];
  rows: string[][];
  tone?: (r: number, c: number) => "good" | "bad" | undefined;
  /** Diagram drawn under the table (PDF: inline SVG, Word: PNG). */
  chart?: { svg: string; w: number; h: number };
}

function blocks(p: PlayerProfile, sections: Set<ExportSection>): Block[] {
  const out: Block[] = [];
  const bat = p.discipline === "batting";
  if (sections.has("summary")) {
    out.push({
      title: "Summary",
      head: ["Pressure Rating", "90% interval", "Rank", "Pressure balls", "Matches"],
      rows: [[
        p.rating.toFixed(1),
        `${p.ciLow.toFixed(0)}–${p.ciHigh.toFixed(0)}`,
        rankText(p, true),
        String(p.pressureBalls),
        String(p.matches),
      ]],
    });
  }
  if (sections.has("comparison")) {
    out.push({
      title: "Normal vs pressure",
      note: "Same player, two situations.",
      head: ["Metric", "Normal", "Pressure", "Change"],
      rows: p.comparison.map((m) => [m.label, fmtMetric(m, m.normal), fmtMetric(m, m.pressure), metricChange(m)]),
      tone: (r, c) => (c === 3 ? (metricGood(p.comparison[r]) ? "good" : "bad") : undefined),
      chart: comparisonSvg(p),
    });
  }
  if (sections.has("radar")) {
    out.push({
      title: "Feature scores",
      note: "Percentile vs eligible peers (50 = peer average).",
      head: ["Feature", "Score", "Peer average"],
      rows: p.radar.map((f) => [f.feature, String(f.score), String(f.peerAvg)]),
      tone: (r, c) => (c === 1 ? (p.radar[r].score >= p.radar[r].peerAvg ? "good" : "bad") : undefined),
      chart: radarSvg(p),
    });
  }
  if (sections.has("matchups")) {
    out.push({
      title: "Matchups",
      note: `Pressure balls vs ${bat ? "bowler" : "batter"} tiers. Change is vs the player's own pressure baseline.`,
      head: ["Tier", "Balls", "Stat", "Value", "Change", bat ? "Dismissals" : "Wickets"],
      rows: p.matchups.map((t) => [
        `vs ${t.tier}`,
        String(t.balls),
        t.statLabel,
        t.statLabel === "Econ" ? t.value.toFixed(2) : t.value.toFixed(1),
        `${signed(t.deltaPct)}%`,
        String(t.dismissals),
      ]),
      tone: (r, c) => (c === 4 ? (p.matchups[r].deltaPct >= 0 ? "good" : "bad") : undefined),
    });
  }
  if (sections.has("consistency")) {
    const s = seasonRows(p);
    out.push({
      title: "Season record",
      note: "Match score 0–100 = performance vs expected in that match's pressure balls.",
      head: ["Season", "Pressure innings", "Pressure balls", "Avg match score", "Best", "Innings ≥ 50"],
      rows: s.map((x) => [x.season, String(x.innings), String(x.balls), x.avg.toFixed(1), String(x.best), `${x.above.toFixed(0)}%`]),
    });
  }
  if (sections.has("heatmap")) {
    const h = p.heatmap;
    const cell = (r: string, c: string) => h.cells.find((x) => x.row === r && x.col === c);
    out.push({
      title: "Heatmap",
      note: `${h.metricLabel}. Balls in brackets; cells under ${h.minBalls} balls are low-sample.`,
      head: [h.rowLabel, ...h.cols],
      rows: h.rows.map((r) => [
        r,
        ...h.cols.map((c) => {
          const x = cell(r, c);
          if (!x || x.value === null) return "–";
          return `${x.value} (${x.balls})${x.balls < h.minBalls ? " *" : ""}`;
        }),
      ]),
      tone: (ri, ci) => {
        if (ci === 0) return undefined;
        const x = cell(h.rows[ri], h.cols[ci - 1]);
        if (!x || x.value === null || x.balls < h.minBalls) return undefined;
        return x.value >= 100 ? "good" : "bad";
      },
      chart: heatmapSvg(p),
    });
  }
  if (sections.has("moments")) {
    out.push({
      title: "Signature moments",
      note: "Biggest pressure contributions, by win-probability swing.",
      head: ["Match", "Date", "Over", "What happened", "WP swing"],
      rows: p.signatureMoments.map((m) => [
        `${m.match} · ${m.competition}`,
        fmtDate(m.date),
        m.over,
        m.description,
        `${signed(m.wpSwing)} pts`,
      ]),
    });
  }
  if (sections.has("flow")) {
    out.push({
      title: "How the rating is built",
      note: "The pipeline behind every Pressure Rating (details on the Method page).",
      head: [],
      rows: [],
      chart: flowSvg(),
    });
  }
  return out;
}

function subtitle(p: PlayerProfile) {
  return `${p.role} · ${p.style} · ${p.teams.join(", ")} · ${p.formats.join(", ")}`;
}

function footerText(meta: ExportMeta) {
  const k = meta.kpis;
  const bits = ["Pressure Lab player report", `exported ${today()}`];
  if (k) bits.push(`data ${k.dataWindow}`, `model ${k.modelVersion}`);
  return bits.join(" · ");
}

/* ------------------------------------------------------------------ Word */

async function exportDocx(profiles: PlayerProfile[], sections: Set<ExportSection>, meta: ExportMeta) {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, ShadingType,
    AlignmentType, Footer, PageNumber, BorderStyle, ImageRun } = d;
  const image = async (c: NonNullable<Block["chart"]>) => {
    const w = 600;
    const h = Math.round((c.h * w) / c.w);
    return new Paragraph({
      spacing: { before: 120, after: 120 },
      children: [new ImageRun({ type: "png", data: await svgToPng(c.svg, c.w, c.h), transformation: { width: w, height: h } })],
    });
  };
  const PINK = "B23A62";
  const BLUE = "4A73A8";
  const border = { style: BorderStyle.SINGLE, size: 4, color: "D9CFC0" };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

  const cell = (text: string, opts: { head?: boolean; tone?: "good" | "bad" } = {}) =>
    new TableCell({
      shading: opts.head ? { type: ShadingType.CLEAR, color: "auto", fill: "F3ECE0" } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({
        children: [new TextRun({
          text,
          bold: opts.head,
          size: 19,
          color: opts.tone === "good" ? "2E7D4F" : opts.tone === "bad" ? PINK : undefined,
        })],
      })],
    });

  const table = (b: Block) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders,
      rows: [
        new TableRow({ tableHeader: true, children: b.head.map((h) => cell(h, { head: true })) }),
        ...b.rows.map((r, ri) => new TableRow({ children: r.map((v, ci) => cell(v, { tone: b.tone?.(ri, ci) })) })),
      ],
    });

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];

  if (profiles.length > 1) {
    children.push(
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: "Pressure Lab · player export", color: PINK })] }),
      new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: `${profiles.length} players · ${today()}`, color: "6B6258" })] }),
      table({
        title: "Players",
        head: ["Player", "Role", "Rating", "90% interval", "Rank", "Pressure balls", "Matches"],
        rows: profiles.map((p) => [p.name, p.role, p.rating.toFixed(1), `${p.ciLow.toFixed(0)}–${p.ciHigh.toFixed(0)}`,
          rankText(p), String(p.pressureBalls), String(p.matches)]),
      }),
    );
  }

  for (const [i, p] of profiles.entries()) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: profiles.length > 1 || i > 0,
        children: [new TextRun({ text: p.name, color: PINK })],
      }),
      new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: subtitle(p), color: BLUE })] }),
    );
    for (const b of blocks(p, sections)) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [new TextRun(b.title)] }));
      if (b.note) children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: b.note, italics: true, size: 18, color: "6B6258" })] }));
      if (b.head.length) children.push(table(b));
      if (b.chart) children.push(await image(b.chart));
    }
  }

  const doc = new Document({
    creator: "Pressure Lab",
    title: profiles.length === 1 ? `${profiles[0].name} · Pressure Lab` : "Pressure Lab player export",
    styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `${footerText(meta)} · page `, size: 16, color: "8A8076" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "8A8076" }),
            ],
          })],
        }),
      },
      children,
    }],
  });
  download(await Packer.toBlob(doc), `${fileBase(profiles)}.docx`);
}

/* ------------------------------------------------------------------ PDF (print) */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function reportHtml(profiles: PlayerProfile[], sections: Set<ExportSection>, meta: ExportMeta) {
  const tableHtml = (b: Block) =>
    `<table><thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows
      .map((r, ri) => `<tr>${r.map((v, ci) => `<td class="${b.tone?.(ri, ci) ?? ""}">${esc(v)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  const cover = profiles.length > 1
    ? `<section class="cover"><h1>Pressure Lab · player export</h1><p class="sub">${profiles.length} players · ${today()}</p>${tableHtml({
      title: "", head: ["Player", "Role", "Rating", "90% interval", "Rank", "Pressure balls", "Matches"],
      rows: profiles.map((p) => [p.name, p.role, p.rating.toFixed(1), `${p.ciLow.toFixed(0)}–${p.ciHigh.toFixed(0)}`,
        rankText(p), String(p.pressureBalls), String(p.matches)]),
    })}</section>`
    : "";
  const meta1 = `<p class="meta">${esc(footerText(meta))}</p>`;
  const body = profiles.map((p) => `<section class="player"><h1>${esc(p.name)}</h1><p class="sub">${esc(subtitle(p))}</p>${meta1}${blocks(p, sections)
    .map((b) => `<h2>${esc(b.title)}</h2>${b.note ? `<p class="note">${esc(b.note)}</p>` : ""}${b.head.length ? tableHtml(b) : ""}${b.chart ? `<div class="chart">${b.chart.svg}</div>` : ""}`)
    .join("")}</section>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(fileBase(profiles))}</title><style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.4 "Segoe UI", Calibri, Arial, sans-serif; color: #2a2520; margin: 0; }
  h1 { color: #b23a62; font-size: 20pt; margin: 0 0 2pt; }
  h2 { font-size: 12pt; margin: 14pt 0 4pt; color: #2a2520; }
  .sub { color: #4a73a8; margin: 0 0 8pt; }
  .note { color: #6b6258; font-style: italic; font-size: 9pt; margin: 0 0 4pt; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; break-inside: auto; }
  th, td { border: 1px solid #d9cfc0; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #f3ece0; font-weight: 600; }
  tr { break-inside: avoid; }
  td.good { color: #2e7d4f; font-weight: 600; } td.bad { color: #b23a62; font-weight: 600; }
  section.player + section.player, section.cover + section.player { break-before: page; }
  .sub { margin-bottom: 2pt; }
  .meta { color: #8a8076; font-size: 8pt; margin: 0 0 8pt; }
  .chart { margin: 8pt 0 4pt; break-inside: avoid; }
  .chart svg { max-width: 100%; height: auto; }
  </style></head><body>${cover}${body}</body></html>`;
}

function exportPdf(profiles: PlayerProfile[], sections: Set<ExportSection>, meta: ExportMeta) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(frame);
  const w = frame.contentWindow!;
  w.document.open();
  w.document.write(reportHtml(profiles, sections, meta));
  w.document.close();
  // The print dialog's "Save as PDF" destination writes the file.
  const back = (document.activeElement as HTMLElement | null) ?? null;
  return new Promise<void>((done) => {
    setTimeout(() => {
      w.focus();
      w.print(); // blocks until the print dialog closes
      // hand keyboard focus back to the page so Esc / Tab keep working in the export dialog
      window.focus();
      back?.focus();
      setTimeout(() => frame.remove(), 1000);
      done();
    }, 250);
  });
}

/* ------------------------------------------------------------------ CSV */

function csvValue(v: unknown) {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function profilesCsv(profiles: PlayerProfile[], sections: Set<ExportSection>) {
  const cols: string[] = [];
  const seen = new Set<string>();
  const rows = profiles.map((p) => {
    const r: Record<string, string | number> = {};
    const put = (k: string, v: string | number) => {
      if (!seen.has(k)) { seen.add(k); cols.push(k); }
      r[k] = v;
    };
    put("Player", p.name);
    put("Player ID", p.id);
    put("Role", p.role);
    put("Discipline", p.discipline);
    put("Style", p.style);
    put("Teams", p.teams.join(" / "));
    put("Formats", p.formats.join(" / "));
    if (sections.has("summary")) {
      put("Pressure Rating", p.rating);
      put("Rating 90% low", p.ciLow);
      put("Rating 90% high", p.ciHigh);
      put("Rank", p.rank > 0 ? p.rank : "Unranked");
      put("Rank of", p.rankOf);
      put("Pressure balls", p.pressureBalls);
      put("Matches", p.matches);
    }
    if (sections.has("comparison")) for (const m of p.comparison) {
      put(`${m.label} (normal)`, m.normal ?? "");
      put(`${m.label} (pressure)`, m.pressure ?? "");
    }
    if (sections.has("radar")) for (const f of p.radar) put(`Feature: ${f.feature}`, f.score);
    if (sections.has("matchups")) for (const t of p.matchups) {
      put(`vs ${t.tier} balls`, t.balls);
      put(`vs ${t.tier} ${t.statLabel}`, t.value);
      put(`vs ${t.tier} change %`, t.deltaPct);
      put(`vs ${t.tier} ${p.discipline === "batting" ? "dismissals" : "wickets"}`, t.dismissals);
    }
    if (sections.has("consistency")) for (const s of seasonRows(p)) {
      put(`${s.season} pressure innings`, s.innings);
      put(`${s.season} pressure balls`, s.balls);
      put(`${s.season} avg match score`, Number(s.avg.toFixed(1)));
    }
    if (sections.has("heatmap")) for (const c of p.heatmap.cells) {
      if (c.value !== null) put(`Heatmap: ${c.row} · ${c.col}`, c.value);
    }
    if (sections.has("moments")) p.signatureMoments.forEach((m, i) => {
      put(`Moment ${i + 1}`, `${m.match} ${m.competition}, ${m.date}, over ${m.over}: ${m.description} (${signed(m.wpSwing)} pts WP)`);
    });
    return r;
  });
  const lines = [cols.map(csvValue).join(","), ...rows.map((r) => cols.map((c) => csvValue(r[c])).join(","))];
  return "﻿" + lines.join("\r\n"); // BOM so Excel reads UTF-8 names correctly
}

/* ------------------------------------------------------------------ JSON */

const SECTION_KEYS: Record<ExportSection, (keyof PlayerProfile)[]> = {
  summary: ["rating", "ciLow", "ciHigh", "rank", "rankOf", "pressureBalls", "matches"],
  comparison: ["comparison"],
  radar: ["radar"],
  matchups: ["matchups"],
  consistency: ["consistency"],
  heatmap: ["heatmap"],
  moments: ["signatureMoments"],
  flow: [],
};

export function profilesJson(profiles: PlayerProfile[], sections: Set<ExportSection>, meta: ExportMeta) {
  const keep: (keyof PlayerProfile)[] = ["id", "name", "role", "discipline", "style", "teams", "formats"];
  for (const s of sections) keep.push(...SECTION_KEYS[s]);
  return JSON.stringify({
    exported: today(),
    dataWindow: meta.kpis?.dataWindow,
    modelVersion: meta.kpis?.modelVersion,
    sections: [...sections],
    players: profiles.map((p) => Object.fromEntries(keep.map((k) => [k, p[k]]))),
  }, null, 2);
}

/* ------------------------------------------------------------------ entry */

export async function exportPlayers(format: ExportFormat, profiles: PlayerProfile[], sections: Set<ExportSection>, meta: ExportMeta = {}) {
  if (!profiles.length) throw new Error("Select at least one player");
  const base = fileBase(profiles);
  if (format === "docx") return exportDocx(profiles, sections, meta);
  if (format === "pdf") return exportPdf(profiles, sections, meta);
  if (format === "csv") return download(new Blob([profilesCsv(profiles, sections)], { type: "text/csv;charset=utf-8" }), `${base}.csv`);
  return download(new Blob([profilesJson(profiles, sections, meta)], { type: "application/json" }), `${base}.json`);
}
