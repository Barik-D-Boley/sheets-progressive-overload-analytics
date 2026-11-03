# Technical Implementation Plan: Module 1 & Module 2

## 1. Project Directory Structure (`./src`)

All Google Apps Script code files and the runtime manifest reside inside the `./src` folder to support `clasp` local synchronization.

```text
./src/
├── appsscript.json
├── backend/
│   ├── ExerciseManager.js
│   ├── Migration.js
│   ├── Logger.js
│   ├── CardioManager.js
│   └── UIController.js
└── ui/
    └── WorkoutEntryUI.html
```

* **`./src/appsscript.json`**: Google Apps Script runtime manifest configuring project permissions, timezone settings, and OAuth scopes.
* **`./src/backend/ExerciseManager.js`**: Core logic for master exercise binding, string normalization, casing standardization, and `PL` prefix enforcement.
* **`./src/backend/Migration.js`**: Batch ingestion utilities to convert v1.0 legacy spreadsheet logs into the 2.0 schema with metadata tagging.
* **`./src/backend/Logger.js`**: Pipeline for processing input entries, filtering blank rows, appending validated set records to the data log, and resetting the input form.
* **`./src/backend/CardioManager.js`**: Dedicated functions for logging cardio duration and intensity into daily summaries.
* **`./src/backend/UIController.js`**: Apps Script triggers (`onOpen`), dynamic menu bindings, and sheet UI initialization routines.

---

## 2. Data Schemas & Table Specifications

### A. Master Exercise Sheet (`Master_Exercises`)
Serves as the single global registry for exercise definitions to ensure updating a name automatically updates all linked references across the spreadsheet ecosystem.

| Column Index | Column Name | Data Type | Validation / Description |
| :--- | :--- | :--- | :--- |
| **A** | `Exercise_ID` | String | Unique Identifier (e.g., `EX-001`) |
| **B** | `Exercise_Name` | String | Standardized name (e.g., `PL Bench Press`, `Lat Pulldowns`) |
| **C** | `Category` | String | Dropdown (`Plate-Loaded`, `Barbell`, `Dumbbell`, `Cable`, `Machine`, `Bodyweight`) |
| **D** | `Primary_Muscle` | String | Primary targeted muscle group |
| **E** | `Secondary_Muscle` | String | Secondary targeted muscle group |
| **F** | `Is_Active` | Boolean | `TRUE` / `FALSE` (controls dropdown visibility) |

---

### B. Primary Data Log Sheet (`Data_Logs`)
Central historical repository storing all raw workout sets migrated from legacy sources or submitted via the logging UI.

| Column Index | Column Name | Data Type | Validation / Description |
| :--- | :--- | :--- | :--- |
| **A** | `Log_ID` | String | Unique set log ID (`LOG-YYYYMMDD-XXXX`) |
| **B** | `Date` | Date | `YYYY-MM-DD` timestamp |
| **C** | `Exercise_Name` | String | Foreign key reference bound to `Master_Exercises` |
| **D** | `Set_Number` | Integer | Sequential set number ($\ge 1$) |
| **E** | `Weight` | Numeric | Load lifted in lbs/kg |
| **F** | `Reps` | Integer | Completed reps ($\ge 1$) |
| **G** | `Estimated_1RM` | Numeric | Calculated $1\text{RM}$ metric |
| **H** | `Sheet_Origin` | String | Metadata identifying record source (e.g., `v1.0_Legacy`, `v2.0_UI`) |

---

### C. Logging Form Interface (`Workout_Entry`)
Interactive dashboard for logging live workouts with automated reset capabilities.

* **Header Controls (Cells B2:D3):** Workout Date (`B2`), Target Modality (`D2`), General Notes (`B3`).
* **Set Entry Table (Cells B6:F25):** 
  * Column B: `Exercise_Name` (Data validation dropdown linked to `Master_Exercises!B2:B`).
  * Column C: `Set_Number`
  * Column D: `Weight`
  * Column E: `Reps`
  * Column F: `Notes / RPE`
* **Cardio Module Block (Cells H6:J10):** Cardio Activity (`H`), Duration in minutes (`I`), Intensity rating (`J`).

---

## 3. Core Functions & Backend APIs

### `./src/backend/ExerciseManager.js`

* `normalizeExerciseName(rawName: string): string`
  * **Purpose:** Applies strict naming conventions to legacy and incoming exercise strings.
  * **Rules:**
    1. Trims leading/trailing whitespace and standardizes casing to Title Case.
    2. Enforces pluralization conventions on movements (e.g., converts "Lat Pulldown" $\rightarrow$ "Lat Pulldowns", "Bicep Curl" $\rightarrow$ "Bicep Curls").
    3. Replaces shorthand plate-loaded identifiers with standard `PL` prefixing (e.g., "Plate Loaded Row" $\rightarrow$ "PL Chest-Supported Row").

* `syncMasterExerciseRegistry(): void`
  * **Purpose:** Updates global named ranges and dynamic data validation rules across the spreadsheet when master exercise records change.

* `getActiveExerciseList(): string[]`
  * **Purpose:** Batch-reads active exercises from `Master_Exercises` to populate dropdown list buffers efficiently using standard `SpreadsheetApp` data arrays.

---

### `./src/backend/Migration.js`

* `migrateLegacyData(): void`
  * **Purpose:** Ingests legacy v1.0 spreadsheet records, formats entries into the 2.0 normalized schema, appends origin metadata, and writes to `Data_Logs`.
  * **Optimization:** Performs a single batch read of the legacy sheet and a single batch append write to `Data_Logs` to minimize execution time.

* `transformLegacyRow(rawRow: any[], sheetSourceTag: string): any[] | null`
  * **Purpose:** Cleans exercise names via `normalizeExerciseName()`, maps set data to the 8-column 2.0 schema, and attaches `sheetSourceTag` (e.g., `"v1.0_Import"`).

---

### `./src/backend/Logger.js`

* `submitWorkoutLog(): void`
  * **Purpose:** Primary trigger function executed by UI button. Batch-reads inputs from `Workout_Entry`, filters out invalid or blank entries, appends valid rows to `Data_Logs` with origin tag `"v2.0_UI"`, and resets the form.

* `filterEmptyEntries(rawRows: any[][]): any[][]`
  * **Purpose:** Safeguard function that strips empty rows or sets lacking required weight/rep values prior to database insertion.

* `resetLoggingForm(): void`
  * **Purpose:** Clears input cells on `Workout_Entry` while preserving formulas and dynamic dropdown formatting to ready the sheet for the next session.

---

### `./src/backend/CardioManager.js`

* `logCardioSession(date: string, activity: string, durationMinutes: number, intensity: string): void`
  * **Purpose:** Processes pre-set cardio tracking inputs and appends session metrics to daily aggregates.

---

### `./src/backend/UIController.js`

* `onOpen(): void`
  * **Purpose:** Creates custom spreadsheet UI menu ("Progressive Overload 2.0") containing macro controls for manual migration, master synchronization, and form resetting.

* `bindExerciseDropdowns(): void`
  * **Purpose:** Connects exercise selection cells in `Workout_Entry` directly to the active range in `Master_Exercises`.

---

## 4. Execution Step-by-Step Task Checkboxes

### Module 1: Legacy Data Migration & Normalization
- [ ] **Data Schema & Master Sheet Setup**
  - [ ] Create `Master_Exercises` tab with standard columns (`Exercise_ID`, `Exercise_Name`, `Category`, `Primary_Muscle`, `Secondary_Muscle`, `Is_Active`).
  - [ ] Define global named range `MasterExerciseList` bound to `Master_Exercises!B2:B`.
  - [ ] Implement `syncMasterExerciseRegistry()` in `./src/backend/ExerciseManager.js`.
- [ ] **Exercise Name Cleaning Engine**
  - [ ] Implement `normalizeExerciseName()` in `./src/backend/ExerciseManager.js`.
  - [ ] Add regex pattern rules to convert shorthand plate-loaded titles to use the standard `PL` prefix.
  - [ ] Implement pluralization standardization rules across movement names.
- [ ] **Legacy Ingestion Pipeline**
  - [ ] Create `Data_Logs` destination tab matching the 8-column 2.0 schema.
  - [ ] Implement `migrateLegacyData()` in `./src/backend/Migration.js` using batch data arrays.
  - [ ] Add `Sheet_Origin` metadata column tagging to identify imported record versions.

### Module 2: Logging UI & Input Automation
- [ ] **Interactive Input Dashboard**
  - [ ] Build single-entry `Workout_Entry` tab layout with dedicated exercise and set input ranges.
  - [ ] Configure dynamic data validation dropdowns in `Workout_Entry` bound to `Master_Exercises`.
- [ ] **Automated Data Pipeline & Safeguards**
  - [ ] Implement `filterEmptyEntries()` in `./src/backend/Logger.js` to discard incomplete/blank input rows.
  - [ ] Implement `submitWorkoutLog()` in `./src/backend/Logger.js` to write validated entries to `Data_Logs`.
  - [ ] Attach `Sheet_Origin` tag `"v2.0_UI"` to all entries submitted through the entry form.
  - [ ] Implement `resetLoggingForm()` to clear inputs and prepare the form for subsequent workouts.
- [ ] **Cardio Tracking Module Integration**
  - [ ] Add dedicated Cardio input block (`Activity`, `Duration`, `Intensity`) to `Workout_Entry` sheet.
  - [ ] Implement `logCardioSession()` in `./src/backend/CardioManager.js` to auto-fill daily summary records.
- [ ] **Menu & Action Controls**
  - [ ] Implement `onOpen()` in `./src/backend/UIController.js` to add custom spreadsheet menu triggers.
  - [ ] Assign macro button controls on `Workout_Entry` sheet to invoke `submitWorkoutLog()`.