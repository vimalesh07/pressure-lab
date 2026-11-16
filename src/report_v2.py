"""v2 reports: FIX 3 weak-opposition share, FIX 5 single-over dominance, FIX 9 confidence
groups + sample cards, and the v1 vs v2 comparison (outputs/comparison_v1_vs_v2.md)."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from pressure_index import Options, stakes
from utils import CHECK, log, section, spearman

SIDE = {"bat": ("striker_id", "p_bat", "nrae", "batters"), "bowl": ("bowler_id", "p_bowl", "nrs", "bowlers")}


# ---------------------------------------------------------------- FIX 3


def weak_share(cfg: dict, b: pd.DataFrame, side: str, ids) -> pd.Series:
    key, pcol, _, _ = SIDE[side]
    x = b[b[pcol] & (b.faced if side == "bat" else b.legal)]
    s = x[f"weak_opp_{side}"].groupby(x[key]).mean()
    return s.reindex(ids)


# ---------------------------------------------------------------- FIX 5


def single_over_dominance(cfg: dict, b: pd.DataFrame, tables: dict, P: dict, top: int = 20) -> pd.DataFrame:
    """Max share of any single over in a top-20 player's total weighted pressure score
    (sum of |weight x per-ball net runs| over pressure balls), under three weightings."""
    section("FIX 5 · SINGLE-OVER DOMINANCE (top-20 players)")
    rows = []
    for side in ["bat", "bowl"]:
        key, pcol, val, lab = SIDE[side]
        st = stakes(cfg, b, side, Options())
        schemes = {"v1: uniform (x opp-Elo weight)": b[f"elo_w_{side}"].values,
                   "raw leverage x stakes (uncapped)": b.leverage_uncapped.values * st,
                   "v2: log1p(capped leverage x stakes)": np.log1p(b.leverage.values * st)}
        ids = list(tables[side].head(top).index)
        mk = b[pcol].values & (b.faced.values if side == "bat" else np.ones(len(b), bool)) & b[key].isin(ids).values
        x = b.loc[mk, [key, "match_id", "innings", "overid", val]].copy()
        for sch, w in schemes.items():
            x["c"] = np.abs(w[mk] * x[val].values)
            per_over = x.groupby([key, "match_id", "innings", "overid"]).c.sum()
            tot = per_over.groupby(level=0).sum()
            share = (per_over.groupby(level=0).max() / tot).reindex(ids)
            for pid, sh in share.items():
                rows.append({"list": lab, "scheme": sch, "player_id": pid, "max_over_share": sh})
    D = pd.DataFrame(rows)
    S = D.groupby(["list", "scheme"]).max_over_share.agg(["median", "mean", "max"]).round(4).reset_index()
    S.to_csv(P["tables"] / "single_over_dominance.csv", index=False)
    log(S.to_string(index=False))
    raw = S[S.scheme.str.startswith("raw")].set_index("list")
    new = S[S.scheme.str.startswith("v2")].set_index("list")
    ok = bool((new["max"] <= raw["max"]).all() and (new["median"] <= raw["median"]).all())
    CHECK.add("FIX 5 Leverage capped; single-over dominance reduced (numbers shown)", ok,
              "; ".join(f"{l}: max single-over share {raw.loc[l, 'max']:.1%} (raw lev x stakes) -> {new.loc[l, 'max']:.1%} "
                        f"(log1p capped), median {raw.loc[l, 'median']:.1%} -> {new.loc[l, 'median']:.1%}" for l in new.index)
              + f"; leverage cap p{int(100 * cfg['pressure']['leverage_cap_quantile'])}")
    return S


# ---------------------------------------------------------------- FIX 9


def confidence(cfg: dict, b: pd.DataFrame, top10: dict, boots: dict, top_sets: dict, names: pd.Series,
               P: dict) -> dict[str, pd.DataFrame]:
    section("FIX 9 · CONFIDENCE GROUPS AND SAMPLE CARDS")
    cc = cfg["confidence"]
    out = {}
    n_tests = len(top_sets)
    for side in ["bat", "bowl"]:
        key, pcol, _, lab = SIDE[side]
        t = top10[side].join(boots[side][["rating_lo", "rating_hi", "rank_lo", "rank_hi", "p_top10"]], how="left")
        sens = pd.Series({pid: np.mean([pid in v[side] for v in top_sets.values()]) for pid in t.index})
        x = b[b[pcol] & (b.faced if side == "bat" else b.legal)]
        x = x[x[key].isin(t.index)]
        ipl = x[x.league == "IPL"].groupby(key).size().reindex(t.index).fillna(0).astype(int)
        intl = x[x.league != "IPL"].groupby(key).size().reindex(t.index).fillna(0).astype(int)
        weak = weak_share(cfg, b, side, t.index)
        g = np.where((t.p_top10 >= cc["core"]["p_top10"]) & (sens >= cc["core"]["sens_share"]), "Core",
                     np.where((t.p_top10 >= cc["likely"]["p_top10"]) | (sens >= cc["likely"]["sens_share"]), "Likely", "Fringe"))
        C = pd.DataFrame({"rank": t["rank"].astype(int), "player_id": t.index, "name": t.index.map(names),
                          "rating": t.rating.round(1), "rank_p5": t.rank_lo.round(0).astype(int), "rank_p95": t.rank_hi.round(0).astype(int),
                          "p_top10": t.p_top10.round(3), "sens_top10_share": sens.round(3).values,
                          "confidence_group": g, "pressure_balls": t.p_balls.astype(int), "matches": t.matches_p.astype(int),
                          "pressure_balls_ipl": ipl.values, "pressure_balls_t20i": intl.values,
                          "weak_opp_share": weak.round(3).values,
                          "weak_opp_flag": (weak > cfg["elo"]["weak_share_flag"]).values})
        C.to_csv(P["tables"] / f"top10_cards_{lab}.csv", index=False)
        out[side] = C
        log(f"{lab.upper()} (sensitivity runs: {n_tests})")
        log(C.drop(columns="player_id").to_string(index=False))
    return out


def weak_opposition_report(cfg: dict, b: pd.DataFrame, tables: dict, names: pd.Series, P: dict) -> pd.DataFrame:
    rows = []
    for side in ["bat", "bowl"]:
        key, pcol, _, lab = SIDE[side]
        ids = tables[side].index
        s = weak_share(cfg, b, side, ids)
        rows.append(pd.DataFrame({"list": lab, "player_id": ids, "name": ids.map(names), "rank": tables[side]["rank"].values,
                                  "weak_opp_share_pressure_balls": s.round(3).values,
                                  "flag_over_25pct": (s > cfg["elo"]["weak_share_flag"]).values}))
    R = pd.concat(rows, ignore_index=True)
    R.to_csv(P["tables"] / "weak_opposition_share.csv", index=False)
    for lab, g in R.groupby("list"):
        log(f"FIX 3 weak-opposition share ({lab}): {int(g.flag_over_25pct.sum())} of {len(g)} eligible flagged "
            f"(> {cfg['elo']['weak_share_flag']:.0%} of pressure balls vs bottom-quartile Elo sides); top-10 flagged: "
            f"{', '.join(g[(g['rank'] <= 10) & g.flag_over_25pct].name.tolist()) or 'none'}")
    return R


# ---------------------------------------------------------------- comparison


def _arrow(old, new):
    if pd.isna(old):
        return "NEW"
    d = int(old - new)
    return "=" if d == 0 else (f"▲{d}" if d > 0 else f"▼{-d}")


def comparison(cfg: dict, P: dict, C: dict) -> Path:
    """outputs/comparison_v1_vs_v2.md"""
    section("RERUN + COMPARE · comparison_v1_vs_v2.md")
    base = Path(P["tables"]).parent / "baseline_v1"
    L = ["# Pressure Lab: v1 vs v2", "",
         "v1 = the pipeline before the fixes (snapshot in `outputs/baseline_v1/`). v2 = after FIX 1-9. "
         "Same data, same seed, same evaluation split (fit 2022-23, choose/calibrate 2024, test 2025-26).", ""]
    # ---- WP metrics
    v1 = pd.read_csv(base / "wp_model_metrics.csv")
    v2 = C["wp"]["metrics"]
    best = C["wp"]["best"]
    L += ["## 1. Win-probability model", "",
          "| version | model | innings | test AUC | test Brier | test log loss |", "|---|---|---|---|---|---|"]
    for r in v1[v1.model.isin(["logreg", "lgbm"])].itertuples():
        L.append(f"| v1 | {r.model} | {r.innings} | {r.auc:.4f} | {r.brier:.4f} | {r.log_loss:.4f} |")
    for r in v2[v2.model.isin(["logreg", "lgbm"]) & v2.evaluation.str.startswith("test")].itertuples():
        L.append(f"| v2 {r.version} | {r.model} | {r.innings} | {r.auc:.4f} | {r.brier:.4f} | {r.log_loss:.4f} |")
    L += ["", f"Model used for scoring in v2: **{best}**, refit on all seasons 2022-2026 after the honest test "
              "(in-sample metrics of the refit are in `tables/wp_model_metrics.csv`).", "",
          "### End-game calibration (2nd innings, test seasons; pred vs actual win %)", "",
          "| balls left | n | actual | before (ML only) | after (ML + DP) | gap before | gap after | ECE before | ECE after |",
          "|---|---|---|---|---|---|---|---|---|"]
    for r in C["wp"]["endgame_table"].itertuples():
        L.append(f"| {r.bucket} | {r.n_balls} | {r.actual_win_pct} | {r.pred_before} | {r.pred_after} | {r.gap_before:+.1f} | "
                 f"{r.gap_after:+.1f} | {r.ece_before} | {r.ece_after} |")
    L += ["", "### 1st-innings reliability by over (test seasons)", "", "| overs | n | actual | predicted | gap | ECE |", "|---|---|---|---|---|---|"]
    for r in C["wp"]["inn1_table"].itertuples():
        L.append(f"| {r.overs} | {r.n_balls} | {r.actual_win_pct} | {r.pred} | {r.gap:+.1f} | {r.ece} |")
    # ---- top 10 side by side
    names = C["D"]["names"]
    expl = C.get("explanations", {})
    for side, lab in [("bat", "batters"), ("bowl", "bowlers")]:
        o = pd.read_csv(base / f"top10_{lab}.csv")
        n = C["cards"][side]
        full_old = pd.read_csv(base / f"full_ratings_{lab}.csv").set_index("player_id")
        new_rank = C["tables"][side]["rank"]
        L += ["", f"## 2. Top 10 {lab}: v1 vs v2", "",
              "| # | v1 | v1 rating | v2 | v2 rating | change | group |", "|---|---|---|---|---|---|---|"]
        for i in range(10):
            ro, rn = o.iloc[i], n.iloc[i]
            old_rank = full_old["rank"].get(rn.player_id, np.nan)
            L.append(f"| {i + 1} | {ro['name']} | {ro.rating:.1f} | {rn['name']} | {rn.rating:.1f} | "
                     f"{_arrow(old_rank if pd.notna(old_rank) and old_rank <= 10**5 else np.nan, rn['rank'])} "
                     f"(v1 #{int(old_rank) if pd.notna(old_rank) else '—'}) | {rn.confidence_group} |")
        new_ids, old_ids = set(n.player_id), set(o.player_id)
        L += ["", f"**Entered:** {', '.join(names.get(p, str(p)) for p in new_ids - old_ids) or 'none'}  ",
              f"**Dropped out:** {', '.join(names.get(p, str(p)) for p in old_ids - new_ids) or 'none'}", ""]
        for p in list(new_ids - old_ids) + list(old_ids - new_ids):
            L.append(f"- **{names.get(p, str(p))}** ({'in' if p in new_ids else 'out'}; v1 #{int(full_old['rank'].get(p)) if pd.notna(full_old['rank'].get(p, np.nan)) else 'not eligible'}"
                     f" -> v2 #{int(new_rank.get(p)) if pd.notna(new_rank.get(p, np.nan)) else 'not eligible'}): {expl.get((side, p), '')}")
    # ---- split half
    s1 = pd.read_csv(base / "split_half.csv")
    s2 = C["split"]
    L += ["", "## 3. Repeatability (split-half, odd vs even matches)", "",
          "| list | metric | v1 r | v2 r | v1 Spearman-Brown | v2 Spearman-Brown |", "|---|---|---|---|---|---|"]
    for r in s2.itertuples():
        a = s1[(s1.list == r.list) & (s1.metric == r.metric)]
        L.append(f"| {r.list} | {r.metric} | {a.pearson_r.iloc[0] if len(a) else '—'} | {r.pearson_r} | "
                 f"{a.spearman_brown_full.iloc[0] if len(a) else '—'} | {r.spearman_brown_full} |")
    # ---- sensitivity
    q1 = pd.read_csv(base / "sensitivity.csv")
    q2 = C["sens"]
    L += ["", "## 4. Sensitivity (top-10 overlap /10 and Spearman vs the main run)", "",
          "| test | list | v1 overlap | v2 overlap | v1 rho | v2 rho |", "|---|---|---|---|---|---|"]
    for r in q2.itertuples():
        a = q1[(q1.test == r.test) & (q1.list == r.list)]
        L.append(f"| {r.test} | {r.list} | {int(a.top10_overlap.iloc[0]) if len(a) else '—'} | {r.top10_overlap} | "
                 f"{a.spearman.iloc[0] if len(a) else '—'} | {r.spearman} |")
    L += ["", "Note: in v2, *Without F3* / *Without F10* remove the opponent tier / opposition Elo from the expected-value "
              "models (in v1 they removed the threat multiplier / Elo weight from the pressure weight). "
              "The stakes tests (off / -50% / +50%) are new in v2.", ""]
    # ---- other fixes
    L += ["## 5. Other fixes (numbers)", ""]
    for line in C.get("fix_notes", []):
        L.append(f"- {line}")
    out = Path(P["tables"]).parent / "comparison_v1_vs_v2.md"
    out.write_text("\n".join(L) + "\n", encoding="utf-8")
    log(f"written {out}")
    return out


def explain_changes(cfg: dict, b: pd.DataFrame, C: dict, ablations: dict) -> dict:
    """For every player who entered / left a top 10: which fix moved them most.
    `ablations` maps a fix label -> {side: rating Series} from re-rating with that fix reverted."""
    base = Path(C["P"]["tables"]).parent / "baseline_v1"
    out = {}
    for side, lab in [("bat", "batters"), ("bowl", "bowlers")]:
        o = pd.read_csv(base / f"top10_{lab}.csv")
        old_ids = set(o.player_id)
        new_ids = set(C["top10"][side].index)
        main = C["tables"][side]
        excl = pd.read_csv(C["P"]["tables"] / "excluded_competitions_players.csv")
        ex_ids = set(excl[(excl.role == ("batting" if side == "bat" else "bowling"))].player_id)
        for p in (new_ids - old_ids) | (old_ids - new_ids):
            moves = []
            for fx, tabs in ablations.items():
                t = tabs[side]
                if p in t.index and p in main.index:
                    moves.append((fx, float(main.rating[p] - t.rating[p]), int(t["rank"][p])))
            txt = []
            if p in ex_ids:
                r = excl[(excl.player_id == p) & (excl.role == ("batting" if side == "bat" else "bowling"))].iloc[0]
                txt.append(f"FIX 3 removed {int(r.balls)} {r.role} balls from A-team cups ({r.share_of_career_balls:.0%} of their balls)")
            if p not in main.index:
                txt.append("no longer eligible in v2 (pressure-ball count or matches below the minimum after the new pressure-ball set)")
            if moves:
                moves.sort(key=lambda m: -abs(m[1]))
                fx, d, rk = moves[0]
                txt.append(f"largest single effect: {fx} ({'+' if d >= 0 else ''}{d:.1f} rating points; with it reverted they would rank #{rk})")
                if len(moves) > 1:
                    txt.append("next: " + ", ".join(f"{f} {'+' if x >= 0 else ''}{x:.1f}" for f, x, _ in moves[1:3]))
            out[(side, p)] = "; ".join(txt) if txt else "combined small effects of several fixes"
    return out
