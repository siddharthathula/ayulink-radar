"""Feature extraction for the rhythm-screening model.

This file and web/lib/engine/rhythm.ts implement the same nine features. Any
change here must be mirrored there, or the parity test will fail.

Window = 30 consecutive RR intervals. All values in milliseconds.
"""
from __future__ import annotations

import math
from typing import Sequence

FEATURES = [
    "mean_rr",
    "sdnn",
    "rmssd",
    "pnn50",
    "cv",
    "nrmssd",
    "sd_ratio",
    "entropy",
    "tpr",
]

WINDOW = 30


def extract_features(rr: Sequence[float]) -> list[float]:
    """Return the nine features in FEATURES order.

    Exactly mirrors the TypeScript implementation:
    - population standard deviations (ddof = 0)
    - pnn50 uses the strict |diff| > 50 test
    - entropy uses 16 equal bins over [-0.5, 0.5], empty bins skipped
    """
    if len(rr) != WINDOW:
        raise ValueError(f"expected {WINDOW} RR intervals, got {len(rr)}")

    x = [float(v) for v in rr]
    n = len(x)
    diff = [x[i + 1] - x[i] for i in range(n - 1)]

    mean_rr = sum(x) / n
    var_rr = sum((v - mean_rr) ** 2 for v in x) / n
    sdnn = math.sqrt(var_rr)
    rmssd = math.sqrt(sum(d * d for d in diff) / len(diff))
    pnn50 = sum(1 for d in diff if abs(d) > 50) / len(diff)
    cv = sdnn / mean_rr
    nrmssd = rmssd / mean_rr

    mean_diff = sum(diff) / len(diff)
    var_diff = sum((d - mean_diff) ** 2 for d in diff) / len(diff)
    sd1 = math.sqrt(0.5) * math.sqrt(var_diff)
    sd2 = math.sqrt(max(2.0 * sdnn * sdnn - sd1 * sd1, 1e-9))
    sd_ratio = sd1 / sd2

    counts = [0] * 16
    for d in diff:
        z = d / mean_rr
        z = min(0.5, max(-0.5, z))
        # 16 equal bins over [-0.5, 0.5]; right edge belongs to the last bin.
        idx = int(math.floor((z + 0.5) * 16))
        if idx == 16:
            idx = 15
        counts[idx] += 1
    total = sum(counts)
    entropy = 0.0
    for c in counts:
        if c:
            p = c / total
            entropy -= p * math.log(p)

    turning = 0
    for i in range(1, n - 1):
        if (x[i] - x[i - 1]) * (x[i + 1] - x[i]) < 0:
            turning += 1
    tpr = turning / (n - 2)

    return [
        mean_rr,
        sdnn,
        rmssd,
        pnn50,
        cv,
        nrmssd,
        sd_ratio,
        entropy,
        tpr,
    ]
