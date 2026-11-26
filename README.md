# Progressive Overload Tracker 2.0

> **Status:** Active Development (Phase 1: Core Foundation & Data Architecture)

An automated, data-driven Google Sheets ecosystem powered by Google Apps Script for tracking strength training, automated 1RM analytics, custom workout log aggregation, and progressive overload tracking.

## Developer Setup & Clasp Workflow

This project uses Google's [clasp](https://github.com/google/clasp) (Command Line Apps Script Projects) tool and Node.js to enable local development in VS Code with Git version control and full Google Apps Script TypeScript/IntelliSense autocompletion.

### 1. Dependency Installation

After cloning the repository, install all required developer dependencies (including `@google/clasp` and `@types/google-apps-script`) from `package.json` by running:

```bash
npm install
```

### 2. Local Configuration

To connect your local workspace to your Google Sheet's Apps Script backend, ensure your `.clasp.json` file in the root folder is configured as follows (this file is ignored by Git to keep your script ID private):

```json
{
  "scriptId": "YOUR_APPS_SCRIPT_ID_HERE",
  "rootDir": "./src",
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

### 3. Developer Commands & Workflows

You can run the core developer workflows using standard `npm` script shortcuts defined in `package.json`:

* **Live Watch & Auto-Push (Development Mode):**
  Actively monitors local files in `./src` and pushes changes to Google Apps Script in real-time on every save:
  ```bash
  npm start
  ```

* **Manual Code Push:**
  Push all local files from `./src` to Google Apps Script:
  ```bash
  npm run push
  ```

* **Safe Pull Remote Code:**
  Pull code from Google Apps Script down to your local `./src` directory without deleting untracked local files:
  ```bash
  npm run pull
  ```

* **Full Clean Pull (Deletes Local Obsolete Files):**
  Pull remote changes and force-delete local files that no longer exist on Google Apps Script:
  ```bash
  npm run pull:clean
  ```

* **Check Synchronization Status:**
  View which local files differ from the remote Apps Script project:
  ```bash
  npm run status
  ```

* **Open Project in Browser:**
  Quickly launch the Google Apps Script web editor for this sheet in your default browser:
  ```bash
  npm run open
  ```

## Versions & Updates

Each copy of the sheet knows its own version (`APP_VERSION` in `src/backend/version.js`). The latest released version is published as a `version.json` file in a **public GitHub gist** (the repo itself is private, so copies can't read from it). `VERSION_CHECK.URL` in `src/backend/version.js` points at that gist's raw link. A copy reads it (cached for 6 hours) and shows an **Update available** card at the top of the phone app's Settings. The sheet menu's **Overload Tracker → About / check for updates** does the same check on demand.

The first time a copy runs the check, Google asks the owner to allow the script to "connect to an external service". The check only downloads `version.json`. If it can't be read (offline, permission not yet granted), the app quietly shows no update.

[`version.json`](version.json) in this repo is the source of truth; the gist is just its public copy.

### Releasing a new version

1. Bump the version (`MAJOR.MINOR.PATCH`) in **all three** places: `APP_VERSION` in `src/backend/version.js`, `version` in `version.json`, and `version` in `package.json`. `npm test` fails if they disagree.
2. In `version.json`, set `released` to the release date and replace `notes` with a short list of what changed. Copies show these notes to their owners.
3. Merge to `main`.
4. Paste the new `version.json` into the gist (gist.github.com → the gist → Edit → Update). Existing copies see the update within about 6 hours.

Use the gist's raw link **without** a commit hash (`https://gist.githubusercontent.com/<user>/<gist id>/raw/version.json`), so it always serves the latest edit.

### Updating your copy

Update steps are listed here for each release that needs them. Your workout data stays in your own sheet.

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