"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { loadMatchIndex, useData } from "@/lib/data";
import type { MatchIndexEntry } from "@/lib/types";
import { cx } from "@/lib/format";

type Hit = { key: string; label: string; sub: string; href: string };

/** Top-bar search (every page except the Overview): players → profile, matches → match centre. Ctrl/⌘+K focuses it. */
export function GlobalSearch() {
  const router = useRouter();
  const players = useData("players.json").data ?? [];
  const [matches, setMatches] = useState<MatchIndexEntry[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !matches.length) loadMatchIndex().then(setMatches).catch(() => {});
  }, [open, matches.length]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", key);
    document.addEventListener("mousedown", away);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", away);
    };
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const t = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!t.length) return [];
    const ok = (s: string) => t.every((w) => s.toLowerCase().includes(w));
    const ps = players
      .filter((p) => ok(`${p.name} ${p.teams.join(" ")} ${p.role}`))
      .slice(0, 6)
      .map((p) => ({ key: `p${p.id}`, label: p.name, sub: `${p.role} · ${p.teams.slice(0, 2).join(", ")}${p.rank ? ` · #${p.rank}` : ""}`, href: `/player/?id=${p.id}` }));
    const ms = matches
      .filter((m) => ok(`${m.competition} ${m.teamA} ${m.teamB} ${m.teamACode ?? ""} ${m.teamBCode ?? ""} ${m.date} ${m.players.map((p) => p.name).join(" ")}`))
      .slice(0, 6)
      .map((m) => ({
        key: `m${m.id}`,
        label: `${m.teamACode ?? m.teamA} vs ${m.teamBCode ?? m.teamB}`,
        sub: `${m.competition}${m.matchNumber ? ` · M${m.matchNumber}` : ""} · ${m.date}`,
        href: `/evidence/?match=${m.id}${m.players[0] ? `&who=${m.players[0].id}` : ""}`,
      }));
    return [...ps, ...ms];
  }, [q, players, matches]);
  useEffect(() => setHi(0), [q]);

  const go = (h: Hit) => {
    router.push(h.href);
    setQ("");
    setOpen(false);
  };

  return (
    <div ref={box} className="relative w-full sm:w-[300px]">
      <label className="flex items-center gap-2 rounded-xl border border-white/60 bg-white/40 px-3 py-2 shadow-[0_6px_18px_-12px_rgba(60,40,20,0.35)] backdrop-blur-md focus-within:border-pink-500/40 focus-within:bg-white/70 focus-within:shadow-[0_0_0_3px_rgba(178,58,98,0.12)]">
        <Search size={14} className="shrink-0 text-text-400" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setHi((h) => Math.min(hits.length - 1, h + 1)));
            else if (e.key === "ArrowUp") (e.preventDefault(), setHi((h) => Math.max(0, h - 1)));
            else if (e.key === "Enter" && hits[hi]) go(hits[hi]);
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search players or matches…"
          aria-label="Search players or matches"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-text-100 placeholder:text-text-400 focus:outline-none"
        />
        {q ? (
          <button onClick={() => setQ("")} aria-label="Clear search" className="text-text-400 hover:text-text-100">
            <X size={13} />
          </button>
        ) : (
          <kbd className="hidden rounded bg-ink/[0.06] px-1.5 text-[10px] text-text-400 sm:inline">Ctrl K</kbd>
        )}
      </label>
      {open && q.trim() && (
        <ul className="absolute right-0 top-full z-50 mt-1.5 max-h-[360px] w-full min-w-[300px] overflow-auto rounded-2xl border border-white/70 bg-white/80 py-1 shadow-[0_18px_40px_-18px_rgba(60,40,20,0.45)] backdrop-blur-xl">
          {hits.length === 0 && <li className="px-3 py-2 text-[12.5px] text-text-400">No player or match found</li>}
          {hits.map((h, i) => (
            <li
              key={h.key}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => (e.preventDefault(), go(h))}
              className={cx("cursor-pointer px-3 py-2", i === hi && "bg-pink-500/[0.08]")}
            >
              <div className="text-[13px] font-semibold text-text-100">{h.label}</div>
              <div className="text-[11.5px] text-text-400">{h.sub}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
