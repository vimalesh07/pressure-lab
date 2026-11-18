"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Download, FileJson, FileSpreadsheet, FileText, Loader2, Printer, Search, X } from "lucide-react";
import type { PlayerProfile } from "@/lib/types";
import { useData } from "@/lib/data";
import { cx } from "@/lib/format";
import { exportPlayers, FORMATS, SECTIONS, type ExportFormat, type ExportSection } from "@/lib/exportPlayers";

const FORMAT_ICON: Record<ExportFormat, ReactNode> = {
  docx: <FileText size={16} />,
  pdf: <Printer size={16} />,
  csv: <FileSpreadsheet size={16} />,
  json: <FileJson size={16} />,
};

type Who = "all" | "batting" | "bowling";

export function ExportDialog({
  open,
  onClose,
  profiles,
  currentId,
}: {
  open: boolean;
  onClose: () => void;
  profiles: Record<string, PlayerProfile>;
  currentId?: string;
}) {
  const kpis = useData("kpis.json");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sections, setSections] = useState<Set<ExportSection>>(new Set(SECTIONS.map((s) => s.id)));
  const [format, setFormat] = useState<ExportFormat>("docx");
  const [query, setQuery] = useState("");
  const [who, setWho] = useState<Who>("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Open: start from the player being viewed.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(currentId && profiles[currentId] ? [currentId] : []));
    setMsg(null);
    setQuery("");
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open, currentId, profiles]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input, [tabindex='0']");
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const all = useMemo(
    () => Object.values(profiles).sort((a, b) => (a.discipline === b.discipline ? (a.rank || 1e6) - (b.rank || 1e6) : a.discipline === "batting" ? -1 : 1)),
    [profiles],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((p) => (who === "all" || p.discipline === who) &&
      (!q || p.name.toLowerCase().includes(q) || p.teams.some((t) => t.toLowerCase().includes(q))));
  }, [all, query, who]);

  if (!open) return null;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const topN = (d: "batting" | "bowling") =>
    setSelected((s) => new Set([...s, ...all.filter((p) => p.discipline === d && p.rank >= 1 && p.rank <= 10).map((p) => p.id)]));
  const toggleSection = (id: ExportSection) =>
    setSections((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const chosen = all.filter((p) => selected.has(p.id));
  const canExport = chosen.length > 0 && sections.size > 0 && !busy;
  const fmt = FORMATS.find((f) => f.id === format)!;

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      await exportPlayers(format, chosen, sections, { kpis: kpis.data });
      setMsg({
        kind: "ok",
        text: format === "pdf"
          ? "Print dialog opened. Choose “Save as PDF” as the destination."
          : `Downloaded ${chosen.length} player${chosen.length > 1 ? "s" : ""} as ${fmt.label} (${fmt.ext}).`,
      });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Export failed" });
    } finally {
      setBusy(false);
    }
  }

  // portal to <body> so the blurred overlay covers the whole window (sidebar included), not just the page column
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/30 p-0 backdrop-blur-md sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        className="flex max-h-[92vh] w-full max-w-[880px] flex-col overflow-hidden rounded-t-2xl border border-ink/10 bg-bg-800 shadow-[0_30px_80px_-20px_rgba(40,25,10,0.35)] sm:rounded-2xl"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-4 border-b border-ink/[0.07] px-5 py-4">
          <div>
            <h2 id="export-title" className="font-display text-[18px] font-semibold tracking-tight">Export player data</h2>
            <p className="mt-0.5 text-[12.5px] text-text-400">Pick players, choose what to include, then download.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-text-400 hover:bg-ink/5 hover:text-text-100">
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[minmax(0,1fr)_300px] md:overflow-hidden">
          {/* 1 · players */}
          <div className="flex min-h-0 flex-col border-ink/[0.07] p-5 md:border-r">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-pink-300">1 · Players</span>
              <span className="tnum text-[12px] text-text-400">{selected.size} selected</span>
            </div>
            <label className="relative block">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or team"
                aria-label="Search players"
                className="w-full rounded-xl bg-ink/[0.04] py-2 pl-8 pr-3 text-[13px] ring-1 ring-ink/10 placeholder:text-text-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["all", "batting", "bowling"] as Who[]).map((w) => (
                <button key={w} onClick={() => setWho(w)} className={cx(
                  "rounded-lg px-2.5 py-1 text-[12px] font-medium ring-1",
                  who === w ? "bg-pink-500 text-white ring-pink-500" : "text-text-400 ring-ink/10 hover:bg-ink/5 hover:text-text-100",
                )}>
                  {w === "all" ? "All" : w === "batting" ? "Batters" : "Bowlers"}
                </button>
              ))}
              <span className="mx-1 w-px bg-ink/10" />
              <button onClick={() => topN("batting")} className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-blue-500 ring-1 ring-ink/10 hover:bg-ink/5">+ Top 10 batters</button>
              <button onClick={() => topN("bowling")} className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-blue-500 ring-1 ring-ink/10 hover:bg-ink/5">+ Top 10 bowlers</button>
              <button onClick={() => setSelected((s) => new Set([...s, ...shown.map((p) => p.id)]))} className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-text-400 ring-1 ring-ink/10 hover:bg-ink/5 hover:text-text-100">Select shown ({shown.length})</button>
              <button onClick={() => setSelected(new Set())} disabled={!selected.size} className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-text-400 ring-1 ring-ink/10 hover:bg-ink/5 hover:text-text-100 disabled:opacity-40">Clear</button>
            </div>
            <ul className="mt-3 max-h-[300px] min-h-[160px] flex-1 divide-y divide-ink/[0.05] overflow-y-auto rounded-xl ring-1 ring-ink/10 md:max-h-none" aria-label="Players">
              {shown.length === 0 && <li className="p-4 text-center text-[13px] text-text-400">No players match “{query}”.</li>}
              {shown.map((p) => {
                const on = selected.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => toggle(p.id)}
                      role="checkbox"
                      aria-checked={on}
                      className={cx("flex w-full items-center gap-3 px-3 py-2 text-left transition-colors", on ? "bg-pink-500/[0.07]" : "hover:bg-ink/[0.03]")}
                    >
                      <span className={cx("grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] ring-1", on ? "bg-pink-500 text-white ring-pink-500" : "ring-ink/25")}>
                        {on && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-text-100">{p.name}</span>
                        <span className="block truncate text-[11.5px] text-text-400">{p.discipline === "batting" ? "Batter" : "Bowler"} · {p.teams.join(", ")}</span>
                      </span>
                      <span className="tnum shrink-0 text-right text-[12px] text-text-400">
                        <span className="font-semibold text-text-100">{p.rating.toFixed(1)}</span>
                        <br />{p.rank > 0 ? `#${p.rank}` : "unranked"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* 2 · sections + 3 · format */}
          <div className="flex min-h-0 flex-col gap-5 p-5 md:overflow-y-auto">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-pink-300">2 · Include</span>
                <button
                  onClick={() => setSections(sections.size === SECTIONS.length ? new Set() : new Set(SECTIONS.map((s) => s.id)))}
                  className="text-[12px] font-medium text-blue-500 hover:underline"
                >
                  {sections.size === SECTIONS.length ? "None" : "All"}
                </button>
              </div>
              <div className="space-y-1">
                {SECTIONS.map((s) => {
                  const on = sections.has(s.id);
                  return (
                    <button key={s.id} role="checkbox" aria-checked={on} onClick={() => toggleSection(s.id)}
                      className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-ink/[0.03]">
                      <span className={cx("mt-0.5 grid h-[16px] w-[16px] shrink-0 place-items-center rounded-[4px] ring-1", on ? "bg-pink-500 text-white ring-pink-500" : "ring-ink/25")}>
                        {on && <Check size={11} strokeWidth={3} />}
                      </span>
                      <span>
                        <span className="block text-[13px] font-medium leading-tight text-text-100">{s.label}</span>
                        <span className="block text-[11.5px] leading-snug text-text-400">{s.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-pink-300">3 · Format</span>
              <div role="radiogroup" aria-label="Export format" className="grid grid-cols-2 gap-2">
                {FORMATS.map((f) => {
                  const on = f.id === format;
                  return (
                    <button key={f.id} role="radio" aria-checked={on} onClick={() => setFormat(f.id)}
                      className={cx("flex items-center gap-2 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors",
                        on ? "bg-pink-500/[0.08] text-pink-500 ring-pink-500/60" : "text-text-100 ring-ink/10 hover:bg-ink/[0.03]")}>
                      {FORMAT_ICON[f.id]}
                      <span className="text-[13px] font-semibold">{f.label}</span>
                      <span className="ml-auto text-[11px] text-text-400">{f.ext}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11.5px] text-text-400">{fmt.hint}</p>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.07] px-5 py-3.5">
          <p role="status" className={cx("min-w-0 flex-1 text-[12.5px]", msg?.kind === "err" ? "text-danger" : msg ? "text-success" : "text-text-400")}>
            {msg?.text ?? (chosen.length === 0 ? "Select at least one player." : sections.size === 0 ? "Choose at least one section." :
              `${chosen.length} player${chosen.length > 1 ? "s" : ""} · ${sections.size} section${sections.size > 1 ? "s" : ""}`)}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-[13px] font-medium text-text-400 ring-1 ring-ink/10 hover:bg-ink/5 hover:text-text-100">Close</button>
            <button onClick={run} disabled={!canExport}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-pink-500/95 to-pink-500/80 px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_24px_-10px_rgba(178,58,98,0.6)] disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Export {chosen.length > 0 ? chosen.length : ""} as {fmt.label}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
