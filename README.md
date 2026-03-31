# feedSheet-gas

Spreadsheet-driven RSS generator using Google Apps Script. Scrape web content via CSS selectors and serve as an API.

## Overview

**feedSheet-gas** is a Google Apps Script (GAS) application that generates RSS feeds from any web page. By defining scraping rules (CSS selectors) in a Google Sheet, you can turn website updates into an RSS feed, even if the site does not natively support RSS.

> [!IMPORTANT]
> **This tool only works with static pages.**
> It works by downloading the HTML of a page directly, the same way a browser would when JavaScript is disabled.
> If a website loads its articles or news items dynamically using JavaScript (for example, content that appears after a brief loading spinner, or pages built with frameworks like React or Vue), those items will not be visible in the raw HTML that this tool downloads — and the feed will not work.
>
> **A quick way to check compatibility:** Right-click the target page in your browser and choose "View Page Source". If you can see the article titles and links in that source code, this tool should work. If the source mostly shows `<script>` tags with little readable content, the page is likely dynamic and not supported.

## Installation

1. **Create a Google Sheet**

   Create a new Google Spreadsheet to act as the configuration database.

1. **Open Script Editor**

   Click on `Extensions` > `Apps Script` in the spreadsheet menu.

1. **Deploy Code**

   Copy the content of `index.gs` into the script editor.

1. **Deploy as Web App**

   - Click `Deploy` > `New deployment`.
   - Select **Web app** as the type.
   - Set **Execute as** to `Me`.
   - Set **Who has access** to `Anyone` (or restrict as needed).
   - Copy the generated **Web App URL**.

## Usage

### 1. Configure the Spreadsheet

Set up the first row of your spreadsheet with the exact headers below. Each subsequent row represents a unique RSS feed configuration.

| Column Name | Description | Example |
| :--- | :--- | :--- |
| **Code** | Unique identifier used in the API URL. | `my-news-feed` |
| **Target URL** | The URL of the website to scrape. | `https://example.com/news` |
| **itemSelector** | CSS selector to identify the list of items. | `div.news-list > article` |
| **Title** | CSS selector for the item's title. | `h2.title` |
| **Url** | CSS selector for the item's link. | `a.permalink` |
| **Description** | CSS selector for the item's summary/description. | `p.excerpt` |
| **Date** | CSS selector for the item's date. | `span.date` |
| **DateFormat** | Format string to parse the date (e.g., YYYY/MM/DD). | `YYYY.MM.DD` |
| **RSS Title** | Title for the generated RSS feed (Reference). | `My Custom News Feed` |

### 2. Access the Feed

Construct the URL using your Web App URL and the `Code` defined in the spreadsheet:

```url
https://script.google.com/macros/s/[YOUR_SCRIPT_ID]/exec?code=my-news-feed
```

Use this URL in your favorite RSS reader.

### 3. Modifying or Deleting a Feed Configuration

**Changing Target URL**: If you update the **Target URL** of an existing row, the cache is automatically reset on the next request. No manual action is needed — the old site's cached items will not appear in the new feed.

**Deleting a row**: When you delete a row from the spreadsheet, the cache for that feed remains in Script Properties. To clean it up, run `purgeOrphanCache()` once from the GAS script editor (`Run` > select function > `Run`).

## File Structure

```tree
/
├── .github/
│   └── workflows/
│       └── test.yml          # GitHub Actions: runs unit tests on push / PR
├── test/
│   ├── setup.js                       # Jest setup: GAS API mocks
│   ├── buildRssXml.test.js            # Unit tests for buildRssXml (RSS structure, escapeXml)
│   ├── cacheAlgorithm.test.js         # Unit tests for the core cache algorithm (processItems)
│   ├── initCacheFingerprint.test.js   # Unit tests for initCache targetUrl change detection
│   ├── parseByFormat.test.js          # Unit tests for parseByFormat, escapeXml, isValidUTCString
│   ├── purgeOrphanCache.test.js       # Unit tests for purgeOrphanCache
│   └── toAbsoluteUrl.test.js          # Unit tests for toAbsoluteUrl
├── .gitignore                # Files and directories to be ignored by Git
├── CLAUDE.md                 # AI assistant guide: architecture, conventions, algorithm notes
├── appscript.json            # GAS manifest: runtime, library dependencies, web app config
├── index.gs                  # The main Google Apps Script code
├── LICENSE                   # MIT License
├── package.json              # npm config for Jest (test only; no build system)
└── README.md                 # This file
```

## Technologies

- **Google Apps Script (GAS)**: Serverless backend for fetching and parsing HTML.
- **Google Sheets**: Database for managing feed configurations.
- **Cheerio (cheerio-gas)**: CSS-selector-based HTML parsing library for GAS.
- **Jest**: Unit test runner for the pure-function logic (CI only; not used in GAS runtime).

## Recommended Combination

Pair **feedSheet-gas** with **[Hiro2 Feed Picker](https://github.com/hiroshikuze/Hiro2-Feed-Picker)**
to build a fully automated news curation pipeline — no RSS support on the source site required.

| Step | Tool | Role |
| :---: | :--- | :--- |
| 1 | **feedSheet-gas** | Converts any website into an RSS feed via CSS selectors |
| 2 | **Hiro2 Feed Picker** | Filters articles by keyword, summarises with Gemini AI, and notifies via LINE |

Both tools run entirely on Google Apps Script and Google Sheets — no servers or paid hosting needed.

## License

[This project is licensed under the MIT License.](./LICENSE)

## Author

[hiroshikuze](https://github.com/hiroshikuze)

## Disclaimer

Users are solely responsible for ensuring their use of this tool complies with the terms of service of target websites and applicable laws. This tool does not endorse scraping content in violation of copyright or website terms of service.

## 💖 Support my work

If you'd like to support my projects, please star the repo or become a sponsor!

[![GitHub Stars](https://img.shields.io/github/stars/hiroshikuze/feedSheet-gas?style=for-the-badge&logo=github&color=yellow&label=%E2%AD%90%20Star%20this%20repo)](https://github.com/hiroshikuze/feedSheet-gas/stargazers)

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-ea4aaa?style=for-the-badge&logo=github-sponsors)](https://github.com/sponsors/hiroshikuze) [![Amazon Wishlist](https://img.shields.io/badge/Amazon-Wishlist-orange?style=for-the-badge&logo=amazon)](https://www.amazon.jp/hz/wishlist/ls/5BAWD0LZ89V9?ref_=wl_share)
