"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/format";

/** Segmented control (single choice). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "md",
}: {
  label: string;
  value: T;
  options: readonly T[] | { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const opts = (options as (T | { value: T; label: string })[]).map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-ink/[0.04] p-1 ring-1 ring-ink/10">
      {opts.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "rounded-lg font-medium transition-colors",
              size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]",
              active
                ? "bg-gradient-to-b from-pink-500/90 to-pink-500/70 text-white shadow-[0_6px_20px_-8px_rgba(178,58,98,0.35)]"
                : "text-text-400 hover:bg-ink/5 hover:text-text-100",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Native select styled to the system (keeps keyboard + screen reader behaviour for free). */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  icon,
  hideLabel,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  icon?: ReactNode;
  hideLabel?: boolean;
  className?: string;
}) {
  return (
    <label className={cx("inline-flex items-center gap-2", className)}>
      <span className={cx("text-[11px] font-semibold uppercase tracking-[0.12em] text-text-400", hideLabel && "sr-only")}>
        {label}
      </span>
      <span className="relative inline-flex items-center">
        {icon && <span className="pointer-events-none absolute left-2.5 text-text-400">{icon}</span>}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className={cx(
            "appearance-none rounded-xl bg-ink/[0.04] py-2 pr-8 text-[13px] font-medium text-text-100 ring-1 ring-ink/10 transition hover:bg-ink/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
            icon ? "pl-8" : "pl-3",
          )}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-bg-800">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-text-400" />
      </span>
    </label>
  );
}

/** Underlined tab strip. */
export function Tabs<T extends string>({
  value,
  tabs,
  onChange,
  label,
}: {
  value: T;
  tabs: { value: T; label: string; icon?: ReactNode; count?: number }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-ink/10">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cx(
              "relative -mb-px flex items-center gap-2 px-4 py-2.5 font-display text-[14px] font-semibold transition-colors",
              active ? "text-text-100" : "text-text-400 hover:text-text-100",
            )}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span className="tnum rounded-md bg-ink/5 px-1.5 text-[11px] text-text-400 ring-1 ring-ink/10">{t.count}</span>
            )}
            <span
              className={cx(
                "absolute inset-x-2 bottom-0 h-[2px] rounded-full transition-opacity",
                active ? "bg-gradient-to-r from-blue-300 via-pink-500 to-pink-300 opacity-100" : "opacity-0",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Small legend swatch + text, used beside charts. */
export function LegendItem({ color, label, shape = "dot" }: { color: string; label: string; shape?: "dot" | "line" | "hatch" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-text-400">
      {shape === "dot" && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
      {shape === "line" && <span className="h-[2px] w-4 rounded-full" style={{ background: color }} />}
      {shape === "hatch" && <span className="hatch h-3 w-3 rounded-[3px] ring-1 ring-ink/10" />}
      {label}
    </span>
  );
}
