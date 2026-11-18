"use client";

import { useState } from "react";
import { useData } from "@/lib/data";
import { cx } from "@/lib/format";
import { kitFor } from "@/lib/teams";

const BASE = process.env.NEXT_PUBLIC_DATA_BASE?.replace(/\/data$/, "") ?? "";

/**
 * Player headshot from Wikimedia Commons (public/players/<id>.jpg, see scripts/fetch_player_photos.py),
 * with the licence credit in the tooltip. Falls back to team-coloured initials when there is no free photo.
 */
export function PlayerPhoto({
  id,
  name,
  team = "",
  className,
  rounded = "rounded-xl",
}: {
  id: string;
  name: string;
  team?: string;
  className?: string;
  rounded?: string;
}) {
  const photos = useData("player_photos.json");
  const [broken, setBroken] = useState(false);
  const info = photos.data?.[id];
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  if (info && !broken) {
    const credit = `Photo: ${info.artist} · ${info.license} · Wikimedia Commons`;
    return (
      <span className={cx("relative block overflow-hidden bg-ink/[0.05]", rounded, className)} title={credit}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${BASE}/players/${info.file}`}
          alt={name}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover object-top"
        />
      </span>
    );
  }
  return (
    <span
      className={cx("grid place-items-center font-display font-bold text-white", rounded, className)}
      style={{ background: `linear-gradient(160deg, ${kitFor(team)}, ${kitFor(team)}cc)` }}
      aria-label={name}
      role="img"
      title="No free-licence photo on Wikimedia Commons"
    >
      <span className="text-[1.1em]">{initials}</span>
    </span>
  );
}
