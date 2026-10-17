"""Daily summary cards (docs/02_DATA.md, `cards/latest.json`)."""
from __future__ import annotations

import math

import numpy as np

from . import indicators as ind
from .patterns import base_rate, similar
from .series import Series


def _r(x: float, nd: int = 4) -> float | None:
    return None if x is None or not math.isfinite(x) else round(float(x), nd)


def _chg(a: np.ndarray, n: int) -> float | None:
    return _r(a[-1] / a[-1 - n] - 1) if len(a) > n else None


def build_card(s: Series, pool: list[Series], pattern_cfg: dict) -> dict:
    a, hi, lo = s.adj, s.adj_high, s.adj_low
    n = len(s)
    sma = {k: ind.sma(a, k) for k in (20, 60, 120)}
    rsi = ind.rsi(a, 14)
    atr = ind.atr(hi, lo, a, 14)
    atr_pct = atr[-1] / a[-1] if n else float("nan")
    vol_ratio = float(s.v[-1] / s.v[-21:-1].mean()) if n > 21 and s.v[-21:-1].mean() > 0 else float("nan")
    hi52 = hi[-252:].max()
    lo52 = lo[-252:].min()

    flags: list[str] = []
    if math.isfinite(vol_ratio) and vol_ratio >= 2:
        flags.append("volume-spike")
    if n > 1 and math.isfinite(atr[-1]) and abs(a[-1] - a[-2]) >= 2 * atr[-1]:
        flags.append("big-move")
    if n >= 60 and hi[-1] >= hi52:
        flags.append("new-52w-high")
    if n >= 60 and lo[-1] <= lo52:
        flags.append("new-52w-low")
    s60 = sma[60]
    if n > 61 and math.isfinite(s60[-2]):
        if a[-2] < s60[-2] and a[-1] >= s60[-1]:
            flags.append("cross-sma60-up")
        if a[-2] >= s60[-2] and a[-1] < s60[-1]:
            flags.append("cross-sma60-down")
    if math.isfinite(rsi[-1]):
        if rsi[-1] >= 70:
            flags.append("rsi-overbought")
        if rsi[-1] <= 30:
            flags.append("rsi-oversold")

    pattern, _ = similar(s, pool, pattern_cfg["window"], pattern_cfg["horizon"],
                         pattern_cfg["matches"], pattern_cfg["minHistory"])
    return {
        "id": s.id,
        "date": s.d[-1],
        "close": _r(s.c[-1], 4),
        "chg1d": _chg(a, 1),
        "chg5d": _chg(a, 5),
        "chg20d": _chg(a, 20),
        "sma": {str(k): _r(v[-1], 4) for k, v in sma.items()},
        "rsi14": _r(rsi[-1], 1),
        "atrPct": _r(atr_pct),
        "volRatio20": _r(vol_ratio, 2),
        "from52wHigh": _r(a[-1] / hi52 - 1),
        "from52wLow": _r(a[-1] / lo52 - 1),
        "pattern": pattern,
        "baseRate": base_rate(s, pattern_cfg["horizon"], pattern_cfg["baseYears"]),
        "flags": flags,
        "history": n,
    }
