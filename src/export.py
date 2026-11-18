"""Stage 10: CSV tables, PNG figures and the JSON files the UI reads (public/data/).

JSON shapes follow src/lib/types.ts exactly. Player ids in JSON are stable slugs
("<name>-<player_id>") built from player_id; all joins use player_id.
"""
from __future__ import annotations

import copy
from datetime import date

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import evidence as evx
import player_metrics as pmx
from pressure_index import Options
from ranking import RATING_COMPS, Rater, bootstrap
from scouting import PHASE_NAME, bowler_group
from utils import CHECK, IPL_CODES, log, section, slugify, team_code, write_json

PHASES_UI = {"Powerplay": "PP", "Middle": "Middle", "Death": "Death"}
BOWLER_ROWS = ["Right-arm pace", "Left-arm pace", "Off spin", "Leg spin", "Left-arm orthodox", "Left-arm wrist spin"]
CORE = {"bat": ["nrae_p", "runs_ae_p", "out_ae_p", "wpa_p", "delta", "consistency"],
        "bowl": ["rsae_p", "wae_p", "dot_p", "wpa_p", "delta", "consistency"]}


# ====================================================================== helpers


class Ctx:
    """Lookup helpers shared by the exporters."""

    def __init__(self, C: dict):
        self.C = C
        b = C["b"]
        self.b = b
        self.names = C["D"]["names"]
        teams = C["D"]["teams"].drop_duplicates("team_id").set_index("team_id").team_name
        self.team_name = teams
        self.team_code = teams.map(team_code)
        self.by_striker = {k: v for k, v in b.groupby("striker_id")}
        self.by_bowler = {k: v for k, v in b.groupby("bowler_id")}
        m = C["D"]["matches"].set_index("match_id")
        self.m = m
        # current team = most recent team a player appeared for
        a = b[["match_date", "striker_id", "batting_team_id"]].set_axis(["d", "pid", "team"], axis=1)
        c = b[["match_date", "bowler_id", "bowling_team_id"]].set_axis(["d", "pid", "team"], axis=1)
        allp = pd.concat([a, c]).sort_values("d")
        self.teams_of = allp.groupby("pid").team.apply(lambda s: list(dict.fromkeys(s[::-1])))
        lg = pd.concat([b[["striker_id", "fmt"]].set_axis(["pid", "fmt"], axis=1),
                        b[["bowler_id", "fmt"]].set_axis(["pid", "fmt"], axis=1)])
        self.formats_of = lg.groupby("pid").fmt.apply(lambda s: sorted(set(s), key=["IPL", "T20I"].index))
        self.bat_type = b.groupby("striker_id").batting_type.agg(lambda s: s.mode().iat[0])
        self.bat_order = b.groupby("striker_id").batting_order.median()
        self.bowl_type = b.groupby("bowler_id").bowling_type.agg(lambda s: s.mode().iat[0])

    def tcode(self, tid) -> str:
        return self.team_code.get(int(tid), str(tid)) if pd.notna(tid) else ""

    def slug(self, pid) -> str:
        return slugify(self.names.get(pid, pid), pid)

    def cur_team(self, pid) -> str:
        t = self.teams_of.get(pid, [])
        return self.tcode(t[0]) if len(t) else ""

    def style(self, pid, disc) -> str:
        if disc == "bowling" and pid in self.bowl_type.index:
            return str(self.bowl_type[pid])
        hand = {"RHB": "Right-hand", "LHB": "Left-hand"}.get(self.bat_type.get(pid, ""), "")
        o = self.bat_order.get(pid, np.nan)
        pos = "top order" if o <= 3 else "middle order" if o <= 5 else "finisher" if o <= 7 else "lower order"
        return f"{hand} {pos}".strip()


def _role(pid, C) -> str:
    sb = C["raters"]["bat"].S
    sw = C["raters"]["bowl"].S
    pb = sb.p_balls.get(pid, 0)
    pw = sw.p_balls.get(pid, 0)
    ec = C["cfg"]["eligibility"]
    if pb >= ec["batter_min_pressure_balls"] / 2 and pw >= ec["bowler_min_pressure_balls"] / 2:
        return "All-rounder"
    return "Batter" if pb >= pw else "Bowler"


def _classification(pid, C) -> dict:
    """The numbers behind `_role`: pressure balls on each side vs half the eligibility minimum,
    plus the player's rating / rank on each list where they are eligible."""
    ec = C["cfg"]["eligibility"]
    out = {"role": _role(pid, C)}
    for side, lab, mn in [("bat", "bat", ec["batter_min_pressure_balls"]), ("bowl", "bowl", ec["bowler_min_pressure_balls"])]:
        S = C["raters"][side].S
        tbl = C["tables"][side]
        out[f"{lab}PressureBalls"] = int(S.p_balls.get(pid, 0))
        out[f"{lab}Matches"] = int(S.matches_p.get(pid, 0)) if "matches_p" in S else 0
        out[f"{lab}Threshold"] = int(mn // 2)
        out[f"{lab}Rating"] = round(float(tbl.rating[pid]), 1) if pid in tbl.index else None
        out[f"{lab}Rank"] = int(tbl["rank"][pid]) if pid in tbl.index else None
    return out


# ====================================================================== tables


def tables(C: dict, X: Ctx) -> None:
    section("STAGE 10a · CSV TABLES")
    P = C["P"]
    for side, lab in [("bat", "batters"), ("bowl", "bowlers")]:
        T = C["tables"][side].join(C["boot"][side], how="left")
        raw_p, raw_n = C["raw"][f"{side}_p"], C["raw"][f"{side}_n"]
        T.insert(0, "name", T.index.map(X.names))
        T.insert(1, "team", [X.cur_team(p) for p in T.index])
        T.index.name = "player_id"
        R = C["raters"][side]
        for c in RATING_COMPS[side]:
            T[f"z_{c}"] = (T[c] - R.z[c][0]) / R.z[c][1]
        # F2: pressure vs normal for every metric (raw), and the difference
        cols = ["sr", "dot_pct", "bnd_pct", "dis_rate", "nrae", "wpa"] if side == "bat" else \
               ["econ", "dot_pct", "bnd_pct", "wkt_rate", "nrs", "wpa"]
        for c in cols:
            T[f"{c}_pressure"] = raw_p[c].reindex(T.index)
            T[f"{c}_normal"] = raw_n[c].reindex(T.index)
            T[f"{c}_delta"] = T[f"{c}_pressure"] - T[f"{c}_normal"]
        T["captaincy_effect"] = C["captain"][side].captaincy_effect.reindex(T.index)
        T.round(4).to_csv(P["tables"] / f"full_ratings_{lab}.csv")
        top = C["top10"][side].join(C["boot"][side], how="left")
        out = pd.DataFrame({
            "rank": top["rank"], "player_id": top.index, "name": top.index.map(X.names),
            "team": [X.cur_team(p) for p in top.index], "rating": top.rating.round(1),
            "ci_low": top.rating_lo.round(1), "ci_high": top.rating_hi.round(1),
            "rank_p5": top.rank_lo, "rank_p95": top.rank_hi, "p_top10": top.p_top10.round(3),
            "pressure_balls": top.p_balls.astype(int), "matches": top.matches_p.astype(int),
            "pressure_delta": top.delta.round(4)})
        out.to_csv(P["tables"] / f"top10_{lab}.csv", index=False)
        n_delta = int(T[f"{cols[0]}_delta"].notna().sum())
        if side == "bat":
            CHECK.add("F2 Pressure delta for every eligible player", n_delta == len(T),
                      f"{n_delta}/{len(T)} batters, {len(C['tables']['bowl'])} bowlers with deltas for every metric")
    C["sens"].to_csv(P["tables"] / "sensitivity.csv", index=False)
    fr = C["scout"]["fragile"]
    keep = ["name", "plan", "rating", "delta", "delta_odd", "delta_even", "p_balls", "matches_p", "recommendation"]
    fr[[c for c in keep if c in fr]].rename_axis("player_id").round(4).to_csv(P["tables"] / "fragile_batters.csv")
    C["scout"]["profiles"].to_csv(P["tables"] / "weakness_profiles.csv", index=False)
    C["phase"][0].to_csv(P["tables"] / "phase_impact.csv", index=False)
    C["split"].to_csv(P["tables"] / "split_half.csv", index=False)
    for side, lab in [("bat", "batters"), ("bowl", "bowlers")]:
        C["sanity"][side].round(3).to_csv(P["tables"] / f"sanity_top30_{lab}.csv")
        cap = C["captain"][side].copy()
        cap.insert(0, "name", cap.index.map(X.names))
        cap.round(4).to_csv(P["tables"] / f"captaincy_{lab}.csv")
    C["stakes"]["elo_report"].to_csv(P["tables"] / "elo_ipl_vs_t20i.csv", index=False)
    log(f"tables written to {P['tables']}")


# ====================================================================== figures


def figures(C: dict, X: Ctx) -> None:
    section("STAGE 10b · FIGURES")
    P = C["P"]
    # pressure vs normal scatter
    fig, ax = plt.subplots(1, 2, figsize=(12, 5))
    for a, side, (pc, nc), ttl in [(ax[0], "bat", ("nrae_p", "nrae_n"), "Batters: net runs above expected / ball"),
                                   (ax[1], "bowl", ("nrs_p", "nrs_n"), "Bowlers: net runs saved / ball")]:
        T = C["tables"][side]
        a.scatter(T[nc], T[pc], s=18, color="#A39580")
        top = C["top10"][side]
        a.scatter(top[nc], top[pc], s=34, color="#B23A62")
        for pid, r in top.iterrows():
            a.annotate(str(X.names.get(pid, pid)), (r[nc], r[pc]), fontsize=7, xytext=(3, 3), textcoords="offset points")
        lim = [min(T[nc].min(), T[pc].min()), max(T[nc].max(), T[pc].max())]
        a.plot(lim, lim, "--", color="#999", lw=1)
        a.set_xlabel("Normal (shrunk)")
        a.set_ylabel("Pressure (shrunk)")
        a.set_title(ttl)
    fig.suptitle("Pressure vs normal performance (eligible players; top 10 in red)")
    fig.tight_layout()
    fig.savefig(P["figures"] / "pressure_vs_normal_scatter.png", dpi=130)
    plt.close(fig)
    # top-10 bars with bootstrap intervals
    fig, ax = plt.subplots(1, 2, figsize=(12, 5))
    for a, side, ttl in [(ax[0], "bat", "Top 10 batters"), (ax[1], "bowl", "Top 10 bowlers")]:
        t = C["top10"][side].join(C["boot"][side])[::-1]
        y = np.arange(len(t))
        a.barh(y, t.rating, color="#B23A62", alpha=0.85)
        a.errorbar(t.rating, y, xerr=[t.rating - t.rating_lo, t.rating_hi - t.rating], fmt="none", ecolor="#2B2118", capsize=3)
        a.set_yticks(y)
        a.set_yticklabels([f"{X.names.get(p, p)}  (P top10 {pt:.0%})" for p, pt in zip(t.index, t.p_top10)], fontsize=8)
        a.set_xlim(0, 100)
        a.set_xlabel("Rating, 5-95% bootstrap interval (1,000 match resamples)", fontsize=9)
        a.set_title(ttl)
    fig.tight_layout()
    fig.savefig(P["figures"] / "top10_rating_bars.png", dpi=130)
    plt.close(fig)
    # phase impact
    T, W = C["phase"]
    fig, ax = plt.subplots(1, 2, figsize=(12, 4.5))
    piv = T.pivot(index="format", columns="phase", values="share_abs_wpa")[["PP", "Middle", "Death"]]
    piv.plot(kind="bar", ax=ax[0], color=["#4A73A8", "#A39580", "#B23A62"])
    ax[0].set_title("Share of total |WPA| by phase")
    ax[0].set_ylabel("Share")
    W[["PP", "Middle", "Death"]].plot(kind="bar", ax=ax[1], color=["#4A73A8", "#A39580", "#B23A62"])
    ax[1].axhline(0.5, ls="--", color="#999")
    ax[1].set_ylim(0.4, 1)
    ax[1].set_title("Team that wins the phase (WPA) wins the match")
    fig.tight_layout()
    fig.savefig(P["figures"] / "phase_impact.png", dpi=130)
    plt.close(fig)
    # sample radar + weakness heatmap
    prof = C["profiles_cache"]
    pid_top = C["top10"]["bat"].index[0]
    rad = prof.get(X.slug(pid_top), {}).get("radar", [])
    fr = C["scout"]["fragile"]
    fig = plt.figure(figsize=(12, 5))
    if rad:
        a = fig.add_subplot(1, 2, 1, polar=True)
        ang = np.linspace(0, 2 * np.pi, len(rad), endpoint=False).tolist()
        vals = [r["score"] for r in rad]
        a.plot(ang + ang[:1], vals + vals[:1], color="#B23A62")
        a.fill(ang + ang[:1], vals + vals[:1], color="#B23A62", alpha=0.25)
        a.plot(ang + ang[:1], [50] * (len(ang) + 1), "--", color="#999", lw=1)
        a.set_xticks(ang)
        a.set_xticklabels([r["feature"] for r in rad], fontsize=7)
        a.set_ylim(0, 100)
        a.set_title(f"Feature radar: {X.names.get(pid_top)} (percentile vs eligible batters)", fontsize=9)
    if len(fr):
        pf = fr.index[0]
        hm = prof.get(X.slug(pf), {}).get("heatmap")
        if hm is None:
            hm = heatmap_bat(X, pf, C["cfg"])
        a2 = fig.add_subplot(1, 2, 2)
        M = np.full((len(hm["rows"]), len(hm["cols"])), np.nan)
        for c in hm["cells"]:
            if c["value"] is not None and c["balls"] >= hm["minBalls"]:
                M[hm["rows"].index(c["row"]), hm["cols"].index(c["col"])] = c["value"]
        im = a2.imshow(M, cmap="RdBu", vmin=40, vmax=160)
        a2.set_xticks(range(len(hm["cols"])))
        a2.set_xticklabels(hm["cols"])
        a2.set_yticks(range(len(hm["rows"])))
        a2.set_yticklabels(hm["rows"])
        for i in range(M.shape[0]):
            for j in range(M.shape[1]):
                a2.text(j, i, "-" if np.isnan(M[i, j]) else f"{M[i, j]:.0f}", ha="center", va="center", fontsize=8)
        fig.colorbar(im, ax=a2, label="Performance index (100 = expected)")
        a2.set_title(f"Weakness heatmap (pressure balls): {X.names.get(pf)}; cells < {hm['minBalls']} balls hidden", fontsize=9)
    fig.tight_layout()
    fig.savefig(P["figures"] / "sample_radar_weakness_heatmap.png", dpi=130)
    plt.close(fig)
    log(f"figures written to {P['figures']}")


# ====================================================================== JSON: leaderboards


def _season_span(seasons) -> str:
    """[2024, 2025] -> "2024–25"; [2022, 2024] -> "2022, 2024"."""
    s = sorted({int(x) for x in seasons})
    if not s:
        return ""
    if s == list(range(s[0], s[-1] + 1)):
        return str(s[0]) if len(s) == 1 else f"{s[0]}–{str(s[-1])[2:]}"
    return ", ".join(str(x) for x in s)


def scope_team(X: "Ctx", b: pd.DataFrame, pid, side: str, fmt: str) -> dict:
    """Team label for a player in a filtered scope (b = the balls in scope).
    IPL / T20I: the team with the most balls in scope; other teams listed with their seasons.
    All: the team with the most PRESSURE balls in scope, plus the main team of the other format as a secondary tag."""
    key, tcol, pcol = ("striker_id", "batting_team_id", "p_bat") if side == "bat" else ("bowler_id", "bowling_team_id", "p_bowl")
    x = b[b[key] == pid]
    if side == "bat":
        x = x[x.faced]
    if not len(x):
        return {"team": X.cur_team(pid), "team2": None, "teamsOther": []}
    base = x[x[pcol]] if fmt == "All" and x[pcol].any() else x
    main = base.groupby(tcol).size().idxmax()
    main_fmt = x.loc[x[tcol] == main, "fmt"].iloc[0]
    same = x[x.fmt == main_fmt]
    others = [{"code": X.tcode(t), "seasons": _season_span(g.season)}
              for t, g in same.groupby(tcol) if t != main]
    team2 = None
    if fmt == "All":
        other = x[x.fmt != main_fmt]
        if len(other):
            team2 = X.tcode(other.groupby(tcol).size().idxmax())
    return {"team": X.tcode(main), "team2": team2, "teamsOther": others}


def _slice_rows(C, X, side, mask, label, iters=200, fmt="All") -> list[dict]:
    cfg = C["cfg"]
    b = C["b"]
    o = Options()
    XX = pmx.player_match(cfg, b, o, mask=mask, pflags=C["pflags"])
    PM = XX[side]
    if len(PM) == 0:
        return []
    share = PM.p_balls.sum() / max(C["pm"][side].p_balls.sum(), 1)
    ec = cfg["eligibility"]
    base_pb = ec["batter_min_pressure_balls"] if side == "bat" else ec["bowler_min_pressure_balls"]
    base_m = ec["batter_min_matches"] if side == "bat" else ec["bowler_min_matches"]
    min_pb = max(cfg["export"]["leaderboard_slice_min_pressure_balls"], int(round(base_pb * share)))
    min_m = max(5, int(round(base_m * min(1.0, share ** 0.5))))
    try:
        R = Rater(cfg, side, PM, o, min_pb=min_pb, min_m=min_m, comps=CORE[side])
    except Exception as e:  # too few players in a slice
        log(f"   slice {label} {side}: skipped ({e})")
        return []
    T = R.table()
    if len(T) == 0:
        return []
    c2 = copy.deepcopy(cfg)
    c2["bootstrap"]["iterations"] = iters
    bs = bootstrap(c2, R, PM, cfg["seed"]) if len(T) >= 3 else pd.DataFrame(index=T.index, columns=["rating_lo", "rating_hi"])
    return _rows(C, X, side, T.head(EXPORT_TOP), bs, PM, mask, iters, fmt)


EXPORT_TOP = 40  # rows per leaderboard view (the Leaderboards page shows 1-10, the Overview sphere up to 40)
DETAIL_TOP = 10  # sparkline data only for the rows the table shows


def _rows(C, X, side, top, bs, PM, mask, resamples: int, fmt: str = "All") -> list[dict]:
    b = C["b"] if mask is None else C["b"][mask]
    fb, fw = C["pflags"]
    if mask is not None:
        fb, fw = fb[mask], fw[mask]
    rows = []
    ms = PM["match_score"]
    ok = PM.p_balls >= 3
    pct = ms[ok].rank(pct=True) * 100
    for rank, (pid, r) in enumerate(top.iterrows(), 1):
        if side == "bat":
            sel = (b.striker_id == pid).values
            p = b[sel & fb]
            n = b[sel & ~fb & b.faced.values]
            srp = 100 * p.bat_runs.sum() / max(p.faced.sum(), 1)
            srn = 100 * n.bat_runs.sum() / max(n.faced.sum(), 1)
            dp = 100 * (srp - srn) / max(srn, 1e-6)
        else:
            sel = (b.bowler_id == pid).values
            p = b[sel & fw]
            n = b[sel & ~fw]
            ep = 6 * p.bowler_runs.sum() / max(p.legal.sum(), 1)
            en = 6 * n.bowler_runs.sum() / max(n.legal.sum(), 1)
            dp = 100 * (en - ep) / max(en, 1e-6)
        light = rank > DETAIL_TOP
        if pid in pct.index.get_level_values(0) and not light:
            sp = pct.loc[pid]
            sp = sp.iloc[np.argsort(X.m.match_date.reindex(sp.index).values, kind="stable")].tail(12)
        else:
            sp = pd.Series(dtype=float)
        # opponent of each sparkline match (from the side the player was on)
        mine = (X.by_striker if side == "bat" else X.by_bowler).get(pid)
        team_col = "batting_team_id" if side == "bat" else "bowling_team_id"
        team_of = mine.groupby("match_id")[team_col].first() if mine is not None else pd.Series(dtype=float)
        points = []
        for mid, v in (sp.items() if not light else []):
            mr = X.m.loc[mid]
            t = team_of.get(mid)
            opp = mr.team2 if pd.notna(t) and int(t) == int(mr.team1) else mr.team1
            points.append({"matchId": str(mid), "date": mr.match_date.strftime("%Y-%m-%d"),
                           "label": f"{X.tcode(t)} vs {X.tcode(opp)}" if pd.notna(t) else str(mr.comp_name),
                           "score": int(round(v))})
        # normal (non-pressure) per-ball value, placed on the same percentile scale as the pressure scores
        nk = "nrae_n" if side == "bat" else "nrs_n"
        if pid in PM.index.get_level_values(0) and not light:
            g = PM.loc[pid]
            nv = g[f"{nk}_num"].sum() / g[f"{nk}_den"].sum() if g[f"{nk}_den"].sum() > 0 else np.nan
        else:
            nv = np.nan
        normal = int(round(100 * float((ms[ok] < nv).mean()))) if pd.notna(nv) else None
        lo = bs.rating_lo.get(pid, np.nan) if "rating_lo" in bs else np.nan
        hi = bs.rating_hi.get(pid, np.nan) if "rating_hi" in bs else np.nan
        rows.append({"rank": int(r.get("rank", rank)), "playerId": X.slug(pid), "name": X.names.get(pid, str(pid)),
                     **scope_team(X, b, pid, side, fmt), "rating": round(float(r.rating), 1), "deltaPct": round(float(dp), 1),
                     "ciLow": round(float(lo if pd.notna(lo) else r.rating), 1),
                     "ciHigh": round(float(hi if pd.notna(hi) else r.rating), 1),
                     "pressureBalls": int(r.p_balls), "matches": int(r.matches_p),
                     "spark": [int(round(v)) for v in sp.values], "sparkPoints": points, "sparkNormal": normal,
                     "resamples": int(resamples) if pd.notna(lo) else 0})
        card = C.get("cards", {}).get(side)
        if mask is None and card is not None and pid in set(card.player_id):  # FIX 9: overall view only
            cr = card.set_index("player_id").loc[pid]
            rows[-1].update({"confidenceGroup": str(cr.confidence_group), "pTop10": float(cr.p_top10),
                             "rankRange": [int(cr.rank_p5), int(cr.rank_p95)], "sensTop10Share": float(cr.sens_top10_share),
                             "pressureBallsIpl": int(cr.pressure_balls_ipl), "pressureBallsT20i": int(cr.pressure_balls_t20i),
                             "weakOppShare": float(cr.weak_opp_share) if pd.notna(cr.weak_opp_share) else 0.0})
        C["ref_ids"].add(pid)
    return rows


def leaderboards(C: dict, X: Ctx) -> None:
    section("STAGE 10c · LEADERBOARD JSON (format x season x phase)")
    b = C["b"]
    seasons = [str(s) for s in sorted(b.season.unique())]
    for side, lab, key in [("bat", "batters", "Strike rate"), ("bowl", "bowlers", "Economy")]:
        views = []
        for fmt in ["All", "IPL", "T20I"]:
            for season in ["All"] + seasons:
                for ph in ["All", "Powerplay", "Middle", "Death"]:
                    if fmt == season == ph == "All":
                        t10 = C["top10"][side]
                        rest = C["tables"][side].drop(t10.index, errors="ignore").sort_values("rating", ascending=False)
                        rest = rest.head(EXPORT_TOP - len(t10)).assign(rank=np.arange(len(t10) + 1, min(EXPORT_TOP, len(t10) + len(rest)) + 1))
                        top = pd.concat([t10, rest[t10.columns.intersection(rest.columns)]])
                        rows = _rows(C, X, side, top, C["boot"][side], C["pm"][side], None,
                                     C["cfg"]["bootstrap"]["iterations"], fmt)
                    else:
                        mask = np.ones(len(b), bool)
                        if fmt != "All":
                            mask &= (b.fmt == fmt).values
                        if season != "All":
                            mask &= (b.season.astype(str) == season).values
                        if ph != "All":
                            mask &= (b.phase == PHASES_UI[ph]).values
                        rows = _slice_rows(C, X, side, mask, f"{fmt}/{season}/{ph}", fmt=fmt)
                    ids = [r["playerId"] for r in rows]
                    if len(ids) != len(set(ids)):  # a player may appear at most once per table
                        raise RuntimeError(f"leaderboard_{lab} {fmt}/{season}/{ph}: duplicate player ids {ids}")
                    views.append({"format": fmt, "season": season, "phase": ph, "rows": rows})
        write_json({"discipline": "batting" if side == "bat" else "bowling", "keyStat": key, "seasons": seasons,
                    "views": views}, C["P"]["public"] / f"leaderboard_{lab}.json")
        n_rows = sum(len(v["rows"]) for v in views)
        log(f"leaderboard_{lab}.json: {len(views)} views, {n_rows} rows")
        # team labels follow the scope: IPL views -> franchises only, T20I views -> national teams only
        bad = [(v["format"], r["name"], r["team"]) for v in views for r in v["rows"]
               if (v["format"] == "IPL" and r["team"] not in IPL_CODES) or (v["format"] == "T20I" and r["team"] in IPL_CODES)]
        legacy = [r["team"] for v in views for r in v["rows"] if r["team"] in ("SH", "PK") or r.get("team2") in ("SH", "PK")]
        CHECK.add(f"Leaderboard {lab}: team label matches the scope, official codes, no duplicates",
                  not bad and not legacy, f"{len(views)} views checked; mismatches {bad[:3]}; legacy codes {legacy[:3]}")


# ====================================================================== JSON: profiles


def heatmap_bat(X: Ctx, pid, cfg) -> dict:
    x = X.by_striker.get(pid)
    x = x[x.p_bat] if x is not None else pd.DataFrame()
    cells = []
    if len(x):
        x = x.assign(grp=x.bowling_type.map(bowler_group))
    for r in BOWLER_ROWS:
        for ph_ui, ph in PHASES_UI.items():
            g = x[(x.grp == r) & (x.phase == ph)] if len(x) else x
            n = int(g.faced.sum()) if len(g) else 0
            if n == 0:
                cells.append({"row": r, "col": ph_ui, "value": None, "balls": 0})
                continue
            exp = float(g.e_bat_runs.sum())
            runs = int(g.bat_runs.sum())
            v = 100 * runs / max(exp, 1e-6)
            cells.append({"row": r, "col": ph_ui, "value": int(round(min(v, 250))), "balls": n,
                          "runs": runs, "expRuns": round(exp, 1), "rate": round(100 * runs / n, 1),
                          "dismissals": int(g.striker_out.sum())})
    return {"rowLabel": "Bowler type", "colLabel": "Phase", "rows": BOWLER_ROWS, "cols": list(PHASES_UI),
            "metricLabel": "Runs vs expected under pressure (100 = expected)", "minBalls": cfg["export"]["scout_min_cell_balls"],
            "formula": "Pressure run index = (actual runs scored ÷ expected runs for those balls) × 100. "
                       "100 = as expected, above 100 = stronger, below 100 = weaker.",
            "ballsLabel": "Balls faced", "runsLabel": "Runs", "rateLabel": "Strike rate", "dismissalsLabel": "Dismissals",
            "cells": cells}


def heatmap_bowl(X: Ctx, pid, cfg) -> dict:
    x = X.by_bowler.get(pid)
    x = x[x.p_bowl] if x is not None else pd.DataFrame()
    cells = []
    rows = ["Elite", "Strong", "Normal"]
    for r in rows:
        for ph_ui, ph in PHASES_UI.items():
            g = x[(x.striker_tier == r) & (x.phase == ph)] if len(x) else x
            n = int(g.legal.sum()) if len(g) else 0
            if n == 0:
                cells.append({"row": r, "col": ph_ui, "value": None, "balls": 0})
                continue
            exp = float(g.e_bowl_runs.sum())
            runs = int(g.bowler_runs.sum())
            v = 100 * exp / max(runs, 1)
            cells.append({"row": r, "col": ph_ui, "value": int(round(min(v, 250))), "balls": n,
                          "runs": runs, "expRuns": round(exp, 1), "rate": round(6 * runs / n, 2),
                          "dismissals": int(g.bowler_wkt.sum())})
    return {"rowLabel": "Batter tier", "colLabel": "Phase", "rows": rows, "cols": list(PHASES_UI),
            "metricLabel": "Expected vs actual runs conceded under pressure (100 = expected)",
            "formula": "Pressure run index = (expected runs for those balls ÷ actual runs conceded) × 100. "
                       "100 = as expected, above 100 = stronger, below 100 = weaker.",
            "ballsLabel": "Balls bowled", "runsLabel": "Runs conceded", "rateLabel": "Economy", "dismissalsLabel": "Wickets",
            "minBalls": cfg["export"]["scout_min_cell_balls"], "cells": cells}


def _overs(balls: int) -> str:
    return f"{balls // 6}.{balls % 6}"


def match_log(X: "Ctx", pid, side: str, rk: pd.Series, nrk: pd.Series) -> list[dict]:
    """Every match the player batted or bowled in: match score + result, the player's full line and the
    part of it on pressure balls (newest first). Written to public/data/logs/<slug>.json."""
    if not hasattr(X, "_dismissals"):  # (match_id, player_id) -> how out, built once
        d = X.b[X.b.dismissed_player_id.notna()]
        X._dismissals = {(m, int(p)): str(t) for m, p, t in zip(d.match_id, d.dismissed_player_id, d.dismissal_type)}
    dis = X._dismissals
    bat = X.by_striker.get(pid)
    bowl = X.by_bowler.get(pid)
    mids = set(bat.match_id.unique() if bat is not None else []) | set(bowl.match_id.unique() if bowl is not None else [])
    bat_g = dict(tuple(bat.groupby("match_id"))) if bat is not None else {}
    bowl_g = dict(tuple(bowl.groupby("match_id"))) if bowl is not None else {}
    rows = []
    for mid in mids:
        if mid not in X.m.index:
            continue
        mr = X.m.loc[mid]
        summ = evx.match_summary(X, mr)
        row = {"matchId": str(mid), **summ}
        team = None
        g = bat_g.get(mid)
        if g is not None and g.faced.any():
            team = g.batting_team_id.iloc[0]
            f = g[g.faced]
            how = dis.get((mid, int(pid)))
            pb = f[f.p_bat]
            row["bat"] = {"runs": int(f.bat_runs.sum()), "balls": int(len(f)), "fours": int(f.is_four.sum()),
                          "sixes": int(f.is_six.sum()), "out": how is not None,
                          "how": how,
                          "pRuns": int(pb.bat_runs.sum()), "pBalls": int(len(pb)), "pOut": bool(pb.striker_out.any())}
        g = bowl_g.get(mid)
        if g is not None and len(g):
            team = team if team is not None else g.bowling_team_id.iloc[0]
            pw = g[g.p_bowl]
            row["bowl"] = {"balls": int(g.legal.sum()), "runs": int(g.bowler_runs.sum()), "wkts": int(g.bowler_wkt.sum()),
                           "dots": int(g.is_dot.sum()), "pBalls": int(pw.legal.sum()), "pRuns": int(pw.bowler_runs.sum()),
                           "pWkts": int(pw.bowler_wkt.sum())}
        if team is None:
            continue
        opp = mr.team2 if int(team) == int(mr.team1) else mr.team1
        row["team"] = X.tcode(team)
        row["opponent"] = X.tcode(opp)
        row["won"] = bool(mr.win_team_id == team) if pd.notna(mr.win_team_id) else None
        ps = rk.get((pid, mid), np.nan)
        ns = nrk.get((pid, mid), np.nan)
        row["pressureScore"] = int(round(ps)) if pd.notna(ps) else None
        row["normalScore"] = int(round(ns)) if pd.notna(ns) else None
        row["hasDetail"] = False
        rows.append(row)
    rows.sort(key=lambda r: r["date"], reverse=True)
    return rows


def best_performances(rows: list[dict], side: str) -> list[dict]:
    """Best line overall and best line on pressure balls only (min. 6 pressure balls)."""
    out = []
    if side == "bat":
        b = [r for r in rows if "bat" in r]
        if b:
            r = max(b, key=lambda r: (r["bat"]["runs"], -r["bat"]["balls"]))
            x = r["bat"]
            out.append({"kind": "overall", "label": "Best innings", "line": f"{x['runs']}{'' if x['out'] else '*'} ({x['balls']})",
                        "matchId": r["matchId"], "opponent": r["opponent"], "date": r["date"], "competition": r["competition"]})
        bp = [r for r in b if r["bat"]["pBalls"] >= 6]
        if bp:
            r = max(bp, key=lambda r: (r["bat"]["pRuns"], -r["bat"]["pBalls"]))
            x = r["bat"]
            out.append({"kind": "pressure", "label": "Best under pressure",
                        "line": f"{x['pRuns']}{'' if x['pOut'] else '*'} ({x['pBalls']})",
                        "matchId": r["matchId"], "opponent": r["opponent"], "date": r["date"], "competition": r["competition"]})
    else:
        b = [r for r in rows if "bowl" in r and r["bowl"]["balls"] > 0]
        if b:
            r = max(b, key=lambda r: (r["bowl"]["wkts"], -r["bowl"]["runs"]))
            x = r["bowl"]
            out.append({"kind": "overall", "label": "Best bowling", "line": f"{x['wkts']}/{x['runs']} ({_overs(x['balls'])})",
                        "matchId": r["matchId"], "opponent": r["opponent"], "date": r["date"], "competition": r["competition"]})
        bp = [r for r in b if r["bowl"]["pBalls"] >= 6]
        if bp:
            r = max(bp, key=lambda r: (r["bowl"]["pWkts"], -r["bowl"]["pRuns"]))
            x = r["bowl"]
            out.append({"kind": "pressure", "label": "Best under pressure",
                        "line": f"{x['pWkts']}/{x['pRuns']} ({_overs(x['pBalls'])})",
                        "matchId": r["matchId"], "opponent": r["opponent"], "date": r["date"], "competition": r["competition"]})
    return out


def _pctile(series: pd.Series, val: float) -> int:
    s = series.dropna()
    return int(round(100 * (s < val).mean())) if len(s) else 50


def profile(C: dict, X: Ctx, pid, disc: str) -> dict:
    cfg = C["cfg"]
    side = "bat" if disc == "batting" else "bowl"
    R = C["raters"][side]
    V = R.rate()
    E = V[V.eligible]
    me = V.loc[pid] if pid in V.index else None
    tbl = C["tables"][side]
    rank = int(tbl["rank"].get(pid, 0)) if pid in tbl.index else 0
    bs = C["boot"][side]
    rating = float(me.rating) if me is not None else 50.0
    fb, fw = C["pflags"]
    b = C["b"]
    if side == "bat":
        x = X.by_striker.get(pid, b.iloc[:0])
        p, n = x[x.p_bat], x[~x.p_bat & x.faced]

        def m(g):
            fcd = max(g.faced.sum(), 1)
            outs = int(g.striker_out.sum())
            return {"avg": (g.bat_runs.sum() / outs) if outs else None,
                    "sr": 100 * g.bat_runs.sum() / fcd, "dot": 100 * (g.faced & (g.bat_runs == 0)).sum() / fcd,
                    "bnd": 100 * (g.is_four | g.is_six).sum() / fcd, "dis": 100 * g.striker_out.sum() / fcd,
                    "nrae": g.nrae.sum() / fcd, "wpa": 100 * g.wpa_bat.sum() / fcd}
        mn, mp = m(n), m(p)
        comp = [("avg", "Batting average", "", "higher"), ("sr", "Strike rate", "", "higher"), ("dot", "Dot-ball %", "%", "lower"), ("bnd", "Boundary %", "%", "higher"),
                ("dis", "Dismissal % per ball", "%", "lower"), ("nrae", "Net runs above expected / ball", "", "higher"),
                ("wpa", "Win prob. added / ball", "wpa", "higher")]
        radar_def = [("Ball Pressure (WPA)", "wpa_p"), ("Run Value", "nrae_p"), ("Pressure Delta", "delta"),
                     ("Matchup Threat", "matchup_ppdeath"), ("Rescue", "rescue"), ("Collapse Entry", "collapse"),
                     ("Stakes", "_stakes"), ("Opposition Strength", "_elo"), ("Consistency", "consistency")]
    else:
        x = X.by_bowler.get(pid, b.iloc[:0])
        p, n = x[x.p_bowl], x[~x.p_bowl]

        def m(g):
            lg = max(g.legal.sum(), 1)
            wk = int(g.bowler_wkt.sum())
            return {"avg": (g.bowler_runs.sum() / wk) if wk else None, "srb": (g.legal.sum() / wk) if wk else None,
                    "econ": 6 * g.bowler_runs.sum() / lg, "dot": 100 * g.is_dot.sum() / lg,
                    "bnd": 100 * (g.is_four | g.is_six).sum() / lg, "wkt": 100 * g.bowler_wkt.sum() / lg,
                    "nrs": g.nrs.sum() / lg, "wpa": 100 * g.wpa_bowl.sum() / lg}
        mn, mp = m(n), m(p)
        comp = [("avg", "Bowling average", "", "lower"), ("srb", "Bowling strike rate (balls / wkt)", "", "lower"),
                ("econ", "Economy", "rpo", "lower"), ("dot", "Dot-ball %", "%", "higher"), ("bnd", "Boundary % conceded", "%", "lower"),
                ("wkt", "Wicket % per ball", "%", "higher"), ("nrs", "Net runs saved / ball", "", "higher"),
                ("wpa", "Win prob. added / ball", "wpa", "higher")]
        radar_def = [("Ball Pressure (WPA)", "wpa_p"), ("Runs Saved", "rsae_p"), ("Pressure Delta", "delta"),
                     ("Death Clamp", "death_clamp"), ("Powerplay Control", "pp_control"), ("Control vs Teammates", "control"),
                     ("Heist", "heist"), ("Pair-breaker", "pair_breaker"), ("Stakes", "_stakes"), ("Consistency", "consistency")]
    r2 = lambda v: None if v is None or not np.isfinite(v) else round(float(v), 2)  # noqa: E731
    comparison = [{"key": k, "label": lab, "normal": r2(mn[k]), "pressure": r2(mp[k]), "unit": u,
                   "better": bt} for k, lab, u, bt in comp]
    extra = C["extra"][side]
    radar = []
    for feat, col in radar_def:
        if col.startswith("_"):
            s = extra[col]
            val = s.get(pid, np.nan)
            sc = _pctile(s.reindex(E.index), val) if pd.notna(val) else 50
        else:
            sc = _pctile(E[col], me[col]) if me is not None else 50
        radar.append({"feature": feat, "score": sc, "peerAvg": 50})
    # consistency strip
    PM = C["pm"][side]
    allms = PM.match_score[PM.p_balls >= 3]
    rk = allms.rank(pct=True) * 100
    # same-match normal-ball (non-pressure) score, on the same percentile scale as the pressure score
    nk = "nrae_n" if side == "bat" else "nrs_n"
    nden = PM[f"{nk}_den"]
    nsc = (PM[f"{nk}_num"] / nden.replace(0, np.nan))[nden >= 6]
    nrk = pd.Series(np.searchsorted(np.sort(allms.dropna().values), nsc.values) / max(allms.notna().sum(), 1) * 100,
                    index=nsc.index)
    cons = []
    if pid in PM.index.get_level_values(0):
        mm = PM.loc[pid]
        mm = mm[mm.p_balls >= 3]
        for season, g in mm.groupby(mm.index.map(lambda mid: int(X.m.season.get(mid, 0)))):
            inns = []
            for mid, r in g.iterrows():
                mr = X.m.loc[mid]
                my_team = (x[x.match_id == mid].batting_team_id if side == "bat" else x[x.match_id == mid].bowling_team_id)
                my_team = my_team.iloc[0] if len(my_team) else None
                opp = mr.away_team_id if my_team == mr.home_team_id else mr.home_team_id
                nv = nrk.get((pid, mid), np.nan)
                inns.append({"matchId": str(mid), "label": f"vs {X.tcode(opp)} · {mr.match_date.strftime('%d %b')}",
                             "date": mr.match_date.strftime("%Y-%m-%d"),
                             "score": int(round(rk.get((pid, mid), 50))), "balls": int(r.p_balls),
                             "normalScore": int(round(nv)) if pd.notna(nv) else None})
            cons.append({"season": str(season), "innings": inns})
    log_rows = match_log(X, pid, side, rk, nrk)
    bests = best_performances(log_rows, side)
    # matchups by opponent tier (pressure balls)
    mus = []
    if side == "bat":
        base_sr = 100 * p.bat_runs.sum() / max(p.faced.sum(), 1)
        for t in ["Elite", "Strong", "Normal"]:
            g = p[p.bowler_tier == t]
            nb = int(g.faced.sum())
            v = 100 * g.bat_runs.sum() / max(nb, 1)
            mus.append({"tier": t, "balls": nb, "statLabel": "SR", "value": round(v, 1),
                        "deltaPct": round(100 * (v - base_sr) / max(base_sr, 1e-6), 1) if nb else 0.0,
                        "dismissals": int(g.striker_out.sum())})
    else:
        base_e = 6 * p.bowler_runs.sum() / max(p.legal.sum(), 1)
        for t in ["Elite", "Strong", "Normal"]:
            g = p[p.striker_tier == t]
            nb = int(g.legal.sum())
            v = 6 * g.bowler_runs.sum() / max(nb, 1)
            mus.append({"tier": t, "balls": nb, "statLabel": "Econ", "value": round(v, 2),
                        "deltaPct": round(100 * (base_e - v) / max(base_e, 1e-6), 1) if nb else 0.0,
                        "dismissals": int(g.bowler_wkt.sum())})
    hm = heatmap_bat(X, pid, cfg) if side == "bat" else heatmap_bowl(X, pid, cfg)
    sig = signature(C, X, pid, side, x)
    return {"id": X.slug(pid), "name": X.names.get(pid, str(pid)), "role": _role(pid, C), "discipline": disc,
            "classification": _classification(pid, C),
            "style": X.style(pid, disc), "teams": [X.tcode(t) for t in X.teams_of.get(pid, [])][:4],
            "formats": X.formats_of.get(pid, ["T20I"]), "rating": round(rating, 1),
            "ciLow": round(float(bs.rating_lo.get(pid, rating)), 1), "ciHigh": round(float(bs.rating_hi.get(pid, rating)), 1),
            "rank": rank, "rankOf": int(len(tbl)), "pressureBalls": int(me.p_balls) if me is not None else 0,
            "matches": int(me.matches_p) if me is not None else 0, "comparison": comparison, "radar": radar,
            "consistency": cons, "matchups": mus, "heatmap": hm, "signatureMoments": sig, "bests": bests,
            "_log": log_rows}


def _outcome_text(r) -> str:
    if r.is_wicket:
        return f"wicket ({r.dismissal_type})" if pd.notna(r.dismissal_type) else "wicket"
    if r.is_six:
        return "six"
    if r.is_four:
        return "four"
    if r.is_wide:
        return "wide"
    return {0: "dot ball", 1: "single"}.get(int(r.team_runs), f"{int(r.team_runs)} runs")


def _context(r) -> str:
    if r.innings == 2:
        return f"{int(max(r.runs_needed, 0))} needed off {int(r.balls_rem)} balls"
    return f"score {int(r.score_before)}/{int(r.wkts_before)} in over {int(r.overid)}"


def signature(C, X, pid, side, x) -> list[dict]:
    if not len(x):
        return []
    col = "wpa_bat" if side == "bat" else "wpa_bowl"
    top = x.sort_values(col, ascending=False).head(3)
    out = []
    for r in top.itertuples():
        mr = X.m.loc[r.match_id]
        opp = r.bowler_name if side == "bat" else r.striker_name
        verb = "vs" if side == "bat" else "to"
        out.append({"matchId": str(r.match_id), "match": f"{X.tcode(mr.team1)} vs {X.tcode(mr.team2)}",
                    "competition": str(mr.comp_name), "date": mr.match_date.strftime("%Y-%m-%d"), "over": r.over_label,
                    "description": f"{_outcome_text(r).capitalize()} {verb} {opp}, {_context(r)}",
                    "wpSwing": round(100 * getattr(r, col), 1)})
    return out


# ====================================================================== JSON: replay, matchups, scouting, method


def replay(C: dict, X: Ctx) -> dict:
    b = C["b"]
    m = X.m
    ok = m[m.has_bbb & ~m.no_result & m.revised_target.isna() & m.total2.notna()].index
    lev = b[b.match_id.isin(ok)].groupby("match_id").agg(lev=("leverage", "mean"), date=("match_date", "first"))
    pick = lev.sort_values("lev", ascending=False).head(C["cfg"]["export"]["replay_matches"]).sort_values("date", ascending=False).index
    out = []
    for mid in pick:
        x = b[b.match_id == mid].reset_index(drop=True)
        mr = m.loc[mid]
        notes = set(x.wpa_bat.abs().nlargest(6).index)
        balls = []
        over_runs = x.groupby(["innings", "overid"]).team_runs.transform("sum")
        last_in_over = ~x.duplicated(["innings", "overid"], keep="last")
        for i, r in x.iterrows():
            ev = "W" if r.is_wicket else "6" if r.is_six else "4" if r.is_four else ("BIG_OVER" if last_in_over[i] and over_runs[i] >= 15 else None)
            d = {"innings": int(r.innings), "over": r.over_label, "idx": int(i), "wp": round(100 * r.wp_team1, 1),
                 "pressure": round(float(r.pressure_pct), 3)}
            if ev:
                d["event"] = ev
            if i in notes:
                d["note"] = (f"{r.striker_name} vs {r.bowler_name}: {_outcome_text(r)}. "
                             f"WP {100 * r.wp_team1:.0f}% -> {100 * r.wp_team1_post:.0f}% ({X.tcode(mr.team1)})")
            balls.append(d)
        perf = []
        bat = x.groupby("striker_id").agg(w=("wpa_bat", "sum"), runs=("bat_runs", "sum"), balls=("faced", "sum"), pb=("p_bat", "sum"),
                                          team=("batting_team_id", "first"))
        bowl = x.groupby("bowler_id").agg(w=("wpa_bowl", "sum"), runs=("bowler_runs", "sum"), lg=("legal", "sum"),
                                          wk=("bowler_wkt", "sum"), pb=("p_bowl", "sum"), team=("bowling_team_id", "first"))
        tot = bat.w.add(bowl.w, fill_value=0).sort_values(ascending=False).head(4)
        for pid, w in tot.items():
            bw, bb = bowl.w.get(pid, 0), bat.w.get(pid, 0)
            if pid in bowl.index and abs(bw) >= abs(bb):
                r = bowl.loc[pid]
                line = f"{int(r.lg // 6)}.{int(r.lg % 6)}-{int(r.runs)}-{int(r.wk)} · {int(r.pb)} pressure balls"
            else:
                r = bat.loc[pid]
                line = f"{int(r.runs)} ({int(r.balls)}) · {int(r.pb)} pressure balls"
            perf.append({"playerId": X.slug(pid), "name": X.names.get(pid, str(pid)), "team": X.tcode(r.team),
                         "role": _role(pid, C), "line": line, "wpa": round(100 * w, 1)})
            C["ref_ids"].add(pid)
        out.append({"id": str(mid), "competition": str(mr.comp_name), "stage": str(mr.stage),
                    "date": mr.match_date.strftime("%Y-%m-%d"), "venue": str(mr.venue_country),
                    "teamA": str(X.team_name.get(int(mr.team1), mr.team1)), "teamB": str(X.team_name.get(int(mr.team2), mr.team2)),
                    "scoreA": f"{int(mr.total1)}/{int(mr.wkts1)} ({int(mr.legal1) // 6}.{int(mr.legal1) % 6})",
                    "scoreB": f"{int(mr.total2)}/{int(mr.wkts2)} ({int(mr.legal2) // 6}.{int(mr.legal2) % 6})",
                    "result": str(mr.result), "balls": balls, "performers": perf})
    log(f"match_replay.json: {len(out)} highest-leverage completed matches")
    return {"matches": out}


def _mstats(g: pd.DataFrame, overs: pd.DataFrame, league_rpb: float, tier_rpb: float) -> dict:
    lg = max(g.legal.sum(), 1)
    econ = 6 * g.bowler_runs.sum() / lg
    return {"deathClampRate": round(100 * overs.clamp.mean(), 1) if len(overs) else 0.0,
            "threatAdjEcon": round(econ * league_rpb / max(tier_rpb, 1e-6), 2),
            "setBatterWickets": int((g.bowler_wkt & g.is_set).sum()),
            "dotPct": round(100 * g.is_dot.sum() / lg, 1), "boundaryPct": round(100 * (g.is_four | g.is_six).sum() / lg, 1),
            "overs": int(len(overs)) if len(overs) else int(lg // 6)}


def matchups(C: dict, X: Ctx) -> dict:
    cfg = C["cfg"]
    b = C["b"]
    defs = [("death-finishers", "Death finishers", "Death"), ("powerplay-hitters", "Powerplay hitters", "PP")]
    tb = C["threat"]["tiers_bat"]
    tiers, lavg, elite, per = [], {}, {}, {}
    for tid, lab, ph in defs:
        ids = set(tb[(tb.phase == ph) & tb.tier.isin(["Elite", "Strong"])].player_id)
        tiers.append({"id": tid, "label": lab,
                      "description": f"{len(ids)} Elite/Strong batters by shrunk SR, boundary % and dot % in "
                                     f"{'overs 16-20' if ph == 'Death' else 'overs 1-6'} (min {cfg['threat']['min_balls']} balls)"})
        g = b[(b.phase == ph) & b.striker_tier.isin(["Elite", "Strong"])]
        o = g.groupby(["match_id", "innings", "overid", "bowler_id"]).agg(runs=("bowler_runs", "sum"), legal=("legal", "sum")).reset_index()
        o = o[o.legal >= 4]
        o["clamp"] = o.runs <= cfg["features"]["clamp_runs"]
        league_rpb = b[b.phase == ph].bowler_runs.sum() / b[b.phase == ph].legal.sum()
        tier_rpb = g.bowler_runs.sum() / g.legal.sum()
        lavg[tid] = _mstats(g, o, league_rpb, tier_rpb)
        per[tid] = (g, o, league_rpb, tier_rpb)
    cands = C["tables"]["bowl"].index
    chosen = []
    for pid in cands:
        if all((per[t][0].bowler_id == pid).sum() >= 30 for t, _, _ in defs):
            chosen.append(pid)
        if len(chosen) >= 16:
            break
    bowlers = []
    for pid in chosen:
        bt = {}
        for tid, _, _ in defs:
            g, o, lr, tr = per[tid]
            bt[tid] = _mstats(g[g.bowler_id == pid], o[o.bowler_id == pid], lr, tr)
        bowlers.append({"id": X.slug(pid), "name": X.names.get(pid, str(pid)), "team": X.cur_team(pid),
                        "style": X.style(pid, "bowling"), "byTier": bt})
        C["ref_ids"].add(pid)
    # elite benchmark: top-decile clamp rate among bowlers with >= 10 qualifying overs vs that tier
    for tid, _, _ in defs:
        g, o, lr, tr = per[tid]
        q = o.groupby("bowler_id").clamp.agg(["mean", "size"])
        q = q[q["size"] >= 10]
        top = q[q["mean"] >= q["mean"].quantile(0.9)].index
        elite[tid] = _mstats(g[g.bowler_id.isin(top)], o[o.bowler_id.isin(top)], lr, tr)
    log(f"matchups.json: {len(bowlers)} bowlers, tiers {[t['id'] for t in tiers]}")
    return {"tiers": tiers, "leagueAverage": lavg, "eliteBenchmark": elite, "bowlers": bowlers}


def scouting_json(C: dict, X: Ctx) -> dict:
    sc = C["scout"]

    def card(pid):
        c = sc["cards"][pid]
        C["ref_ids"].add(pid)
        return {"playerId": X.slug(pid), "name": X.names.get(pid, str(pid)), "discipline": "batting", "team": X.cur_team(pid),
                "role": _role(pid, C), "normalIndex": c["normal_index"], "pressureIndex": c["pressure_index"],
                "dropPct": c["drop_pct"], "sampleBalls": c["sample"],
                "struggles": {"versus": c["versus"], "delivery": c["delivery"], "line": c["line"], "phase": c["phase"]},
                "dismissals": c["dismissals"], "recommendation": c["recommendation"]}
    return {"squadName": sc["squad_name"], "fix": [card(p) for p in sc["fix_ids"] if p in sc["cards"]],
            "attack": [card(p) for p in sc["attack_ids"] if p in sc["cards"]]}


def method_json(C: dict) -> dict:
    cfg = C["cfg"]
    R = C["wp"]
    met = R["metrics"]
    best = met[(met.model == R["best"]) & (met.innings.astype(str) == "all")].iloc[0]
    T, _ = C["phase"]
    ph = T[T.format == "All"].set_index("phase")
    sens = C["sens"]
    mb, mw = C["threat"]["mult_bat"], C["threat"]["mult_bowl"]
    pipeline = [
        {"id": "situation", "title": "Situation",
         "detail": f"Pre-ball state for {C['kpis']['ballsAnalysed']:,} legal balls; par model (test MAE {R['par_mae']:.0f} runs) and "
                   f"{'logistic' if R['best'] == 'logreg' else 'LightGBM'} WP model (test AUC {best.auc:.2f}, Brier {best.brier:.3f}).",
         "output": "Win probability, WPA and leverage per ball"},
        {"id": "stakes", "title": "Stakes",
         "detail": f"Knockout x{cfg['stakes']['knockout']}, must-win x{cfg['stakes']['must_win']}, series decider "
                   f"x{cfg['stakes']['series_decider']}, dead rubber x{cfg['stakes']['dead_rubber']}, IPL NRR race x{cfg['stakes']['nrr_race']}.",
         "output": f"Stakes multiplier {cfg['stakes']['cap'][0]}-{cfg['stakes']['cap'][1]}"},
        {"id": "threat", "title": "Opponent strength",
         "detail": "Leave-one-out opponent tiers per phase (Elite top 15%, Strong next 25%) and pre-match opposition Elo "
                   "adjust the expected runs and wickets of every ball. Opponent strength is used only here, never to "
                   "pick pressure balls. A-team cups are excluded.",
         "output": "Opponent-adjusted expected runs and wickets"},
        {"id": "performance", "title": "Performance vs expected",
         "detail": f"Top {int(cfg['pressure']['top_share'] * 100)}% of balls by leverage (capped at p99) x stakes, weighted by "
                   f"log(1 + leverage x stakes); runs, wickets (state-based value, about {R['wkt_runs']:.0f} runs on average) "
                   "and WPA vs the opponent-adjusted expectation.",
         "output": "Per-ball residuals, pressure vs normal"},
        {"id": "rank", "title": "Shrink & rank",
         "detail": f"Empirical-Bayes shrinkage, eligibility, {cfg['bootstrap']['iterations']:,} bootstrap resamples by match.",
         "output": "Pressure Rating 0-100 with 5-95% interval and a confidence group (Core / Likely / Fringe)"},
    ]
    sens_rows = [{"test": f"{r.test} ({r.list})", "change": r.change, "rankCorrelation": float(r.spearman) if pd.notna(r.spearman) else 0.0,
                  "top10Overlap": int(r.top10_overlap)} for r in sens.itertuples()]
    lim = [
        {"title": "Small pressure samples", "detail": "Even eligible players have 120-650 pressure balls; bootstrap rank intervals are wide, so read P(top 10) alongside the rank."},
        {"title": "First-innings win probability is uncertain", "detail": f"Without a target the WP model is weaker in innings 1 (test AUC {met[(met.model == R['best']) & (met.innings.astype(str) == '1')].auc.iloc[0]:.2f}) than in the chase."},
        {"title": "Early wickets carry real leverage", "detail": "In this data an early wicket moves win probability as much as many death-over balls, so powerplay balls are often pressure balls. The rule-based sensitivity test shows how rankings change without this."},
        {"title": "Tiers use the full period", "detail": "Threat tiers are descriptive and built on all seasons, so an opponent's tier reflects the whole 2022-2026 window, not form on the day."},
        {"title": "Mixed competition strength", "detail": "International matches include associate sides (A-team cups are excluded). Opposition Elo adjusts the expected values, and each top-10 card shows the share of pressure balls against bottom-quartile Elo sides."},
        {"title": "No fielding, venue or ball-tracking data", "detail": "Fielding, pitch and venue effects are only partly absorbed by state expectations; bowl_speed was dropped (about 39% zeros)."},
    ]
    groups = {side: [{"name": r["name"], "rank": int(r["rank"]), "group": r.confidence_group, "pTop10": float(r.p_top10),
                      "sensTop10Share": float(r.sens_top10_share)} for _, r in C["cards"][side].iterrows()]
              for side in ["bat", "bowl"]} if "cards" in C else {}
    return {"pipeline": pipeline, "calibration": R["calibration"], "confidenceGroups": groups,
            "confidenceRule": "Core: P(top 10) >= 60% and in the top 10 in >= 70% of sensitivity runs; "
                              "Likely: P(top 10) >= 35% or in the top 10 in >= 40% of runs; Fringe: everyone else.",
            "endgameCalibration": C["wp"]["endgame_table"].to_dict("records"),
            "phaseImpact": [{"phase": PHASE_NAME[p], "batting": float(ph.loc[p, "batting_gain_vs_mean"]),
                             "bowling": float(ph.loc[p, "bowling_gain_vs_mean"])} for p in ["PP", "Middle", "Death"]],
            "sensitivity": sens_rows, "limitations": lim, "eligibility": C["eligibility_counts"],
            "wpModel": {"model": R["best"], "testAuc": float(best.auc), "testBrier": float(best.brier),
                        "testLogLoss": float(best.log_loss)}}


# ====================================================================== orchestration


def match_files(C: dict, X: Ctx, profiles: dict, pid_of: dict) -> set:
    """public/data/matches/<matchId>.json for every match a profile links to: the player's highest-scoring
    pressure innings and their signature moments. Each file holds the match summary, the ball-by-ball
    win-probability curve and, per linked player, their line and every delivery with its pressure reasons.
    Loaded on demand by the player page (one small file per click)."""
    import json

    out_dir = C["P"]["public"] / "matches"
    out_dir.mkdir(parents=True, exist_ok=True)
    for f in out_dir.glob("*.json"):
        f.unlink()
    pct = C.get("pressure_pct") or evx.pressure_pct(C["b"])
    cache = C.setdefault("match_cache", evx.MatchCache(C["b"]))
    want: dict[str, set] = {}
    for slug, prof in profiles.items():
        inns = [i for s in prof["consistency"] for i in s["innings"]]
        best = max(inns, key=lambda i: (i["score"], i["balls"]), default=None)
        mids = ([best["matchId"]] if best else []) + [s["matchId"] for s in prof["signatureMoments"]]
        if 1 <= prof["rank"] <= 10:  # top-10 players: ball-by-ball for every match in their log
            mids += [r["matchId"] for r in prof.get("_log", [])]
        for mid in mids:
            want.setdefault(mid, set()).add(slug)
    have = set(X.m.index.astype(str))
    n_files = n_links = 0
    missing = 0
    links: set = set()
    for mid_s, slugs in want.items():
        if mid_s not in have:
            missing += len(slugs)
            continue
        mid = X.m.index[X.m.index.astype(str) == mid_s][0]
        mx, _ = cache.get(mid)
        if not len(mx):
            missing += len(slugs)
            continue
        players = {}
        for slug in sorted(slugs):
            side = "bat" if profiles[slug]["discipline"] == "batting" else "bowl"
            pim = evx.player_in_match(C, X, mid, pid_of[slug], side, pct, cache, _outcome_text)
            if pim:
                players[slug] = {"name": profiles[slug]["name"], "discipline": profiles[slug]["discipline"], **pim}
                links.add((mid_s, slug))
        doc = {"id": mid_s, **evx.match_summary(X, X.m.loc[mid]), "curve": evx.curve(mx), "players": players}
        with open(out_dir / f"{mid_s}.json", "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
        n_files += 1
        n_links += len(players)
    # lookup index for the match centre: every match file and the players it holds ball data for
    index = []
    for f in sorted(out_dir.glob("*.json")):
        if f.stem == "index":
            continue
        with open(f, encoding="utf-8") as fh:
            doc = json.load(fh)
        index.append({k: doc.get(k) for k in ["id", "competition", "stage", "date", "season", "matchNumber", "teamA",
                                                "teamB", "teamACode", "teamBCode", "scoreA", "scoreB", "result"]}
                     | {"players": [{"id": k, "name": v["name"], "discipline": v["discipline"]}
                                    for k, v in doc["players"].items()]})
    index.sort(key=lambda r: r["date"] or "", reverse=True)
    with open(out_dir / "index.json", "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    size = sum(f.stat().st_size for f in out_dir.glob("*.json")) / 1e6
    log(f"matches/*.json: {n_files} match files ({size:.1f} MB), {n_links} player-match links; {missing} unresolved links")
    CHECK.add("Match info files for every best innings + signature moment", n_files > 0 and missing == 0,
              f"{n_files} files, {n_links} player-match links, {size:.1f} MB in public/data/matches/")
    return links


def run(C: dict) -> None:
    X = Ctx(C)
    C["ref_ids"] = set()
    P = C["P"]
    b = C["b"]
    C["kpis"] = {"matchesAnalysed": int(b.match_id.nunique()), "ballsAnalysed": int(b.legal.sum()),
                 "pressureBalls": int(b.pressure_any.sum()),
                 "playersRated": int(len(set(C["tables"]["bat"].index) | set(C["tables"]["bowl"].index))),
                 "dataWindow": f"{b.season.min()}–{b.season.max()}", "competitions": ["IPL", "T20I"],
                 "modelVersion": C["cfg"]["export"]["model_version"], "lastUpdated": date.today().isoformat(),
                 "pressureThreshold": f"Top {int(C['cfg']['pressure']['top_share'] * 100)}% of balls by leverage x stakes "
                                      f"(per side)"}
    # extra radar inputs: stakes and opposition-strength performance
    ex = {}
    for side, key, val, w, st in [("bat", "striker_id", "nrae", "elo_w_bat", "stakes_core_bat"),
                                  ("bowl", "bowler_id", "nrs", "elo_w_bowl", "stakes_core_bowl")]:
        base = b[b.faced] if side == "bat" else b
        hs = base[base[st] > 1.0].groupby(key)[val].mean()
        st_ = base[base[w] > 1.0].groupby(key)[val].mean()
        ex[side] = {"_stakes": hs, "_elo": st_}
    C["extra"] = ex
    tables(C, X)
    leaderboards(C, X)
    rep = replay(C, X)
    evd = evx.build(C, X, _outcome_text)
    mu = matchups(C, X)
    sj = scouting_json(C, X)
    # profiles for every player referenced by any JSON (+ all top-10s)
    section("STAGE 10d · PROFILES, PLAYERS, REPLAY, MATCHUPS, SCOUTING, METHOD, KPIS")
    ids = list(C["top10"]["bat"].index) + list(C["top10"]["bowl"].index) + list(C["ref_ids"])
    ids = list(dict.fromkeys(ids))
    profiles, players = {}, []
    tb, tw = C["tables"]["bat"], C["tables"]["bowl"]
    for pid in ids:
        rb = tb["rank"].get(pid, 10**6)
        rw = tw["rank"].get(pid, 10**6)
        if rb == rw == 10**6:
            sb, sw = C["raters"]["bat"].S.p_balls.get(pid, 0), C["raters"]["bowl"].S.p_balls.get(pid, 0)
            disc = "batting" if sb >= sw else "bowling"
        else:
            disc = "batting" if rb <= rw else "bowling"
        prof = profile(C, X, pid, disc)
        profiles[prof["id"]] = prof
        players.append({k: prof[k] for k in ["id", "name", "role", "discipline", "style", "teams", "formats"]}
                       | {"rank": prof["rank"], "rating": prof["rating"]})
    C["profiles_cache"] = profiles
    links = match_files(C, X, profiles, {X.slug(pid): pid for pid in ids})
    log_dir = P["public"] / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    for f in log_dir.glob("*.json"):
        f.unlink()
    n_rows = 0
    for slug, prof in profiles.items():
        rows = prof.pop("_log", [])
        for r in rows:
            r["hasDetail"] = (r["matchId"], slug) in links
        n_rows += len(rows)
        write_json({"id": slug, "matches": rows}, log_dir / f"{slug}.json")
    log(f"logs/*.json: {len(profiles)} player match logs, {n_rows} player-match rows "
        f"({len(links)} with ball-by-ball detail)")
    figures(C, X)
    pub = P["public"]
    write_json(C["kpis"], pub / "kpis.json")
    write_json(players, pub / "players.json")
    write_json(profiles, pub / "player_profiles.json")
    write_json(rep, pub / "match_replay.json")
    write_json(evd, pub / "evidence.json")
    write_json(mu, pub / "matchups.json")
    write_json(sj, pub / "scouting.json")
    write_json(method_json(C), pub / "method.json")
    log(f"JSON written to {pub}: {len(players)} players / profiles")
