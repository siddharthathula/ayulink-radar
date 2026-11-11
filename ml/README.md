# Rhythm-screening model

A logistic-regression screen for irregular pulse rhythm, trained on beat-to-beat
intervals from the **MIT-BIH Atrial Fibrillation Database** (`afdb`) on
PhysioNet. It is a screening flag, not a diagnosis.

## Data and licence

- Source: <https://physionet.org/content/afdb/1.0.0/> (v1.0.0, 25 records, 250 Hz).
- Licence: Open Data Commons Attribution License v1.0 (ODC-BY 1.0).
- Citation required by PhysioNet: Moody GB, Mark RG. *A new method for detecting
  atrial fibrillation using R-R intervals.* Computers in Cardiology.
  10:227-230 (1983).
- Annotations used: rhythm annotations from `.atr` (manually prepared) and beat
  annotations from `.qrs` or `.qrsc` where available. Raw ECG signals are not
  downloaded and never committed.
- Only annotation files are fetched (2.4 MB) instead of the full 606 MB signal
  archive. This keeps the repo and the download small; the model only needs
  beat times and rhythm labels.

Records 00735 and 03665 have no signal files in `afdb` and are represented only
by annotations; they are included. Records 05091 and 07859 use the manually
reviewed `.qrsc` beat annotations.

## Method

1. RR intervals in ms from consecutive beat times at 250 Hz.
2. Drop RR < 200 ms or > 2500 ms; windows that would span a dropped interval are
   skipped.
3. Window = 30 consecutive RR intervals, stride 15.
4. Label AF if at least 90% of the window's beats are inside `(AFIB` rhythm
   segments. Label normal if 100% are inside `(N` segments. Discard the rest.
5. Nine features: mean RR, SDNN (population), RMSSD, pNN50, CV, normalized
   RMSSD, SD1/SD2, Shannon entropy of the 16-bin histogram of
   `RR_diff / mean_RR`, and turning-point ratio.
6. `StandardScaler` + `LogisticRegression(max_iter=1000, class_weight='balanced')`.
7. `GroupKFold(5)` split by record, so windows from one record never appear in
   both train and test.
8. Threshold = the smallest out-of-fold threshold with specificity >= 0.95.
   The final model is then fit on all windows.

The web implementation is in `web/lib/engine/rhythm.ts`; the C implementation is
in `firmware/rhythm_infer.h`. Both implement the same nine features. The
parity tests compare against Python probabilities.

## Results (actual output of `ml/train_rhythm.py`)

Data: 25 records, 77,794 labelled windows (34,247 AF, 43,547 normal).
Split: GroupKFold(5) by record. Threshold: 0.672611.

| Fold | Sensitivity | Specificity | AUROC |
|---|---|---|---|
| 1 | 0.9346 | 0.9900 | 0.9944 |
| 2 | 0.9958 | 0.9828 | 0.9974 |
| 3 | 0.9817 | 0.9301 | 0.9827 |
| 4 | 0.9265 | 0.9977 | 0.9989 |
| 5 | 0.9260 | 0.8813 | 0.9693 |
| **Mean ± sd** | **0.9529 ± 0.0333** | **0.9564 ± 0.0497** | **0.9885 ± 0.0125** |

Out-of-fold at the chosen threshold: sensitivity 0.9462, specificity 0.9500,
AUROC 0.9851 (TN 41,370, FP 2,177, FN 1,841, TP 32,406).

Read the numbers as they are: fold 5 has noticeably lower specificity (0.8813)
than the others. The threshold was chosen on pooled out-of-fold predictions;
it does not guarantee 95% specificity in every record group.

Figures: `ml/out/roc.png`, `ml/out/confusion.png`.
Machine-readable metrics: `ml/out/metrics.json`.

## Reproduce

```bash
python3 -m venv ml/.venv
ml/.venv/bin/pip install -r ml/requirements.txt
ml/.venv/bin/python ml/download_afdb.py
ml/.venv/bin/python ml/train_rhythm.py
ml/.venv/bin/python ml/export_model.py
```

Exports (generated, committed):

- `web/public/model/rhythm_model.json` — coefficients, scaler, threshold, metrics
- `web/public/model/parity.json` — 20 windows for Python/TypeScript parity
- `web/public/model/samples.json` — 40 windows (20 AF, 20 normal) for the lab
- `firmware/rhythm_model.h`, `firmware/rhythm_infer.h` — C model
- `firmware/rhythm_samples.h` — four replay windows for the OLED demo
- `firmware/rhythm_parity_test.c` — host test, worst absolute difference
  5.96e-08 against Python (tolerance 1e-4)

The `samples.json` and `parity.json` files contain only derived RR intervals, not
ECG waveforms. They are shared under ODC-BY 1.0 with attribution to PhysioNet.

## Caveats

- Training data are ECG-derived RR intervals. The band uses an optical PPG
  sensor; on-band validation is pending. PPG artefacts and beat-detection
  errors are not represented in this dataset.
- The screen flags irregular rhythm; it does not identify atrial fibrillation
  or any disease.
- Cohort is a public clinical ECG database, not a community screening
  population.
