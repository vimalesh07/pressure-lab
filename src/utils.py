"""Shared helpers: config, logging, paths, checklist, shrinkage, naming."""
from __future__ import annotations

import json
import logging
import random
import re
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]

# ---------------------------------------------------------------- config / paths


def load_config(path: Path | None = None) -> dict:
    with open(path or ROOT / "config.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def paths(cfg: dict) -> dict[str, Path]:
    p = cfg["paths"]
    out = ROOT / p["outputs"]
    d = {
        "raw": ROOT / p["raw"],
        "processed": ROOT / p["processed"],
        "outputs": out,
        "tables": out / "tables",
        "figures": out / "figures",
        "models": out / "models",
        "logs": out / "logs",
        "public": ROOT / p["public_data"],
    }
    for k, v in d.items():
        if k != "raw":
            v.mkdir(parents=True, exist_ok=True)
    return d


def set_seeds(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)


# ---------------------------------------------------------------- logging

_LOGGER: logging.Logger | None = None


def get_logger(log_file: Path | None = None) -> logging.Logger:
    """Logger that writes to stdout and outputs/logs/run_log.txt."""
    global _LOGGER
    if _LOGGER is not None:
        return _LOGGER
    lg = logging.getLogger("pressure_lab")
    lg.setLevel(logging.INFO)
    lg.handlers.clear()
    fmt = logging.Formatter("%(message)s")
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    try:
        sh.stream.reconfigure(encoding="utf-8")  # Windows consoles
    except Exception:
        pass
    lg.addHandler(sh)
    if log_file is not None:
        fh = logging.FileHandler(log_file, mode="w", encoding="utf-8")
        fh.setFormatter(fmt)
        lg.addHandler(fh)
    _LOGGER = lg
    return lg


def log(msg: str = "") -> None:
    get_logger().info(msg)


def section(title: str) -> None:
    log("")
    log("=" * 78)
    log(f"  {title}")
    log("=" * 78)


class Timer:
    def __init__(self, name: str):
        self.name = name

    def __enter__(self):
        self.t = time.time()
        return self

    def __exit__(self, *a):
        log(f"[time] {self.name}: {time.time() - self.t:.1f}s")


# ---------------------------------------------------------------- acceptance checklist


class Checklist:
    """Collects ✅/❌ items with one line of evidence each."""

    def __init__(self):
        self.items: list[tuple[str, bool, str]] = []

    def add(self, item: str, ok: bool, evidence: str) -> None:
        self.items.append((item, bool(ok), evidence))

    def all_ok(self) -> bool:
        return all(ok for _, ok, _ in self.items)

    def render(self) -> str:
        w = max(len(i) for i, _, _ in self.items)
        lines = ["FINAL ACCEPTANCE CHECKLIST", "-" * (w + 60)]
        for item, ok, ev in self.items:
            lines.append(f"{'✅' if ok else '❌'}  {item.ljust(w)}  {ev}")
        return "\n".join(lines)


CHECK = Checklist()


def check(cond: bool, msg: str) -> None:
    """Hard assertion that is also logged."""
    if not cond:
        log(f"ASSERTION FAILED: {msg}")
        raise AssertionError(msg)
    log(f"  [assert ok] {msg}")


# ---------------------------------------------------------------- shrinkage


def eb_prior_strength(sums: np.ndarray, ns: np.ndarray, sumsq: np.ndarray | None = None,
                      lo: float = 20, hi: float = 2000, p_rate: bool = False) -> tuple[float, float]:
    """Empirical-Bayes (normal-normal / beta-binomial) prior for per-ball means.

    Returns (mu, m, tau): population mean, prior strength in balls and the true-talent
    SD, so that shrunk = (sum + m*mu) / (n + m).
    Method of moments: tau^2 = Var_between - E[sigma^2 / n]; m = sigma^2 / tau^2.
    """
    ns = np.asarray(ns, float)
    sums = np.asarray(sums, float)
    keep = ns > 0
    ns, sums = ns[keep], sums[keep]
    if len(ns) < 5:
        mu = float(sums.sum() / max(ns.sum(), 1))
        return (mu, hi, 1e-6)
    mu = sums.sum() / ns.sum()
    means = sums / ns
    if p_rate:
        sigma2 = mu * (1 - mu)
    elif sumsq is not None:
        sumsq = np.asarray(sumsq, float)[keep]
        sigma2 = (sumsq.sum() - ns.sum() * mu**2) / max(ns.sum() - 1, 1)
    else:
        sigma2 = np.var(means) * np.mean(ns)
    # Ball-weighted between-player variance; its expected sampling-noise part is
    # sum_i (n_i/N) * sigma^2/n_i = sigma^2 * k / N.
    w = ns / ns.sum()
    var_between = np.sum(w * (means - mu) ** 2)
    tau2 = var_between - sigma2 * len(ns) / ns.sum()
    tau2 = max(tau2, 1e-12)
    m = float(np.clip(sigma2 / tau2, lo, hi))
    tau = float(np.sqrt(sigma2 / m))  # true-talent SD implied by the (clipped) prior
    return float(mu), m, tau


def shrink(sums, ns, mu: float, m: float):
    return (np.asarray(sums, float) + m * mu) / (np.asarray(ns, float) + m)


# ---------------------------------------------------------------- naming


def slugify(name: str, pid: int) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-")
    return f"{s}-{int(pid)}"


# Official short codes (IPL franchises and ICC members / associates). One table, used for every JSON.
TEAM_CODES = {
    "Chennai Super Kings": "CSK", "Delhi Capitals": "DC", "Gujarat Titans": "GT", "Kolkata Knight Riders": "KKR",
    "Lucknow Super Giants": "LSG", "Mumbai Indians": "MI", "Punjab Kings": "PBKS", "Rajasthan Royals": "RR",
    "Royal Challengers Bengaluru": "RCB", "Royal Challengers Bangalore": "RCB", "Sunrisers Hyderabad": "SRH",
    "Afghanistan": "AFG", "Australia": "AUS", "Bangladesh": "BAN", "Canada": "CAN", "England": "ENG", "Hong Kong": "HK",
    "India": "IND", "Ireland": "IRE", "Japan": "JPN", "Kuwait": "KUW", "Nepal": "NEP", "Netherlands": "NED",
    "New Zealand": "NZ", "Oman": "OMA", "Pakistan": "PAK", "Scotland": "SCO", "Singapore": "SIN", "South Africa": "SA",
    "Sri Lanka": "SL", "United Arab Emirates": "UAE", "United States Of America": "USA", "United States of America": "USA",
    "West Indies": "WI", "Zimbabwe": "ZIM", "Namibia": "NAM", "Uganda": "UGA", "Papua New Guinea": "PNG",
}
IPL_CODES = {"CSK", "DC", "GT", "KKR", "LSG", "MI", "PBKS", "RR", "RCB", "SRH"}


def team_code(name: str) -> str:
    """Official short code for a team (A-sides get "-A"). Unknown teams keep their full name and log a warning."""
    name = str(name).strip()
    suffix = ""
    m = re.match(r"^(.*?)\s+(A|U19|Women)$", name)
    if m and m.group(1) in TEAM_CODES:
        name, suffix = m.group(1), "-" + m.group(2)
    if name in TEAM_CODES:
        return TEAM_CODES[name] + suffix
    log(f"WARNING: no short code for team '{name}', showing the full name")
    return name + suffix


def to_jsonable(o):
    if isinstance(o, dict):
        return {str(k): to_jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [to_jsonable(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        v = float(o)
        return None if np.isnan(v) else v
    if isinstance(o, float) and np.isnan(o):
        return None
    if isinstance(o, np.ndarray):
        return [to_jsonable(v) for v in o.tolist()]
    if isinstance(o, (pd.Timestamp,)):
        return o.strftime("%Y-%m-%d")
    return o


def write_json(obj, path: Path) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(to_jsonable(obj), f, ensure_ascii=False, indent=1)


def spearman(a, b) -> float:
    a = pd.Series(a).rank()
    b = pd.Series(b).rank()
    if a.std() == 0 or b.std() == 0:
        return float("nan")
    return float(np.corrcoef(a, b)[0, 1])


def jaccard(a, b) -> float:
    a, b = set(a), set(b)
    return len(a & b) / max(len(a | b), 1)
