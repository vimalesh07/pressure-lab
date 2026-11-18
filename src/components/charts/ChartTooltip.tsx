"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

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

/**
 * Tooltip rendered in a portal at fixed viewport coordinates, so scroll / overflow containers
 * never clip it. (x, y) = the anchor point; the box sits above it, clamped inside the viewport.
 */
export function FloatingTip({ x, y, children, below = false }: { x: number; y: number; children: ReactNode; below?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const left = Math.max(8, Math.min(vw - r.width - 8, x - r.width / 2));
    let top = below ? y + 10 : y - r.height - 10;
    if (top < 8) top = y + 14;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.opacity = "1";
  });
  if (!mounted) return null;
  return createPortal(
    <div ref={ref} className="pointer-events-none fixed left-0 top-0 z-[100] opacity-0" role="tooltip">
      {children}
    </div>,
    document.body,
  );
}
