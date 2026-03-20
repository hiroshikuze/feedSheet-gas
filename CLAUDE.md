# CLAUDE.md — feedSheet-gas

AI assistant guide for the **feedSheet-gas** codebase. Read this before making any changes.

---

## Project Overview

**feedSheet-gas** is a Google Apps Script (GAS) application that converts any website into an RSS feed. Scraping rules (CSS selectors) are stored in a Google Sheet ("取得元"). The app is deployed as a Web App endpoint that returns RSS 2.0 XML.

There is **no build system, no npm, no CI/CD**. The single source file `index.gs` is pasted directly into the Google Apps Script editor.

---

## Repository Structure

```text
/
├── index.gs          # Single-file GAS application (all logic here)
├── appscript.json    # GAS manifest: timezone, library deps, webapp config
├── .geminirules      # AI coding conventions (Japanese, not tracked in git)
├── .gitignore        # Excludes .clasp.json, IDE dirs, OS files
├── README.md         # User-facing documentation (English)
└── LICENSE           # MIT License
```

There is **no build step, no bundler, and no test framework**. The single `index.gs` is copied directly into the GAS script editor.

## Technology Stack

- **Runtime**: Google Apps Script (V8 engine) — deployed as a Web App
- **HTML Parsing**: Cheerio library (GAS library ID `1ReeQ6WO8kKNxoaA_O0XEQ589cIrRvEBA9qcWpNqdOP17i47u6N9M5Xh0`, version 16)
- **Configuration storage**: Google Sheets (sheet named `取得元`) + Script Properties
- **Output**: RSS 2.0 XML via `ContentService`
- **Logging**: Stackdriver (`Logger.log()`)

## Code Architecture (`index.gs`)

### Global State (module-level constants/variables)

| Symbol | Type | Purpose |
| :--- | :--- | :--- |
| `scriptProperties` | object | `PropertiesService.getScriptProperties()` — persists cache and config |
| `CACHE_PERIOD` | number | Cache retention days (from Script Property `CACHE_PERIOD`, default 7) |
| `NOW` | Date | Current timestamp, set once at module load |
| `CACHE` | array | Full parsed cache loaded from Script Property `CACHE_JSON` |
| `CACHE_ENTRY` | object | Cache slice for the current request's config `no` |

### Request Flow (`doGet` → …)

```text
doGet(e)
  ├─ getConfigByNo(no, code)   → reads row from "取得元" sheet
  ├─ initCache(no, isReset, isPreview, targetUrl)
  │    → loads CACHE from Script Properties
  │    → auto-resets value[] if stored targetUrl ≠ current targetUrl (config change detection)
  ├─ generateRssFeed(config, isPreview)
  │    ├─ UrlFetchApp.fetch(targetUrl)   → fetches HTML
  │    ├─ extractItems(html, config)     → Cheerio parsing, returns item array
  │    │    └─ parseByFormat(rawDate, dateFormat)  → custom date token parser
  │    ├─ cache comparison & update
  │    └─ saveCache()  (unless isPreview)
  └─ buildRssXml(config, items) → RSS 2.0 XML string
```

### URL Query Parameters

| Parameter | Values | Effect |
| :--- | :--- | :--- |
| `no` | integer | Select config row by No column (required if `code` absent) |
| `code` | string | Select config row by Code column (required if `no` absent) |
| `reset` | `1` | Clear cache for this config; all items treated as new |
| `preview` | `1` | Return feed without saving cache (safe for testing) |

### Utility Functions (run manually from GAS editor)

| Function | Purpose |
| :--- | :--- |
| `purgeOrphanCache()` | Removes `CACHE_JSON` entries whose `no` no longer exists in the sheet. Run after deleting a config row. |

### Google Sheet Schema (`取得元` sheet, row index 0 = header)

| Column index | Header | Config property | Description |
| :--- | :--- | :--- | :--- |
| 0 | No | `No` | Numeric identifier |
| 1 | Code | `Code` | Alphanumeric slug for URL |
| 2 | Target URL | `targetUrl` | URL to scrape |
| 3 | itemSelector | `itemSelector` | CSS selector for item containers |
| 4 | Title | `title` | CSS selector for item title |
| 5 | Url | `link` | CSS selector for `<a>` element (href extracted) |
| 6 | Description | `description` | CSS selector for description text |
| 7 | Date | `date` | CSS selector for date element |
| 8 | DateFormat | `dateFormat` | Token format string (see below) |
| 9 | RSS Title | `rssTitle` | RSS channel `<title>` |

### Date Format Token Syntax (`parseByFormat`)

Tokens are matched left-to-right, longest first:

| Token | Matches |
| :--- | :--- |
| `YYYY` | 4-digit year |
| `YY` | 2-digit year (adds 2000) |
| `MM` or `M` | Month (1–2 digits) |
| `DD` or `D` | Day (1–2 digits) |
| `hh` or `h` | Hour |
| `mm` or `m` | Minute |
| `ss` or `s` | Second |
| `(x)` | Skip arbitrary characters |

Example: `YYYY.MM.DD` parses `"2026.02.25"`.

### Cache Data Structure (stored in Script Property `CACHE_JSON`)

```json
[
  {
    "no": 1,
    "targetUrl": "https://example.com/",
    "value": [
      {
        "url": "https://example.com/article/1",
        "savedDate": "Wed, 25 Feb 2026 00:00:00 GMT",
        "lastSeen": "Wed, 25 Feb 2026 00:00:00 GMT"
      }
    ]
  }
]
```

- `targetUrl`: fingerprint for auto-reset detection. When the spreadsheet's `targetUrl` differs from this stored value, `initCache` automatically clears `value` (equivalent to `?reset=1`). Old cache entries without this field are treated as changed and reset on first access.
- Items older than `CACHE_PERIOD` days (measured by `lastSeen`) are purged on each request.

## Coding Conventions

All rules from `.geminirules` apply. Key points:

1. **`'use strict';`** at the top of every `.js` file.
2. **ES6+ only**: `const`/`let` (never `var`), arrow functions, destructuring, template literals.
3. **camelCase** for variables and functions; **UPPER_SNAKE_CASE** for module-level constants (`CACHE_PERIOD`, `NOW`, `CACHE`, `CACHE_ENTRY`).
4. **4-space indentation** (spaces, not tabs).
5. **JSDoc on every function**: include `@param` with type and `@return` with type.
6. **Japanese inline comments** for complex or non-obvious logic.
7. **No hardcoded secrets**: all credentials/config via `PropertiesService.getScriptProperties()`.
8. **Minimize Spreadsheet API calls**: fetch all data with `getDataRange().getValues()` once; do not call sheet methods in loops.
9. **`Logger.log()`** at meaningful points so execution flow can be traced in Stackdriver.
10. **XML safety**: always pass user-controlled strings through `escapeXml()` before embedding in XML output.

## GAS-Specific Constraints

- **Maximum execution time**: 6 minutes per invocation. Long-running operations must be designed with this limit in mind.
- **No `require`/`import`**: GAS does not support Node.js modules. All code lives in the global scope of a single file (or multiple files in the same project, all sharing one global scope).
- **No filesystem access**: use `UrlFetchApp` for HTTP, `SpreadsheetApp` for data, `PropertiesService` for persistence.
- **External libraries**: added via GAS Library mechanism in `appscript.json`, not npm.
- **`.clasp.json`** (contains the Script ID) is gitignored — never commit it.

## Deployment

1. Copy `index.gs` content into the GAS script editor (or push with `clasp push` if `.clasp.json` is configured locally).
2. `appscript.json` is the project manifest; ensure it is in the root of the GAS project.
3. Deploy via `Deploy > New deployment > Web app`:
   - Execute as: `Me` (USER_DEPLOYING)
   - Access: `Anyone` (ANYONE_ANONYMOUS)
4. The generated Web App URL is the RSS endpoint.

## Testing / Debugging

There is no automated test suite. Use these approaches:

- **`?preview=1`** — returns the feed without modifying the cache; safe for repeated calls during development.
- **`?reset=1`** — clears the cache for a config entry, forcing all items to be treated as new.
- **Stackdriver logs** — visible in the GAS editor under `View > Logs` or Google Cloud Console.
- **`Logger.log()`** — liberally used throughout `index.gs`; add more for new logic.

## Editing Guidelines for AI Assistants

- **Read `index.gs` fully before making any change** — all logic is in one file and functions are interdependent.
- **Do not introduce `var`**, Node.js APIs, or npm packages.
- **Do not remove `'use strict'`**.
- **Preserve JSDoc comments** on every function; update them when signatures change.
- **Do not hardcode URLs or credentials** in source; direct to Script Properties.
- **When adding a new sheet column**, update `getConfigByNo` column index mapping and the spreadsheet schema table in `README.md`.
- **When changing the cache structure**, update `initCache`, `saveCache`, `cacheMergeEntry`, and `generateRssFeed` consistently, and document the new shape in this file.
- **README.md is user-facing English documentation** — keep it in sync with any behavior changes.
- The `.geminirules` file contains the authoritative coding-style contract for this project; follow it even when working outside Gemini.

## Git Workflow

- Default branch: `master` / `main`
- Feature branches follow the pattern: `claude/<description>-<session-id>`
- Push with: `git push -u origin <branch-name>`
- Commit messages should be prefixed with `add:`, `fix:`, or `update:` (matching existing history style).
