<div align="center">

# AyuLink Radar

### It knows your normal. And when your street isn't.

An AI-powered early-warning system for everyone, anywhere in India. A low-cost, **modular** wristband —
or the smartwatch you already wear — learns each person's own resting heart rate. AI spots quiet
shifts, notices when **many neighbours shift together**, **forecasts which area will flare up in the
next 3 days**, and tells a health worker, a family or a clinic who to check first. An **operator
assistant** answers "who should I visit first?" in plain words, even offline.
Bands work **offline over LoRa**; the same system runs on smartwatches in a city high-rise.

**INNOVEX 2026 · PS 01 — AI-Powered Healthcare:** *"Develop intelligent solutions for early disease detection and accessible healthcare."*

[![CI](https://github.com/siddharthathula/ayulink-radar/actions/workflows/ci.yml/badge.svg)](https://github.com/siddharthathula/ayulink-radar/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Status: screening prototype](https://img.shields.io/badge/status-screening%20prototype-orange)

**[▶ Live demo](https://ayulink-radar.vercel.app)** · **[30-second guided tour](https://ayulink-radar.vercel.app/demo?tour=1)** · **[The AI inside](https://ayulink-radar.vercel.app/ai)** · **[Configure a band](https://ayulink-radar.vercel.app/configure)** · **[Business](https://ayulink-radar.vercel.app/business)** · **[Field app](https://ayulink-radar.vercel.app/field)** · **[API](https://ayulink-radar.vercel.app/api-docs)**

<!-- TODO before submission: confirm the live URL above matches your Vercel deploy, add the 90-second video link and team member names. -->

</div>

> **Screening prototype. Not a medical device. Not clinically validated.**
> Population data in the demo is **simulated**. The wristband and LoRa gateway hardware are real
> bench prototypes. Every number in this README is produced by a script in this repository.

![Surveillance console — light theme, cluster alert in one hamlet](docs/images/readme/console-light.webp)

<table>
<tr>
<td width="50%" align="center"><img src="docs/images/readme/band.jpg" alt="AyuLink wristband prototype: ESP32, OLED showing BPM, SpO2 and skin temperature, Li-Po battery with USB-C charger on an elastic strap" width="320"><br><b>AyuLink wristband</b> — our bench prototype. Heart rate, SpO2, skin temperature, motion. Real photo.</td>
<td width="50%" align="center"><img src="docs/images/readme/gateway.jpg" alt="AyuLink LoRa gateway prototype: ESP32 with SX1278 LoRa module and OLED on perfboard" width="320"><br><b>AyuLink LoRa gateway</b> — receives band packets with no internet. Real photo (GPS digits blurred).</td>
</tr>
</table>

## In one minute

| | |
|---|---|
| **The problem** | Fever outbreaks are noticed only after sick people reach a clinic. In villages far from a PHC, that is days too late. |
| **The idea** | Everyone's heart beats a little faster when an infection starts. One person's rise means little. **Many people in the same hamlet rising together** is a warning. |
| **What we built** | A modular wristband + LoRa gateway (real hardware), a detection engine, **two trained AI models** (3-day escalation forecaster, rhythm screen), a grounded **operator assistant** (text + voice), an operator console, a band configurator, a field app for ASHA workers, and 6 APIs. |
| **The AI** | 8 pieces from first reading to visit list. The forecaster warned before the alert in **87%** of outbreak zones, a median **2 days** early (AUROC **0.949** on held-out runs). See [The AI inside](#the-ai-inside). |
| **For whom** | Villages under a PHC, elders living alone, office workers, heart patients after discharge, outdoor workers in heat, camps and mass events — one band, [configured per person](#one-band-built-around-each-person). |
| **Where** | Shown around **Hyderabad**: rural Rangareddy hamlets, 8 towns from Patancheru to Uppal, and apartment towers in the Financial District. |
| **Result (simulated)** | In a village with 80% daily band wear, **95.0%** of seeded clusters were caught, a median **3 days** before simulated clinic detection, with 0.004 false alerts per zone per month. |
| **Business** | Recurring software for public health first, then families, employers, hospitals and campuses. See [Business model](#business-model). |
| **Honest limit** | Population data is simulated. Needs ≥ 60% daily wear. Not a medical device. |

---

## Contents

1. [A story from the monsoon](#1-a-story-from-the-monsoon)
2. [The problem](#2-the-problem)
3. [Our solution](#3-our-solution) · [The AI inside](#the-ai-inside) · [One band, built around each person](#one-band-built-around-each-person)
4. [What is new](#4-what-is-new--and-what-is-not)
5. [How it works](#5-how-it-works)
6. [Results](#6-results)
7. [Feasibility](#7-feasibility)
8. [Use cases: who, where, when — around Hyderabad](#8-use-cases-who-where-when--around-hyderabad)
9. [Scalability: from one PHC to all of India](#9-scalability-from-one-phc-to-all-of-india) · [Business model](#business-model)
10. [Hardware](#10-hardware) · [Product tour](#product-tour)
11. [How this meets the judging criteria](#11-how-this-meets-the-judging-criteria)
12. [Run it yourself and deploy](#12-run-it-yourself-and-deploy)
13. [Limitations, privacy and safety](#13-limitations-privacy-and-safety)
14. [Roadmap](#14-roadmap)
15. [References](#15-references)

---

## 1. A story from the monsoon

> *This is an illustrative story. The people and the hamlet are fictional composites, not a real
> case. It shows the kind of gap AyuLink Radar is built for.*

It has rained for nine days in a forest hamlet two hours from the nearest Primary Health Centre.
**Lakshmi**, the ASHA worker, covers 212 people across three hamlets on foot.

On Monday, a farmer tells her his son has "a little fever". On Tuesday, two women at the hand-pump
mention body pain. On Wednesday an old man stays in bed. Nobody goes to the PHC; the road is
flooded, a day's wages is a day's wages, and fevers come every monsoon.

The PHC's weekly report shows nothing unusual. The first patient from the hamlet reaches the clinic
on **Saturday**: a 9-year-old girl, **Divya**, too weak to stand. By then eleven people in her hamlet
are sick. A medical team arrives the next week. Divya spends four nights in the district hospital.

Every one of those people had a heart that was beating faster than *their own* normal, days before
anyone counted them.

**The same week, with AyuLink Radar.** On Tuesday evening, eight band wearers in Divya's hamlet are
drifting above their personal baselines at once. The console turns the hamlet amber, then red.
Lakshmi's phone shows a ranked list: *visit these six houses first*, with a note in Telugu. On
Wednesday morning she checks temperatures, finds four fevers, and the PHC sends a team with test
kits **on Thursday**: two days before the first clinic visit, while it is still a small cluster.

That gap — between when a community starts getting sick and when the health system finds out — is
what we are trying to close.

---

## 2. The problem

**Outbreaks are counted after people get sick enough to be counted.**

India's disease surveillance (IDSP, digitised as IHIP) is built on reports from health facilities
and field workers. It is real and it works, but it starts when a sick person reaches a clinic or
an ASHA notices and reports. Three things make that late:

| Gap | What happens | Evidence |
|---|---|---|
| **Surveillance starts at the clinic** | Clusters grow quietly before the first patient arrives. | Routine passive reporting suffers from under-reporting and poor timeliness [ICMR-NIE, ref 6]. |
| **What is counted is a fraction of what happens** | In 2024, surveillance recorded **297** dengue deaths; medical certification of cause of death recorded **2,340** [ref 7]. | Surveillance sees a fraction of the real burden. |
| **No device means no early signal** | Wearable-based illness tracking is proven, but only for affluent smartwatch owners, mostly in the USA [refs 1–3]. | People with no smartwatch and no nearby clinic produce no early signal at all. |

The burden is not small: **2,33,519** dengue cases were reported in India in 2024 [ref 8], and
fevers are no longer confined to the monsoon months [ref 8].

**The question we answer:** *can a cheap wristband and a community-level detector give a health
worker a few days' warning, in places with no internet, without pretending to diagnose anyone?*

---

## 3. Our solution

AyuLink Radar has three detection layers and one action layer.

| Layer | What it does | In plain words |
|---|---|---|
| **A · Personal baseline drift** | Each person's resting heart rate is compared with their **own** 21-day median, not a population average. A drift flag needs 2+ days clearly above normal. | "Your heart has been beating faster than *your* normal for 2 days." Often an early sign of fever or infection. |
| **B · Community cluster alert** | For each zone, a binomial test asks: are *more people drifting together* than chance allows? Bonferroni-corrected, with a region-wide guard so a heatwave is not mistaken for a local outbreak. | "Eight of 24 people in this hamlet are drifting at once. That is very unlikely to be chance." |
| **C · Irregular-rhythm screening** | A trained model scores 30-beat windows of beat-to-beat intervals for irregular rhythm (atrial-fibrillation-like patterns). Runs in the browser and as a C header on the ESP32. | "This person's pulse looks irregular. Refer for an ECG." |
| **D · AI forecast** | A trained model ranks every zone by its chance of reaching alert in the **next 3 days**, and names the factors behind each score. | "Rayakunta isn't on alert yet, but it will likely be by Thursday. Go today." |
| **E · Action** | A ranked **visit-first list**, a short **note in Telugu, Hindi or English**, the **Ask AyuLink** assistant, a **field app** for the ASHA, and a printable **situation report** for the PHC. | "Visit these six houses first. Here is what to check." |

**What it never does:** name a disease, diagnose, or suggest medicine. Every flag is labelled
*screening flag, not a diagnosis*.

### The AI inside

AI is not a chatbot bolted on at the end. It runs at every step, and every piece is small enough to
explain, test and run offline. Full page: [/ai](https://ayulink-radar.vercel.app/ai).

| # | AI piece | Type | What it does for a person |
|---|---|---|---|
| 1 | Signal quality gate | Automated QC | Drops readings from a loose strap or heavy movement. Bad data never becomes an alert. |
| 2 | Personal baseline | Per-person anomaly detection | Learns *your* normal resting heart rate; flags a steady drift from yourself. |
| 3 | Cluster detection | Population anomaly detection | Many neighbours drifting together → watch / alert, with a heat/festival guard. |
| 4 | **3-day escalation forecaster** | **Trained ML model** | Predicts which zone will reach alert in the next 3 days, with reasons. |
| 5 | Irregular pulse screen | Trained ML model | Beat-to-beat timing → irregular-rhythm screen. Python, TypeScript and ESP32 C, parity-tested. |
| 6 | Visit-first ranking | Explainable triage scoring | One ordered list of who to see, each with plain-word reasons. |
| 7 | **Ask AyuLink assistant** | Grounded conversational AI | "Brief me", "which zone is next?", "who first?" — text or voice, works offline. |
| 8 | Health-worker notes | Multilingual generation | Telugu / Hindi / English notes, read aloud; LLM output validated or replaced. |

**Ask AyuLink** reads a fact sheet built from the live console (zones, forecast, visit list) and
answers with a deterministic rules engine that always works, even with no internet. If a Groq key is
set, an LLM may rephrase the answer — but any reply that adds a number not in the facts, names a
disease or mentions a medicine is thrown away. Medical questions ("does V-03-017 have dengue?") get a
referral line, never an answer. Press **A** in the console.

### One band, built around each person

A grandmother living alone needs fall alerts and SOS location. An office worker wants a phone link and
no GPS. A heart patient needs rhythm checks. The [band configurator](https://ayulink-radar.vercel.app/configure)
lets you switch modules per wearer and shows exactly which AI features, battery load and privacy
settings follow. It exports a JSON config and a firmware header (`ayulink_config.h`).

| Module | Part | Status |
|---|---|---|
| Pulse (HR, beat timing, SpO₂) | MAX30102 | On prototype |
| Skin temperature | LM35 | On prototype |
| Motion / falls / rest detection | MPU6050 | On prototype |
| LoRa radio (no internet needed) | SX1278 433 MHz | On prototype |
| GPS (off by default; SOS-only or always) | u-blox NEO-6M | On prototype |
| Screen | SH1106 OLED | On prototype |
| ECG lead | AD8232 | **Planned** |
| Skin response (GSR) for heat stress | Grove GSR | **Planned** |
| Phone link | ESP32 BLE | **Planned** |
| Battery gauge | MAX17048 | **Planned** |

Ready-made profiles: village health watch · elder living alone · everyday wellness · heart follow-up ·
outdoor worker heat · camp or mass event. `/api/ingest` already accepts the optional module fields
(`spo2_pct`, `skin_temp_c`, `gsr_us`, `ecg_rr_ms`, `lat`/`lng`) and rejects location from a band that
hasn't declared GPS. Wiring the header into band firmware is in progress.

---

## 4. What is new — and what is not

We did not invent wearable illness detection. We are honest about that.

| | Population-level detection | Per-person baseline | Works offline | Low-cost band | Health-worker output |
|---|:-:|:-:|:-:|:-:|:-:|
| Scripps / Fitbit studies (USA) [refs 1–3] | ✓ (state level) | ✓ | ✗ | ✗ (consumer watches) | ✗ |
| Hospital bedside monitors (e.g. contactless mattress sensors) | ✗ | — | — | ✗ | Nurse alert |
| LoRa vitals bands in research papers | ✗ | not stated | ✓ | ✓ | SMS alert |
| **AyuLink Radar** | **✓ (hamlet / town / tower)** | **✓** | **✓ LoRa** | **✓** | **✓ ranked list + local-language note** |

**Our contribution** is the combination, built for India's last mile:
1. A **population layer** that turns individual wearables into a community cluster detector at hamlet scale.
2. **One engine, three settings**: village (own band + LoRa), city (bands + smartwatches across a metro), housing society (existing smartwatches, aggregate-only).
3. **ASHA-first output**: what to do, who first, in her language, usable offline.
4. **One model, three runtimes**: the rhythm model is trained in Python, runs in TypeScript in the browser, and exports to a C header for the ESP32 — with parity tests across all three.

---

## 5. How it works

```mermaid
flowchart LR
  subgraph Village["Village — no internet needed"]
    B1["AyuLink band<br/>ESP32 · MAX30102 PPG · MPU6050 · LM35<br/>on-band fall / tremor / rhythm"] -- "LoRa 433.5 MHz uplink<br/>(+ ESP-NOW short range)" --> G["LoRa gateway<br/>ESP32 + SX1278<br/>store-and-forward buffer"]
  end
  G -- "syncs when a link is up" --> I["/api/ingest<br/>packet validation"]
  I --> E["Detection engine<br/>1 · personal baseline drift<br/>2 · zone cluster test<br/>3 · rhythm screening"]
  E --> AI["AI forecaster<br/>zone risk, next 3 days"]
  AI --> C["Operator console<br/>map · surveillance grid · alerts"]
  C --> A["Ask AyuLink<br/>grounded assistant · voice"]
  E --> F["Field app (ASHA)<br/>visit list · Telugu/Hindi note · offline form"]
  C --> R["Situation report<br/>for PHC / district"]
```

**Detection in four steps**

1. **Quality gate.** A day counts only if the band was worn ≥ 120 minutes at rest with ≤ 30% motion
   artefact. Bad readings are thrown away; a sensor problem can never become a health alert.
2. **Personal baseline.** Median of the person's last 21 valid days (skipping the 2 most recent).
   Robust z-score; a drift flag needs z ≥ 2 on two consecutive valid days.
3. **Cluster test.** In each zone, `k` people flagged in a 3-day window out of `n` eligible
   wearers is tested against the zone's own historical rate with a binomial tail. Watch at
   `p < 0.01/Z`, alert at `p < 0.001/Z` (Bonferroni over `Z` zones). Zones under 10 wearers never
   alert. If more than half of all zones light up on the same day, the day is treated as a
   region-wide shift (heat, festival) and downgraded.
4. **Triage.** People are ranked by drift strength, zone level, rhythm screen and age. Notes are
   fixed templates; an optional LLM may rephrase them, but its output is checked and replaced by the
   template if it names a disease, a medicine, or drops the disclaimer.

Full method: [`docs/method.md`](docs/method.md) and the [Method page](https://ayulink-radar.vercel.app/method).

---

## 6. Results

> These are **simulation** results on held-out test seeds (101–300). Thresholds were tuned only on
> seeds 1–100. Source: [`web/public/data/eval.json`](web/public/data/eval.json), produced by
> [`web/scripts/evaluate.ts`](web/scripts/evaluate.ts). Clinic comparison is a deliberately generous
> simulated baseline (3rd clinic visit from the outbreak zone plus reporting lag).

### Cluster detection at 80% daily band wear (full engine)

| Setting | Clusters detected (95% CI) | Median lead vs simulated clinic | False alerts per zone per 30 days |
|---|---|---|---|
| Village (6 Rangareddy hamlets × 34) | **95.0%** (91.5–97.5) | **3 days** earlier | 0.0039 |
| City (8 towns around Hyderabad × 60) | **92.5%** (88.5–96.0) | **1 day** earlier | 0.0035 |
| Society (6 Financial District towers × 80) | **91.0%** (87.0–95.0) | same day | 0.0094 |

**Same test scenarios, four detectors** (village, 80% wear, held-out seeds 101–300):

| Detector | Clusters detected | Median lead | False alerts / zone / 30 d |
|---|---|---|---|
| D1 · Fixed threshold (resting HR ≥ 90, zone alert at 4 people) | 0.0% | — | 0.0000 |
| D2 · Personal baseline, zone alert at 4 drifting people (no statistics) | 100.0% | **4 days** earlier | **0.072** |
| D3 · Personal baseline + cluster test | 95.0% | **3 days** earlier | 0.0039 |
| **D4 · D3 + heat/festival guard (shipped)** | **95.0%** | **3 days** earlier | **0.0039** |

Personal baselines make cheap sensors useful (D1 → D2). The cluster test cuts false alerts
~18× for a small loss in sensitivity and lead time (D2 → D3/D4).

### It only works if people wear the band

| Daily wear (village) | 100% | 80% | 60% | 40% |
|---|---|---|---|---|
| Clusters detected | 95.5% | 95.0% | 54.5% | **0.0%** |

**The community signal needs about 80% daily wear.** At 60% it catches roughly half of clusters
(54.5%), at 40% nothing. This is the most important operational requirement, and the first
thing a pilot must measure.

### Stress tests (village, 80% wear)

| Scenario | What we tested | Result |
|---|---|---|
| Fast spread | Higher transmission between neighbouring hamlets | 99.0% detected, 3 days earlier |
| Isolated illness | Many unrelated sick people, no outbreak | 0.0047 false alerts / zone / 30 d |
| Heatwave | +3 bpm for everyone for 5 days | 92.0% detected, but **0.64 false alerts / zone / 30 d** — the region-wide guard needs work |
| Noisy sensors | Heavy motion and contact artefact | **9.0% detected** — signal quality matters |

### Calibration: does the cluster test keep its promise?

Calm runs only (no outbreak), held-out seeds 101–300, region-wide guard **off** (raw test). Honest
p-values mean the observed share with p ≤ t stays at or below t. Bonferroni corrects for zones, not
for testing every day, so we also show how often a whole calm 32-day run raises an alert.

| Setting · wear | P(p ≤ 0.01) | P(p ≤ 0.05) | Alert rate per test (nominal) | Calm runs with ≥1 alert | … with ≥1 watch |
|---|---|---|---|---|---|
| village · 80% | 0.0028 | 0.0155 | 0.0001 (0.0002) | 2.5% | 12.5% |
| city · 80% | 0.0043 | 0.0201 | 0.0001 (0.0001) | 1.5% | 10.5% |
| society · 80% | 0.0072 | 0.0328 | 0.0003 (0.0002) | 3.0% | 16.5% |
| village · 60% | 0.0014 | 0.0121 | 0 (0.0002) | 0.0% | 1.0% |
| city · 60% | 0.0009 | 0.0092 | 0 (0.0001) | 0.5% | 3.0% |
| society · 60% | 0.0016 | 0.0098 | 0 (0.0002) | 0.5% | 5.5% |

P-values are conservative almost everywhere. Exception: society at 80% wear fires alerts slightly
above its per-test promise, because one person's flag persists for days and neighbours aren't fully
independent. Source: [`web/public/data/calibration.json`](web/public/data/calibration.json).

> **Fixed 11 Nov 2026.** The flagged count *k* could include people who weren't in the denominator *n*
> (fewer than 2 valid days in the window), making p-values too small on ~12% of zone-days. *k* is now
> restricted to eligible people, a test guards it, and every number in this README was regenerated.

### 3-day zone escalation forecaster

Logistic model, 9 zone-level features, trained on simulated seeds 1–100 and tested on **held-out
seeds 101–200** (3 settings × 3 scenarios × wear 0.6 / 0.8 / 1.0; 504,118 zone-days).
Question: *will this zone reach ALERT within 3 days?* Source:
[`web/public/data/forecast_eval.json`](web/public/data/forecast_eval.json), produced by
[`web/scripts/train-forecast.ts`](web/scripts/train-forecast.ts).

| Held-out test | AI forecaster | Without AI |
|---|---|---|
| AUROC | **0.949** | 0.918 (cluster p-value alone) |
| F1 | **0.487** | 0.326 ("zone on watch" rule) |
| Recall | **0.625** | 0.317 |
| Warned before the alert | **87%** of outbreak zones, median **2 days** early | — |
| False warnings in calm runs | 0.073 per zone per 30 days | — |

By setting: village AUROC 0.948, city 0.957, society 0.938.
In plain words: about 4 in 10 high-risk warnings become an alert within 3 days; the rest cost one extra visit.

**Weak spot, published:** under a heatwave (never seen in training) AUROC drops to
0.822 with **1.824 false warnings per zone per 30 days**. Noisy sensors hold up (AUROC 0.948).
The label is the engine's own alert, so this forecasts *escalation*, not disease.

### Irregular-rhythm screening model

Trained on the public **MIT-BIH Atrial Fibrillation Database** (PhysioNet, 25 records, 77,794
windows of 30 beats), evaluated with 5-fold cross-validation **split by patient record**:

| AUROC | Sensitivity | Specificity |
|---|---|---|
| **0.989** ± 0.012 | 95.3% ± 3.3% | 95.6% ± 5.0% |

The band uses an optical pulse sensor, not ECG. **On-band validation is pending.** Source:
[`ml/out/metrics.json`](ml/out/metrics.json).

---

## 7. Feasibility

| Dimension | Status | Detail |
|---|---|---|
| **Technical** | **Built and tested** | Band firmware (ESP32, MAX30102, MPU6050, LM35, SX1278, NEO-6M), LoRa gateway, detection engine, rhythm model, escalation forecaster, operator console, field app and 6 API endpoints. 48 automated tests including Python ↔ TypeScript ↔ C model parity. |
| **Connectivity** | **Designed for no internet** | Bands → LoRa → gateway with store-and-forward. The console runs entirely in the browser after first load. Only the operator side needs a link, and only to sync. |
| **Operational** | **Fits existing work** | ASHAs already do home visits. AyuLink tells her *which* homes first. The visit form takes about 30 seconds and saves offline. Band charging and wear compliance are the main risks; ASHA visits double as a wear-and-charge nudge. |
| **Economic** | **Costing in progress** | Built from commodity modules (ESP32, MAX30102, MPU6050, SX1278). Per-band bill of materials: *TBD — being costed from our purchase records.* One gateway serves a cluster of hamlets; the software runs on free tiers. |
| **Regulatory & ethical** | **Screening, not diagnosis** | No disease names, no treatment advice, aggregate-only urban view, small zones suppressed, pseudonymous codes only. A real deployment needs consent, data-protection compliance (Digital Personal Data Protection Act, 2023) and an ethics review. |
| **Who would run it** | **Existing system** | Complements IDSP/IHIP; it does not replace them. Integration with ABDM / IHIP is future work. **No government partnership is claimed.** |

---

## 8. Use cases: who, where, when — around Hyderabad

**The demo is set in the Hyderabad region** so judges can recognise the places. Names of real towns
are used only to orient the map; every wearer and every outbreak in the console is **simulated**.

| Console setting | Where on the map | Who wears what | Why this setting matters |
|---|---|---|---|
| **Village** | 6 fictional hamlets in rural Rangareddy, near Chevella | AyuLink bands, LoRa gateway, no internet | Hamlets far from a PHC where fevers are noticed last |
| **City** | 8 real towns around Hyderabad: Patancheru, Kukatpally, Medchal, Secunderabad, Gachibowli, Shamshabad, LB Nagar, Uppal | Half AyuLink bands, half existing smartwatches | One console for a whole metro; see which town lights up first |
| **Society** | 6 apartment towers in the Financial District | Existing smartwatches only, aggregate view | Gated communities and campuses with many wearables already |

Switch between them with the **Village · City · Society** buttons (keys 1, 2, 3). The map can show
**street, terrain, satellite, light or dark** base maps, and you can drag and scroll freely.

**Who uses it**

| User | Uses AyuLink to… | Gets |
|---|---|---|
| ASHA / ANM | follow her own ranked visit list, read a Telugu/Hindi note, record a 30-second visit offline | which house to visit first, today |
| PHC medical officer | watch all hamlets on one console, print a situation report | a cluster flagged days before the clinic queue fills |
| District surveillance officer | watch many PHCs on the surveillance grid | where to send rapid-response teams and test kits |
| Urban ward / housing-society health desk | read existing smartwatches, aggregate view only | early fever clusters in colonies and towers |

**Where it fits**

- **Villages under a PHC** — e.g. Rangareddy, Vikarabad, Sangareddy, Medak around Hyderabad; the core pilot setting.
- **Tribal and forest belts** — Mulugu, Bhadradri Kothagudem, Adilabad: scattered hamlets, weak signal, long walks to a PHC.
- **Cities and their edges** — Hyderabad's fast-growing towns (Patancheru, Medchal, Shamshabad) where new colonies outgrow clinics.
- **Mass gatherings** — e.g. Telangana's Medaram Maha Jatara drew a cumulative **1.6 crore+**
  visitors over four days in 2026 [ref 10]. Temporary camps need fast fever signals.
- **Flood and relief camps**, **residential schools and hostels**, **migrant labour camps**.

**When it matters most**

| Months | Season | Why AyuLink helps |
|---|---|---|
| Jan – Feb | Festivals, winter fevers | Crowded short windows; fast cluster signal |
| Mar – May | Heat season | Region-wide guard separates heat from local outbreaks |
| Jun – Sep | **Monsoon** | Main season for febrile clusters |
| Oct – Nov | **Post-monsoon** | Mosquito-borne fevers often peak after the rains |
| Dec | Quiet | Personal baselines settle before the next season |

More on the [Impact page](https://ayulink-radar.vercel.app/impact).

---

## 9. Scalability: from one PHC to all of India

India already has the people who would act on every alert: **10.4 lakh ASHA workers** [ref 9].
AyuLink adds a signal to their existing routine; it does not need a new workforce.

| Stage | Scope | What we learn |
|---|---|---|
| 1 · Pilot | 1 PHC · ~200 bands · 8 weeks | Real wear compliance, battery life, false-alert rate against the PHC fever register |
| 2 · Block | 5–10 PHCs | ASHA workflow at scale, gateway placement, training time |
| 3 · District | One district surveillance unit | Console beside existing reporting |
| 4 · State | Seasonal deployment in high-risk blocks | Bands move to where the season needs them |

**Why it scales cheaply**

- **Stateless engine.** The same TypeScript runs in a browser tab and in a serverless function.
  More districts means more bands and gateways, not more servers.
- **One engine, any density.** Village, city and society presets share the same code; only zone
  size and data source change.
- **Hardware-agnostic input.** Anything that produces a daily resting heart rate can feed the
  engine: our band, a smartwatch, a future ABDM-linked device.
- **Offline-first.** No dependency on rural mobile data.

> Pilot plan is **proposed, not started**. We have no partner yet.

### Business model

**Not another smartwatch — an early-warning service anyone can plug into.** Full page:
[/business](https://ayulink-radar.vercel.app/business).

| Who pays | Their problem | What they get | How they pay |
|---|---|---|---|
| **Public health (first customer)** — PHC, district, state | Outbreaks counted only after clinic visits | Zone alerts, 3-day forecast, ASHA visit lists | Annual district licence + hardware; CSR can fund bands |
| Families with an elder at home | "Is Amma okay?" | Fall alert, SOS location, gentle drift nudges | Band + monthly subscription |
| Employers (outdoor / shift workers) | Heat stress and illness spreading on sites | Site-level clusters, heat-strain signal | Per worker per month |
| Hospitals | Patients vanish after discharge until they're back in emergency | Rhythm and drift follow-up from home | Per-patient monitoring fee |
| Campuses, hostels, gated communities | One sick person becomes twenty | Block-level early warning on bands or smartwatches | Annual site licence |
| Camps and mass events | Crowds, no network, no history | Rent-a-kit live in a day | Per-event rental |

**Revenue:** recurring software subscription (core) · hardware near cost · bring-your-own-wearable
(software only) · API licences for wearable brands and insurers. **Pricing is set after the pilot** —
we'd rather publish real costs than guess.

**Market (sourced):** 114.2 M wearables shipped in India in 2025 (IDC, Mar 2026) · 149 M people aged
60+ in 2022, 347 M by 2050 (UNFPA & IIPS, India Ageing Report 2023) · 5.7% of people 60+ and 9.0% of
elderly women live alone (LASI Wave 1) · 10.4 lakh ASHAs [ref 9].

**Why it's hard to copy:** a population layer (not just a gadget) · works with no phone or internet ·
modular per person · explainable, no-diagnosis AI that's easier to trust and approve.

**Risks we're managing:** medical-device rules (stay screening-only; prepare for CDSCO before any
clinical claim) · wear compliance (measure in pilot; detector tolerates 60%) · privacy (codes not
names, GPS off by default, built with the DPDP Act, 2023 in mind) · heatwave false warnings (next model
update) · simulation ≠ reality (the pilot).

---

## 10. Hardware

Built by our team and bench-tested. Three wristbands and one gateway exist.

| | AyuLink wristband | AyuLink LoRa gateway |
|---|---|---|
| **Microcontroller** | ESP32 DevKit V1 | ESP32 DevKit |
| **Sensors** | MAX30102 optical pulse + SpO2 · MPU6050 motion (fall / tremor) · LM35 skin temperature · NEO-6M GPS | — |
| **Radio** | SX1278 LoRa uplink, 433.5 MHz · SF9 · 10 dBm, plus ESP-NOW (2.4 GHz) for short-range ACKs | SX1278 (Ra-02) LoRa receiver + ESP-NOW; drops duplicate copies |
| **Display** | SH1106 1.3" OLED: BPM, SpO2, skin temp, signal | OLED: link status, last packet, location |
| **Power** | Li-Po cell (3.7 V) with TP4056 USB-C charger | USB 5 V |
| **On-device logic** | Fall detection, tremor detection, SOS button, rhythm model as a C header (`firmware/rhythm_demo`) | Store-and-forward buffer, forwards JSON over USB / network |
| **Firmware** | [`firmware/ayulink_band/Wrist_Band`](firmware/ayulink_band/Wrist_Band) · [wiring guide](firmware/ayulink_band/Wrist_Band/WIRING.md) | [`firmware/ayulink_band/Gateway`](firmware/ayulink_band/Gateway) |

### Radio link, compliance and security (honest status)

| | Status |
|---|---|
| **Uplink** | Band → gateway over **LoRa** (SX1278, 433.5 MHz, SF9/125 kHz, 32-byte authenticated frame, ~247 ms on air). Routine vitals every 15 s, emergencies every 3 s and at once on any SOS / fall / cancel. Firmware written 12 Nov 2026; **bench range test pending**. Earlier prototype builds used only ESP-NOW. |
| **Short-range path** | ESP-NOW (2.4 GHz, licence-free) still carries gateway ACKs and notices to the band and a second copy of each frame when in range. The gateway keeps the first copy of each sequence number and drops the other. |
| **Indian radio rules** | Targets the 433.05–434.79 MHz exemption (G.S.R. 347(E), 2022): **10 mW e.r.p., 10% duty cycle**. Conducted power is set to 10 dBm (≈10 mW e.r.p. with the stock ≤2.15 dBi antenna). A token-bucket limiter keeps every rolling hour under **9.5%** on air (unit-tested). Field deployment still needs **WPC Equipment Type Approval**; the field version may move to 865–867 MHz for range. |
| **Integrity** | Every frame carries a 48-bit HMAC-SHA256 tag and a sequence number checked against a replay window. |
| **Confidentiality** | **Not yet.** Vitals are sent unencrypted over the air (pseudonymous device ID, no name). All prototype bands share one published placeholder key, so authentication is tested but not enforced. Planned: per-device keys and AES-CCM payload encryption. |
| **Location** | GPS fixes are sent when live. Without a fix, the configured home anchor is sent **only in SOS / fall frames**; routine vitals carry no location. |

Settings: [`firmware/ayulink_band/common/ayulink_lora.h`](firmware/ayulink_band/common/ayulink_lora.h).

**How we built it**

<table>
<tr>
<td width="40%" align="center"><img src="docs/images/readme/build-components.jpg" alt="All parts laid out: GPS, OLED, LoRa module, patch antenna, perfboard carrier with GPS and MPU6050, ESP32-WROOM-32 DevKit, 2000 mAh Li-Po" width="340"><br>Full parts set: ESP32-WROOM-32, NEO-6M GPS, MPU6050, Ra-02 LoRa, OLED, 3.7 V 2000 mAh Li-Po</td>
<td width="30%" align="center"><img src="docs/images/readme/build-modules.jpg" alt="NEO-6M GPS module above an Ra-02 SX1278 LoRa module" width="200"><br>NEO-6M GPS and Ra-02 SX1278 LoRa (433 MHz)</td>
<td width="30%" align="center"><img src="docs/images/readme/build-perfboard.jpg" alt="Perfboard carrier with female headers for the ESP32" width="220"><br>Hand-soldered perfboard carrier for the ESP32</td>
</tr>
</table>

> Readings on the photos are bench readings, not clinical measurements. On-wrist validation is
> pending.

### Product tour

| | |
|---|---|
| ![Console, dark theme](docs/images/readme/console-dark.webp) | **Surveillance console** — radar map (street, terrain, satellite, light, dark), surveillance grid (every zone × every day), drift curve, LoRa network status, alerts with plain-language explanations, ranked visit list with case actions, Stress Lab, situation report. |
| ![Ask AyuLink assistant answering a brief and a forecast question](docs/images/readme/assistant-light.webp) | **Ask AyuLink** — the operator just asks: "brief me", "which zone will flare up next?", "who first?". Grounded in console data, voice in and out, works offline, refuses diagnosis. |
| ![AI forecast tab ranking zones by 3-day escalation risk](docs/images/readme/forecast-panel.webp) | **AI forecast** — every zone ranked by its chance of reaching alert in 3 days, with the reasons and the held-out accuracy right there. |
| ![Band configurator](docs/images/readme/configure-light.webp) | **Band configurator** — pick a profile or switch modules per person; see the AI features, battery load, privacy and the over-the-air packet; export JSON or a firmware header. |
| ![The AI inside page](docs/images/readme/ai-page-light.webp) | **The AI inside** — 8 AI pieces from band to visit list, the forecaster's model card and its weak spots. |
| ![Business page](docs/images/readme/business-light.webp) | **Business** — market (sourced), six customer segments, revenue, competition, go-to-market and risks. |
| ![Field app](docs/images/readme/field.webp) | **Field app** — what the ASHA sees: her list, a note in Telugu / Hindi / English, a 30-second visit form, offline save and sync. |
| ![Impact page](docs/images/readme/impact.webp) | **Impact** — who uses it, where, when, and how it scales. |

**Also included**

- **Rhythm Lab** — run the rhythm model in the browser on held-out ECG-derived samples, see the
  features that drove the score, then reveal the true label.
- **Hardware** — the real band and gateway, wiring, what runs where.
- **Method** — every algorithm, the evaluation design and every limitation.
- **API** — `/api/engine`, `/api/forecast`, `/api/assistant`, `/api/rhythm`, `/api/triage`, `/api/ingest`.
- **Settings** — light / dark / system theme, high contrast, colour-blind-safe colours, reduce
  motion, base map, scroll-to-zoom, labels, default setting, playback speed, note language.
- **Accessibility** — keyboard shortcuts (Space, ←/→, 1/2/3, C, S, R, A assistant, F forecast, ?), screen-reader labels,
  read-aloud health-worker notes.

---

## 11. How this meets the judging criteria

| Criterion | Where to look |
|---|---|
| **Problem relevance (PS 01)** | Early detection → personal drift + cluster alert + rhythm screening. Accessible → offline LoRa, low-cost band, local-language notes, field app. |
| **Innovation & originality** | Population-level detection from cheap wearables at hamlet scale; one engine for village / city / society; one model in three runtimes. See [§4](#4-what-is-new--and-what-is-not). |
| **Technical implementation** | Real firmware + gateway, two trained models with held-out evaluation, a statistical engine, a modular band configurator, 6 APIs, 47 tests, CI, reproducible evaluation. |
| **AI / intelligence** | 8 AI pieces end to end: trained **3-day escalation forecaster** (AUROC 0.949, beats the non-AI baseline), trained rhythm classifier (AUROC 0.989 on held-out records), statistical cluster detection, grounded **Ask AyuLink** assistant (text + voice, offline), fact-locked multilingual notes. See [The AI inside](#the-ai-inside). |
| **Business viability** | Six customer segments, recurring revenue, sourced market size, GTM from one PHC pilot, risks and mitigations. See [Business model](#business-model). |
| **Real-world impact** | ASHA-first workflow, situation report for PHCs, seasonal and mass-gathering use cases, India-scale rollout path. |
| **Feasibility** | [§7](#7-feasibility): what is built, what is pending, what it costs, what it needs (≥ 60% daily wear). |
| **Scalability** | [§9](#9-scalability-from-one-phc-to-all-of-india): stateless engine, offline-first, hardware-agnostic. |
| **Honesty & rigour** | Simulated vs real always labelled; test seeds never used for tuning; failures published (low wear, noisy sensors, heatwave false alerts). |

---

## 12. Run it yourself and deploy

**Deploy your own copy in two minutes** (free Vercel account, no keys needed):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsiddharthathula%2Fayulink-radar&root-directory=web&project-name=ayulink-radar)

Or by hand: import the repository at [vercel.com/new](https://vercel.com/new), set **Root Directory
= `web`**, keep the defaults, press Deploy. Optional environment variables are listed in
[`web/.env.example`](web/.env.example); none are required.

**Run locally**

```bash
git clone https://github.com/siddharthathula/ayulink-radar.git
cd ayulink-radar/web
npm install
npm run dev          # http://localhost:3000
npm test             # 47 tests: engine, forecaster, assistant, configurator, rhythm parity, API
npm run lint         # 0 errors
npm run build        # production build
npm run eval:all     # one command: detection grid, calibration, forecaster (~11 minutes)
# or one at a time: npm run eval:detect | eval:calibrate | eval:forecast
```

**Try the API**

```bash
curl -s -X POST https://ayulink-radar.vercel.app/api/engine \
  -H 'Content-Type: application/json' \
  -d '{"mode":"village","scenario":"cluster","seed":2026,"wearRate":0.8}'
```

```bash
# AI: which zone is likely to reach alert in the next 3 days?
curl -s -X POST https://ayulink-radar.vercel.app/api/forecast \
  -H 'Content-Type: application/json' \
  -d '{"mode":"village","scenario":"cluster","seed":2026,"day":8}'
```

**Rhythm model** (Python 3.10+):

```bash
cd ml && pip install -r requirements.txt
python download_afdb.py && python train_rhythm.py && python export_model.py
```

**Repository map**

```
web/        Next.js app: console, field app, rhythm lab, impact, method, API routes
  lib/engine/   detection engine (simulate, baseline, cluster, quality, rhythm, queue)
  lib/ai/       forecaster model loader, Ask AyuLink assistant (rules + LLM guard)
  lib/config/   modular band catalog, profiles, AI-feature map, config export
  lib/api/      stateless API handlers
  scripts/      evaluate.ts, train-forecast.ts — produce web/public/data/*.json
  tests/        engine, rhythm parity and API tests
ml/         rhythm model training, features, export (Python)
firmware/   ESP32 band, gateway, dispenser firmware; rhythm model as C header + demo sketch
docs/       method, architecture, images
```

**Stack:** Next.js · TypeScript · Tailwind CSS · Leaflet · Recharts · Vitest · Python (scikit-learn,
wfdb) · ESP32 (Arduino / PlatformIO) · LoRa SX1278. Maps (no key needed): OpenStreetMap, OpenTopoMap,
Esri World Imagery and Light/Dark Gray Canvas; CARTO only if you set `NEXT_PUBLIC_CARTO_KEY`. Live weather: Open-Meteo. Full list:
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

---

## 13. Limitations, privacy and safety

**Limitations**

- Population data in the demo is **simulated**. Three physical prototype bands exist.
- The **AI forecaster** is trained and tested on simulated data, forecasts escalation of the engine's
  own alert (not disease), and gives more false warnings in heatwaves.
- **ECG, GSR, phone link and battery gauge** modules are designed, not built. The configurator marks them *Planned*.
- Resting-heart-rate drift is **not disease-specific**. An alert means *possible febrile-illness
  cluster — send a health worker to check*. It never names a disease.
- The rhythm model is trained on **ECG-derived** intervals; the band uses an **optical** sensor.
  On-band validation is pending.
- Lead times depend on simulation assumptions, which are listed openly.
- Detection needs **≥ ~60% daily wear**; at 40% it fails.
- Heavy sensor noise and heatwaves degrade performance (see stress tests).
- Not a medical device. Not clinically validated.

**Privacy by design**

- Pseudonymous codes only; no names, phone numbers, addresses or photos of patients.
- Zones with fewer than 10 wearers never alert. Society mode shows aggregates only.
- Map dot positions are random and carry no address meaning.
- Case actions and settings are stored only in the browser that made them.
- The public demo transmits no personal health data.

---

## 14. Roadmap

- **Pilot** with one PHC: wear compliance, battery life, alerts vs the PHC fever register.
- **Heat-aware forecaster** — add temperature and weather features so heatwaves stop causing false warnings.
- **Build the planned modules** — ECG (AD8232), GSR, BLE phone link, battery gauge — and the v3 packet.
- **Family app** — elder-alone profile alerts the family's phone, not just the console.
- **Skin temperature** (the band already has an LM35) as a second signal alongside resting HR.
- **On-band rhythm validation** with paired ECG recordings.
- **Tremor screening** — the band firmware already includes a tremor detector.
- **865–867 MHz LoRa** for longer range, subject to Indian (WPC) rules.
- **Health-platform ingestion** (ABDM / IHIP) as future work, with the right approvals.

**Prior work disclosure:** the wristband hardware and an earlier dashboard were built by our team
before INNOVEX 2026. The detection engine, cluster radar, rhythm model, evaluation, console, field
app and API are new for this event.

---

## 15. References

1. Radin JM, Wineinger NE, Topol EJ, Steinhubl SR. *Harnessing wearable device data to improve state-level real-time surveillance of influenza-like illness in the USA.* Lancet Digital Health, 2020. https://doi.org/10.1016/S2589-7500(19)30222-5
2. Quer G, Radin JM, et al. *Wearable sensor data and self-reported symptoms for COVID-19 detection.* Nature Medicine, 2021. https://doi.org/10.1038/s41591-020-1123-x
3. Scripps Research DETECT study. https://detect.scripps.edu
4. Moody GB, Mark RG. MIT-BIH Atrial Fibrillation Database, PhysioNet. https://physionet.org/content/afdb/1.0.0/
5. Integrated Disease Surveillance Programme / IHIP, NCDC, MoHFW. https://idsp.mohfw.gov.in
6. Abdulkader RS (ICMR-NIE). *Challenges and opportunities for public health surveillance.* https://www.icts.res.in/sites/default/files/media/attachments/files/Challenges_opportunities_PHSurv_Rizwan_0.pdf
7. The South First. *Dengue paradox: Registrar General records more deaths than Health Ministry* (RGI MCCD 2024 vs NCVBDC). https://thesouthfirst.com/health/dengue-paradox-registrar-general-records-688-more-deaths-than-health-ministry/
8. Al Jazeera. *Why India's deadly dengue crisis is no longer confined to the monsoons*, 2026 (citing NCVBDC). https://www.aljazeera.com/news/2026/6/11/why-indias-deadly-dengue-crisis-is-now-no-longer-confined-to-the-monsoons
9. Government factsheet via NewKerala, Sep 2026: *Over 10.40 lakh ASHAs, 10.58 lakh Anganwadi workers.* https://www.newkerala.com/news/a/over-1040-lakh-ashas-1058-lakh-anganwadi-workers-427.htm
10. Deccan Chronicle. *Curtains go down at Medaram* (cumulative attendance 1.6 crore+, 2026). https://www.deccanchronicle.com/amp/southern-states/telangana/curtains-go-down-at-medaram-with-tribal-deities-retreating-into-forest-1934094

---

<div align="center">

Built by **Team AyuLink** for INNOVEX 2026 · MIT License

*Screening flag, not a diagnosis.*

</div>
