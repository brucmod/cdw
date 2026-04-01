# CDW Org Directory

> A fast, filterable people directory for the CDW Sales organization — built with vanilla JS, zero dependencies, and designed around the **Everpure** color palette.

---

## Overview

The CDW Org Directory is a single-file web app (`index.html`) that loads org data from three JSON files and renders a fully interactive directory. It runs entirely in the browser — no server, no framework, no build step. Deploy it on GitHub Pages and anyone with the link can search and explore the org.

Three organizations are available from a single interface:

| Org | People | Map View |
|-----|--------|----------|
| **CDW** — Sales Organization | ~3,100 | ✓ |
| **DCS** — Hybrid Infrastructure | 184 | — |
| **Canada** | 260 | ✓ |

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | Complete app — all UI, logic, and styles in one file |
| `CDW_data_.json` | CDW Sales org records |
| `dcs_data.json` | DCS / Hybrid Infrastructure records |
| `canada_data.json` | Canada org records |
| `README.md` | This file |

> All four files must live in the **same folder** for the app to work. The JSON files are loaded via `fetch()` at runtime — opening `index.html` directly as a `file://` URL will fail due to browser CORS restrictions. Use a local web server or GitHub Pages.

---

## Hosting on GitHub Pages

1. Create a new GitHub repo (public, or private with Pages enabled on a paid plan)
2. Push all four files to the `main` branch
3. Go to **Settings → Pages → Source** → set branch to `main`, folder to `/ (root)`
4. Your site will be live at `https://<your-org>.github.io/<repo-name>/`

Changes to any file take effect within ~60 seconds of pushing.

---

## Views

Each org supports up to four views, toggled from the filter bar:

### Table
Sortable columns. Click any column header to sort ascending/descending. Click any row to open the full detail modal for that person.

### Cards
Visual grid with colored tags showing role, channel/solution area, tier, region, district, and home location. Hover reveals an email link.

### Groups
People grouped by their direct manager, with collapsible sections. Shows segment, location, and email for each person inline.

### Map *(CDW and Canada only)*
Interactive Leaflet map. Markers scale with headcount — the bigger the dot, the more people at that location. Virtual locations use dashed markers. Click any marker or location header in the side panel to drill in. CDW shows a "Top States" overlay; Canada shows a "By Province" breakdown.

---

## Filters

All filters are **bidirectional** — selecting one filter automatically narrows the options in every other filter to only show values that exist in the current result set. The search box also participates, so typing a name narrows the dropdowns too.

### CDW filters
| Filter | Field |
|--------|-------|
| Segment | Commercial / Government / Education |
| Channel | Corporate, Federal, K-12, Healthcare, State & Local, Financial Services, Higher Ed |
| Tier | Majors, Territory, Small Business, Federal, Enterprise, State & Local, K-12 |
| Region | East, West, Central, Acceleration, DOD, and more (37 regions) |
| District | 210 granular team groupings |
| Role | Account Manager, Field Sales, Sales Manager, Directors, VPs |
| Manager | Direct manager name |

### DCS filters
| Filter | Field |
|--------|-------|
| Manager | Direct manager (leadership excluded) |
| Segment | Commercial Majors, FSI, Healthcare, Education, Territory, AI, and more |
| Solution Area | Data Center Solutions, All Hybrid Infrastructure, All DI, Artificial Intelligence |

### Canada filters
| Filter | Field |
|--------|-------|
| Role | Account Manager, ATAE, Manager, FAE |
| Segment | Commercial East/West/Quebec, Enterprise, Small Business, Government, Education |
| Province | ON, BC, AB, QC, MB, NB |
| Manager | Direct manager |
| Sr Manager | Senior manager |

---

## Person Detail Modal

Click any row, card, or map pin to open the full detail view for that person. Fields shown include:

- Contact info (email, phone)
- Location and state/province
- Full title and role group
- Segment, channel, tier, region, area, district
- Tenure (length of service)
- Academy / Residency status *(CDW)*
- Home location, office location, states covered *(DCS)*
- Department, tenure *(Canada)*
- **Reporting chain** — manager and director with their titles and email links

---

## Splash Screen

On first load, a full-screen splash plays for approximately 3 seconds with a faked progress bar. The bar steps through six stages (`Connecting → Loading directory → Fetching people → Building index → Almost there → Ready`) before the app transitions in. If the data takes longer than 3 seconds to load (slow connection), the app waits for the data before dismissing the splash.

Switching between CDW, DCS, and Canada after the first load skips the splash entirely.

---

## Updating Data

Click **Update Data** in the top-right of the header to open the updater modal. Drag and drop — or click to browse for — a `.xlsx` or `.xls` export file.

### What the updater does

1. **Reads the spreadsheet** using SheetJS (loaded from CDN, no install needed)
2. **Normalises column headers** — maps common export header names (e.g. `CoworkerName`, `EmailAddress`, `CoworkerTitleGroupDescription`) to the app's field names automatically
3. **Merges** the new data with the existing records using **email address as the primary key**, falling back to name if email is blank
4. **Preserves existing fields** — any field that exists in the current record but is missing or blank in the new file is carried over. This means DCS-specific fields like `statesCovers`, `officeLocation`, and `coverageParsed` are never lost when a standard org export is loaded
5. **Shows a summary** — Updated count, New People count, Removed count, plus a preview table of up to 10 newly added people
6. **Applies live** — click Apply Update and the directory refreshes instantly in place. No page reload needed.

> The updater only affects the **current browser session**. To persist the update permanently, replace the corresponding JSON file in the GitHub repo and push.

### Column header mapping

The updater recognises these common export headers and maps them automatically:

| Export column | App field |
|---------------|-----------|
| `CoworkerName` | `name` |
| `EmailAddress` | `email` |
| `DirectPhone` | `phone` |
| `CoworkerLocationDescription` | `location` |
| `CoworkerTitleDescription` | `title` |
| `CoworkerTitleGroupDescription` | `titleGroup` |
| `LOSMonth` | `losMonths` |
| `LOSGroupDescription` | `losGroup` |
| `AcademyAMFlagDescription` | `academyFlag` |
| `ManagerTitle` | `managerTitle` |
| `ManagerEmail` | `managerEmail` |
| `Director Email` | `directorEmail` |
| `Director Title` | `directorTitle` |
| `SolutionArea` | `solutionArea` |
| `HomeLocation` | `homeLocation` |
| `StatesCovers` | `statesCovers` |
| `OfficeLocation` | `officeLocation` |
| `SrManager` | `srManager` |

Any column not in this list passes through using its original header name, so extra columns in the export are preserved automatically.

---

## Data Quality Notes

A few things worth knowing about the CDW dataset:

- **~3,100 real people** after removal of house accounts, test records, RPA bots, and placeholder entries (`Donotdelete Salestrainee`, `Houseacct *`, `Rpabot*`, etc.)
- **17 duplicate names** exist in the source data (e.g. three people named David Friedman). The modal lookup uses email as the key when available
- **Phone numbers** missing for ~15% of records
- **State** unresolvable for ~11% (virtual/remote workers without a state code)
- **LOS data** missing for ~19% of records

---

## Design

The app uses the **Everpure** color palette throughout:

| Name | Hex | Usage |
|------|-----|-------|
| Ash Gray | `#2D2A27` | CDW background, primary dark surface |
| Cloud White | `#FFF5E3` | Text |
| Stone Gray | `#D0C8BA` | Muted text, borders |
| Pure Orange | `#FF7023` | CDW accent, CTAs, active states |
| Walnut Brown | `#71584C` | Borders, structural elements |
| Basil Green | `#5A6359` | DCS accent |
| Clay Pink | `#95685D` | Canada accent |
| Moss Green | `#8FA596` | Success states, update button |
| Quartz Pink | `#DEA193` | Tier tags |
| Mint Green | `#C5E4CC` | Solution area tags |
| Rose Pink | `#F2CDC4` | Role/segment tags |
| Cinnamon Brown | `#BD673D` | Warning states |

Each org has its own background tint that activates when you switch:
- **CDW** → Ash Gray `#2D2A27`
- **DCS** → Basil-dark `#252B24`
- **Canada** → Clay-dark `#2B2220`

Typography uses **DM Serif Display** for headings and the logo, **DM Mono** for labels, badges, and code-like values, and **DM Sans** for all body text.

---

## Technical Notes

- **No framework or build step** — vanilla JS (ES5 compatible), single HTML file
- **External CDN libraries**: Leaflet 1.9.4 (map), SheetJS 0.18.5 (xlsx parsing), Google Fonts (DM Serif Display, DM Mono, DM Sans)
- **Must be served over HTTP** — `file://` access is blocked by browser CORS policy. Use GitHub Pages, a local server (`python -m http.server`), or VS Code Live Server
- **Bidirectional filters** work by re-evaluating available options on every filter change, excluding the changed filter itself from its own pool calculation
- **Map geocoding** is fully hardcoded — all 86 CDW locations and 12 Canada locations have embedded lat/lng coordinates. No geocoding API calls are made at runtime
- **Splash screen** uses a dual-gate pattern: the app only renders once *both* the data fetch *and* a 3.2-second fake timer have completed, whichever is last

---

## Local Development

```bash
# Python 3
python -m http.server 8000

# Node
npx serve .

# Then open
http://localhost:8000
```

---

*February 2026 · REV2*
