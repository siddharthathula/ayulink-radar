# Method

AyuLink Radar is a screening prototype. It is not a medical device and has not been clinically validated. The population data in the demo is simulated.

## Detection layers

1. **Personal baseline drift.** For each person and each valid day, the baseline is the median of the previous 21 valid resting-HR readings, skipping the two most recent days. Sigma is `max(1.4826 * MAD, 1.5)`; the robust z-score is `(rhr - baseline) / sigma`. A day is elevated at `z >= 2.0`. A drift flag requires two consecutive valid elevated days. Invalid or missing days are skipped and can never create a flag.
2. **Cluster alert.** For each zone and day, `n` is the number of people with at least two valid days in the last 3 days, and `k` is the number of unique people flagged in that same 3-day window. The expected rate `p0` is the mean of the same 3-day unique-person rate over days `d-28..d-4`, floored at 0.02. The p-value is the binomial tail `P(X >= k)` under `n` and `p0`. Bonferroni correction uses the number of zones. Alert requires `k >= 4` and `p < 0.001/Z`; watch requires `k >= 3` and `p < 0.01/Z`. Zones with fewer than 10 eligible wearers are always normal.
3. **Region-wide guard.** If more than half of all zones would be watch or alert on the same day, every level is downgraded one step and the day is marked region-wide. A region-wide shift (heat, festival) is not a local cluster.
4. **Rhythm screening.** A logistic-regression model on nine RR-interval features, trained on ECG-derived intervals from the public MIT-BIH Atrial Fibrillation Database. It flags irregular rhythm; it does not identify a disease. The band uses an optical pulse sensor and on-band validation is pending.

## Evaluation design

Tuning seeds: 1-100. Test seeds: 101-300 (200 seeds). Stress and noise sweep: seeds 101-200. Test seeds were never used to tune a threshold. Runtime: 310 s.

Ground truth for a zone-day is at least 3 people in that zone with days-since-infection in 1..10. Detection rate is the share of `cluster` runs with an alert in the outbreak zone before day `outbreakDay + 14`. Specificity is the share of calm zone-days on/after day 28 with no alert. Precision is the share of alert zone-days in `cluster` runs that are truly outbreak-active. False alerts are alert zone-days per zone per 30 observed days in calm runs.

Tuning target: at most 0.2 false alert zone-days per zone per 30 days. Observed maximum: 0.009 (target met).

## Radar results (test seeds only)

All four detectors receive the same simulated data. D1 is a fixed threshold; D2 adds personal baselines without statistics; D3 adds the binomial cluster test; D4 adds the region-wide guard and is the product.

### Village

| Wear rate | Detector | Detection rate [95% CI] | Zone-day specificity [95% CI] | Precision [95% CI] | False alerts / zone / 30d | Median lead days [p25, p75] |
|---|---|---|---|---|---|---|
| 100% | D1 Fixed threshold | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | 100.0% [100.0%–100.0%] | 0.000 | -4.0 [-4.0, -4.0] |
| 100% | D2 Personal baseline | 100.0% [100.0%–100.0%] | 99.5% [99.4%–99.6%] | 95.0% [93.8%–96.1%] | 0.144 | 6.0 [4.0, 7.0] |
| 100% | D3 Baseline + binomial | 95.5% [92.5%–98.0%] | 100.0% [100.0%–100.0%] | 99.7% [99.3%–99.9%] | 0.001 | 3.0 [1.0, 4.0] |
| 100% | D4 Full engine | 95.5% [92.5%–98.0%] | 100.0% [100.0%–100.0%] | 99.7% [99.3%–99.9%] | 0.001 | 3.0 [1.0, 4.0] |
| 80% | D1 Fixed threshold | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | — [—] | 0.000 | — |
| 80% | D2 Personal baseline | 100.0% [100.0%–100.0%] | 99.8% [99.7%–99.8%] | 97.1% [96.2%–98.0%] | 0.072 | 4.0 [3.0, 6.0] |
| 80% | D3 Baseline + binomial | 95.0% [92.0%–98.0%] | 100.0% [100.0%–100.0%] | 99.3% [98.6%–99.8%] | 0.004 | 3.0 [1.0, 4.0] |
| 80% | D4 Full engine | 95.0% [91.5%–97.5%] | 100.0% [100.0%–100.0%] | 99.3% [98.6%–99.8%] | 0.004 | 3.0 [1.0, 4.0] |
| 60% | D1 Fixed threshold | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | — [—] | 0.000 | — |
| 60% | D2 Personal baseline | 79.0% [73.5%–84.5%] | 100.0% [100.0%–100.0%] | 99.7% [99.4%–100.0%] | 0.001 | 1.0 [-2.0, 3.0] |
| 60% | D3 Baseline + binomial | 54.5% [47.5%–61.0%] | 100.0% [100.0%–100.0%] | 100.0% [100.0%–100.0%] | 0.000 | 0.0 [-1.0, 2.0] |
| 60% | D4 Full engine | 54.5% [47.5%–61.0%] | 100.0% [100.0%–100.0%] | 100.0% [100.0%–100.0%] | 0.000 | 0.0 [-1.0, 2.0] |
| 40% | D1 Fixed threshold | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | — [—] | 0.000 | — |
| 40% | D2 Personal baseline | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | — [—] | 0.000 | — |
| 40% | D3 Baseline + binomial | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | — [—] | 0.000 | — |
| 40% | D4 Full engine | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | — [—] | 0.000 | — |

### City

| Wear rate | Detector | Detection rate [95% CI] | Zone-day specificity [95% CI] | Precision [95% CI] | False alerts / zone / 30d | Median lead days [p25, p75] |
|---|---|---|---|---|---|---|
| 100% | D1 Fixed threshold | 0.5% [0.0%–1.5%] | 100.0% [100.0%–100.0%] | 100.0% [100.0%–100.0%] | 0.000 | -7.0 [-7.0, -6.0] |
| 100% | D2 Personal baseline | 100.0% [100.0%–100.0%] | 96.9% [96.7%–97.2%] | 74.1% [72.6%–75.7%] | 0.919 | 5.0 [4.0, 7.0] |
| 100% | D3 Baseline + binomial | 98.0% [96.0%–99.5%] | 100.0% [100.0%–100.0%] | 99.8% [99.5%–100.0%] | 0.002 | 2.0 [0.0, 3.0] |
| 100% | D4 Full engine | 98.0% [96.0%–99.5%] | 100.0% [100.0%–100.0%] | 99.8% [99.5%–100.0%] | 0.002 | 2.0 [0.0, 3.0] |
| 80% | D1 Fixed threshold | 0.5% [0.0%–1.5%] | 100.0% [100.0%–100.0%] | 100.0% [100.0%–100.0%] | 0.000 | -5.0 [-5.0, -4.0] |
| 80% | D2 Personal baseline | 99.0% [97.5%–100.0%] | 98.4% [98.2%–98.5%] | 84.0% [82.7%–85.4%] | 0.484 | 4.0 [3.0, 6.0] |
| 80% | D3 Baseline + binomial | 92.5% [88.5%–96.0%] | 100.0% [100.0%–100.0%] | 99.9% [99.8%–100.0%] | 0.004 | 1.0 [-1.0, 2.0] |
| 80% | D4 Full engine | 92.5% [88.5%–96.0%] | 100.0% [100.0%–100.0%] | 99.9% [99.8%–100.0%] | 0.004 | 1.0 [-1.0, 2.0] |
| 60% | D1 Fixed threshold | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | — [—] | 0.000 | — |
| 60% | D2 Personal baseline | 92.0% [88.0%–95.5%] | 99.9% [99.9%–99.9%] | 97.3% [96.3%–98.1%] | 0.028 | 1.0 [-1.0, 3.0] |
| 60% | D3 Baseline + binomial | 63.5% [56.5%–70.0%] | 100.0% [100.0%–100.0%] | 100.0% [100.0%–100.0%] | 0.001 | -2.0 [-4.0, 0.0] |
| 60% | D4 Full engine | 63.5% [56.5%–70.5%] | 100.0% [100.0%–100.0%] | 100.0% [100.0%–100.0%] | 0.001 | -2.0 [-4.0, 0.0] |
| 40% | D1 Fixed threshold | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | — [—] | 0.000 | — |
| 40% | D2 Personal baseline | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | 100.0% [100.0%–100.0%] | 0.000 | -6.5 [-8.3, -4.8] |
| 40% | D3 Baseline + binomial | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | — [—] | 0.000 | — |
| 40% | D4 Full engine | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | — [—] | 0.000 | — |

### Society

| Wear rate | Detector | Detection rate [95% CI] | Zone-day specificity [95% CI] | Precision [95% CI] | False alerts / zone / 30d | Median lead days [p25, p75] |
|---|---|---|---|---|---|---|
| 100% | D1 Fixed threshold | 0.5% [0.0%–1.5%] | 100.0% [100.0%–100.0%] | 100.0% [100.0%–100.0%] | 0.000 | -6.0 [-6.5, -3.5] |
| 100% | D2 Personal baseline | 100.0% [100.0%–100.0%] | 93.0% [92.7%–93.4%] | 64.6% [63.1%–66.1%] | 2.100 | 6.0 [4.0, 7.0] |
| 100% | D3 Baseline + binomial | 95.5% [92.5%–98.0%] | 100.0% [100.0%–100.0%] | 100.0% [99.9%–100.0%] | 0.005 | 1.0 [0.0, 3.0] |
| 100% | D4 Full engine | 95.5% [92.5%–98.0%] | 100.0% [100.0%–100.0%] | 100.0% [99.8%–100.0%] | 0.005 | 1.0 [0.0, 3.0] |
| 80% | D1 Fixed threshold | 1.5% [0.0%–3.5%] | 100.0% [100.0%–100.0%] | 100.0% [100.0%–100.0%] | 0.000 | -6.0 [-8.5, -3.0] |
| 80% | D2 Personal baseline | 100.0% [100.0%–100.0%] | 96.2% [96.0%–96.4%] | 75.8% [74.4%–77.3%] | 1.140 | 5.0 [3.0, 6.0] |
| 80% | D3 Baseline + binomial | 91.0% [87.0%–94.5%] | 100.0% [99.9%–100.0%] | 99.6% [99.3%–99.9%] | 0.009 | 0.0 [-1.0, 2.0] |
| 80% | D4 Full engine | 91.0% [87.0%–95.0%] | 100.0% [99.9%–100.0%] | 99.6% [99.3%–99.9%] | 0.009 | 0.0 [-1.0, 2.0] |
| 60% | D1 Fixed threshold | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | 100.0% [100.0%–100.0%] | 0.000 | -5.0 [-5.0, -5.0] |
| 60% | D2 Personal baseline | 94.5% [91.0%–97.5%] | 99.7% [99.6%–99.8%] | 97.0% [96.3%–97.8%] | 0.095 | 1.0 [-1.0, 3.0] |
| 60% | D3 Baseline + binomial | 65.5% [59.0%–72.0%] | 100.0% [100.0%–100.0%] | 100.0% [100.0%–100.0%] | 0.001 | -2.0 [-4.0, 0.0] |
| 60% | D4 Full engine | 65.5% [59.0%–72.0%] | 100.0% [100.0%–100.0%] | 100.0% [100.0%–100.0%] | 0.001 | -2.0 [-4.0, 0.0] |
| 40% | D1 Fixed threshold | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | — [—] | 0.000 | — |
| 40% | D2 Personal baseline | 0.5% [0.0%–1.5%] | 100.0% [100.0%–100.0%] | 100.0% [100.0%–100.0%] | 0.000 | -7.0 [-8.0, -4.0] |
| 40% | D3 Baseline + binomial | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | — [—] | 0.000 | — |
| 40% | D4 Full engine | 0.0% [0.0%–0.0%] | 100.0% [100.0%–100.0%] | — [—] | 0.000 | — |

## Stress tests

D4 and D1, wear rate 0.8 (low participation uses 0.4). Heatwave and isolated illness are false-alert stress tests; fast spread is a detection test. Detection and false-alert columns come from separate `cluster` and `calm` runs with the same seeds.

| Mode | Stress | Detector | Detection rate | Zone-day specificity | False alerts / zone / 30d | Median lead days |
|---|---|---|---|---|---|---|
| village | heatwave | D1 | 0.0% | 100.0% | 0.000 | -4.0 [-4.0, -4.0] |
| village | heatwave | D4 | 92.0% | 97.9% | 0.636 | 3.0 [2.0, 5.0] |
| village | noisy | D1 | 0.0% | 100.0% | 0.000 | — |
| village | noisy | D4 | 9.0% | 100.0% | 0.000 | -2.0 [-4.0, 1.0] |
| village | isolated | D1 | — | 100.0% | 0.000 | — |
| village | isolated | D4 | — | 100.0% | 0.005 | — |
| village | fast | D1 | 0.0% | 100.0% | 0.000 | — |
| village | fast | D4 | 99.0% | 100.0% | 0.003 | 3.0 [2.0, 4.0] |
| village | low-participation | D1 | 0.0% | 100.0% | 0.000 | — |
| village | low-participation | D4 | 0.0% | 100.0% | 0.000 | — |
| ward | heatwave | D1 | 1.0% | 100.0% | 0.000 | -4.0 [-4.0, -4.0] |
| ward | heatwave | D4 | 92.0% | 98.4% | 0.492 | 1.0 [-1.0, 3.0] |
| ward | noisy | D1 | 0.0% | 100.0% | 0.000 | — |
| ward | noisy | D4 | 9.0% | 100.0% | 0.000 | -5.0 [-7.0, -2.0] |
| ward | isolated | D1 | — | 100.0% | 0.000 | — |
| ward | isolated | D4 | — | 100.0% | 0.011 | — |
| ward | fast | D1 | 1.0% | 100.0% | 0.000 | -4.5 [-5.3, -3.8] |
| ward | fast | D4 | 100.0% | 100.0% | 0.002 | 2.0 [1.0, 3.0] |
| ward | low-participation | D1 | 0.0% | 100.0% | 0.000 | — |
| ward | low-participation | D4 | 0.0% | 100.0% | 0.000 | — |
| society | heatwave | D1 | 3.0% | 100.0% | 0.000 | -5.0 [-6.0, -4.0] |
| society | heatwave | D4 | 89.0% | 99.0% | 0.311 | 1.0 [-0.3, 2.0] |
| society | noisy | D1 | 0.0% | 100.0% | 0.000 | — |
| society | noisy | D4 | 4.0% | 100.0% | 0.000 | -6.0 [-8.3, -4.8] |
| society | isolated | D1 | — | 100.0% | 0.000 | — |
| society | isolated | D4 | — | 99.9% | 0.022 | — |
| society | fast | D1 | 4.0% | 100.0% | 0.000 | -3.5 [-6.0, -1.3] |
| society | fast | D4 | 100.0% | 100.0% | 0.003 | 2.0 [0.0, 3.0] |
| society | low-participation | D1 | 0.0% | 100.0% | 0.000 | — |
| society | low-participation | D4 | 0.0% | 100.0% | 0.000 | — |

## Noise sweep

Village, wear rate 0.8, D4. Person-level precision is flagged person-days that are truly ill (days-since-infection 1..10 or a sporadic episode) divided by all flagged person-days. Zone detection and false alerts use the same runs.

| Noise level | Person-flag precision | Detection rate | False alerts / zone / 30d |
|---|---|---|---|
| 0.0 | 79.2% | 97.0% | 0.002 |
| 0.2 | 70.3% | 96.0% | 0.003 |
| 0.4 | 65.5% | 77.0% | 0.003 |
| 0.6 | 61.9% | 39.0% | 0.000 |
| 0.8 | 60.4% | 9.0% | 0.000 |
| 1.0 | 59.0% | 0.0% | 0.000 |

## Rhythm model (per-record cross-validation)

Data: 77794 windows from 25 records (34247 AF, 43547 normal). Split: GroupKFold(5) by record; final model fit on all windows.

| Metric | Mean ± sd |
|---|---|
| Sensitivity | 0.9529 ± 0.0333 |
| Specificity | 0.9564 ± 0.0497 |
| AUROC | 0.9885 ± 0.0125 |

The rhythm model is trained on ECG-derived intervals. The band uses an optical/analog pulse sensor. On-band validation is pending. The screen does not diagnose atrial fibrillation or any other condition.

## Simulation assumptions

- 60 days, 6/8/6 zones, 34/60/80 people per zone for village/ward/society.
- Baseline resting HR 68 ± 7 bpm (clamped 50-92); ages 18-80; 50/50 sex.
- Daily wear probability equals the selected wear rate. Wear minutes are 300 ± 150; artefact fraction is |N(0,1)| × (0.08 + 0.35 × noise).
- Two region-wide hot days (+1.5 bpm) after day 28 in every scenario; heatwave stress uses five consecutive days (+3 bpm) after day 30.
- Sporadic illness: 0.003 per healthy day for 4 days (+6 bpm); isolated stress multiplies this by 3 and suppresses outbreak transmission.
- Outbreak: 3 seeded people in one zone on day 34; infectious for days 2-8; transmission follows the binomial-style hazard in the source with beta 0.55 and spill 0.06 for spread; fast stress uses 0.9/0.12.
- Clinic detection: each infected person visits with probability 0.45 on infection day + 3 + U{1,2,3}; the third visit from the outbreak zone plus a 3/2/2-day reporting lag is the simulated clinic detection.
- The clinic bar is deliberately generous (three visits), so the measured lead time is not inflated.

## Limitations

- Population data are simulated. Three physical prototype bands exist. No field deployment has been completed.
- Resting-HR drift is not disease-specific. A cluster alert means a possible febrile-illness cluster; it never names a disease.
- Rhythm training data are ECG-derived; on-band optical validation is pending.
- Small groups give weak statistics. Zones with fewer than 10 eligible wearers never alert.
- Lead time depends on the simulation assumptions above, not on observed clinic data.
- Not a medical device. Clinical validation has not been performed.

## References

- Radin JM, Wineinger NE, Topol EJ, Steinhubl SR. Wearable device data and influenza-like illness surveillance. *Lancet Digital Health* 2020. <https://doi.org/10.1016/S2589-7500(19)30222-5>
- Quer G, Radin JM, et al. Wearable sensor data and self-reported symptoms for COVID-19 detection. *Nature Medicine* 2021. <https://doi.org/10.1038/s41591-020-1123-x>
- Scripps DETECT study. <https://detect.scripps.edu>
- PhysioNet MIT-BIH Atrial Fibrillation Database. <https://physionet.org/content/afdb/1.0.0/>
- Moody GB, Mark RG. A new method for detecting atrial fibrillation using R-R intervals. *Computers in Cardiology* 1983. <http://ecg.mit.edu/george/publications/afib-cinc-1983.pdf>
