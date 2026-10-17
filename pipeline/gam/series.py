"""Daily price series in the column format of docs/02_DATA.md."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np


def file_name(ticker_id: str) -> str:
    return ticker_id.replace(":", "-") + ".json"


@dataclass
class Series:
    id: str
    d: list[str]
    o: np.ndarray
    h: np.ndarray
    l: np.ndarray
    c: np.ndarray
    v: np.ndarray
    f: np.ndarray
    meta: dict = field(default_factory=dict)

    def __len__(self) -> int:
        return len(self.d)

    @property
    def adj(self) -> np.ndarray:
        """Adjusted close: close × adjustment factor."""
        return self.c * self.f

    @property
    def adj_high(self) -> np.ndarray:
        return self.h * self.f

    @property
    def adj_low(self) -> np.ndarray:
        return self.l * self.f

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "asOf": self.d[-1] if self.d else None,
            "d": self.d,
            "o": [round(float(x), 4) for x in self.o],
            "h": [round(float(x), 4) for x in self.h],
            "l": [round(float(x), 4) for x in self.l],
            "c": [round(float(x), 4) for x in self.c],
            "v": [int(x) for x in self.v],
            "f": [round(float(x), 6) for x in self.f],
            **({"meta": self.meta} if self.meta else {}),
        }

    @classmethod
    def from_json(cls, data: dict) -> "Series":
        return cls(
            id=data["id"],
            d=list(data["d"]),
            o=np.asarray(data["o"], dtype=float),
            h=np.asarray(data["h"], dtype=float),
            l=np.asarray(data["l"], dtype=float),
            c=np.asarray(data["c"], dtype=float),
            v=np.asarray(data["v"], dtype=float),
            f=np.asarray(data["f"], dtype=float),
            meta=data.get("meta", {}),
        )

    def validate(self) -> list[str]:
        """Return a list of problems; empty means the series is usable."""
        problems: list[str] = []
        n = len(self.d)
        for name in ("o", "h", "l", "c", "v", "f"):
            if len(getattr(self, name)) != n:
                problems.append(f"{name} length {len(getattr(self, name))} != {n}")
        if problems:
            return problems
        if n == 0:
            return ["empty"]
        if self.d != sorted(self.d) or len(set(self.d)) != n:
            problems.append("dates not strictly increasing")
        if np.any(~np.isfinite(self.c)) or np.any(self.c <= 0):
            problems.append("non-positive or missing close")
        if np.any(self.h + 1e-9 < np.maximum(self.o, self.c)) or np.any(self.l - 1e-9 > np.minimum(self.o, self.c)):
            problems.append("high/low do not contain open/close")
        if np.any(self.f <= 0):
            problems.append("non-positive adjustment factor")
        return problems


def load(path: Path) -> Series | None:
    if not path.exists():
        return None
    return Series.from_json(json.loads(path.read_text(encoding="utf-8")))


def save(series: Series, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(series.to_json(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
