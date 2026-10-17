"""Deterministic synthetic prices for local development and tests. Never written to public/data."""
from __future__ import annotations

import datetime as dt
import hashlib

import numpy as np

from .series import Series


def trading_days(end: dt.date, n: int) -> list[str]:
    days: list[str] = []
    d = end
    while len(days) < n:
        if d.weekday() < 5:
            days.append(d.isoformat())
        d -= dt.timedelta(days=1)
    return days[::-1]


def synthetic(ticker_id: str, n: int = 2500, start_price: float = 100.0,
              end: dt.date = dt.date(2026, 10, 16), tick: float = 0.01) -> Series:
    seed = int(hashlib.sha256(ticker_id.encode()).hexdigest()[:8], 16)
    rng = np.random.default_rng(seed)
    vol = rng.uniform(0.012, 0.03)
    # Regime-switching drift so that charts have trends, ranges and crashes.
    drift = np.zeros(n)
    i = 0
    while i < n:
        length = int(rng.integers(40, 200))
        drift[i:i + length] = rng.normal(0.0004, 0.0015)
        i += length
    rets = drift + rng.standard_t(4, n) * vol / np.sqrt(2)
    close = start_price * np.exp(np.cumsum(rets))
    gap = rng.normal(0, vol / 3, n)
    open_ = np.concatenate([[start_price], close[:-1]]) * np.exp(gap)
    span = np.abs(rng.normal(0, vol, n)) * close
    high = np.maximum(open_, close) + span * rng.uniform(0.2, 1.0, n)
    low = np.minimum(open_, close) - span * rng.uniform(0.2, 1.0, n)
    low = np.maximum(low, np.minimum(open_, close) * 0.5)
    q = lambda x: np.round(x / tick) * tick  # noqa: E731
    o, h, l, c = q(open_), q(high), q(low), q(close)
    h = np.maximum(h, np.maximum(o, c))
    l = np.minimum(l, np.minimum(o, c))
    volume = (rng.lognormal(13, 0.5, n) * (1 + 3 * (np.abs(rets) > 2 * vol))).astype(int)
    return Series(id=ticker_id, d=trading_days(end, n), o=o, h=h, l=l, c=c, v=volume.astype(float),
                  f=np.ones(n), meta={"sample": True})
