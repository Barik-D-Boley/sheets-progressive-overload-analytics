# Progressive Overload Tracker 2.0 — Functional Requirements & Feature Specification

This document defines the technical requirements, feature breakdown, and execution checklist for **Progressive Overload 2.0**. It serves as the single source of truth for planning (Architect Mode) and implementation (Code Mode).

---

## Confirmed Architecture & Existing Workbook

These decisions were confirmed before implementation planning:

- Quarter tabs are the canonical workout log and source of truth. They store the plain/raw records for each quarter and are the only place where those workout records are edited.
- `Compiled Data` is a read-only, user-facing consolidated view for browsing, searching, summaries, and charts. It must not be used as an editable duplicate or as the source from which quarter records are rewritten.
- Cardio is stored separately in a `Cardio` tab and linked to its selected workout date.
- The `Master` tab remains the home for user profile and configurable settings, including preferred weight units.
- Keep date-stamped bodyweight history so historical bodyweight ratios remain accurate; the current profile weight alone is not sufficient.
- Master selects the default input/display unit. A unit preference change affects future input and explicitly requested display conversions only; it never converts or rewrites canonical values in quarter logs. Store the unit with each logged load and bodyweight value so the original measurement remains unambiguous.
- Legacy migration is a one-time import, but must include a preview and validation step before writing records.
- Exercise references use stable IDs so renaming an exercise updates its displayed name without changing its historical identity.
- Include all requested features in this specification; prioritize migration and logging, and leave muscle-volume analytics and commercial release for later phases.

The supplied workbook currently contains `Workout Entry`, `Compiled Data`, `Master`, a hidden `Q4 2026` tab, and `All Data - Unorganized`. Its entry sheet already has workout date/gym/workout controls, three set columns, notes, and exercise-navigation controls. `Compiled Data` contains workout fields and per-set 1RM columns alongside search/summary content. Migration must inventory the actual populated cells and formulas in these tabs before finalizing field mappings; do not infer a complete schema from the visible headers alone. Preserve the existing quarter-tab raw-data purpose and use `Compiled Data` for the consolidated presentation.

### Confirmed Implementation Decisions (Round 2)

`FEATURES.md` is the single source of truth. `PLAN.md` is superseded and may be deleted.

**Set data**
- Each working set stores: load, load unit, reps, assisted reps, partial reps, and RIR/RPE. Warm-up sets are **not** stored.
- Warm-up guidance on `Workout Entry` is derived from the previous session of the same exercise (no warm-up data is logged).
- In quarter tabs, all of a set's data is packed into **one cell per set** (compact raw form). `Compiled Data` expands it into readable columns.
- The default is 3 working sets. The Master `Num of sets` setting controls how many set slots the form shows, which allows extra sets and drop sets.

**1RM**
- Default formula is Epley; Brzycki, Lombardi, Mayhew, O'Conner, Wathan, and Lander are selectable on Master.
- Reps above 12 are capped at 12 for the 1RM calculation (a 15-rep set is calculated as 12 reps). The logged reps are unchanged.
- Negative (assisted) loads produce an estimated 1RM of 0.

**Registries (all on Master, each with stable IDs)**
- Exercises, Workouts (Push/Pull/Legs/…), Gyms, and saved Routines (a routine = ordered list of exercises for a workout, savable from the sheet).

**Cardio**
- Cardio records store mainly distance and speed (with units), linked to the workout date, in the `Cardio` tab.

**Quarter tabs**
- Named `Q1 <year>` … `Q4 <year>`, covering calendar quarters (Q1 = Jan–Mar). They are hidden.
- A new quarter tab is created automatically when the first workout of that quarter is submitted.

**Migration**
- `All Data - Unorganized` is the only legacy source (its data matches the older "Progressive Overload Chart" workbook). It is imported once.
- Unparseable cells are flagged in the preview and left for manual correction later. They are never silently dropped.
- The user reviews and approves the legacy-name → exercise mapping (`migration/exercise-name-map.csv`) before import.

**Workout Entry (mobile-first)**
- Shows one exercise at a time. "Next" advances Set 1 → Set 2 → Set 3 → next exercise in the routine, Set 1, and so on.
- "Choose workout" loads a saved routine.
- "Previous date" and "Goal weight/reps" rows are filled from the logged history of the same exercise (last date it was done).
- Buttons are checkboxes styled to fill a gray cell (drawings with assigned scripts do not work in the Sheets mobile app). Checking a box runs the action and the script unchecks it.

**Compiled Data**
- Read-only, rebuilt from the hidden quarter tabs. Shows weights **converted to the Master preferred unit** (presentation only). Corrections are made in the quarter tabs, never in `Compiled Data`.

**Monthly gain**
- For each exercise: best estimated 1RM this calendar month vs. best estimated 1RM last calendar month. The largest percentage gain wins; ties break by the largest absolute gain, then by the exercise done most often this month. Exercises missing either month are excluded; if none qualify, no gain is shown.

### Draft Progression Rules (awaiting approval)

All modes share these settings on Master: rep range (min–max), load increment (default 5 lb / 2.5 kg; 10 lb / 5 kg for lower-body compounds), target RIR, and stall threshold (default 3 sessions).

- **Bodybuilding: double progression.** Rep range 8–12 at RIR 1–2.
  - When every working set reaches the top of the range at or above the target RIR, the next session's goal is +1 increment with reps reset to the bottom of the range.
  - Otherwise, keep the load and aim for +1 rep on the weakest set.
- **Powerlifting: percentage-based.** Rep range 3–6. The goal load is the Master "Strength goal" percentage (e.g. 85–93%) of the current best estimated 1RM, rounded to the increment.
  - When RIR comes in above the target, the next session's goal is +1 increment.
- **Custom:** the user sets the rep range, increment, and target RIR. It uses the double-progression logic.
- **Stall / reset (all modes):** if estimated 1RM does not improve for the stall threshold of consecutive sessions, recommend a 10% load reduction and rebuild. Deload-week frequency (Master) is surfaced in the weekly prompt.
- Recommendations are shown as "Goal" values on `Workout Entry` and are never written as recorded results.

### Confirmed Implementation Decisions (Round 3)

- **Plate notation** (`2*45+25`) is the number of plates loaded and is kept exactly as written in the set cell (`2*45+25x10`). Calculations use the evaluated total (115).
- **`+N` reps** in legacy data (`120 for 10+1`) are assisted reps.
- **Odd legacy cells** (`(neg)`, `(?)`, `for ?`, reversed `12 for -24`, timed `for 26 sec`, missing `for`) are flagged. They are imported with the original text kept in the set cell so they can be fixed in the quarter tab later.
- **Packed set cell format:** `<load>x<reps>[ a<assisted>][ p<partial>][ @<rir>][ @rpe<rpe>]`, e.g. `205x8 a1 p2 @2`. The unit is stored in its own column per row.
- **Popups:** desktop shows popups; on mobile, the weekly bodyweight prompt, monthly celebration, and new-exercise prompt appear as an input/banner area on `Workout Entry`.

### Implementation Notes (Module 1)

- **Registry locations on Master** (title row 1, headers row 2, data from row 3): Exercises at column G, Workouts at N, Gyms at Q. These are configurable in `src/backend/config.js`.
- **Legacy layout:** blocks are detected per row because column positions shift around row 424. Anchors are a date (new session), the gym (row after the date, including a lone cell under the date), `date, gym` in one cell, or a session note such as `Deload`. Column X holds cardio calories; X1 holds a bodyweight (imported dated to the first legacy workout).
- **Date checks:** a session date in the future, or earlier than the previous date in the same block, is blocked until it is fixed in the legacy tab (currently `S239`: 8/27/27).
- **Workflow:** menu *Overload Tracker → Legacy migration*: 1) Build name review (`Migration Review` tab; approve or edit each legacy name), 2) Preview import (`Migration Preview` tab), 3) Run import.
- **Recovery:** every imported row stores its legacy cell in `Source`; re-running skips rows already present, so a partial failure is fixed by running the import again. A completed import is recorded and blocks further runs.
- The existing `Q4 2026 (hidden)` template tab is left untouched; quarter tabs are named `Q<n> <year>`.

### Decisions to Approve Before the Related Implementation

- **Progression recommendations:** See "Draft Progression Rules" above; approve or adjust before implementation.
- **Display conversion:** Resolved — `Compiled Data` converts to the Master preferred unit (view-only).
- **Monthly strength gain:** Resolved — see "Monthly gain" above.

### Cross-Feature Acceptance Criteria

- A successful exercise rename changes the displayed name in historical quarter logs, `Compiled Data`, and charts without changing the exercise ID or set records.
- `Compiled Data` reflects canonical quarter-log changes and cannot be edited to create or alter workout records.
- A migration preview reports imported, skipped, invalid, and ambiguous rows; invalid or ambiguous data is not silently lost, and a completed one-time import cannot be accidentally duplicated.
- Submitting a workout stores each valid set once; blank rows are ignored, invalid non-empty rows are reported, and the form is not cleared after a failed write.
- Changing the preferred unit does not alter any canonical value or unit recorded in a quarter log; any converted values in `Compiled Data` are presentation-only.
- A bodyweight-ratio chart uses the bodyweight value recorded for each lift date and clearly identifies dates without a matching value.
- Weekly and monthly prompts follow their stated cadence and do not display fabricated statistics when there is insufficient data.

---

## Module 1: Legacy Data Migration & Normalization

### 1.1 Data Schema & Exercise Management
- [ ] **Master Exercise Binding:** Maintain one exercise registry on `Master` with a stable unique exercise ID. Store the ID in workout records and resolve the current display name from the registry so renames update historical and future views without rewriting identity.
- [x] **Sheet Origin Tracking:** Add dedicated provenance fields to canonical quarter-log records identifying the source sheet/version of each imported record.
- [ ] **Exercise Name Cleaning:** Standardize naming conventions across legacy data:
  - [ ] Convert shorthand terms (e.g., prefix `PL` for Plate-Loaded exercises).
  - [ ] Standardize pluralization and casing across all movements (e.g., "Lat Pulldowns", "Bicep Curls").
  - [ ] Review ambiguous names through an explicit legacy-name-to-exercise mapping; do not apply unsafe blanket pluralization or merge distinct exercises based only on similar text.

### 1.2 Legacy Import Pipeline
- [x] **Data Ingestion:** Build a Google Apps Script migration utility to preview and import the legacy `All Data - Unorganized` and other confirmed source ranges into the appropriate canonical quarter logs. Preserve existing quarter-tab data, including hidden tabs; detect overlaps before importing to avoid duplicate records.
- [x] **Migration Preview & Validation:** Show source rows, proposed exercise matches, parsed set values, row counts, and invalid/ambiguous rows before import; require confirmation and report any rows that need correction.
- [x] **One-Time Import Safety:** Preserve the original source tabs, do not silently discard malformed or unmatched records, and provide a clear completion summary. Record successful completion and block accidental duplicate imports; document recovery behavior if an import fails partway through.

---

## Module 2: Logging UI & Input Automation

### 2.1 Interactive Logging Form
- [ ] **Single Entry Sheet:** Refine the existing `Workout Entry` tab into the dedicated logging dashboard, retaining its date, gym, workout, exercise-navigation, set, and notes controls while adding dynamic exercise dropdowns.
- [ ] **Automated Data Push & Reset:** Implement a backend Apps Script action to append validated entries to the appropriate canonical quarter log and reset only the submitted input fields after a successful write.
- [ ] **Empty Entry Safeguard:** Automatically filter and discard blank rows or empty inputs during the data push execution.
- [ ] **Invalid Entry Feedback:** Report incomplete or invalid non-empty rows and preserve the form contents until the user fixes them; do not silently discard entered data.

### 2.2 Dynamic Exercise & Cardio Handling
- [ ] **Unlisted Exercise Prompt:** Trigger an interactive UI modal prompting the user to create and register a new exercise in the `Master` registry if an unrecognized movement is entered.
- [ ] **Cardio Selector:** Add preset cardio dropdown options (e.g., `20 min`, `30 min`) that log a cardio session for the selected date in the separate `Cardio` tab and update the corresponding daily cardio status.
- [ ] **Bodyweight History:** Record each prompted or manual bodyweight update with its date; use that history for date-matched ratios and show the latest value in the Master profile.

### 2.3 Hidden Backend Architecture
- [ ] **Canonical Quarter Logs:** Store raw workout records in quarter-specific tabs, with one row per exercise per date: date, gym ID, workout ID, exercise ID, load unit, one packed cell per set (load, reps, assisted reps, partial reps, RIR/RPE), notes, and source/provenance. Estimated 1RM is computed in `Compiled Data`. Preserve valid signed loads and fractional reps found in assisted exercises or the legacy data. New records are written to the quarter matching their workout date.
- [ ] **Weekly Bodyweight Log:** Store dated bodyweight observations and their units in a history log; do not overwrite older entries when the current profile weight changes.
- [ ] **Compiled Data View:** Build `Compiled Data` as a read-only consolidated presentation sourced from the canonical quarter logs, retaining its search, summary, and chart functionality. It must not write back or become a second source of truth.
- [ ] **Unit-Safe Display:** Show the recorded value and unit in `Compiled Data`, or offer an explicitly view-only conversion to the current preferred unit. Never rewrite canonical quarter-log values when settings change.
- [ ] **Backend Organization:** Keep calculation ranges and supporting matrices hidden where appropriate, without hiding the user-facing `Workout Entry`, `Master`, `Compiled Data`, `Cardio`, or quarter-log tabs.

---

## Module 3: Analytics, Visualizations & Progression Logic

### 3.1 Adaptive Progression Engines
- [ ] **Progression Rules Proposal:** Specify configurable inputs and propose target-rep, load-increase, and reset/stall rules for Powerlifting, Bodybuilding, and Custom modes; obtain approval of the rules before implementation.
- [ ] **Dynamic Rep Range Calculator:** Once approved, calculate and display target reps and recommended loads week-to-week using the selected modality and user settings. Keep recommendations distinct from recorded workout results.
- [ ] **Precision 1RM Formatting:** Format calculated 1-Rep Max (1RM) numbers to display to one decimal place when under 100 ($< 100$), and round to whole numbers when $\ge 100$.

### 3.2 Visual Analytics
- [ ] **Toggleable Performance Charting:** Create dynamic strength progression charts with UI toggles to switch between:
  - [ ] Absolute Raw Weight Lifted.
  - [ ] Bodyweight Ratio (Lifted Weight / Current Bodyweight).
  - [ ] Use bodyweight recorded for the lift date, convert units consistently, and make missing bodyweight data visible rather than silently substituting a current value.

---

## Module 4: Sheet Administration & UI Controls

### 4.1 Admin & Navigation Tools
- [ ] **Sheet Visibility Macro:** Add an interactive button on `Master` that hides inactive or temporary workspace tabs, while never hiding required user-facing tabs or the active input/logging surface.

---

## Module 5: Habit Tracking, Prompts & Notifications

### 5.1 Weekly & Monthly Triggers
- [ ] **Weekly Bodyweight Prompt:** Trigger a once-weekly startup modal requesting a bodyweight update paired with a summary statistic (default: lifting workouts completed in the preceding seven days).
- [ ] **Weekly Prompt Cadence:** Show the prompt at most once per calendar week when the spreadsheet is opened; track completion and avoid repeating it on every edit.
- [ ] **Monthly Milestone Celebration:** Implement a popup highlighting the largest per-exercise estimated 1RM gain for the calendar month. Define the comparison window and tie-breaking rules before implementation.
- [ ] **Monthly Prompt Cadence:** Show the milestone at most once per month when the spreadsheet is opened; handle months with no comparable records without presenting a false gain.

### 5.2 Consistency Dashboards
- [ ] **Lifting Check-off Calendar:** Build a visual calendar grid tracking daily strength session completions.
- [ ] **Cardio Check-off Calendar:** Build a visual calendar grid tracking daily cardio session completions.

---

## Module 6: Future Muscle-Group Analytics

### 6.1 Exercise Muscle Mapping
- [ ] **Muscle Mapping:** Add primary and secondary muscle groups to each exercise in the master registry.
- [ ] **Set Volume Attribution:** Calculate weekly working sets per muscle from logged sets and exercise mappings. Document the counting rule so a set is not unintentionally double-counted across primary and secondary muscles.
- [ ] **Weekly Muscle Volume Popup:** Add a popup/dashboard summary showing weekly set volume per muscle group.

---

## Module 7: Release, Distribution & Branding

### 7.1 System Protection & Attribution
- [ ] **Immutable Metadata:** Protect application versioning, software name, and developer contact information against unauthorized user modification.
- [ ] **Protection Limits:** Treat protected ranges and sheets as safeguards against accidental edits, not tamper-proof controls; a copy owner can change protections and script code.

### 7.2 Documentation & User Onboarding
- [ ] **User Onboarding Guide:** Create a dedicated documentation sheet detailing:
  - Naming conventions (`PL`, pluralization).
  - Machine consistency guidelines (using identical equipment when possible).
  - Progressive overload principles and tracking best practices.
- [ ] **Competitive Value Proposition Sheet:** Compare the spreadsheet fairly with subscription-based workout apps. Substantiate claims such as pricing model, exportability/data control, and lightweight workflow; disclose Google Sheets/account requirements and avoid guarantees of absolute privacy, permanent storage, or zero loading time.

### 7.3 Commercial Marketplace Readiness
- [ ] Package and format template files for commercial listing on digital spreadsheet marketplaces.
- [ ] Research target spreadsheet marketplaces and their current listing, delivery, and support requirements before publishing.