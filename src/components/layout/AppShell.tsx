"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarRange, Database, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { NAV } from "@/lib/nav";
import { cx } from "@/lib/format";
import { useData } from "@/lib/data";
import { FilterBar, FilterProvider } from "./Filters";

/** Abstract brand mark: two overlapping diamonds (original artwork, no franchise marks). */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id="bm1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C9688A" />
          <stop offset="1" stopColor="#B23A62" />
        </linearGradient>
        <linearGradient id="bm2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4A73A8" />
          <stop offset="1" stopColor="#2E4E7A" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="32" height="32" rx="10" fill="#FFFBF4" stroke="rgba(60,40,20,0.12)" />
      <path d="M15 9 L24 20 L15 31 L6 20 Z" fill="url(#bm2)" opacity="0.95" />
      <path d="M25 9 L34 20 L25 31 L16 20 Z" fill="url(#bm1)" opacity="0.92" />
      <path d="M20 14.5 L24 20 L20 25.5 L16 20 Z" fill="#fff" opacity="0.9" />
    </svg>
  );
}

const PAGES_WITH_FILTERS = ["/leaderboards/"];

function normalise(path: string) {
  return path.endsWith("/") ? path : `${path}/`;
}

function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const path = normalise(usePathname() || "/");
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-ink/30 md:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-ink/[0.07] bg-bg-800/80 backdrop-blur-xl transition-[width,transform] duration-300",
          collapsed ? "md:w-[76px]" : "md:w-[248px]",
          "w-[264px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
        aria-label="Main navigation"
      >
        <div className={cx("flex h-[72px] items-center gap-3 px-5", collapsed && "md:justify-center md:px-0")}>
          <BrandMark />
          <div className={cx("leading-tight", collapsed && "md:hidden")}>
            <div className="font-display text-[17px] font-bold tracking-tight">Pressure Lab</div>
            <div className="text-[10.5px] uppercase tracking-[0.16em] text-text-400">T20 high-pressure analytics</div>
          </div>
          <button className="ml-auto text-text-400 md:hidden" onClick={onClose} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors",
                  collapsed && "md:justify-center md:px-0",
                  active
                    ? "bg-gradient-to-r from-pink-500/20 via-pink-500/[0.08] to-transparent text-text-100"
                    : "text-text-400 hover:bg-ink/[0.04] hover:text-text-100",
                )}
              >
                {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-pink-500" />}
                <Icon size={18} className={active ? "text-pink-300" : ""} />
                <span className={cx(collapsed && "md:hidden")}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={cx("m-3 rounded-2xl border border-ink/[0.07] bg-ink/[0.03] p-3", collapsed && "md:hidden")}>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-400">
            <span className="live-dot h-2 w-2 rounded-full bg-pink-500" />
            Model output
          </div>
          <p className="mt-1.5 text-[11.5px] leading-snug text-text-400">
            Ratings from IPL + T20I ball-by-ball data. Regenerate with <code className="text-text-100">run_all.py</code>.
          </p>
        </div>

        <button
          onClick={onToggle}
          className="mx-3 mb-4 hidden items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] text-text-400 hover:bg-ink/[0.04] hover:text-text-100 md:flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={16} className="mx-auto" /> : <PanelLeftClose size={16} />}
          <span className={cx(collapsed && "hidden")}>Collapse</span>
        </button>
      </aside>
    </>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const path = normalise(usePathname() || "/");
  const item = NAV.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href))) ?? NAV[0];
  const showFilters = PAGES_WITH_FILTERS.some((p) => path.startsWith(p));
  const kpis = useData("kpis.json").data;
  return (
    <header className="sticky top-0 z-30 border-b border-ink/[0.06] bg-bg-900/70 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-8">
        <button className="text-text-400 md:hidden" onClick={onMenu} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.16em] text-text-400">Pressure Lab / {item.label}</div>
          <div className="truncate text-[13.5px] text-text-100">{item.blurb}</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {showFilters ? (
            <FilterBar />
          ) : (
            <>
              <span className="hidden items-center gap-1.5 rounded-lg bg-ink/[0.04] px-2.5 py-1.5 text-[12px] text-text-400 ring-1 ring-ink/10 sm:inline-flex">
                <CalendarRange size={14} /> {kpis ? `${kpis.competitions.join(" + ")} · ${kpis.dataWindow}` : "Loading…"}
              </span>
              <span className="hidden items-center gap-1.5 rounded-lg bg-ink/[0.04] px-2.5 py-1.5 text-[12px] text-text-400 ring-1 ring-ink/10 lg:inline-flex">
                <Database size={14} /> {kpis ? `Model ${kpis.modelVersion}` : "Loading…"}
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pl-sidebar");
      if (saved) setCollapsed(saved === "1");
      else if (window.innerWidth < 1280) setCollapsed(true);
    } catch {
      if (window.innerWidth < 1280) setCollapsed(true);
    }
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("pl-sidebar", c ? "0" : "1");
      } catch {}
      return !c;
    });
  return (
    <FilterProvider>
      <div className="backdrop" aria-hidden />
      <Sidebar collapsed={collapsed} onToggle={toggle} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className={cx("relative z-10 transition-[padding] duration-300", collapsed ? "md:pl-[76px]" : "md:pl-[248px]")}>
        <TopBar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto max-w-[1440px] px-4 pb-10 pt-8 md:px-8">{children}</main>
        <footer className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 border-t border-ink/[0.06] px-4 py-5 text-[12px] text-text-400 md:px-8">
          <span>Unofficial fan analytics project. Not affiliated with Rajasthan Royals.</span>
          <span>Pressure Lab · SupeRR Selector Season 2 · Round 1</span>
        </footer>
      </div>
    </FilterProvider>
  );
}
