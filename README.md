# Progressive Overload Tracker 2.0

> **Status:** Active Development (Phase 1: Core Foundation & Data Architecture)

An automated, data-driven Google Sheets ecosystem powered by Google Apps Script for tracking strength training, automated 1RM analytics, custom workout log aggregation, and progressive overload tracking.

## Developer Setup & Clasp Workflow

This project uses Google's [clasp](https://github.com/google/clasp) (Command Line Apps Script Projects) tool to enable local development in VS Code with Git version control.

### 1. Local Configuration

To connect your local workspace to your Google Sheet's Apps Script backend, ensure your `.clasp.json` file in the root folder is configured as follows (this file is ignored by Git to keep your script ID private):

```json
{
  "scriptId": "YOUR_APPS_SCRIPT_ID_HERE",
  "rootDir": "./src"
  "scriptExtensions": [
    ".js",
    ".gs"
  ],
  "htmlExtensions": [
    ".html"
  ],
  "jsonExtensions": [
    ".json"
  ],
  "filePushOrder": [],
  "skipSubdirectories": false
}
```

### 2. Clasp Developer Commands

* **Live File Watching & Auto-Push:**
  Watch local files for edits and automatically push changes to Google Apps Script every time you save:
  ```bash
  clasp push --watch
  ```

* **Manual Code Push:**
  Push all local files from `./src` to Google Apps Script:
  ```bash
  clasp push
  ```

* **Force Pull Remote Code:**
  Pull code from Google Apps Script down to your local `./src` directory (overwriting local files):
  ```bash
  clasp pull --force
  ```

* **Check Synchronization Status:**
  View which local files differ from the remote Apps Script project:
  ```bash
  clasp status
  ```

* **Open Project in Web Editor:**
  Quickly launch the Google Apps Script web editor for this sheet in your default browser:
  ```bash
  clasp open
  ```

## Spreadsheet vs. Fitness Apps

* **One-Time Ownership:** No monthly subscription fees or locked feature paywalls.
* **Complete Data Ownership:** Raw, unfiltered access to all log data that you can export or modify anytime.
* **Zero Bloat:** Instant load times without advertisements, slow web requests, or unnecessary background syncs.
* **Custom Progression:** Tailored 1RM calculations, customizable exercise lists, and full visualization control.

## Product Roadmap & Development Strategy

The development process is structured into sequential phases to ensure a stable data foundation before expanding into automated UI controls, habit building, and distribution.

### Phase 1: Core Foundation & Data Architecture
*Focus: Establishing clean data structures, standardizing naming conventions, and migrating historical logs.*
* **Data Normalization:** Clean up legacy exercise names (e.g., standardizing `PL` for plate-loaded, enforcing plural conventions).
* **Master Schema Integration:** Bind exercise names globally to a Master Sheet so updates cascade automatically across all records.
* **Legacy Migration:** Format and import historical log data into the 2.0 schema, including sheet source tagging.

### Phase 2: Logging UI & Input Automation
*Focus: Eliminating manual copy-pasting with a streamlined, interactive logging form.*
* **Interactive Entry Interface:** Build a dedicated workout entry dashboard with dropdown exercise selection.
* **Automated Data Pipeline:** Develop backend scripts to validate entries, push workout logs to hidden background sheets, and reset the entry form.
* **Smart Safeguards:** Auto-filter blank/empty entries and add interactive prompts when logging new or unlisted exercises.
* **Cardio Integration:** Add pre-set cardio tracking modules (duration/intensity) that auto-fill daily summaries.

### Phase 3: Analytics, Progression Logic & UI Controls
*Focus: Turning raw logging data into actionable strength progression, visual trends, and clean navigation.*
* **Dynamic Progression Logic:** Implement target rep calculators tailored to different training modalities (e.g., Powerlifting vs. Bodybuilding rep ranges).
* **Advanced Charting:** Build toggleable strength visualizers (e.g., Raw Weight lifted vs. Bodyweight Ratio).
* **Precision Formatting:** Refine 1RM mathematical models and decimal precision rules for low-weight metrics (< 100 lbs/kg).
* **Sheet Navigation Controls:** Add administrative macro buttons on the Master sheet to toggle and clean up inactive workspace tabs.

### Phase 4: Habit Building, Popups & Engagement
*Focus: Keeping the user consistent through automated feedback loops and progress highlights.*
* **Weekly Health Sync:** Trigger weekly modal popups prompting bodyweight updates paired with key weekly stats.
* **Monthly Milestone Celebrations:** Automatically calculate and highlight top strength gains at the end of each month.
* **Consistency Dashboards:** Add visual check-off calendars for tracking lifting and cardio streaks.

### Phase 5: Advanced Analytics & Muscle Group Tracking
*Focus: Deep-dive biomechanical analytics for hyper-targeted muscle group programming.*
* **Muscle Mapping:** Map exercises to primary/secondary target muscles and track completed set volume.
* **Volume Dashboards:** Create popup summaries and visual gauges for total weekly sets per muscle group.

### Phase 6: Commercial Packaging, Branding & Marketplace Launch
*Focus: Preparing the spreadsheet project for public release and commercial distribution.*
* **Branding Protection:** Implement immutable metadata, versioning, and author attribution.
* **User Onboarding:** Create comprehensive guide tabs covering training philosophy, machine consistency, and naming conventions.
* **Marketplace Optimization:** Finalize comparative marketing copy highlighting the benefits over subscription apps and package for release on spreadsheet platforms.