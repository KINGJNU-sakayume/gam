"""Fetch daily prices. Network access only happens here.

Primary: Yahoo Finance via `yfinance`. Fallback for Korean stocks: FinanceDataReader (unadjusted, factor 1).
Both are unofficial data sources; docs/01_CURRENT_STATE.md tracks the plan to move to a broker API.
"""
from __future__ import annotations

import datetime as dt

import numpy as np

from .series import Series


def _day(i) -> str:
    return i.date().isoformat() if hasattr(i, "date") else str(i)[:10]


def _from_frame(ticker_id: str, df, has_adj: bool) -> Series:
    raw_last = _day(df.index[-1]) if len(df) else None
    df = df.dropna(subset=["Open", "High", "Low", "Close"])
    df = df[df["Close"] > 0]
    dates = [_day(i) for i in df.index]
    c = df["Close"].to_numpy(float)
    f = (df["Adj Close"].to_numpy(float) / c) if has_adj and "Adj Close" in df else np.ones(len(c))
    f = np.where(np.isfinite(f) & (f > 0), f, 1.0)
    o, h, l = (df[k].to_numpy(float) for k in ("Open", "High", "Low"))
    # Data vendors occasionally report a high below the close (or a low above the open); widen to contain them.
    h = np.maximum(h, np.maximum(o, c))
    l = np.minimum(l, np.minimum(o, c))
    v = df["Volume"].fillna(0).to_numpy(float) if "Volume" in df else np.zeros(len(c))
    s = Series(ticker_id, dates, o, h, l, c, v, f)
    if raw_last and dates and raw_last > dates[-1]:
        s.meta["droppedTail"] = raw_last  # reported in status.json, not saved with the prices
    return s


def fetch_yahoo(ticker_id: str, symbol: str, years: int) -> Series:
    import yfinance as yf

    df = yf.download(symbol, period=f"{years}y", interval="1d", auto_adjust=False, actions=False,
                     progress=False, multi_level_index=False, threads=False)
    if df is None or df.empty:
        raise RuntimeError(f"yfinance returned no rows for {symbol}")
    return _from_frame(ticker_id, df, has_adj=True)


def fetch_fdr(ticker_id: str, code: str, years: int) -> Series:
    import FinanceDataReader as fdr

    start = (dt.date.today() - dt.timedelta(days=365 * years + 10)).isoformat()
    df = fdr.DataReader(code, start)
    if df is None or df.empty:
        raise RuntimeError(f"FinanceDataReader returned no rows for {code}")
    return _from_frame(ticker_id, df, has_adj=False)


def fetch(entry: dict, years: int) -> tuple[Series, str]:
    """Return (series, source name). Raises if every source fails."""
    errors: list[str] = []
    try:
        return fetch_yahoo(entry["id"], entry["yahoo"], years), "yahoo"
    except Exception as e:  # noqa: BLE001 - any vendor failure falls through to the next source
        errors.append(f"yahoo: {e}")
    if entry["id"].startswith("KR:"):
        try:
            return fetch_fdr(entry["id"], entry["id"].split(":")[1], years), "fdr"
        except Exception as e:  # noqa: BLE001
            errors.append(f"fdr: {e}")
    raise RuntimeError("; ".join(errors))
