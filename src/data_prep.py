"""Stage 1: map raw files, apply cricket data rules, rebuild the pre-ball state.

Extras rules (worked out from the data and reconciled against results):
  runs           = runs off the bat (0 on wides, byes, leg-byes)
  extras1_runs   = the primary extra: wide (1 + any run/boundary), no-ball (1),
                   byes / leg-byes (runs taken), penalty (5)
  extras_2_runs  = byes / leg-byes run off a no-ball
  team runs      = runs + extras1_runs + extras_2_runs
  batter runs    = runs
  bowler conceded= runs + wides + no-ball penalty   (byes, leg-byes, penalty excluded)
  "other"        = behaves exactly like a no-ball (1 extra, bat runs allowed, and
                   counting it as legal produces 7-ball overs), so treated as a no-ball.
"""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

from utils import CHECK, check, log, section

# ---------------------------------------------------------------- file mapping


def map_files(raw: Path, patterns: dict[str, str]) -> dict[str, list[Path]]:
    files = [p for p in raw.iterdir() if p.is_file() and p.suffix.lower() == ".csv" and not p.name.startswith(".")]
    ignored = [p.name for p in raw.iterdir() if p.is_file() and p not in files]
    out: dict[str, list[Path]] = {}
    claimed: set[Path] = set()
    # Most specific patterns first so "teams" does not grab the mapping file.
    for key in sorted(patterns, key=lambda k: -len(patterns[k])):
        pat = patterns[key].lower()
        hits = [p for p in files if p not in claimed and pat in p.stem.lower()]
        if key == "teams":
            hits = [p for p in hits if re.search(r"(^|[_\-\s])teams$", p.stem.lower())]
        out[key] = sorted(hits)
        claimed.update(hits)
    log(f"Raw folder: {raw}")
    for k, v in out.items():
        log(f"  {k:<15} -> {[p.name for p in v]}")
    if ignored:
        log(f"  ignored non-CSV files: {ignored}")
    unclaimed = [p.name for p in files if p not in claimed]
    if unclaimed:
        log(f"  unmapped CSVs (ignored): {unclaimed}")
    for k, v in out.items():
        check(len(v) >= 1, f"dataset '{k}' mapped to at least one file")
    return out


def _read(paths: list[Path]) -> pd.DataFrame:
    return pd.concat([pd.read_csv(p, low_memory=False) for p in paths], ignore_index=True)


# ---------------------------------------------------------------- result parsing


def parse_result(r: str) -> tuple[float | None, str | None]:
    r = str(r)
    if re.search(r"super\s*over|tied", r, re.I):
        return None, "tie"
    m = re.search(r"won\s+by\s*(\d+)\s*([A-Za-z]+)", r, re.I)
    if not m:
        return None, None
    return float(m.group(1)), ("runs" if m.group(2).lower().startswith("run") else "wkts")


# ---------------------------------------------------------------- main


def run(cfg: dict, P: dict) -> dict[str, pd.DataFrame]:
    section("STAGE 1 · DATA PREP")
    dc = cfg["data"]
    fm = map_files(P["raw"], dc["file_patterns"])

    bbb_parts = fm["ball_by_ball"]
    bbb = _read(bbb_parts)
    n0 = len(bbb)
    bbb = bbb.drop_duplicates()
    log(f"ball_by_ball: {len(bbb_parts)} file(s), {n0:,} rows, {n0 - len(bbb):,} exact duplicates dropped -> {len(bbb):,}")
    matches = _read(fm["matches"]).drop_duplicates("match_id")
    comps = _read(fm["competitions"]).drop_duplicates("comp_id")
    teams = _read(fm["teams"]).drop_duplicates()
    mapping = _read(fm["mapping"]).drop_duplicates()
    p11 = _read(fm["playing_eleven"]).drop_duplicates()
    log(f"matches {len(matches)} · competitions {len(comps)} · teams {len(teams)} · mapping {len(mapping)} · playing_eleven {len(p11)}")

    # ---- matches enrichment
    m = matches.merge(comps[["comp_id", "comp_name", "match_format"]], on="comp_id", how="left")
    m["match_date"] = pd.to_datetime(m["match_date"])
    m["season"] = m["match_date"].dt.year
    m["league"] = np.where(m.comp_name.str.contains(r"\bIPL\b", regex=True), "IPL",
                           np.where(m.match_format.eq("T20I"), "T20I", "Emerging"))
    # UI uses two formats; emerging-team (A side) tournaments are grouped with internationals.
    m["fmt"] = np.where(m.league.eq("IPL"), "IPL", "T20I")
    m["elo_pool"] = np.where(m.league.eq("IPL"), "IPL", "International")
    log(f"leagues: {m.league.value_counts().to_dict()} (Emerging = A-team Asia Cups, grouped with T20I for format views)")
    parsed = m.result.apply(parse_result)
    m["margin"] = [p[0] for p in parsed]
    m["margin_kind"] = [p[1] for p in parsed]
    m["is_tie"] = m.margin_kind.eq("tie")
    m["no_result"] = m.win_team_id.isna() & ~m.is_tie
    m["knockout"] = (m.knock_out.eq(1) | m.stage.isin(dc["knockout_stages"])).astype(int)
    m["is_final"] = m.stage.eq("Final").astype(int)
    log(f"no-result matches (no win_team_id, not tied): {int(m.no_result.sum())}")
    log(f"tied matches (decided by super over): {int(m.is_tie.sum())}")
    log(f"knockout matches: {int(m.knockout.sum())}  (knock_out=1 or stage in {dc['knockout_stages']})")
    dls = m.revised_target.notna() | m.first_inn_revised_overs.notna() | m.second_inn_revised_overs.notna()
    log(f"DLS / reduced-overs matches: {int(dls.sum())} (revised overs are stored in balls)")

    no_bbb = sorted(set(m.match_id) - set(bbb.match_id))
    log(f"matches with NO ball-by-ball data: {len(no_bbb)} -> {no_bbb}")
    orphan = set(bbb.match_id) - set(m.match_id)
    check(len(orphan) == 0, "every ball-by-ball match_id exists in matches")

    # ---- super overs
    so = bbb.innings > 2
    log(f"super-over deliveries (innings 3/4) excluded: {int(so.sum())} balls in {bbb[so].match_id.nunique()} matches")
    b = bbb[~so].copy()

    # ---- extras rules
    et = b.extras_type.fillna("none")
    b["is_wide"] = et.eq("wide")
    b["is_noball"] = et.isin(dc["noball_extras"])
    b["legal"] = ~et.isin(dc["illegal_extras"])
    b["faced"] = ~b.is_wide
    b["team_runs"] = b.runs + b.extras1_runs + b.extras_2_runs
    b["bat_runs"] = b.runs
    b["bowler_runs"] = b.runs + np.where(b.is_wide | b.is_noball, b.extras1_runs, 0)
    b["is_wicket"] = b.is_wicket.astype(bool)
    b["bowler_wkt"] = b.is_wicket & ~b.dismissal_type.isin(dc["non_bowler_dismissals"])
    b["striker_out"] = b.is_wicket & b.dismissed_player_id.eq(b.striker_id)
    b["nonstriker_out"] = b.is_wicket & b.dismissed_player_id.eq(b.non_striker_id)
    b["is_four"] = b.is_four.astype(bool)
    b["is_six"] = b.is_six.astype(bool)
    b["is_dot"] = b.legal & b.team_runs.eq(0)  # bowler dot: legal ball, nothing off it
    log(f"extras: {et.value_counts().to_dict()}")
    log(f"legal balls {int(b.legal.sum()):,} · wides {int(b.is_wide.sum()):,} · no-balls (incl. 'other') {int(b.is_noball.sum()):,}")
    log(f"wickets {int(b.is_wicket.sum()):,} · credited to bowler {int(b.bowler_wkt.sum()):,} "
        f"(excluded {dc['non_bowler_dismissals']})")
    log("bowl_speed is not used (~39% zeros).")

    # ---- order and pre-ball state
    b = b.merge(m[["match_id", "season", "league", "fmt", "comp_id", "comp_name", "match_date", "stage", "knockout",
                   "first_inn_revised_overs", "second_inn_revised_overs", "revised_target", "win_team_id",
                   "no_result", "is_tie", "elo_pool"]], on="match_id", how="left")
    b = b.sort_values(["match_id", "innings", "overid", "over_ball_num"]).reset_index(drop=True)
    g = b.groupby(["match_id", "innings"], sort=False)
    b["score_before"] = g.team_runs.cumsum() - b.team_runs
    b["wkts_before"] = g.is_wicket.cumsum() - b.is_wicket
    b["legal_before"] = g.legal.cumsum() - b.legal
    b["ball_seq"] = g.cumcount()
    rev1 = b.first_inn_revised_overs.where(b.innings.eq(1))
    rev2 = b.second_inn_revised_overs.where(b.innings.eq(2))
    b["max_balls"] = rev1.fillna(rev2).fillna(120).clip(upper=120)
    b["balls_rem"] = (b.max_balls - b.legal_before).clip(lower=0)
    b["phase"] = np.select([b.overid <= 6, b.overid <= 15], ["PP", "Middle"], "Death")
    b["crr"] = np.where(b.legal_before > 0, b.score_before * 6 / b.legal_before.clip(lower=1), 0.0)

    inn_tot = b.groupby(["match_id", "innings"]).agg(total=("team_runs", "sum"), wkts=("is_wicket", "sum"),
                                                    legal=("legal", "sum"), bat_team=("batting_team_id", "first"),
                                                    bowl_team=("bowling_team_id", "first")).reset_index()
    t1 = inn_tot[inn_tot.innings == 1].set_index("match_id")
    b["inn1_total"] = b.match_id.map(t1.total)
    b["target"] = np.where(b.innings.eq(2), b.revised_target.fillna(b.inn1_total + 1), np.nan)
    b["runs_needed"] = b.target - b.score_before
    b["rrr"] = np.where(b.innings.eq(2), b.runs_needed * 6 / b.balls_rem.clip(lower=1), np.nan)

    # partnership (resets at each wicket)
    gp = b.groupby(["match_id", "innings", "wkts_before"], sort=False)
    b["part_runs"] = gp.team_runs.cumsum() - b.team_runs
    b["part_balls"] = gp.legal.cumsum() - b.legal
    # batter balls faced before this ball
    gs = b.groupby(["match_id", "innings", "striker_id"], sort=False)
    b["bat_balls_before"] = gs.faced.cumsum() - b.faced
    b["bat_runs_before"] = gs.bat_runs.cumsum() - b.bat_runs
    b["is_set"] = b.bat_balls_before >= cfg["features"]["set_batter_balls"]
    # wickets in the previous 12 deliveries of the innings
    win = cfg["features"]["collapse_window"]
    b["wkts_last12"] = g.is_wicket.transform(lambda s: s.shift(1, fill_value=False).astype(int).rolling(win, min_periods=1).sum()).astype(int)
    # legal-ball number inside the over, for "18.4" style labels
    go = b.groupby(["match_id", "innings", "overid"], sort=False)
    b["ball_in_over"] = go.legal.cumsum().where(b.legal, go.legal.cumsum() + 1).clip(upper=6)
    b["over_label"] = (b.overid - 1).astype(str) + "." + b.ball_in_over.astype(int).astype(str)

    # batter entry (first ball at the crease as striker or non-striker) for F14
    first_seen = pd.concat([
        b[["match_id", "innings", "ball_seq", "striker_id", "wkts_last12"]].rename(columns={"striker_id": "pid"}),
        b[["match_id", "innings", "ball_seq", "non_striker_id", "wkts_last12"]].rename(columns={"non_striker_id": "pid"}),
    ]).sort_values("ball_seq").drop_duplicates(["match_id", "innings", "pid"])
    first_seen["collapse_entry"] = (first_seen.ball_seq > 0) & (first_seen.wkts_last12 >= cfg["features"]["collapse_wickets"])
    ce = first_seen.set_index(["match_id", "innings", "pid"]).collapse_entry
    b["collapse_entry"] = pd.MultiIndex.from_frame(b[["match_id", "innings", "striker_id"]]).map(ce).fillna(False).astype(bool)
    log(f"batter innings that started in a collapse (>= {cfg['features']['collapse_wickets']} wkts in prev {win} balls): "
        f"{int(first_seen.collapse_entry.sum())}")

    # ---- assertions on the rebuilt state
    leg = b.groupby(["match_id", "innings"]).legal.sum()
    check(int(leg.max()) <= 120, f"every innings has <= 120 legal balls (max {int(leg.max())})")
    check(int(b.wkts_before.max()) <= 10, f"wickets before a ball never exceed 10 (max {int(b.wkts_before.max())})")
    neg = int((b.max_balls - b.legal_before < 0).sum())
    log(f"balls bowled beyond the revised-overs limit (balls_rem clipped to 0): {neg}")

    # ---- reconciliation against results
    rec = _reconcile(m, inn_tot)
    rate = rec.ok.mean()
    log(f"RECONCILIATION: rebuilt innings totals vs winning margins: {int(rec.ok.sum())}/{len(rec)} = {rate:.2%}")
    bad = rec[~rec.ok]
    for _, r in bad.iterrows():
        log(f"   mismatch match {r.match_id}: '{r.result}' | inn1 {r.total1:.0f}, inn2 {r.total2:.0f}/{r.wkts2:.0f}, "
            f"revised_target {r.revised_target}")
    unparsed = m[(m.margin_kind.isna()) & m.win_team_id.notna()]
    if len(unparsed):
        log(f"   results with a winner but no parsable margin: {len(unparsed)}")
    check(rate >= cfg["data"]["reconciliation_min_match_rate"], f"reconciliation rate {rate:.2%} >= 98%")
    CHECK_STATE["reconcile"] = (rate, len(rec))

    m = m.merge(inn_tot[inn_tot.innings == 1][["match_id", "total", "wkts", "legal", "bat_team", "bowl_team"]]
                .rename(columns={"total": "total1", "wkts": "wkts1", "legal": "legal1", "bat_team": "team1", "bowl_team": "team2"}),
                on="match_id", how="left")
    m = m.merge(inn_tot[inn_tot.innings == 2][["match_id", "total", "wkts", "legal"]]
                .rename(columns={"total": "total2", "wkts": "wkts2", "legal": "legal2"}), on="match_id", how="left")
    m["has_bbb"] = m.match_id.isin(b.match_id)

    # ---- player directory (always keyed on player_id)
    names = pd.concat([
        b[["striker_id", "striker_name"]].set_axis(["player_id", "name"], axis=1),
        b[["bowler_id", "bowler_name"]].set_axis(["player_id", "name"], axis=1),
        mapping[["player_id", "player_name"]].set_axis(["player_id", "name"], axis=1),
    ]).dropna().drop_duplicates("player_id").set_index("player_id").name
    log(f"players with an id: {len(names):,}")

    log(f"SUMMARY: {b.match_id.nunique()} matches with balls, {len(b):,} deliveries, "
        f"{int(b.legal.sum()):,} legal, seasons {sorted(b.season.unique())}")
    b.to_parquet(P["processed"] / "balls.parquet", index=False)
    m.to_parquet(P["processed"] / "matches.parquet", index=False)
    return {"balls": b, "matches": m, "teams": teams, "mapping": mapping, "p11": p11, "names": names,
            "comps": comps, "no_bbb": no_bbb}


CHECK_STATE: dict = {}


def _reconcile(m: pd.DataFrame, inn: pd.DataFrame) -> pd.DataFrame:
    t = inn.pivot(index="match_id", columns="innings", values=["total", "wkts", "bat_team"])
    t.columns = [f"{a}{b}" for a, b in t.columns]
    d = m.merge(t, left_on="match_id", right_index=True)
    d = d[d.margin_kind.isin(["runs", "wkts"]) & d.win_team_id.notna() & d.total2.notna()].copy()
    ok = []
    for _, r in d.iterrows():
        if r.margin_kind == "runs":
            good = r.win_team_id == r.bat_team1 and (
                r.total1 - r.total2 == r.margin
                or (pd.notna(r.revised_target) and r.revised_target - 1 - r.total2 == r.margin))
        else:
            tgt = r.revised_target if pd.notna(r.revised_target) else r.total1 + 1
            good = r.win_team_id == r.bat_team2 and r.total2 >= tgt and (10 - r.wkts2 == r.margin)
        ok.append(bool(good))
    d["ok"] = ok
    return d[["match_id", "result", "total1", "total2", "wkts2", "revised_target", "ok"]]


def exclude_competitions(cfg: dict, P: dict, b: pd.DataFrame, m: pd.DataFrame, names: pd.Series):
    """FIX 3: drop non-senior competitions (A-team / emerging cups) from everything after the WP
    model: tiers, Elo, expectations and ratings. Logs balls / matches removed per affected player."""
    ex = set(cfg["data"].get("exclude_comp_ids", []))
    drop_b = b.comp_id.isin(ex)
    drop_m = m.comp_id.isin(ex)
    x = b[drop_b]
    rows = []
    for role, key, n in [("batting", "striker_id", "faced"), ("bowling", "bowler_id", "legal")]:
        g = x.groupby(key).agg(balls=(n, "sum"), matches=("match_id", "nunique"))
        tot = b.groupby(key)[n].sum()
        g["share_of_career_balls"] = (g.balls / tot.reindex(g.index)).round(3)
        g["role"] = role
        g["name"] = g.index.map(names)
        rows.append(g.reset_index().rename(columns={key: "player_id"}))
    R = pd.concat(rows, ignore_index=True).sort_values("balls", ascending=False)
    R.to_csv(P["tables"] / "excluded_competitions_players.csv", index=False)
    comps = m[drop_m].groupby(["comp_id", "comp_name"]).size()
    log(f"FIX 3 excluded competitions {sorted(ex)}: {int(drop_m.sum())} matches, {int(drop_b.sum()):,} deliveries "
        f"({'; '.join(f'{c[1]}: {k}' for c, k in comps.items())}); {R.player_id.nunique()} players affected")
    for r in R.head(12).itertuples():
        log(f"   {r.name:<26} {r.role:<8} -{int(r.balls):>4} balls, -{int(r.matches)} matches "
            f"({r.share_of_career_balls:.0%} of their {r.role} balls)")
    log("   full list -> outputs/tables/excluded_competitions_players.csv")
    return b[~drop_b].copy(), m[~drop_m].copy(), {"matches": int(drop_m.sum()), "balls": int(drop_b.sum()),
                                                  "players": int(R.player_id.nunique())}
