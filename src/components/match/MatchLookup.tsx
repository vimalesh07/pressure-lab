"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { MatchIndexEntry } from "@/lib/types";
import { cx } from "@/lib/format";
import { BORDER, codeFromName } from "./model";

export function matchLabel(m: MatchIndexEntry) {
  const a = m.teamACode ?? codeFromName(m.teamA);
  const b = m.teamBCode ?? codeFromName(m.teamB);
  const d = new Date(m.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${m.competition}${m.matchNumber ? ` · M${m.matchNumber}` : ""} · ${a} vs ${b} · ${d}`;
}

/** Searchable match combobox + player chips (players with ball-by-ball data in that match). */
export function MatchLookup({
  index,
  matchId,
  playerId,
  onPick,
}: {
  index: MatchIndexEntry[];
  matchId: string;
  playerId: string;
  onPick: (matchId: string, playerId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const cur = index.find((m) => m.id === matchId);

  const hay = useMemo(
    () =>
      index.map((m) =>
        [m.competition, m.season, m.date, m.teamA, m.teamB, m.teamACode, m.teamBCode, m.matchNumber ? `m${m.matchNumber}` : "",
          new Date(m.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
          ...m.players.map((p) => p.name)].join(" ").toLowerCase(),
      ),
    [index],
  );
  const results = useMemo(() => {
    const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out: MatchIndexEntry[] = [];
    for (let i = 0; i < index.length && out.length < 40; i++) if (toks.every((t) => hay[i].includes(t))) out.push(index[i]);
    return out;
  }, [q, index, hay]);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => setHi(0), [q]);

  const choose = (m: MatchIndexEntry) => {
    const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    // the player whose name matches the most search words (e.g. "bumrah 2024" -> Bumrah)
    const score = (n: string) => toks.filter((t) => n.toLowerCase().includes(t)).length;
    const best = [...m.players].sort((x, y) => score(y.name) - score(x.name))[0];
    const byName = best && score(best.name) > 0 ? best : undefined;
    const keep = m.players.find((p) => p.id === playerId);
    onPick(m.id, (byName ?? keep ?? m.players[0])?.id ?? playerId);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="rounded-2xl border bg-white p-3 sm:p-4" style={{ borderColor: BORDER }}>
      <div ref={box} className="relative">
        <label className="flex items-center gap-2 rounded-xl border bg-[#FBF6EE] px-3 py-2.5 focus-within:ring-2 focus-within:ring-[#3B6FB6]/50" style={{ borderColor: BORDER }}>
          <Search size={15} className="shrink-0 text-text-400" />
          <input
            role="combobox"
            aria-expanded={open}
            aria-controls="match-lookup-list"
            aria-autocomplete="list"
            value={q}
            placeholder={cur ? `${matchLabel(cur)} · search match or player…` : "Search match or player…"}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setHi((h) => Math.min(results.length - 1, h + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((h) => Math.max(0, h - 1));
              } else if (e.key === "Enter" && results[hi]) {
                e.preventDefault();
                choose(results[hi]);
              } else if (e.key === "Escape") setOpen(false);
            }}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-text-100 placeholder:text-text-400 focus:outline-none"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search" className="text-text-400 hover:text-text-100">
              <X size={14} />
            </button>
          )}
        </label>
        {open && (
          <ul
            id="match-lookup-list"
            role="listbox"
            className="absolute inset-x-0 top-full z-40 mt-1 max-h-[320px] overflow-auto rounded-xl border bg-white py-1 shadow-[0_14px_32px_-18px_rgba(60,40,20,0.4)]"
            style={{ borderColor: BORDER }}
          >
            {results.length === 0 && <li className="px-3 py-2 text-[12.5px] text-text-400">No match found. Try a team, season, date or player.</li>}
            {results.map((m, i) => (
              <li
                key={m.id}
                role="option"
                aria-selected={i === hi}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(m);
                }}
                className={cx("flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-[13px]", i === hi && "bg-[#FBF6EE]", m.id === matchId && "font-semibold")}
              >
                <span className="min-w-0 truncate">{matchLabel(m)}</span>
                <span className="tnum shrink-0 text-[11.5px] text-text-400">
                  {m.scoreA.split(" ")[0]} · {m.scoreB.split(" ")[0]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cur && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-400">Player</span>
          {cur.players.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(cur.id, p.id)}
              aria-pressed={p.id === playerId}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6FB6]/60",
                p.id === playerId ? "bg-[#C2507A] text-white" : "bg-white text-text-100 ring-1 ring-[#EADFCB] hover:bg-[#FBF6EE]",
              )}
            >
              {p.name}
              <span className={cx("text-[10.5px]", p.id === playerId ? "text-white/75" : "text-text-400")}>{p.discipline === "batting" ? "bat" : "bowl"}</span>
            </button>
          ))}
          <span className="ml-1 text-[11px] text-text-400">players with ball-by-ball data in this match</span>
        </div>
      )}
    </div>
  );
}
