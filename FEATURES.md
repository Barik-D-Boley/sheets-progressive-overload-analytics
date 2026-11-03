# Progressive Overload Tracker 2.0 — Functional Requirements & Feature Specification

This document defines the technical requirements, feature breakdown, and execution checklist for **Progressive Overload 2.0**. It serves as the single source of truth for planning (Architect Mode) and implementation (Code Mode).

---

## Module 1: Legacy Data Migration & Normalization

### 1.1 Data Schema & Exercise Management
- [ ] **Master Exercise Binding:** Link exercise names globally to a single `Master Sheet` exercise registry so updating an exercise name updates all historical and future references automatically.
- [ ] **Sheet Origin Tracking:** Add a dedicated metadata column in the primary `Data` sheet identifying the source sheet/version of each imported record.
- [ ] **Exercise Name Cleaning:** Standardize naming conventions across legacy data:
  - [ ] Convert shorthand terms (e.g., prefix `PL` for Plate-Loaded exercises).
  - [ ] Standardize pluralization and casing across all movements (e.g., "Lat Pulldowns", "Bicep Curls").

### 1.2 Legacy Import Pipeline
- [ ] **Data Ingestion:** Build a Google Apps Script migration utility to ingest data from the original 1.0 spreadsheet format and map it cleanly into the normalized 2.0 schema.

---

## Module 2: Logging UI & Input Automation

### 2.1 Interactive Logging Form
- [ ] **Single Entry Sheet:** Create a dedicated input dashboard for workout logging featuring dynamic dropdown menus.
- [ ] **Automated Data Push & Reset:** Implement a backend Apps Script trigger to push validated workout entries to the main `Data` sheet and automatically reset the entry form for the next session.
- [ ] **Empty Entry Safeguard:** Automatically filter and discard blank rows or empty inputs during the data push execution.

### 2.2 Dynamic Exercise & Cardio Handling
- [ ] **Unlisted Exercise Prompt:** Trigger an interactive UI modal prompting the user to create and register a new exercise to the `Master Sheet` if an unrecognized movement is entered.
- [ ] **Cardio Selector:** Add preset cardio dropdown options (e.g., `20 min`, `30 min`) that automatically calculate and autofill daily cardio metrics.

### 2.3 Hidden Backend Architecture
- [ ] **Structure Masking:** Organize backend calculation sheets, normalized data tables, and aggregation matrices as hidden tabs to maintain a clean user interface.

---

## Module 3: Analytics, Visualizations & Progression Logic

### 3.1 Adaptive Progression Engines
- [ ] **Dynamic Rep Range Calculator:** Calculate target rep and weight progressions week-to-week based on customizable training modalities (Powerlifting, Bodybuilding, Custom).
- [ ] **Precision 1RM Formatting:** Format calculated 1-Rep Max (1RM) numbers to display to one decimal place when under 100 ($< 100$), and round to whole numbers when $\ge 100$.

### 3.2 Visual Analytics
- [ ] **Toggleable Performance Charting:** Create dynamic strength progression charts with UI toggles to switch between:
  - [ ] Absolute Raw Weight Lifted.
  - [ ] Bodyweight Ratio (Lifted Weight / Current Bodyweight).

---

## Module 4: Sheet Administration & UI Controls

### 4.1 Admin & Navigation Tools
- [ ] **Sheet Visibility Macro:** Add an interactive button on the Master Control Sheet that automatically hides inactive or temporary workspace tabs.

---

## Module 5: Habit Tracking, Prompts & Notifications

### 5.1 Weekly & Monthly Triggers
- [ ] **Weekly Bodyweight Prompt:** Trigger a once-weekly startup modal requesting a bodyweight update paired with key summary performance stats.
- [ ] **Monthly Milestone Celebration:** Implement an automated monthly popup highlighting the user's largest strength gain metric over the preceding 30 days.

### 5.2 Consistency Dashboards
- [ ] **Lifting Check-off Calendar:** Build a visual calendar grid tracking daily strength session completions.
- [ ] **Cardio Check-off Calendar:** Build a visual calendar grid tracking daily cardio session completions.

---

## Module 6: Release, Distribution & Branding

### 6.1 System Protection & Attribution
- [ ] **Immutable Metadata:** Protect application versioning, software name, and developer contact information against unauthorized user modification.

### 6.2 Documentation & User Onboarding
- [ ] **User Onboarding Guide:** Create a dedicated documentation sheet detailing:
  - Naming conventions (`PL`, pluralization).
  - Machine consistency guidelines (using identical equipment when possible).
  - Progressive overload principles and tracking best practices.
- [ ] **Competitive Value Proposition Sheet:** Detail the key advantages over subscription-based workout apps:
  - One-time ownership (no monthly subscriptions).
  - 100% data privacy and permanent ownership.
  - Zero loading lag, ads, or web sync dependencies.

### 6.3 Commercial Marketplace Readiness
- [ ] Package and format template files for commercial listing on digital spreadsheet marketplaces.