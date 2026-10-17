"""Similar-pattern search and base rates (docs/02_DATA.md, `pattern` and `baseRate`)."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .series import Series


def _znorm_windows(log_price: np.ndarray, window: int) -> np.ndarray:
    """Every z-normalised window of length `window`, one per row (row i ends at index i + window - 1)."""
    w = np.lib.stride_tricks.sliding_window_view(log_price, window)
    mean = w.mean(axis=1, keepdims=True)
    std = w.std(axis=1, keepdims=True)
    std[std == 0] = np.nan
    return (w - mean) / std


def _window_vol(log_price: np.ndarray, window: int) -> np.ndarray:
    """Std of daily log returns inside every window (row i ends at index i + window - 1)."""
    r = np.diff(log_price)
    rw = np.lib.stride_tricks.sliding_window_view(r, window - 1)
    return rw.std(axis=1)


def _summary(values: np.ndarray) -> dict:
    return {
        "upShare": round(float((values > 0).mean()), 4),
        "median": round(float(np.median(values)), 4),
        "p10": round(float(np.percentile(values, 10)), 4),
        "p90": round(float(np.percentile(values, 90)), 4),
    }


@dataclass
class Match:
    series_id: str
    end: int
    date: str
    distance: float
    forward: float  # volatility-scaled forward return


def similar(target: Series, pool: list[Series], window: int = 40, horizon: int = 20,
            k: int = 30, min_history: int = 260) -> tuple[dict | None, list[Match]]:
    """Find the k past windows (over every series in `pool`) most like the target's last `window` days.

    Forward returns of a match are scaled by (target volatility / match volatility) so that a calm and a wild
    stock with the same shape are comparable. Within one series, chosen windows end at least `window // 2`
    days apart; in the target's own series, windows that overlap the present or whose forward period reaches
    into the present window are excluded.
    """
    if len(target) < min_history:
        return None, []
    tlog = np.log(target.adj)
    q = _znorm_windows(tlog[-window:], window)[0]
    if not np.all(np.isfinite(q)):
        return None, []
    t_vol = float(np.diff(tlog[-window:]).std())

    candidates: list[tuple[float, str, int, float, str]] = []
    for s in pool:
        if len(s) < window + horizon + 1:
            continue
        lp = np.log(s.adj)
        z = _znorm_windows(lp, window)
        vol = _window_vol(lp, window)
        ends = np.arange(window - 1, len(s))
        valid = ends + horizon < len(s)
        if s.id == target.id:
            valid &= ends + horizon < len(s) - window  # forward period must end before the present window
        dist = np.sqrt(np.nansum((z - q) ** 2, axis=1))
        dist[~np.all(np.isfinite(z), axis=1)] = np.inf
        fwd_raw = np.full(len(ends), np.nan)
        fwd_raw[valid] = s.adj[ends[valid] + horizon] / s.adj[ends[valid]] - 1
        for i in np.where(valid & np.isfinite(dist))[0]:
            mv = vol[i]
            if not mv > 0:
                continue
            scaled = float(np.expm1(np.log1p(fwd_raw[i]) * (t_vol / mv)))
            candidates.append((float(dist[i]), s.id, int(ends[i]), scaled, s.d[ends[i]]))

    candidates.sort(key=lambda c: c[0])
    chosen: list[Match] = []
    taken: dict[str, list[int]] = {}
    gap = window // 2
    for dist, sid, end, fwd, date in candidates:
        if any(abs(end - e) < gap for e in taken.get(sid, [])):
            continue
        taken.setdefault(sid, []).append(end)
        chosen.append(Match(sid, end, date, dist, fwd))
        if len(chosen) == k:
            break
    if len(chosen) < max(5, k // 3):
        return None, chosen
    fwd = np.array([m.forward for m in chosen])
    return {"window": window, "horizon": horizon, "matches": len(chosen), **_summary(fwd)}, chosen


def base_rate(target: Series, horizon: int = 20, years: int = 5) -> dict | None:
    a = target.adj[-(years * 252 + horizon):]
    if len(a) < horizon + 60:
        return None
    fwd = a[horizon:] / a[:-horizon] - 1
    return {"horizon": horizon, "samples": int(len(fwd)), **_summary(fwd)}
