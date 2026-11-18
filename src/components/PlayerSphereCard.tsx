"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanSearch, UserRound } from "lucide-react";
import { useData } from "@/lib/data";
import type { LeaderboardRow } from "@/lib/types";
import { cx } from "@/lib/format";
import { kitOf } from "@/lib/teamMeta";
import { useFilters } from "@/components/layout/Filters";
import { DeltaPill } from "@/components/ui/DeltaPill";
import { PlayerPhoto } from "@/components/ui/PlayerPhoto";
import { SphereImageGrid, type ImageData } from "@/components/ui/img-sphere";

const RING = "#C2507A";

/** Sphere item for players without a photo: a team-coloured initials circle (SVG data URL). */
function initialsAvatar(name: string, team: string) {
  const k = kitOf(team);
  const ini = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><radialGradient id='g' cx='35%' cy='30%' r='75%'><stop offset='0' stop-color='white' stop-opacity='.28'/><stop offset='1' stop-color='white' stop-opacity='0'/></radialGradient></defs><circle cx='50' cy='50' r='50' fill='${k.shirt}'/><circle cx='50' cy='50' r='50' fill='url(#g)'/><circle cx='50' cy='50' r='46' fill='none' stroke='${k.trim}' stroke-width='3'/><text x='50' y='50' dy='.35em' text-anchor='middle' font-family='Inter, system-ui, sans-serif' font-size='36' font-weight='700' fill='${k.text}'>${ini}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Overview hero: the top players (up to 40) of the selected list on a spinnable sphere. Same ranking
 * source as the Leaderboards page and the same global format / season / phase filter.
 */
export function PlayerSphereCard() {
  const router = useRouter();
  const bat = useData("leaderboard_batters.json");
  const bowl = useData("leaderboard_bowlers.json");
  const players = useData("players.json");
  const photos = useData("player_photos.json").data;
  const { format, season, phase } = useFilters();
  // fit the globe to the viewport height (no scrolling on the landing page)
  const [sphereSize, setSphereSize] = useState(420);
  useEffect(() => {
    const fit = () => setSphereSize(Math.max(260, Math.min(560, window.innerHeight - 260)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const [hot, setHot] = useState<string | null>(null);

  // one globe of profiles: batters and bowlers mixed (by rank), each player once
  const rows: (LeaderboardRow & { role: string })[] = useMemo(() => {
    const pick = (lb: typeof bat.data, role: string) =>
      (lb?.views.find((v) => v.format === format && v.season === season && v.phase === phase)?.rows ?? []).map((r) => ({ ...r, role }));
    const a = pick(bat.data, "batter");
    const b = pick(bowl.data, "bowler");
    const out: (LeaderboardRow & { role: string })[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < Math.max(a.length, b.length); i++)
      for (const r of [a[i], b[i]]) if (r && !seen.has(r.playerId)) (seen.add(r.playerId), out.push(r));
    return out;
  }, [bat.data, bowl.data, format, season, phase]);
  const images: ImageData[] = useMemo(
    () =>
      rows.map((r) => ({
        id: r.playerId,
        // the player's Wikimedia photo when we have one, a team-coloured initials circle otherwise
        src: photos?.[r.playerId] ? `/players/${photos[r.playerId].file}` : initialsAvatar(r.name, r.team),
        alt: r.name,
        rank: r.rank,
        rating: r.rating,
        team: r.team,
        ringColor: RING,
        href: `/player/?id=${r.playerId}`,
      })),
    [rows, photos],
  );
  const cur = rows.find((r) => r.playerId === hot) ?? rows[0];
  const role = cur?.role ?? "player";
  // the pressure-proof page covers the overall top 10 of each list
  const proof = cur && players.data?.some((p) => p.id === cur.playerId && (p.rank ?? 0) >= 1 && (p.rank ?? 0) <= 10);
  // fewer than 20 players: shrink the sphere a little so it doesn't look sparse
  const radius = rows.length < 20 ? Math.round(160 * (0.72 + (0.28 * rows.length) / 20)) : 160;
  const scope = `${format} · ${season === "All" ? "2022–2026" : season}${phase === "All" ? "" : ` · ${phase.toLowerCase()}`}`;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-400">Top under pressure</div>
          <div className="text-[11.5px] text-text-400">{scope}</div>
        </div>
      </div>

      <div className="mt-2 flex w-full justify-center">
        {images.length ? (
          <SphereImageGrid
            key={`${format}-${season}-${phase}`}
            followMouse
            dustCount={140}
            images={images}
            containerSize={sphereSize}
            sphereRadius={radius}
            baseImageScale={0.15}
            hoverScale={1.35}
            autoRotate
            autoRotateSpeed={0.15}
            dragSensitivity={0.6}
            momentumDecay={0.95}
            onHover={(it) => setHot(it?.id ?? null)}
            onSelect={(it) => router.push(it.href ?? `/player/?id=${it.id}`)}
          />
        ) : (
          <div className="grid aspect-square w-full max-w-[460px] place-items-center text-[13px] text-text-400">
            No ranked players for this filter.
          </div>
        )}
      </div>
      <p className="mt-1 text-center text-[12px] text-text-400">Drag to spin · click a player</p>

      {/* footer: fixed height so the card never jumps */}
      <div className="mt-2 flex h-[88px] items-center gap-3 rounded-2xl border border-[#EADFCB] bg-white px-4" aria-live="polite">
        {cur ? (
          <>
            <PlayerPhoto id={cur.playerId} name={cur.name} team={cur.team} rounded="rounded-full" className="h-10 w-10 shrink-0 text-[13px]" />
            <div className="min-w-0 flex-1">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-400">
                No. {cur.rank} {role} under pressure
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 leading-tight">
                <span className="font-display text-[16px] font-semibold">{cur.name}</span>
                <span className="tnum font-display text-[16px] font-semibold text-pink-500">{cur.rating.toFixed(1)}</span>
                <span className="inline-flex items-center gap-1 text-[12px] text-text-400">
                  <span className="h-2 w-2 rounded-full" style={{ background: kitOf(cur.team).shirt }} />
                  {cur.team}
                </span>
                <span className="inline-flex items-center gap-1 text-[11.5px] text-text-400">
                  <DeltaPill value={cur.deltaPct} size="sm" /> vs normal
                </span>
              </div>
              {proof ? (
                <Link href={`/evidence/?player=${cur.playerId}`} className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-pink-500 hover:underline">
                  <ScanSearch size={12} /> See the matches that prove it
                </Link>
              ) : (
                <Link href={`/player/?id=${cur.playerId}`} className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-pink-500 hover:underline">
                  <UserRound size={12} /> Open the player profile
                </Link>
              )}
            </div>
          </>
        ) : (
          <span className="text-[13px] text-text-400">Loading…</span>
        )}
      </div>
    </div>
  );
}
