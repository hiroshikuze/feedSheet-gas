# CLAUDE.md — feedSheet-gas

AI assistant guide for the **feedSheet-gas** codebase. Read this before making any changes.

---

## Project Overview

**feedSheet-gas** is a Google Apps Script (GAS) application that converts any website into an RSS feed. Scraping rules (CSS selectors) are stored in a Google Sheet ("取得元"). The app is deployed as a Web App endpoint that returns RSS 2.0 XML.

There is **no build system, no npm, no CI/CD**. The single source file `index.js` is pasted directly into the Google Apps Script editor.

---

## Repository Structure

```
/
├── index.js          # Entire GAS application — only source file
├── appscript.json    # GAS manifest (runtime, library deps, web app config)
├── README.md         # End-user documentation (English)
├── .geminirules      # AI assistant coding conventions (not committed publicly)
├── .gitignore        # Excludes .clasp.json, IDE dirs, OS metadata
└── LICENSE           # MIT
```

`.clasp.json` is **gitignored** because it contains the sensitive `scriptId`. Never commit it.

---

## Architecture

### Data Flow

```
GET ?code=<code>  (or ?no=<n>)
        │
        ▼
   doGet(e)                    ← GAS Web App entry point
        │
        ▼
   getConfigByNo()             ← reads sheet "取得元", returns RssConfig
        │
        ▼
   initCache()                 ← loads CACHE_JSON from ScriptProperties
        │
        ▼
   generateRssFeed()
     ├─ UrlFetchApp.fetch()    ← HTTP GET to target website
     ├─ extractItems()         ← Cheerio CSS-selector parsing
     ├─ parseByFormat()        ← custom date token parser
     ├─ compare with cache     ← assign pubDate (parsed | cached | now)
     └─ saveCache()            ← persist updated CACHE_JSON
        │
        ▼
   buildRssXml()               ← RSS 2.0 XML string
        │
        ▼
   ContentService (RSS MIME type)
```

### Global State Variables

| Variable | Type | Purpose |
| :--- | :--- | :--- |
| `scriptProperties` | `PropertiesService` | Persistent key-value store for cache |
| `CACHE_PERIOD` | `number` | Cache retention days (default 7, configurable via Script Property `CACHE_PERIOD`) |
| `NOW` | `Date` | Current datetime, set once at script start |
| `CACHE` | `Array` | Full deserialized cache array from `CACHE_JSON` property |
| `CACHE_ENTRY` | `Object` | Slice of `CACHE` for the current feed `no` |

---

## Google Sheet Schema ("取得元")

Row 1 is a header row (skipped during lookup). Each data row is one feed configuration.

| Column Index | Column Name | Type | Description | Example |
| :---: | :--- | :--- | :--- | :--- |
| 0 | No | number | Internal numeric ID | `1` |
| 1 | Code | string | URL parameter identifier | `my-news-feed` |
| 2 | Target URL | string | Website to scrape | `https://example.com/news` |
| 3 | itemSelector | string | CSS selector for each list item | `div.news-list > article` |
| 4 | Title | string | CSS selector for item title | `h2.title` |
| 5 | Url | string | CSS selector for item `href` | `a.permalink` |
| 6 | Description | string | CSS selector for item summary | `p.excerpt` |
| 7 | Date | string | CSS selector for item date | `span.date` |
| 8 | DateFormat | string | Token format string (see below) | `YYYY.MM.DD` |
| 9 | RSS Title | string | Feed display name | `My Custom News Feed` |

A row is ignored if column 0 (No) is empty or null.

---

## URL Parameters

| Parameter | Values | Effect |
| :--- | :--- | :--- |
| `no` | integer | Select config by No column |
| `code` | string | Select config by Code column |
| `reset` | `1` | Wipe cache for this feed before running |
| `preview` | `1` | Run without reading or writing cache |

Either `no` or `code` is required. Omitting both returns an error response.

---

## Key Functions (index.js)

| Function | Lines | Purpose |
| :--- | :--- | :--- |
| `doGet(e)` | 39–81 | Web App entry point; orchestrates the full pipeline |
| `getConfigByNo(no, code)` | 131–165 | Reads sheet and returns an `RssConfig` object |
| `initCache(no, isReset, isPreview)` | 89–103 | Loads `CACHE_JSON` from ScriptProperties; filters expired entries |
| `saveCache()` | 108–111 | Serialises `CACHE` back to `CACHE_JSON` ScriptProperty |
| `cacheMergeEntry()` | 116–123 | Upserts `CACHE_ENTRY` back into `CACHE` |
| `generateRssFeed(config, isPreview)` | 173–229 | Fetches HTML, extracts items, assigns dates, updates cache |
| `extractItems(html, config)` | 237–283 | Cheerio-based extraction; resolves relative URLs |
| `buildRssXml(config, items)` | 291–317 | Produces an RSS 2.0 XML string |
| `createErrorResponse(msg)` | 324–327 | Returns plain-text error via ContentService |
| `escapeXml(unsafe)` | 334–341 | Escapes `<`, `>`, `&`, `'`, `"` for XML safety |
| `parseByFormat(str, format)` | 349–424 | Token-based date parser (see below) |

### `parseByFormat` Token Reference

Format strings are built from these tokens:

| Token | Matches | Note |
| :--- | :--- | :--- |
| `YYYY` | 4-digit year | |
| `YY` | 2-digit year | Assumes 2000+ |
| `MM` / `M` | Month (1–12) | |
| `DD` / `D` | Day (1–31) | |
| `hh` / `h` | Hour | |
| `mm` / `m` | Minute | |
| `ss` / `s` | Second | |
| `(…)` | Wildcard | Skips that segment entirely |

Missing components default to the current year, month 1, day 1, and 00:00:00.

---

## Caching Behaviour

- Cache is stored as JSON in the ScriptProperty `CACHE_JSON`.
- Structure: `[{ no, value: [{ url, savedDate, lastSeen }] }, …]`
- Entries older than `CACHE_PERIOD` days (based on `lastSeen`) are pruned in `initCache`.
- When an item has no parseable date, its `pubDate` is assigned from `savedDate` in cache (if valid UTC), or the current datetime.
- `preview=1` skips both reading and writing cache.
- `reset=1` starts with an empty `CACHE` for that feed, forcing all items to appear as new.

---

## Coding Conventions

Follow these rules when modifying `index.js`:

- **`'use strict';`** must remain at the top of the file.
- **ES6+** only: `const`/`let`, arrow functions, destructuring, template literals.
- **camelCase** for all variable and function names.
- **4-space indentation** (no tabs).
- **JSDoc** on every function with `@param` and `@return` types.
- **Japanese inline comments** for logic explanations (matches existing style).
- **`Logger.log()`** for all debug output — never `console.log`.
- **No hardcoded secrets** — use `PropertiesService.getScriptProperties()`.
- Minimise spreadsheet reads: fetch `getDataRange().getValues()` once and operate on the array.
- Keep the **6-minute GAS execution limit** in mind; avoid large loops or external calls inside loops.
- Errors must be caught and surfaced via `createErrorResponse()` so the caller sees a readable message.

---

## Library Dependency

| Symbol | Library | Version | ID |
| :--- | :--- | :--- | :--- |
| `Cheerio` | cheerio-gas | 16 | `1ReeQ6WO8kKNxoaA_O0XEQ589cIrRvEBA9qcWpNqdOP17i47u6N9M5Xh0` |

This must be added under **Resources → Libraries** in the Apps Script editor (it is declared in `appscript.json` but must also be manually linked in the editor for local testing).

---

## Deployment

There is no automated deployment pipeline. Manual steps:

1. Open the bound Google Sheet → Extensions → Apps Script.
2. Paste the contents of `index.js` into the editor.
3. Deploy → New deployment → Web app.
   - **Execute as**: Me (USER_DEPLOYING in `appscript.json`)
   - **Who has access**: Anyone (ANYONE_ANONYMOUS)
4. Copy the Web App URL.

To update an existing deployment, use **Deploy → Manage deployments → Edit** on the current deployment rather than creating a new one (preserves the URL).

---

## Testing / Debugging

There is no automated test suite. Use these built-in mechanisms:

| Technique | How |
| :--- | :--- |
| **Preview mode** | Append `?preview=1` to URL — runs full pipeline without touching cache |
| **Reset mode** | Append `?reset=1` to force all items treated as new |
| **Logger** | View execution logs in Apps Script editor → Executions |
| **Stackdriver** | Exception logs are routed to Cloud Logging (`exceptionLogging: STACKDRIVER`) |

When adding new logic, add `Logger.log()` calls with descriptive labels matching the existing numbered step pattern (`Logger.log("1")`, `Logger.log("2")` etc.).

---

## README Conventions

When updating `README.md`:

- Primary language: **English**.
- Section order: Overview → Installation → Usage → File Structure → Technologies → License → Author → Donation.
- File structure section uses `tree` format with `# inline description` after each filename.
- Use `|` tables for configuration columns.
- List items use `-` (not `*`).
- Keep the author attribution (`hiroshikuze`) and donation link intact.

---

## What NOT to Do

- Do not add a build system, bundler, or `package.json` — this project intentionally has none.
- Do not commit `.clasp.json` (contains sensitive `scriptId`).
- Do not use `console.log` — GAS uses `Logger.log`.
- Do not hardcode API keys or credentials.
- Do not rename the sheet `"取得元"` without updating the hardcoded reference in `getConfigByNo`.
- Do not exceed the 6-minute GAS execution limit with synchronous operations.
