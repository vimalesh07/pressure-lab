import type { ReactNode } from "react";
import { Card } from "./Card";
import { CountUp } from "./CountUp";

export function KpiCard({
  label,
  value,
  icon,
  hint,
  index,
  accent = "pink",
  format,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  hint?: string;
  index?: number;
  accent?: "pink" | "blue";
  format?: (n: number) => string;
}) {
  return (
    <Card index={index} className="overflow-hidden p-5">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl"
        style={{ background: accent === "pink" ? "rgba(178,58,98,0.08)" : "rgba(74,115,168,0.08)" }}
      />
      <div className="relative flex items-center justify-between">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-text-400">{label}</span>
        <span className={accent === "pink" ? "text-pink-300" : "text-blue-300"}>{icon}</span>
      </div>
      <CountUp
        value={value}
        format={format}
        className="tnum relative mt-3 block font-display text-[34px] font-semibold leading-none tracking-tight"
      />
      {hint && <p className="relative mt-2 text-[12px] text-text-400">{hint}</p>}
    </Card>
  );
}
