"use client";

import { useEffect, useState } from "react";
import type {
  EvidenceFile,
  Kpis,
  Leaderboard,
  MatchFile,
  MatchReplayFile,
  MatchupsFile,
  MethodFile,
  Player,
  PlayerProfile,
  ScoutingFile,
} from "./types";

/** Map of every JSON file in /public/data to the type it must satisfy. */
export interface DataFiles {
  "kpis.json": Kpis;
  "players.json": Player[];
  "leaderboard_batters.json": Leaderboard;
  "leaderboard_bowlers.json": Leaderboard;
  "player_profiles.json": Record<string, PlayerProfile>;
  "match_replay.json": MatchReplayFile;
  "matchups.json": MatchupsFile;
  "scouting.json": ScoutingFile;
  "method.json": MethodFile;
  "evidence.json": EvidenceFile;
}
export type DataFile = keyof DataFiles;

const BASE = process.env.NEXT_PUBLIC_DATA_BASE ?? "/data";
const cache = new Map<string, Promise<unknown>>();

export function loadData<F extends DataFile>(file: F): Promise<DataFiles[F]> {
  if (!cache.has(file)) {
    const p = fetch(`${BASE}/${file}`).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${file} (${r.status})`);
      return r.json();
    });
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return cache.get(file) as Promise<DataFiles[F]>;
}

/** One match's info file (public/data/matches/<id>.json), fetched on demand and cached. */
export function loadMatch(id: string): Promise<MatchFile> {
  const key = `matches/${id}.json`;
  if (!cache.has(key)) {
    const p = fetch(`${BASE}/${key}`).then((r) => {
      if (!r.ok) throw new Error(r.status === 404 ? "No match info file for this match yet." : `Could not load match ${id} (${r.status})`);
      return r.json();
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key) as Promise<MatchFile>;
}

export interface DataState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
}

/** Fetches a /public/data JSON file at runtime (so files can be swapped without code changes). */
export function useData<F extends DataFile>(file: F): DataState<DataFiles[F]> {
  const [state, setState] = useState<DataState<DataFiles[F]>>({
    data: undefined,
    error: undefined,
    loading: true,
  });
  useEffect(() => {
    let alive = true;
    loadData(file)
      .then((data) => alive && setState({ data, error: undefined, loading: false }))
      .catch((error: Error) => alive && setState({ data: undefined, error, loading: false }));
    return () => {
      alive = false;
    };
  }, [file]);
  return state;
}
