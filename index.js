'use strict';

/**
 * RSS設定オブジェクトの型定義
 * @typedef {Object} RssConfig
 * @property {string} targetUrl - スクレイピング対象のURL
 * @property {string} regexTitleLink - タイトルとリンク抽出用の正規表現
 * @property {string} regexDesc - 説明文抽出用の正規表現
 * @property {string} regexDate - 日付抽出用の正規表現
 * @property {string} rssTitle - RSSフィード全体のタイトル
 */

/** {object} - スクリプトプロパティ */
const scriptProperties = PropertiesService.getScriptProperties();

/** {number} - キャッシュ：保存期間 */
const CACHE_PERIOD = Number(scriptProperties.getProperty("CACHE_PERIOD")) || 7; // 未指定なら7日

/** {object} - 現在時刻 */
const NOW = new Date();

/** {<array>} - キャッシュ */
let CACHE = [];

/** {no: number, value: <array>} - noにのみ該当するキャッシュを取り出したもの */
let CACHE_ENTRY = {};

/**
 * Web APIのエントリーポイント (GETリクエストを処理)：メインルーチン
 * 外部からアクセスされた際に自動的に呼び出されます。
 * URLパラメータ:
 * - no: 設定No (noかcode必須)
 * - code: 設定code (noかcode必須)
 * - reset: 1を指定するとキャッシュを削除して強制的に新着扱いにします
 * - preview: 1を指定するとキャッシュを保存せずに結果だけ返します
 * @param {GoogleAppsScript.Events.DoGet} e - GETリクエストのイベントオブジェクト
 * @return {GoogleAppsScript.Content.TextOutput} 生成されたRSS XML または エラーメッセージ
 */
const doGet = (e) => {
  // 各パラメータを取得
  let no = e.parameter.no;
  const code = e.parameter.code;
  const isReset = e.parameter.reset === '1';
  const isPreview = e.parameter.preview === '1';

  if (!no && !code) {
    return createErrorResponse('Error: Parameter "no" or "code" is required.');
  }

  try {
    // 1. スプレッドシートから設定を取得
    Logger.log("1");
    const config = getConfigByNo(no, code);
    if (!config) {
      return createErrorResponse(`Error: No configuration found for no="${no}" or code="${code}".`);
    }

    const temp_no = config.No;
    if(! temp_no) {
      return createErrorResponse(`Error: Configuration found but "No" column is empty.`);
    }
    no = temp_no;
    Logger.log(config);

    Logger.log("2");
    // 2. キャッシュ初期化
    initCache(no, isReset, isPreview);

    // 3. RSS生成
    Logger.log("3");
    const rssXml = generateRssFeed(config, isPreview);

    // 4. XMLとしてレスポンスを返す
    Logger.log("Finish");
    return ContentService.createTextOutput(rssXml)
      .setMimeType(ContentService.MimeType.RSS);

  } catch (err) {
    return createErrorResponse(`Error: ${err.toString()}`);
  }
};

/**
 * キャッシュ初期化
 * @param {number} no - 取得したい設定のNo
 * @param {boolean} isReset - キャッシュをリセットするか
 * @param {boolean} isPreview - キャッシュ保存をスキップするか
 */
const initCache = (no, isReset, isPreview) => {
  if (!isReset && !isPreview) {
    CACHE = JSON.parse(scriptProperties.getProperty("CACHE_JSON") || "[]");
  }

  // noに該当するキャッシュのみ取り出す
  CACHE_ENTRY = CACHE.find(c => c.no === no);
  if (!CACHE_ENTRY) CACHE_ENTRY = { no, value: [] };

  // 古いデータを削除
  CACHE_ENTRY.value = CACHE_ENTRY.value.filter(v => {
    const diffDays = (NOW - new Date(v.lastSeen)) / 1000 / 60 / 60 / 24;
    return diffDays <= CACHE_PERIOD;
  });
}

/**
 * キャッシュ保存
 */
const saveCache = () => {
  cacheMergeEntry(); // 既存 CACHE に更新反映
  scriptProperties.setProperty("CACHE_JSON", JSON.stringify(CACHE));
};

/**
 * CACHE_ENTRY を CACHE に戻す（上書き or 新規追加）
 */
const cacheMergeEntry = () => {
  const idx = CACHE.findIndex(c => c.no === CACHE_ENTRY.no);
  if (idx >= 0) {
    CACHE[idx] = CACHE_ENTRY;
  } else {
    CACHE.push(CACHE_ENTRY);
  }
};

/**
 * スプレッドシートから指定NoかCodeの設定行を読み込み、設定オブジェクトを返します。
 * @param {number} no - 取得したい設定のNo
 * @param {number} code - 取得したい設定のCode
 * @return {RssConfig|null} 設定オブジェクト。見つからない場合はnull
 */
const getConfigByNo = (no, code) => {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('取得元');

  if (!sheet) {
    throw new Error(`Sheet "取得元" not found.`);
  }

  const data = sheet.getDataRange().getValues(); // 全データを取得

  // 1行目はヘッダーなので2行目(インデックス1)から探索
  // A列(インデックス0)がNoと一致する行を探す
  const row = data.find(
    (r, i) => i > 0
    && (
      (no !== undefined && r[0].toString() === no.toString())
      || (code !== undefined && r[1].toString() === code)
    )
  );

  if (!row || row[0] === "" || row[0] === null) return null;

  return {
    No: row[0],                             // No
    Code: String(row[1].trim()),            // コード
    targetUrl: String(row[2].trim()),       // ターゲットURL
    itemSelector: String(row[3].trim()),    // item部分
    title: String(row[4].trim()),           // タイトル
    link: String(row[5].trim()),            // リンクURL
    description: String(row[6].trim()),     // 説明
    date: String(row[7].trim()),            // 日付
    dateFormat: String(row[8].trim()),      // 書式
    rssTitle: String(row[9].trim()) || 'Custom RSS Feed'  // タイトル
  };
};

/**
 * 指定された設定に基づいてHTMLを取得・解析し、RSS 2.0形式のXML文字列を生成します。
 * @param {RssConfig} config - RSS生成のための設定オブジェクト
 * @param {boolean} - isPreview キャッシュ保存をスキップするか
 * @return {string} 生成されたRSS XML文字列
 */
const generateRssFeed = (config, isPreview) => {
  const isValidUTCString = (str) => {
    if (typeof str !== 'string') return false;

    const utcPattern = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;    
    if (!utcPattern.test(str)) return false;

    const date = new Date(str);
    if (isNaN(date.getTime())) return false;

    return date.toUTCString() === str;
  };

  const html = UrlFetchApp.fetch(config.targetUrl).getContentText();

  // アイテム抽出
  const items = extractItems(html, config);

  // キャッシュと比較してRSSに載せる物をフィルタ
  const newItems = [];
  items.forEach(item => {
    const cacheItem = CACHE_ENTRY.value.find(v => v.url === item.url);
    const exists = !!cacheItem;
    const nowUTC = NOW.toUTCString();

    Logger.log(JSON.stringify(item));
    if(item.date) {
      Logger.log("dateをそのまま使う");
      newItems.push(item);
    } else {
      if(exists) {
        if(isValidUTCString(cacheItem.savedDate)) {
          Logger.log("cashを使う");
        } else {
          Logger.log(`${cacheItem.savedDate} 現在日付を使う`);
        }
        item.date = (isValidUTCString(cacheItem.savedDate)) ? cacheItem.savedDate : nowUTC;
        newItems.push(item);
        cacheItem.lastSeen = nowUTC;
      } else {
        Logger.log("キャッシュなし、現在日付を使う");
        item.date = nowUTC;
        newItems.push(item);
      }
    }
    if(!exists && !isPreview) {
      CACHE_ENTRY.value.push({
        url: item.url,
        savedDate: item.rawDate || nowUTC,
        lastSeen: nowUTC
      });
      saveCache();
    }
  });

  return buildRssXml(config, newItems);
};

/**
 * 正規表現を使ってHTMLテキストからRSSアイテム情報を抽出します。
 * @param {string} html - 解析対象のHTML文字列
 * @param {RssConfig} config - 正規表現を含む設定オブジェクト
 * @return {Array<{title: string, url: string, description: string, date: string, guid: string}>} 抽出されたアイテムの配列
 */
const extractItems = (html, config) => {
  let $ = Cheerio.load(html);
  const items = [];

  const toAbsoluteUrl = (rawUrl, base) => {
    if (!rawUrl) return "";
    if (rawUrl.startsWith('http')) return rawUrl;

    const match = base.match(/^(https?:\/\/[^\/]+)/);
    const origin = match ? match[1] : base;

    return origin.replace(/\/$/, '') + '/' + rawUrl.replace(/^\//, '');
  };

  $(config.itemSelector).each((i, el) => {
    const title = $(el).find(config.title).text().trim();
    const rawUrl = $(el).find(config.link).attr('href');
    Logger.log(`${i} ${title} ${rawUrl}`);
    if(!title || !rawUrl) return;

    const url = toAbsoluteUrl(rawUrl, config.targetUrl);
    Logger.log(url);
    $(el).find('.curator').remove();
    const description = config.description ? $(el).find(config.description).text().replace(/\s+/g, ' ').trim() : '';
    Logger.log(`description: ${description}`);
    Logger.log("config.date: "+config.date);
    Logger.log("$(el).find: "+$(el).find(config.date));
    //Logger.log($(el).find(config.date));
    const rawDate = (config.date) ? $(el).find(config.date).first().text().trim() : null;
    Logger.log("rawDate: "+rawDate);
    Logger.log("config.dateFormat: "+config.dateFormat);
    const parsed = parseByFormat(rawDate, config.dateFormat);
    const dateStr = ( !config.date || parsed === null) ? null : parsed.toUTCString();
    Logger.log(`dateStr: ${dateStr}`);

    items.push({
      title,
      url,
      description,
      rawDate,
      date: dateStr,
      guid: url
    });
  });

  return items;
};

/**
 * RSS XMLの構築
 * @param {RssConfig} config - 正規表現を含む設定オブジェクト
 * @param {Array<{title: string, url: string, description: string, date: string, guid: string}>} items - アイテムの配列
 * @returns {string} RSS XML
 */
const buildRssXml = (config, items) => {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(config.rssTitle)}</title>
    <link>${config.targetUrl.replace(/&/g, '&amp;')}</link>
    <description>Generated by GAS Webhook</description>
    <pubDate>${NOW.toUTCString()}</pubDate>
    <generator>GAS RSS Generator</generator>
`;

  items.forEach(item => {
    xml += `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${item.url.replace(/&/g, '&amp;')}</link>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${item.date}</pubDate>
      <guid>${item.guid}</guid>
    </item>
`;
  });

  xml += `  </channel>
</rss>`;

  return xml;
};

/**
 * エラー発生時のテキストレスポンスを生成します。
 * @param {string} msg - エラーメッセージ
 * @return {GoogleAppsScript.Content.TextOutput} テキスト形式の出力オブジェクト
 */
const createErrorResponse = (msg) => {
  Logger.log(msg);
  return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
};

/**
 * XMLの特殊文字（<, >, &, ', "）をエスケープします。
 * @param {string|null|undefined} unsafe - エスケープ対象の文字列
 * @return {string} エスケープ済みの文字列
 */
const escapeXml = (unsafe) => {
  if (!unsafe) return '';
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    /** @type {Object<string, string>} */
    const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
    return map[c];
  });
};

/**
 * 日付書式変換
 * @param {string} str - 変換元日付文字列
 * @param {string} format - 書式文字列
 * @return {object} 解析後Dateオブジェクト
 */
const parseByFormat = (str, format) => {
  if (!str || !format) return null;

  /** 正規表現エスケープ関数 */
  const escapeReg = s => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

  /** 書式文字列で使用する日付トークン（対応する正規表現） */
  const tokens = [
    ["YYYY", "(?<YYYY>\\d{4})"],
    ["YY",   "(?<YY>\\d{2})"],
    ["MM",   "(?<MM>\\d{1,2})"],
    ["DD",   "(?<DD>\\d{1,2})"],
    ["hh",   "(?<hh>\\d{1,2})"],
    ["mm",   "(?<mm>\\d{1,2})"],
    ["ss",   "(?<ss>\\d{1,2})"],
    ["M",    "(?<M>\\d{1,2})"],
    ["D",    "(?<D>\\d{1,2})"],
    ["h",    "(?<h>\\d{1,2})"],
    ["m",    "(?<m>\\d{1,2})"],
    ["s",    "(?<s>\\d{1,2})"]
  ];

  /** 書式：文字列をそのまま使えるように正規表現へエスケープ * */
  let regexStr = "";
  for (let i = 0; i < format.length;) {
    // (x) 形式はスキップ扱い
    if (format[i] === "(") {
      const j = format.indexOf(")", i);
      if (j > -1) {
        regexStr += "(?:.*)";
        i = j + 1;
        continue;
      }
    }

    // トークン一致（長い順なので安全）
    let matched = false;
    for (const [tok, re] of tokens) {
      if (format.startsWith(tok, i)) {
        regexStr += re;
        i += tok.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // 通常文字
      regexStr += escapeReg(format[i]);
      i++;
    }
  }

  const re = new RegExp("^" + regexStr + "$");
  Logger.log(`${str} / ${re}`);
  const match = str.match(re);
  if (!match || !match.groups) return null;

  /** 年の決定 */
  const year =
    (match.groups.YYYY) ? Number(match.groups.YYYY)
    : (match.groups.YY) ? 2000 + Number(match.groups.YY)
    : NOW.getFullYear();

  const MM = Number(match.groups.MM || match.groups.M || 1);
  const DD = Number(match.groups.DD || match.groups.D || 1);
  const hh = Number(match.groups.hh || match.groups.h || 0);
  const mm = Number(match.groups.mm || match.groups.m || 0);
  const ss = Number(match.groups.ss || match.groups.s || 0);

  /** 時間生成 */
  const date = new Date(year, MM - 1, DD, hh, mm, ss);
  Logger.log(`${year}, ${MM - 1}, ${DD}, ${hh}, ${mm}, ${ss}`);

  return isNaN(date.getTime()) ? null : date;
}