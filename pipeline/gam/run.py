"""Command line: `python -m gam.run fetch|cards|sample`. Run from the `pipeline/` directory."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from . import series as S
from .cards import build_card
from .sample import synthetic

ROOT = Path(__file__).resolve().parents[2]


def _config() -> tuple[dict, dict]:
    watch = json.loads((ROOT / "config/watchlist.json").read_text(encoding="utf-8"))
    settings = json.loads((ROOT / "config/settings.json").read_text(encoding="utf-8"))
    return watch, settings


def _entries(watch: dict) -> list[dict]:
    return [{**e, "kind": "index"} for e in watch["indices"]] + [{**e, "kind": "stock"} for e in watch["stocks"]]


def _market_of(entry: dict) -> str:
    return "KR" if entry.get("currency") == "KRW" and not entry["id"].startswith("FX:") else "US"


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def cmd_fetch(out: Path) -> int:
    from .fetch import fetch  # imported here so `cards`/`sample` work without the vendor libraries

    watch, settings = _config()
    results = []
    for e in _entries(watch):
        path = out / "prices" / S.file_name(e["id"])
        old = S.load(path)
        try:
            s, source = fetch(e, settings["history"]["years"])
            problems = s.validate()
            if problems:
                raise RuntimeError("invalid data: " + "; ".join(problems))
            if old is not None and len(s) < 0.9 * len(old):
                raise RuntimeError(f"only {len(s)} rows, previously {len(old)}; keeping the previous file")
            S.save(s, path)
            results.append({"id": e["id"], "ok": True, "source": source, "rows": len(s), "asOf": s.d[-1]})
            print(f"ok   {e['id']:<12} {source:<6} {len(s):>5} rows, last {s.d[-1]}")
        except Exception as err:  # noqa: BLE001
            results.append({"id": e["id"], "ok": False, "error": str(err)[:300],
                            "asOf": old.d[-1] if old else None})
            print(f"FAIL {e['id']:<12} {err}", file=sys.stderr)
    write_json(out / "status.json", {"generatedAt": _now(), "results": results})
    return 0 if any(r["ok"] for r in results) else 1


def cmd_cards(out: Path, sample: bool = False) -> int:
    watch, settings = _config()
    loaded = {}
    for e in _entries(watch):
        s = S.load(out / "prices" / S.file_name(e["id"]))
        if s is not None:
            loaded[e["id"]] = (e, s)
    pool = [s for e, s in loaded.values() if e["kind"] == "stock" or e["id"].startswith("IX:")]
    cards = []
    as_of: dict[str, str] = {}
    for e, s in loaded.values():
        card = build_card(s, pool, settings["pattern"])
        card["kind"] = e["kind"]
        cards.append(card)
        m = _market_of(e)
        as_of[m] = max(as_of.get(m, ""), s.d[-1])
    write_json(out / "cards" / "latest.json", {"asOf": as_of, "generatedAt": _now(), "sample": sample, "cards": cards})
    index = {
        "generatedAt": _now(),
        "sample": sample,
        "asOf": as_of,
        "entries": [
            {k: e[k] for k in ("id", "name", "currency", "kind") if k in e}
            | {"market": e.get("market"), "file": "prices/" + S.file_name(e["id"]),
               "available": e["id"] in loaded,
               "asOf": loaded[e["id"]][1].d[-1] if e["id"] in loaded else None}
            for e in _entries(watch)
        ],
    }
    write_json(out / "index.json", index)
    print(f"cards: {len(cards)} written, asOf {as_of}")
    return 0


SAMPLE_START = {"KR:005930": 32000, "KR:000660": 48000, "KR:207940": 380000, "KR:012450": 60000,
                "IX:KOSPI": 2000, "IX:KOSDAQ": 650, "IX:SPX": 2100, "IX:NDX": 5200, "FX:USDKRW": 1150}


def cmd_sample(out: Path) -> int:
    watch, _ = _config()
    for e in _entries(watch):
        n = 90 if e["id"] == "US:SPCX" else 2500
        start = SAMPLE_START.get(e["id"], 40.0)
        tick = 100.0 if e["id"].startswith("KR:") else 0.01
        S.save(synthetic(e["id"], n=n, start_price=start, tick=tick), out / "prices" / S.file_name(e["id"]))
    write_json(out / "status.json", {"generatedAt": _now(), "sample": True, "results": []})
    code = cmd_cards(out, sample=True)
    _sample_notes(out)
    return code


def _sample_notes(out: Path) -> None:
    """Placeholder notes so the note panels can be seen locally. Clearly marked; never deployed."""
    cards = json.loads((out / "cards/latest.json").read_text(encoding="utf-8"))["cards"]
    stocks = [c for c in cards if c["kind"] == "stock"]
    first = stocks[0]
    write_json(out / "notes/latest.json", {
        "date": first["date"], "written": _now(), "model": "sample", "sample": True,
        "market": "샘플 노트입니다. 실제 분석이 아니며 화면 모양을 보기 위한 자리 채움 글입니다.",
        "notes": [{"id": c["id"], "changed": bool(c["flags"]),
                   "text": f"샘플 노트 — 신호 {', '.join(c['flags']) or '없음'}. 실제 노트는 Claude 예약 작업이 씁니다.",
                   "sources": []} for c in stocks],
    })
    write_json(out / "notes/forecasts.json", [
        {"id": "ai-sample-1", "by": "ai", "ticker": first["id"], "madeAfter": "2026-08-14", "horizon": 20,
         "pUp": 0.55, "low": -0.08, "high": 0.1, "why": "샘플 예측"},
    ])
    s = S.load(out / "prices" / S.file_name(first["id"]))
    start = s.d[len(s) - 400]
    write_json(out / "notes/replays/index.json", [{"id": "sample-1", "title": "샘플 회차: 박스권 끝자락", "level": "보통"}])
    write_json(out / "notes/replays/sample-1.json", {
        "id": "sample-1", "title": "샘플 회차: 박스권 끝자락", "ticker": first["id"], "startDate": start,
        "lookback": 120, "steps": 60,
        "commentary": {"0": "샘플 해설: 지금까지의 차트만 보고 쓴 글이 이 자리에 나옵니다.",
                       "10": "샘플 해설: 열흘 뒤 시점의 해설."},
        "reveal": {"text": "샘플 공개 글: 실제 회차에서는 이 구간에 무슨 일이 있었는지 출처와 함께 씁니다.", "sources": []},
    })


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="gam.run")
    p.add_argument("command", choices=["fetch", "cards", "sample"])
    p.add_argument("--out", default=None, help="data directory (default public/data, or sample-data for `sample`)")
    a = p.parse_args(argv)
    out = Path(a.out) if a.out else ROOT / ("sample-data" if a.command == "sample" else "public/data")
    if a.command == "sample" and out.resolve() == (ROOT / "public/data").resolve():
        print("refusing to write synthetic data into public/data", file=sys.stderr)
        return 2
    if a.command == "fetch":
        code = cmd_fetch(out)
        return code if code else cmd_cards(out)
    if a.command == "cards":
        return cmd_cards(out)
    return cmd_sample(out)


if __name__ == "__main__":
    raise SystemExit(main())
