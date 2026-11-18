"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { FormatFilter, PhaseFilter } from "@/lib/types";
import { Segmented, Select } from "@/components/ui/Controls";

interface FilterState {
  format: FormatFilter;
  season: string;
  phase: PhaseFilter;
  setFormat: (f: FormatFilter) => void;
  setSeason: (s: string) => void;
  setPhase: (p: PhaseFilter) => void;
}

const Ctx = createContext<FilterState | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [format, setFormat] = useState<FormatFilter>("IPL");
  const [season, setSeason] = useState("All");
  const [phase, setPhase] = useState<PhaseFilter>("All");
  const value = useMemo(
    () => ({ format, season, phase, setFormat, setSeason, setPhase }),
    [format, season, phase],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFilters() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFilters must be used inside <FilterProvider>");
  return v;
}

export const SEASON_OPTIONS = ["All", "2022", "2023", "2024", "2025", "2026"];

/** Format / Season / Phase filter bar, rendered in the top bar on pages that use it. */
export function FilterBar() {
  const f = useFilters();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented label="Format" value={f.format} options={["IPL", "T20I"] as const} onChange={f.setFormat} size="sm" />
      <Select
        label="Season"
        hideLabel
        value={f.season}
        onChange={f.setSeason}
        options={SEASON_OPTIONS.map((s) => ({ value: s, label: s === "All" ? "All seasons" : `Season ${s}` }))}
      />
      <Segmented
        label="Phase"
        value={f.phase}
        options={[
          { value: "All", label: "All overs" },
          { value: "Powerplay", label: "Powerplay" },
          { value: "Middle", label: "Middle" },
          { value: "Death", label: "Death" },
        ]}
        onChange={(v) => f.setPhase(v as PhaseFilter)}
        size="sm"
      />
    </div>
  );
}
