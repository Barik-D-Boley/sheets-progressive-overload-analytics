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

### Progression Rules (approved)

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
- **Odd legacy cells** (confirmed conventions; the original text is kept in the record's Notes):
  - `(neg)` = negatives (lowered alone, assisted up): `295 for 5 (neg)` → `295x0 a5`.
  - `(?)` = unsure weight: the question mark is dropped (`85(?) for 10` → `85x10`).
  - Unknown reps (`for ?`, or plates with no `for`): that set is ignored; an entry with no usable sets is skipped.
  - Reversed numbers (`12 for -24`): swapped to `-24x12` since reps can't be negative.
  - Cardio split intervals: `10/2 min` + `7/9 speed` → 12 min at the time-weighted average speed; one time with `6/7 speed` → the plain average.
  - Timed holds (`315 for 26 sec`) stay flagged and are imported with the original text so they can be fixed in the quarter tab later.
- **Packed set cell format:** `<load>x<reps>[ a<assisted>][ p<partial>][ @<rir>][ @rpe<rpe>]`, e.g. `205x8 a1 p2 @2`. The unit is stored in its own column per row.
- **Popups:** desktop shows popups; on mobile, the weekly bodyweight prompt, monthly celebration, and new-exercise prompt appear as an input/banner area on `Workout Entry`.

### Exercise Naming Format (Round 4)

- **Format:** `<Movement> (<Equipment tag>[, <Detail>])`, e.g. `Bench press (BB)`, `Tricep pushdowns (Cable, Rope)`, `Decline press (PL)`, `Pull-ups (BW)`.
- **Movement** is sentence case: only the first word is capitalized, except proper nouns (`Romanian deadlifts (BB)`, `Bulgarian split squats (DB)`, `Nordic hamstring curls (BW)`). Names stay plural.
- **Equipment tags** (always present for lifts, even when obvious): Barbell `BB`, Dumbbell `DB`, Plate-loaded `PL`, Cable `Cable`, Machine `Machine`, Smith machine `Smith`, EZ bar `EZ`, Bodyweight `BW`.
  - Iso-lateral machines are `PL`, and "iso" is dropped from the name (`Bench press (PL)`, not `Iso-lateral bench press (PL)`).
  - Dips and pull-ups are `BW`; added weight (dip belt) is a positive load, and assistance is a negative load.
  - Hanging leg raises are `DB` when any set uses weight and `BW` when no set does. During migration this is the review tab's optional "Name If No Weight" column; on the entry form the BW version is chosen when all sets are logged at 0.
- **Details** (attachments, angles) follow the tag after a comma and are capitalized: `Pullovers (Cable, Bar)`, `Pec flys (Cable, Low-to-high)`.
- **Cardio** is a separate list on Master (not in the exercise list). Incline goes in parentheses: `Treadmill (15°)`.
- **New exercises** added from the entry form are formatted automatically: the user picks equipment from a dropdown and enters the movement, and the name is built from the format.
- **Configurable for buyers:** the template, separator, equipment tags, and proper nouns are settings (`NAMING_DEFAULTS` in `src/backend/naming.js`). Module 2 adds an editable equipment/tag table on Master that overrides the defaults. Existing exercises can be renamed in the registry at any time because records reference IDs.

### Workout Entry Form (Round 5)

- **One set per screen**, inputs top to bottom so Enter moves down: Weight, Reps, Assisted reps, Partial reps, RIR (dropdown: 0, 1-2, 3-4, 5+), Set notes. Weight accepts plate notation (`2*45+25`).
- **Header:** date fills in automatically, the user picks the gym, and picking a workout loads its routine starting at the first exercise. A **Log cardio** button sits at the top.
- **Shown per set:** Last (same gym first, then any gym), Goal (approved progression rules), and on set 1 the warm-up ladder for exercises with **Warm-up** checked.
- **Warm-up ladder:** plate jumps below the working weight (lb: 45, 95, 135, 185, 225, 275, 315 ...; kg: 20, 40, 60 ...), heaviest first, reps 1, 2, 4, 6, 8 ..., skipping any step within 10% of the working weight. 275 → 225×1, 185×2, 135×4, 95×6, 45×8. Only for exercises with Warm-up checked (by default: bench, incline bench, squats, deadlifts).
- **Next** validates the set and moves to the next set (the weight carries over). After the last set the exercise is written to its quarter tab and the next unfinished exercise loads. **Back** reopens earlier sets and exercises; saving again rewrites the same record.
- **Exercise dropdown:** the routine's exercises (✓ when saved), then every other active exercise, then **+ New exercise…**. Picking one jumps to it; picking one outside the routine adds it for today only. Routine templates are edited only on Master.
- **Setup notes** (e.g. seat and pin settings) are stored on the exercise and shown every time; editing them on the form saves them.
- **Set notes** are stored in the record's Notes column as `S1: paused | S3: spotter`; RIR is stored in the set cell (`@1-2`, `@5+`).
- **New exercise creator:** movement, equipment (from the Master tag table), optional detail, Warm-up checkbox, setup notes; the name is formatted automatically.
- **Hanging leg raises:** when every set is logged at 0, the record is saved under the `(BW)` version of the exercise if it exists.
- **Master additions:** exercise registry columns Warm-up, Setup Notes, Increment; registries at G (exercises), Q (workouts), T (gyms), W (cardio); Routines at AA (one row per workout, seeded from the last logged session); equipment tag table at AR; missing settings (Custom rep min/max, Target RIR, Load increment, Stall threshold) are appended under the existing settings in A:B.
- **Setup:** menu *Overload Tracker → Set up workout entry form*. The existing mockup tab is renamed "Workout Entry (old mockup)", not deleted.
- **Mobile limits:** a script cannot move the cursor or choose the keyboard on the Sheets app, so after Next the user taps the Weight box.

### Compiled Data View (Round 6)

- **Layout:** filters across row 1 (Time frame, Gym, Workout, Search, Clear button); status in row 2; headers in row 3: Quarter, Date, Gym, Workout, Exercise, Set 1-N, 1RM per set, Best 1RM, Notes. One row per exercise per day, newest first.
- **Sets** are shown readably (`225 × 6 · +1 assisted · RIR 1-2`); loads are converted to the Master unit for display only. Unparseable legacy cells are shown as `⚠ <original text>`.
- **1RM:** per set with the Master formula and display rounding; assisted and bodyweight-only sets show 0.
- **Time frames:** All time, This month, Last 3 months, This year, and each quarter tab.
- **Exercise panel** (right of the table) when the filtered rows contain one exercise: times done, best 1RM, last done, and strength gain in the time frame (best 1RM of the last session vs the first).
- **Refresh:** on Finish workout, on any filter change, from the menu (*Refresh compiled data*), and nightly around midnight via a time-driven trigger installed by *Set up compiled data*.
- **Read-only:** the data area is protected with a warning that points to the quarter tabs. The previous tab is renamed "Compiled Data (old mockup)", not deleted.

### Bodyweight Logging (Round 7)

- **Purpose:** relative strength only. Each lift uses the most recent weigh-in on or before its date; lifts before the first weigh-in have no ratio.
- **Logging:** a small "⚖ Log bodyweight" button below the message line on `Workout Entry` (any time), saved with the form's date to the hidden `Bodyweight Log`; Master "Current weight" shows the latest weigh-in. Older entries are never overwritten.
- **Stale prompt:** when a workout is started and the latest weigh-in is more than 30 days old (or there is none), the form shows "Last weigh-in: 170 lb, 34 days ago. Log today's weight?" with **Save** and **Not now (keep 170 lb)**. Not now keeps using the old weight and does not ask again for 7 days.
- **Apple Health (optional, iPhone):** *Overload Tracker → Advanced → Connect Apple Health* shows a private link and Shortcuts steps (a daily automation that sends the latest Health weight). Requires deploying the script as a web app (Execute as: Me, Access: Anyone); requests need a secret token, duplicates are ignored, and *Reset Apple Health link* revokes the old link. Deliberately kept out of the main setup so buyers do not think it is required.

### Strength Chart & Relative Strength (Round 8)

- **Where:** on `Compiled Data`, driven by the filters like the original sheet: when the filters (usually Search) match one exercise, a line chart appears under the exercise panel. No chart when several exercises match.
- **Lines:** a "Chart lines" dropdown (P1): **Best 1RM** (default: best estimated 1RM per session) or **Each set** (1RM per set: red, green, blue, yellow, ...). Y axis in the Master unit. Chart data lives in hidden helper columns (AD onward).
- **Gym:** the existing Gym filter (default All gyms) applies to the chart too.
- **Relative strength** is a statistic in the panel rather than a chart toggle: latest (last session's best 1RM ÷ the weigh-in in effect on that date, with the weigh-in shown) and best relative strength in the time frame. Sessions before the first weigh-in are counted as "Sessions without bodyweight"; no current weight is substituted.

### Entry Form Layout & Routines (Round 9)

- **Labels in column A, values/dropdowns in column B:** Date (B1), Gym (B2), Routine (B3), Exercise (B4, label shows "Exercise (2 of 6)"), then Setup, the set title, Last, Goal, Warm-up, inputs, and Back / Next / Finish.
- **Log cardio and Log bodyweight** buttons sit below the exercise inputs and buttons (rows 20-21).
- **Last** shows the date with the year: "Last · 11/14/26 BYUI".
- **Routines** on Master (AA): `Routine | Workout | Exercise 1..15`, e.g. "Push Day 1 | Push | Bench press (BB) | ...". The Routine dropdown lists routine names; records are saved under the routine's Workout so history and the Compiled Data workout filter stay grouped (Push/Pull/Legs). The older `Workout | Exercise...` layout is converted automatically by *Set up workout entry form*.
- The six routines from the old sheet (Push/Pull/Legs, Day 1 and Day 2) are the starting templates.

### Gym-Specific History (Round 10)

- **Last and Goal** use every gym's history for free weights (BB, DB, EZ, BW) and the current gym's history for Machine, Cable, PL, and Smith exercises, falling back to any gym when the exercise has never been done at the current gym.
- Each exercise has a **Same Gym Only** checkbox on Master (exercise list, column P), filled in from its equipment by *Set up workout entry form* and editable for exceptions. The default equipment list is `CONFIG.GYM_SPECIFIC_EQUIPMENT`.
- Possible later addition (not built): a Machines table and a Machine dropdown to tell apart several machines of the same type at one gym; it needs a Machine column in the quarter tabs.

### Implementation Notes (Module 1)

- **Registry locations on Master** (title row 1, headers row 2, data from row 3): Exercises at column G (with an Equipment column derived from the tag), Workouts at Q, Gyms at T, Cardio at W. These are configurable in `src/backend/config.js`.
- **Legacy layout:** blocks are detected per row because column positions shift around row 424. Anchors are a date (new session), the gym (row after the date, including a lone cell under the date), `date, gym` in one cell, or a session note such as `Deload`. Column X holds cardio calories; X1 holds a bodyweight (imported dated to the first legacy workout).
- **Date checks:** a session date in the future, or earlier than the previous date in the same block, is blocked until it is fixed in the legacy tab (currently `S239`: 8/27/27).
- **Workflow:** menu *Overload Tracker → Legacy migration*: 1) Build name review (`Migration Review` tab; approve or edit each legacy name), 2) Preview import (`Migration Preview` tab), 3) Run import.
- **Recovery:** every imported row stores its legacy cell in `Source`; re-running skips rows already present, so a partial failure is fixed by running the import again. A completed import is recorded and blocks further runs.
- The existing `Q4 2026 (hidden)` template tab is left untouched; quarter tabs are named `Q<n> <year>`.

### Decisions to Approve Before the Related Implementation

- **Progression recommendations:** Resolved — see "Progression Rules (approved)" above.
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
- [x] **Master Exercise Binding:** Maintain one exercise registry on `Master` with a stable unique exercise ID. Store the ID in workout records and resolve the current display name from the registry so renames update historical and future views without rewriting identity.
- [x] **Sheet Origin Tracking:** Add dedicated provenance fields to canonical quarter-log records identifying the source sheet/version of each imported record.
- [x] **Exercise Name Cleaning:** Standardize naming conventions across legacy data (see "Exercise Naming Format"):
  - [x] Equipment shorthand goes in a trailing tag, e.g. `(PL)` for plate-loaded; iso-lateral machines are `PL`.
  - [x] Plural movement names in sentence case (e.g. "Lat pulldowns (Cable)", "Bicep curls (DB)").
  - [ ] Review ambiguous names through an explicit legacy-name-to-exercise mapping (`Migration Review` tab); do not apply unsafe blanket pluralization or merge distinct exercises based only on similar text.

### 1.2 Legacy Import Pipeline
- [x] **Data Ingestion:** Build a Google Apps Script migration utility to preview and import the legacy `All Data - Unorganized` and other confirmed source ranges into the appropriate canonical quarter logs. Preserve existing quarter-tab data, including hidden tabs; detect overlaps before importing to avoid duplicate records.
- [x] **Migration Preview & Validation:** Show source rows, proposed exercise matches, parsed set values, row counts, and invalid/ambiguous rows before import; require confirmation and report any rows that need correction.
- [x] **One-Time Import Safety:** Preserve the original source tabs, do not silently discard malformed or unmatched records, and provide a clear completion summary. Record successful completion and block accidental duplicate imports; document recovery behavior if an import fails partway through.

---

## Module 2: Logging UI & Input Automation

### 2.1 Interactive Logging Form
- [x] **Single Entry Sheet:** Refine the existing `Workout Entry` tab into the dedicated logging dashboard, retaining its date, gym, workout, exercise-navigation, set, and notes controls while adding dynamic exercise dropdowns.
- [x] **Automated Data Push & Reset:** Implement a backend Apps Script action to append validated entries to the appropriate canonical quarter log and reset only the submitted input fields after a successful write.
- [x] **Empty Entry Safeguard:** Automatically filter and discard blank rows or empty inputs during the data push execution.
- [x] **Invalid Entry Feedback:** Report incomplete or invalid non-empty rows and preserve the form contents until the user fixes them; do not silently discard entered data.

### 2.2 Dynamic Exercise & Cardio Handling
- [x] **Unlisted Exercise Prompt:** Trigger an interactive UI modal prompting the user to create and register a new exercise in the `Master` registry if an unrecognized movement is entered.
- [x] **Cardio Selector:** Add preset cardio dropdown options (e.g., `20 min`, `30 min`) that log a cardio session for the selected date in the separate `Cardio` tab and update the corresponding daily cardio status.
- [x] **Bodyweight History:** Record each prompted or manual bodyweight update with its date; use that history for date-matched ratios and show the latest value in the Master profile.

### 2.3 Hidden Backend Architecture
- [x] **Canonical Quarter Logs:** Store raw workout records in quarter-specific tabs, with one row per exercise per date: date, gym ID, workout ID, exercise ID, load unit, one packed cell per set (load, reps, assisted reps, partial reps, RIR/RPE), notes, and source/provenance. Estimated 1RM is computed in `Compiled Data`. Preserve valid signed loads and fractional reps found in assisted exercises or the legacy data. New records are written to the quarter matching their workout date.
- [x] **Weekly Bodyweight Log:** Store dated bodyweight observations and their units in a history log; do not overwrite older entries when the current profile weight changes.
- [x] **Compiled Data View:** Build `Compiled Data` as a read-only consolidated presentation sourced from the canonical quarter logs, retaining its search, summary, and chart functionality. It must not write back or become a second source of truth.
- [x] **Unit-Safe Display:** Show the recorded value and unit in `Compiled Data`, or offer an explicitly view-only conversion to the current preferred unit. Never rewrite canonical quarter-log values when settings change.
- [ ] **Backend Organization:** Keep calculation ranges and supporting matrices hidden where appropriate, without hiding the user-facing `Workout Entry`, `Master`, `Compiled Data`, `Cardio`, or quarter-log tabs.

---

## Module 3: Analytics, Visualizations & Progression Logic

### 3.1 Adaptive Progression Engines
- [x] **Progression Rules Proposal:** Specify configurable inputs and propose target-rep, load-increase, and reset/stall rules for Powerlifting, Bodybuilding, and Custom modes; obtain approval of the rules before implementation.
- [x] **Dynamic Rep Range Calculator:** Once approved, calculate and display target reps and recommended loads week-to-week using the selected modality and user settings. Keep recommendations distinct from recorded workout results.
- [x] **Precision 1RM Formatting:** Format calculated 1-Rep Max (1RM) numbers to display to one decimal place when under 100 ($< 100$), and round to whole numbers when $\ge 100$.

### 3.2 Visual Analytics
- [x] **Toggleable Performance Charting:** (lines toggle Best 1RM / Each set; bodyweight ratio moved to the panel statistics) Create dynamic strength progression charts with UI toggles to switch between:
  - [x] Absolute Raw Weight Lifted (as estimated 1RM).
  - [x] Bodyweight Ratio: shown as panel statistics instead of a chart line.
  - [x] Use bodyweight recorded for the lift date, convert units consistently, and make missing bodyweight data visible rather than silently substituting a current value.

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
  - Naming conventions (`<Movement> (<Equipment tag>)`, equipment tags, pluralization).
  - Machine consistency guidelines (using identical equipment when possible).
  - Progressive overload principles and tracking best practices.
- [ ] **Competitive Value Proposition Sheet:** Compare the spreadsheet fairly with subscription-based workout apps. Substantiate claims such as pricing model, exportability/data control, and lightweight workflow; disclose Google Sheets/account requirements and avoid guarantees of absolute privacy, permanent storage, or zero loading time.

### 7.3 Commercial Marketplace Readiness
- [ ] Package and format template files for commercial listing on digital spreadsheet marketplaces.
- [ ] Research target spreadsheet marketplaces and their current listing, delivery, and support requirements before publishing.