#!/usr/bin/env python3
"""Download the annotation files of the MIT-BIH Atrial Fibrillation Database.

Only .atr (rhythm) and .qrs/.qrsc (beat) annotations are fetched. The raw ECG
signals are not needed for this model and are never committed. PhysioNet
serves the database under the Open Data Commons Attribution License v1.0.

Usage:
    python ml/download_afdb.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import wfdb

RECORDS = [
    "00735", "03665", "04015", "04043", "04048", "04126", "04746", "04908",
    "04936", "05091", "05121", "05261", "06426", "06453", "06995", "07162",
    "07859", "07879", "07910", "08215", "08219", "08378", "08405", "08434",
    "08455",
]

# Manually reviewed beat annotations exist for these records.
QRSC_RECORDS = {"05091", "07859"}

OUT = Path(__file__).resolve().parent / "data" / "afdb"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    files: list[str] = []
    for record in RECORDS:
        files.append(f"{record}.atr")
        if record in QRSC_RECORDS:
            files.append(f"{record}.qrsc")
        else:
            files.append(f"{record}.qrs")

    print(f"Downloading {len(files)} annotation files to {OUT} ...")
    try:
        wfdb.dl_files("afdb", str(OUT), files, keep_subdirs=False, overwrite=False)
    except Exception as exc:  # noqa: BLE001 - report and fail loudly
        print(f"Download failed: {exc}", file=sys.stderr)
        return 1

    missing = [f for f in files if not (OUT / f).exists()]
    if missing:
        print(f"Missing after download: {missing}", file=sys.stderr)
        return 1
    total = sum((OUT / f).stat().st_size for f in files)
    print(f"OK: {len(files)} files, {total / 1024:.0f} KiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
