#!/usr/bin/env python3
"""Train and evaluate the rhythm-screening model.

Data: PhysioNet MIT-BIH Atrial Fibrillation Database (afdb), annotation files
only. 30-RR windows, stride 15. Labels: >=90% of the window's beats inside an
(AFIB rhythm segment = AF; 100% inside (N = normal; everything else discarded.

Split: GroupKFold(5) by record. The final model is then fit on all windows.

Run:
    python ml/train_rhythm.py
"""
from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import wfdb
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, roc_curve
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from features import FEATURES, WINDOW, extract_features

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "afdb"
OUT = ROOT / "out"
FS = 250.0  # afdb signals are 250 Hz (PhysioNet page)
STRIDE = 15
N_FOLDS = 5
NORMAL = "(N"
AF = "(AFIB"


def assign_rhythm(atr: wfdb.Annotation, beats: np.ndarray) -> np.ndarray:
    """Rhythm label active at each beat sample."""
    seg_samples: list[int] = []
    seg_notes: list[str] = []
    for sample, note in zip(atr.sample.tolist(), atr.aux_note):
        text = (note or "").strip()
        if text.startswith("("):
            seg_samples.append(int(sample))
            seg_notes.append(text)

    out = np.full(len(beats), "", dtype=object)
    if not seg_samples:
        return out
    idx = np.searchsorted(np.asarray(seg_samples), beats, side="right") - 1
    for j, k in enumerate(idx):
        if k >= 0:
            out[j] = seg_notes[int(k)]
    return out


def build_dataset() -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str]]:
    """Return (rr_windows, labels, groups, record_names)."""
    if not DATA.exists() or not any(DATA.glob("*.atr")):
        raise SystemExit(
            f"No afdb annotations in {DATA}. Run: python ml/download_afdb.py"
        )

    records = sorted(p.stem for p in DATA.glob("*.atr"))
    rr_windows: list[np.ndarray] = []
    labels: list[int] = []
    groups: list[str] = []
    per_record: dict[str, dict[str, int]] = {}

    for record in records:
        atr = wfdb.rdann(str(DATA / record), "atr")
        ext = "qrsc" if (DATA / f"{record}.qrsc").exists() else "qrs"
        ann = wfdb.rdann(str(DATA / record), ext)
        beats = np.asarray(ann.sample, dtype=np.int64)
        if len(beats) < WINDOW + 1:
            continue

        rr = np.rint(np.diff(beats).astype(np.float64) * 1000.0 / FS).astype(np.int64)
        valid = (rr >= 200) & (rr <= 2500)
        rhythm = assign_rhythm(atr, beats)

        counts = {"af": 0, "normal": 0, "discarded": 0}
        for start in range(0, len(rr) - WINDOW + 1, STRIDE):
            if not valid[start : start + WINDOW].all():
                counts["discarded"] += 1
                continue
            beat_rhythm = rhythm[start : start + WINDOW + 1]
            af_frac = float(np.mean(beat_rhythm == AF))
            normal_frac = float(np.mean(beat_rhythm == NORMAL))
            if af_frac >= 0.90:
                label = 1
                counts["af"] += 1
            elif normal_frac == 1.0:
                label = 0
                counts["normal"] += 1
            else:
                counts["discarded"] += 1
                continue
            rr_windows.append(rr[start : start + WINDOW])
            labels.append(label)
            groups.append(record)
        per_record[record] = counts

    if not rr_windows:
        raise SystemExit("No labelled windows were produced.")
    print("Per-record windows (af / normal / discarded):")
    for record, c in per_record.items():
        print(f"  {record}: {c['af']:4d} / {c['normal']:5d} / {c['discarded']:4d}")
    print(f"Total records: {len(records)}; windows: {len(rr_windows)}")
    return (
        np.stack(rr_windows).astype(np.uint16),
        np.asarray(labels, dtype=np.int64),
        np.asarray(groups),
        records,
    )


def specificity(y: np.ndarray, pred: np.ndarray) -> float:
    tn = int(np.sum((y == 0) & (pred == 0)))
    fp = int(np.sum((y == 0) & (pred == 1)))
    return tn / (tn + fp) if (tn + fp) else float("nan")


def sensitivity(y: np.ndarray, pred: np.ndarray) -> float:
    tp = int(np.sum((y == 1) & (pred == 1)))
    fn = int(np.sum((y == 1) & (pred == 0)))
    return tp / (tp + fn) if (tp + fn) else float("nan")


def choose_threshold(y: np.ndarray, prob: np.ndarray, min_specificity: float = 0.95) -> float:
    """Smallest threshold whose out-of-fold specificity is at least 0.95."""
    candidates = np.unique(prob)
    for threshold in candidates:
        pred = (prob >= threshold).astype(int)
        if specificity(y, pred) >= min_specificity:
            return float(threshold)
    return 1.0


def mean_sd(values: list[float]) -> tuple[float, float]:
    arr = np.asarray([v for v in values if not math.isnan(v)], dtype=np.float64)
    if arr.size == 0:
        return float("nan"), float("nan")
    mean = float(np.mean(arr))
    sd = float(np.std(arr, ddof=1)) if arr.size > 1 else 0.0
    return mean, sd


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    rr_windows, y, groups, records = build_dataset()
    X = np.asarray([extract_features(row.tolist()) for row in rr_windows])
    print(f"Feature matrix: {X.shape}; AF={int(y.sum())}; normal={int((y == 0).sum())}")

    gkf = GroupKFold(n_splits=N_FOLDS)
    oof_prob = np.full(len(y), np.nan)
    folds: list[dict] = []

    for fold_idx, (train_idx, test_idx) in enumerate(
        gkf.split(X, y, groups), start=1
    ):
        model = Pipeline(
            [
                ("scaler", StandardScaler()),
                (
                    "clf",
                    LogisticRegression(max_iter=1000, class_weight="balanced"),
                ),
            ]
        )
        model.fit(X[train_idx], y[train_idx])
        prob = model.predict_proba(X[test_idx])[:, 1]
        oof_prob[test_idx] = prob
        test_records = sorted(set(groups[test_idx].tolist()))
        folds.append(
            {
                "fold": fold_idx,
                "test_records": test_records,
                "n": int(len(test_idx)),
                "n_af": int(y[test_idx].sum()),
                "n_normal": int((y[test_idx] == 0).sum()),
                "prob": prob,
                "y": y[test_idx],
            }
        )
        print(
            f"fold {fold_idx}: test records {test_records}, "
            f"n={len(test_idx)}, AF={int(y[test_idx].sum())}"
        )

    if np.isnan(oof_prob).any():
        raise SystemExit("Some windows were not assigned an out-of-fold prediction.")

    threshold = choose_threshold(y, oof_prob)
    print(f"\nChosen threshold (OOF specificity >= 0.95): {threshold:.6f}")

    fold_metrics: list[dict] = []
    for fold in folds:
        pred = (fold["prob"] >= threshold).astype(int)
        met = {
            "fold": fold["fold"],
            "test_records": fold["test_records"],
            "n": fold["n"],
            "n_af": fold["n_af"],
            "n_normal": fold["n_normal"],
            "sensitivity": sensitivity(fold["y"], pred),
            "specificity": specificity(fold["y"], pred),
            "auroc": float(roc_auc_score(fold["y"], fold["prob"]))
            if len(set(fold["y"].tolist())) == 2
            else float("nan"),
        }
        fold_metrics.append(met)
        print(
            f"fold {fold['fold']}: sens={met['sensitivity']:.4f} "
            f"spec={met['specificity']:.4f} auroc={met['auroc']:.4f}"
        )

    oof_pred = (oof_prob >= threshold).astype(int)
    oof_metrics = {
        "sensitivity": sensitivity(y, oof_pred),
        "specificity": specificity(y, oof_pred),
        "auroc": float(roc_auc_score(y, oof_prob)),
    }
    sens_mean, sens_sd = mean_sd([f["sensitivity"] for f in fold_metrics])
    spec_mean, spec_sd = mean_sd([f["specificity"] for f in fold_metrics])
    auroc_mean, auroc_sd = mean_sd([f["auroc"] for f in fold_metrics])

    # Final model on all windows.
    final = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=1000, class_weight="balanced")),
        ]
    )
    final.fit(X, y)
    scaler: StandardScaler = final.named_steps["scaler"]
    clf: LogisticRegression = final.named_steps["clf"]

    # ROC plot: each fold plus out-of-fold.
    fig, ax = plt.subplots(figsize=(6, 5), dpi=150)
    for fold in folds:
        fpr, tpr, _ = roc_curve(fold["y"], fold["prob"])
        ax.plot(fpr, tpr, linewidth=1, alpha=0.7, label=f"fold {fold['fold']}")
    fpr, tpr, _ = roc_curve(y, oof_prob)
    ax.plot(fpr, tpr, linewidth=2.2, color="black", label="out-of-fold")
    ax.plot([0, 1], [0, 1], linestyle="--", linewidth=0.8, color="grey")
    ax.set_xlabel("False positive rate")
    ax.set_ylabel("True positive rate")
    ax.set_title("Rhythm model — GroupKFold by record")
    ax.legend(fontsize=7, loc="lower right")
    fig.tight_layout()
    fig.savefig(OUT / "roc.png")
    plt.close(fig)

    # Confusion matrix (out-of-fold, at the chosen threshold).
    tp = int(np.sum((y == 1) & (oof_pred == 1)))
    fn = int(np.sum((y == 1) & (oof_pred == 0)))
    tn = int(np.sum((y == 0) & (oof_pred == 0)))
    fp = int(np.sum((y == 0) & (oof_pred == 1)))
    matrix = np.array([[tn, fp], [fn, tp]])
    fig, ax = plt.subplots(figsize=(4.5, 4), dpi=150)
    ax.imshow(matrix, cmap="Blues")
    for (i, j), value in np.ndenumerate(matrix):
        ax.text(j, i, str(value), ha="center", va="center", fontsize=14)
    ax.set_xticks([0, 1], ["Pred normal", "Pred AF"])
    ax.set_yticks([0, 1], ["True normal", "True AF"])
    ax.set_title("Out-of-fold confusion")
    fig.tight_layout()
    fig.savefig(OUT / "confusion.png")
    plt.close(fig)

    metrics = {
        "dataset": "MIT-BIH Atrial Fibrillation Database (PhysioNet afdb v1.0.0)",
        "dataLicense": "Open Data Commons Attribution License v1.0 (ODC-BY 1.0)",
        "dataCitation": (
            "Moody GB, Mark RG. A new method for detecting atrial fibrillation "
            "using R-R intervals. Computers in Cardiology. 10:227-230 (1983)."
        ),
        "annotators": "Rhythm annotations prepared manually; beat annotations by automated detector (qrsc where available).",
        "samplingRateHz": FS,
        "records": records,
        "nRecords": len(records),
        "nWindows": int(len(y)),
        "nAf": int(y.sum()),
        "nNormal": int((y == 0).sum()),
        "window": {
            "rrIntervals": WINDOW,
            "beats": WINDOW + 1,
            "stride": STRIDE,
            "rrDropMs": [200, 2500],
            "afLabel": ">=90% of beats in (AFIB segments",
            "normalLabel": "100% of beats in (N segments",
        },
        "split": "GroupKFold(5) by record; final model fit on all windows",
        "features": FEATURES,
        "thresholdRule": "smallest out-of-fold threshold with specificity >= 0.95",
        "threshold": threshold,
        "folds": fold_metrics,
        "mean": {
            "sensitivity": sens_mean,
            "specificity": spec_mean,
            "auroc": auroc_mean,
        },
        "sd": {
            "sensitivity": sens_sd,
            "specificity": spec_sd,
            "auroc": auroc_sd,
        },
        "outOfFold": {
            "sensitivity": oof_metrics["sensitivity"],
            "specificity": oof_metrics["specificity"],
            "auroc": oof_metrics["auroc"],
            "confusion": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
        },
        "finalModel": {
            "features": FEATURES,
            "mean": [float(v) for v in scaler.mean_],
            "scale": [float(v) for v in scaler.scale_],
            "coef": [float(v) for v in clf.coef_[0]],
            "intercept": float(clf.intercept_[0]),
        },
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (OUT / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    (OUT / "model_state.json").write_text(
        json.dumps(metrics["finalModel"], indent=2) + "\n"
    )

    print("\nPer-fold mean ± sd (sample sd):")
    print(f"  sensitivity {sens_mean:.4f} ± {sens_sd:.4f}")
    print(f"  specificity {spec_mean:.4f} ± {spec_sd:.4f}")
    print(f"  AUROC       {auroc_mean:.4f} ± {auroc_sd:.4f}")
    print(
        "Out-of-fold: "
        f"sens={oof_metrics['sensitivity']:.4f} "
        f"spec={oof_metrics['specificity']:.4f} "
        f"auroc={oof_metrics['auroc']:.4f}"
    )
    print(f"Wrote {OUT / 'metrics.json'}, roc.png, confusion.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
