"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarRange, Database, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { NAV } from "@/lib/nav";
import { cx } from "@/lib/format";
import { useData } from "@/lib/data";
import { FilterBar, FilterProvider } from "./Filters";
import { GlobalSearch } from "./GlobalSearch";

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
  hoverOpen,
  onEnter,
  onLeave,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onClose: () => void;
  hoverOpen: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const path = normalise(usePathname() || "/");
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-ink/30 md:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cx(
          // glass rail: icons sit in a fixed 52px column (same x when collapsed or open); labels fade, never re-wrap
          "glass-nav fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden transition-[width,transform,box-shadow] duration-300 ease-out",
          collapsed ? "md:w-[76px]" : "md:w-[248px]",
          "w-[264px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          (mobileOpen || hoverOpen) && "shadow-[16px_0_48px_-18px_rgba(60,40,20,0.35)]",
        )}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        aria-label="Main navigation"
      >
        <div className="flex h-[72px] shrink-0 items-center px-3">
          <span className="grid h-[52px] w-[52px] shrink-0 place-items-center">
            <BrandMark />
          </span>
          <div className={cx("min-w-0 whitespace-nowrap leading-tight transition-opacity duration-200", collapsed ? "md:opacity-0" : "opacity-100 delay-100")}>
            <div className="font-display text-[17px] font-bold tracking-tight">Pressure Lab</div>
            <div className="text-[9.5px] uppercase tracking-[0.1em] text-text-400">T20 pressure analytics</div>
          </div>
          <button className="ml-auto shrink-0 text-text-400 md:hidden" onClick={onClose} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <nav className="mt-2 flex-1 space-y-1.5 px-3">
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
                  "group relative flex h-11 items-center rounded-2xl text-[14px] font-medium transition-colors",
                  active ? "glass-chip text-text-100" : "text-text-100/75 hover:bg-white/50 hover:text-text-100",
                )}
              >
                <span className="grid h-11 w-[52px] shrink-0 place-items-center">
                  <span
                    className={cx(
                      "grid h-9 w-9 place-items-center rounded-xl transition",
                      active ? "bg-gradient-to-br from-pink-500 to-[#8E2C52] text-white shadow-[0_6px_16px_-6px_rgba(178,58,98,0.7)]" : "group-hover:bg-white/70",
                    )}
                  >
                    <Icon size={18} />
                  </span>
                </span>
                <span className={cx("whitespace-nowrap transition-opacity duration-200", collapsed ? "md:opacity-0" : "opacity-100 delay-100")}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

      </aside>
    </>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const path = normalise(usePathname() || "/");
  const item = NAV.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href))) ?? NAV[0];
  const showFilters = path === "/" || PAGES_WITH_FILTERS.some((p) => path.startsWith(p));
  const kpis = useData("kpis.json").data;
  // hide on scroll down, show again on scroll up (or near the top)
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const on = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 6) return;
      setHidden(y > last && y > 80);
      last = y;
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header
      className={cx(
        "glass-bar sticky top-0 z-30 transition-transform duration-300 ease-out",
        hidden && "-translate-y-full focus-within:translate-y-0",
      )}
    >
      <div className="mx-auto flex min-h-[72px] max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-8">
        <button className="text-text-400 md:hidden" onClick={onMenu} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.16em] text-text-400">Pressure Lab / {item.label}</div>
          <div className="truncate text-[13.5px] text-text-100">{item.blurb}</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <GlobalSearch />
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
  // Overview: full-viewport landing, no top bar / footer / page scrollbar
  const isHome = normalise(usePathname() || "/") === "/";
  useEffect(() => {
    document.documentElement.style.overflow = isHome ? "hidden" : "";
    return () => void (document.documentElement.style.overflow = "");
  }, [isHome]);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false); // desktop: floating sidebar, opens at the left edge
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pl-sidebar");
      if (saved) setCollapsed(saved === "1");
      else if (window.innerWidth < 1280) setCollapsed(true);
    } catch {
      if (window.innerWidth < 1280) setCollapsed(true);
    }
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      {/* desktop: a mini icon bar is always visible; hovering it opens the full sidebar and pushes the page */}
      <Sidebar
        collapsed={!hoverOpen}
        onToggle={toggle}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        hoverOpen={hoverOpen}
        onEnter={() => setHoverOpen(true)}
        onLeave={() => setHoverOpen(false)}
      />
      <div className={cx("relative z-10 transition-[padding] duration-300 ease-out", hoverOpen ? "md:pl-[248px]" : "md:pl-[76px]")}>
        {!isHome && <TopBar onMenu={() => setMobileOpen(true)} />}
        {isHome && (
          <button className="fixed left-3 top-3 z-30 rounded-lg p-2 text-text-400 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
        )}
        <main className={isHome ? "mx-auto h-[100dvh] max-w-[1440px] overflow-hidden px-4 md:px-8" : "mx-auto max-w-[1440px] px-4 pb-10 pt-8 md:px-8"}>{children}</main>
        {!isHome && <footer className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 border-t border-ink/[0.06] px-4 py-5 text-[12px] text-text-400 md:px-8">
          <span>Unofficial fan analytics project. Not affiliated with Rajasthan Royals.</span>
          <span>Pressure Lab · SupeRR Selector Season 2 · Round 1</span>
        </footer>}
      </div>
    </FilterProvider>
  );
}
