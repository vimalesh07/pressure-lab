import type { ReactNode } from "react";

/** Shared tooltip surface for Recharts and custom SVG charts. */
export function TooltipBox({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="pointer-events-none min-w-[160px] rounded-xl border border-ink/10 bg-bg-800/95 px-3 py-2 text-[12px] shadow-[0_12px_30px_-12px_rgba(60,40,20,0.35)] backdrop-blur-md">
      {title && <div className="mb-1 font-display text-[12.5px] font-semibold text-text-100">{title}</div>}
      <div className="space-y-0.5 text-text-400">{children}</div>
    </div>
  );
}

export function TooltipRow({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5">
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
      </span>
      <span className="tnum font-semibold text-text-100">{value}</span>
    </div>
  );
}
