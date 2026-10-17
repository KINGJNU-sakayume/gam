import math
import tempfile
import unittest
from pathlib import Path

import numpy as np

from gam import indicators as ind
from gam import series as S
from gam.cards import build_card
from gam.patterns import base_rate, similar
from gam.sample import synthetic

CFG = {"window": 40, "horizon": 20, "matches": 30, "baseYears": 5, "minHistory": 260}


class Indicators(unittest.TestCase):
    def test_sma(self):
        x = np.arange(1, 11, dtype=float)
        out = ind.sma(x, 3)
        self.assertTrue(np.isnan(out[1]))
        self.assertAlmostEqual(out[2], 2.0)
        self.assertAlmostEqual(out[-1], 9.0)

    def test_rsi_bounds_and_extremes(self):
        up = np.arange(1, 40, dtype=float)
        self.assertAlmostEqual(ind.rsi(up)[-1], 100.0)
        flat = np.full(40, 5.0)
        self.assertAlmostEqual(ind.rsi(flat)[-1], 50.0)
        r = ind.rsi(synthetic("X").adj)
        finite = r[np.isfinite(r)]
        self.assertTrue(((finite >= 0) & (finite <= 100)).all())

    def test_rsi_known_value(self):
        # 14 changes: gains sum 3.34, losses sum 1.40 → RS = 3.34 / 1.40 → RSI = 100 - 100 / (1 + RS) = 70.46
        closes = np.array([44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
                           45.89, 46.03, 45.61, 46.28, 46.28])
        rs = 3.34 / 1.40
        self.assertAlmostEqual(ind.rsi(closes)[-1], 100 - 100 / (1 + rs), places=6)

    def test_atr_positive(self):
        s = synthetic("Y")
        a = ind.atr(s.h, s.l, s.c)
        self.assertTrue((a[np.isfinite(a)] > 0).all())


class Series(unittest.TestCase):
    def test_roundtrip_and_validate(self):
        s = synthetic("KR:000001", n=300)
        self.assertEqual(s.validate(), [])
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x.json"
            S.save(s, p)
            back = S.load(p)
        self.assertEqual(back.d, s.d)
        self.assertTrue(np.allclose(back.c, s.c))

    def test_validate_catches_bad_rows(self):
        s = synthetic("Z", n=50)
        s.h[10] = s.l[10] - 1
        self.assertIn("high/low do not contain open/close", s.validate())


class Patterns(unittest.TestCase):
    def setUp(self):
        self.pool = [synthetic(f"T{i}") for i in range(4)]

    def test_similar_excludes_present_and_respects_gap(self):
        t = self.pool[0]
        summary, matches = similar(t, self.pool, **{"window": 40, "horizon": 20, "k": 30})
        self.assertIsNotNone(summary)
        self.assertEqual(summary["matches"], 30)
        for m in matches:
            if m.series_id == t.id:
                self.assertLess(m.end + 20, len(t) - 40)
        by_series = {}
        for m in matches:
            by_series.setdefault(m.series_id, []).append(m.end)
        for ends in by_series.values():
            ends.sort()
            self.assertTrue(all(b - a >= 20 for a, b in zip(ends, ends[1:])))
        self.assertTrue(0 <= summary["upShare"] <= 1)
        self.assertLessEqual(summary["p10"], summary["median"])
        self.assertLessEqual(summary["median"], summary["p90"])

    def test_exact_copy_is_found_first(self):
        t = self.pool[0]
        donor = synthetic("DONOR")
        # Make the donor contain the target's last 40 days (scaled) far in its past.
        seg = t.adj[-40:] * 3.0
        donor.c[500:540] = seg
        donor.o[500:540] = seg
        donor.h[500:540] = seg
        donor.l[500:540] = seg
        _, matches = similar(t, [donor], window=40, horizon=20, k=5, min_history=260)
        self.assertEqual(matches[0].series_id, "DONOR")
        self.assertEqual(matches[0].end, 539)
        self.assertAlmostEqual(matches[0].distance, 0.0, places=6)

    def test_short_history_gives_none(self):
        short = synthetic("NEW", n=90)
        summary, _ = similar(short, self.pool + [short])
        self.assertIsNone(summary)

    def test_base_rate(self):
        br = base_rate(self.pool[1])
        self.assertEqual(br["samples"], 5 * 252)


class Cards(unittest.TestCase):
    def test_card_fields(self):
        pool = [synthetic(f"C{i}") for i in range(3)]
        card = build_card(pool[0], pool, CFG)
        for key in ("close", "chg1d", "chg20d", "rsi14", "atrPct", "volRatio20", "pattern", "baseRate", "flags"):
            self.assertIn(key, card)
        self.assertTrue(math.isfinite(card["rsi14"]))
        self.assertEqual(card["history"], 2500)

    def test_volume_spike_flag(self):
        s = synthetic("V", n=400)
        s.v[-1] = s.v[-21:-1].mean() * 5
        self.assertIn("volume-spike", build_card(s, [s], CFG)["flags"])

    def test_new_listing_card(self):
        s = synthetic("US:SPCX", n=90)
        card = build_card(s, [s], CFG)
        self.assertIsNone(card["pattern"])
        self.assertEqual(card["history"], 90)


class Fetch(unittest.TestCase):
    def test_market_of_keeps_fx_out_of_market_dates(self):
        from gam.run import _market_of
        self.assertEqual(_market_of({"id": "FX:USDKRW", "currency": "KRW"}), "FX")
        self.assertEqual(_market_of({"id": "IX:KOSPI", "currency": "KRW"}), "KR")
        self.assertEqual(_market_of({"id": "US:NVDA", "currency": "USD"}), "US")

    def test_frame_with_incomplete_last_row(self):
        try:
            import pandas as pd
        except ImportError:
            self.skipTest("pandas not installed")
        from gam.fetch import _from_frame
        idx = pd.to_datetime(["2026-10-14", "2026-10-15", "2026-10-16"])
        df = pd.DataFrame({"Open": [10, 11, None], "High": [11, 12, None], "Low": [9, 10, None],
                           "Close": [10.5, 11.5, 11.8], "Adj Close": [10.4, 11.5, 11.8], "Volume": [1, 2, 3]}, index=idx)
        s = _from_frame("US:X", df, has_adj=True)
        self.assertEqual(s.d, ["2026-10-14", "2026-10-15"])
        self.assertEqual(s.meta["droppedTail"], "2026-10-16")
        self.assertAlmostEqual(s.f[0], 10.4 / 10.5)
        self.assertEqual(s.validate(), [])


if __name__ == "__main__":
    unittest.main()
