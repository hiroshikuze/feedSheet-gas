# feedSheet-gas

Spreadsheet-driven RSS generator using Google Apps Script. Scrape web content via CSS selectors and serve as an API.

## Overview

**feedSheet-gas** is a Google Apps Script (GAS) application that generates RSS feeds from any web page. By defining scraping rules (CSS selectors) in a Google Sheet, you can turn website updates into an RSS feed, even if the site does not natively support RSS.

## Installation

1. **Create a Google Sheet**

   Create a new Google Spreadsheet to act as the configuration database.

1. **Open Script Editor**

   Click on `Extensions` > `Apps Script` in the spreadsheet menu.

1. **Deploy Code**

   Copy the content of `index.js` into the script editor.

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

## File Structure

```tree
/
├── .gitignore    # Files and directories to be ignored by Git
├── index.js      # The main Google Apps Script code
├── LICENSE       # License file
└── README.md     # This file
```

## Technologies

- **Google Apps Script (GAS)**: Serverless backend for fetching and parsing HTML.
- **Google Sheets**: Database for managing feed configurations.

## License

[This project is licensed under the MIT License.](./LICENSE)

## Author

[hiroshikuze](https://github.com/hiroshikuze)

## Disclaimer

Users are solely responsible for ensuring their use of this tool complies with the terms of service of target websites and applicable laws. This tool does not endorse scraping content in violation of copyright or website terms of service.

## 💖 Support my work

If you'd like to support my projects, please consider becoming a sponsor!

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-ea4aaa?style=for-the-badge&logo=github-sponsors)](https://github.com/sponsors/hiroshikuze) [![Amazon Wishlist](https://img.shields.io/badge/Amazon-Wishlist-orange?style=for-the-badge&logo=amazon)](https://www.amazon.jp/hz/wishlist/ls/5BAWD0LZ89V9?ref_=wl_share)
