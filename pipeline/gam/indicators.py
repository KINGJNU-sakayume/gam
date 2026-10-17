"""Technical indicators on numpy arrays. NaN where not enough data."""
from __future__ import annotations

import numpy as np


def sma(x: np.ndarray, n: int) -> np.ndarray:
    out = np.full(len(x), np.nan)
    if len(x) < n:
        return out
    cs = np.cumsum(np.insert(x.astype(float), 0, 0.0))
    out[n - 1:] = (cs[n:] - cs[:-n]) / n
    return out


def _wilder(values: np.ndarray, n: int) -> np.ndarray:
    """Wilder smoothing seeded with the simple mean of the first n values."""
    out = np.full(len(values), np.nan)
    if len(values) < n:
        return out
    out[n - 1] = values[:n].mean()
    for i in range(n, len(values)):
        out[i] = (out[i - 1] * (n - 1) + values[i]) / n
    return out


def rsi(close: np.ndarray, n: int = 14) -> np.ndarray:
    out = np.full(len(close), np.nan)
    if len(close) <= n:
        return out
    diff = np.diff(close)
    gain = np.where(diff > 0, diff, 0.0)
    loss = np.where(diff < 0, -diff, 0.0)
    ag = _wilder(gain, n)
    al = _wilder(loss, n)
    with np.errstate(divide="ignore", invalid="ignore"):
        rs = ag / al
        r = 100 - 100 / (1 + rs)
    r = np.where(al == 0, np.where(ag == 0, 50.0, 100.0), r)
    out[1:] = r
    return out


def atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, n: int = 14) -> np.ndarray:
    if len(close) == 0:
        return np.array([])
    prev = np.concatenate([[close[0]], close[:-1]])
    tr = np.maximum(high - low, np.maximum(np.abs(high - prev), np.abs(low - prev)))
    return _wilder(tr, n)
