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
    initCache(no, isReset, isPreview, config.targetUrl);

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
 * @param {string} targetUrl - 現在の設定のtargetUrl（変更検知用フィンガープリント）
 */
const initCache = (no, isReset, isPreview, targetUrl) => {
  if (!isReset && !isPreview) {
    CACHE = JSON.parse(scriptProperties.getProperty("CACHE_JSON") || "[]");
  }

  // noに該当するキャッシュのみ取り出す
  CACHE_ENTRY = CACHE.find(c => c.no === no);
  if (!CACHE_ENTRY) CACHE_ENTRY = { no, targetUrl, value: [] };

  // targetUrlが変わっていたら自動リセット（設定変更・行の差し替えに対応）
  // ※ targetUrl が undefined（旧形式キャッシュ）の場合も不一致扱いでリセット
  if (!isReset && CACHE_ENTRY.targetUrl !== targetUrl) {
    Logger.log(`targetUrl変更を検知。キャッシュを自動リセット: ${CACHE_ENTRY.targetUrl} → ${targetUrl}`);
    CACHE_ENTRY = { no, targetUrl, value: [] };
  } else {
    // フィンガープリントを最新に更新
    CACHE_ENTRY.targetUrl = targetUrl;
  }

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
 * スプレッドシートに存在しない No のキャッシュエントリを CACHE_JSON から削除します。
 * スプレッドシートの行を削除した後、GASエディタから手動で実行してください。
 * doGet 経由では呼び出されません。
 */
const purgeOrphanCache = () => {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('取得元');
  if (!sheet) {
    Logger.log('purgeOrphanCache: シート "取得元" が見つかりません。');
    return;
  }

  // スプレッドシートの有効な No 一覧を取得（ヘッダー行を除く、空白行はスキップ）
  const data = sheet.getDataRange().getValues();
  const validNos = new Set(
    data.slice(1)
      .map(r => r[0])
      .filter(v => v !== '' && v !== null)
      .map(v => Number(v))
  );
  Logger.log(`有効なNo一覧: ${[...validNos].join(', ')}`);

  const allCache = JSON.parse(scriptProperties.getProperty('CACHE_JSON') || '[]');
  const before = allCache.length;

  // スプレッドシートに存在しない no のエントリを除外
  const filtered = allCache.filter(entry => validNos.has(Number(entry.no)));
  const removed = before - filtered.length;

  scriptProperties.setProperty('CACHE_JSON', JSON.stringify(filtered));
  Logger.log(`purgeOrphanCache 完了: ${removed} 件削除、${filtered.length} 件保持`);
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
 * 有効なUTC日付文字列（toUTCString形式）か検証します。
 * @param {string} str - 検証対象文字列
 * @return {boolean} 有効なUTC文字列かどうか
 */
const isValidUTCString = (str) => {
  if (typeof str !== 'string') return false;
  const utcPattern = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;
  if (!utcPattern.test(str)) return false;
  const date = new Date(str);
  if (isNaN(date.getTime())) return false;
  return date.toUTCString() === str;
};

/**
 * HTMLアイテムとキャッシュを処理し、RSS出力アイテムと更新後キャッシュを返す純粋関数。
 * ・dateあり → HTMLの値をそのまま使用
 * ・dateなし・キャッシュあり → savedDateを使用（lastSeen/title/descriptionを更新）
 * ・dateなし・キャッシュなし → 現在時刻をdateとしてキャッシュ新規登録
 * ・HTMLにないがキャッシュにある（orphan）
 *     savedDateからCACHE_PERIOD日以内 → savedDateでRSSに追加（ghost item）
 *     savedDateからCACHE_PERIOD日超過 → キャッシュから削除、RSSにも出さない
 * @param {Array<{title:string, url:string, description:string, rawDate:string|null, date:string|null, guid:string}>} htmlItems - HTML抽出アイテム
 * @param {Array<{url:string, title:string, description:string, savedDate:string, lastSeen:string}>} cacheValues - 現在のキャッシュエントリ配列
 * @param {Date} now - 現在時刻
 * @param {number} cachePeriod - キャッシュ保持日数
 * @param {boolean} isPreview - プレビューモード（trueのときキャッシュ更新しない）
 * @return {{rssItems: Array, updatedCache: Array}} RSSに出力するアイテムと更新後キャッシュ
 */
const processItems = (htmlItems, cacheValues, now, cachePeriod, isPreview) => {
  const nowUTC = now.toUTCString();
  // 現在HTMLに存在するURLのセット（orphan検出用）
  const currentUrls = new Set(htmlItems.map(item => item.url));
  const rssItems = [];
  // キャッシュをシャローコピーして操作（元配列を破壊しない）
  const updatedCache = cacheValues.map(v => ({ ...v }));

  htmlItems.forEach(item => {
    const cacheItem = updatedCache.find(v => v.url === item.url);
    const exists = !!cacheItem;

    Logger.log(JSON.stringify(item));

    if (item.date) {
      // HTMLにdateあり → そのまま使用
      Logger.log("dateをそのまま使う");
      rssItems.push(item);
      if (exists) {
        // キャッシュを最新化（title/descriptionが変わっていても追従）
        cacheItem.lastSeen = nowUTC;
        cacheItem.title = item.title;
        cacheItem.description = item.description;
      }
    } else {
      // dateなし → キャッシュから取得 or 現在日時
      if (exists) {
        if (isValidUTCString(cacheItem.savedDate)) {
          Logger.log("cacheを使う");
        } else {
          Logger.log(`${cacheItem.savedDate} 現在日付を使う`);
        }
        item.date = isValidUTCString(cacheItem.savedDate) ? cacheItem.savedDate : nowUTC;
        rssItems.push(item);
        // キャッシュを最新化
        cacheItem.lastSeen = nowUTC;
        cacheItem.title = item.title;
        cacheItem.description = item.description;
      } else {
        Logger.log("キャッシュなし、現在日付を使う");
        item.date = nowUTC;
        rssItems.push(item);
      }
    }

    // 未登録アイテムをキャッシュに追加（previewモードでは書き込まない）
    if (!exists && !isPreview) {
      updatedCache.push({
        url: item.url,
        title: item.title,
        description: item.description,
        savedDate: item.date || nowUTC,  // dateあり → その値 / dateなし → 現在時刻
        lastSeen: nowUTC
      });
    }
  });

  // orphan処理：HTMLにないがキャッシュにあるアイテムを処理
  if (!isPreview) {
    const urlsToDelete = new Set();
    updatedCache
      .filter(v => !currentUrls.has(v.url))
      .forEach(cacheItem => {
        // savedDateを起点にCACHE_PERIOD日以内かどうか判定
        const diffDays = (now - new Date(cacheItem.savedDate)) / 1000 / 60 / 60 / 24;
        if (diffDays <= cachePeriod) {
          // 期間内 → ghost itemとしてRSSに追加
          Logger.log(`orphan（期間内）: ${cacheItem.url}`);
          rssItems.push({
            title: cacheItem.title || '',
            url: cacheItem.url,
            description: cacheItem.description || '',
            rawDate: null,
            date: isValidUTCString(cacheItem.savedDate) ? cacheItem.savedDate : nowUTC,
            guid: cacheItem.url
          });
        } else {
          // 期限切れ → キャッシュから削除
          Logger.log(`orphan（期限切れ）削除: ${cacheItem.url}`);
          urlsToDelete.add(cacheItem.url);
        }
      });

    if (urlsToDelete.size > 0) {
      return {
        rssItems,
        updatedCache: updatedCache.filter(v => !urlsToDelete.has(v.url))
      };
    }
  }

  return { rssItems, updatedCache };
};

/**
 * 指定された設定に基づいてHTMLを取得・解析し、RSS 2.0形式のXML文字列を生成します。
 * @param {RssConfig} config - RSS生成のための設定オブジェクト
 * @param {boolean} isPreview - キャッシュ保存をスキップするか
 * @return {string} 生成されたRSS XML文字列
 */
const generateRssFeed = (config, isPreview) => {
  const html = UrlFetchApp.fetch(config.targetUrl).getContentText();
  const items = extractItems(html, config);

  const { rssItems, updatedCache } = processItems(
    items, CACHE_ENTRY.value, NOW, CACHE_PERIOD, isPreview
  );

  if (!isPreview) {
    CACHE_ENTRY.value = updatedCache;
    saveCache();
  }

  return buildRssXml(config, rssItems);
};

/**
 * 相対URLを絶対URLに変換します。
 * - http/https で始まる場合はそのまま返す
 * - // で始まるプロトコル相対URLには https: を付与する
 * - / で始まる相対パスにはベースURLのoriginを付加する
 * @param {string} rawUrl - 変換元URL文字列
 * @param {string} base - ベースURL
 * @return {string} 絶対URL文字列
 */
const toAbsoluteUrl = (rawUrl, base) => {
  if (!rawUrl) return "";
  if (rawUrl.startsWith('http')) return rawUrl;
  // プロトコル相対URL（//example.com/path）→ httpsスキームを付与
  if (rawUrl.startsWith('//')) return 'https:' + rawUrl;

  const match = base.match(/^(https?:\/\/[^\/]+)/);
  const origin = match ? match[1] : base;

  return origin.replace(/\/$/, '') + '/' + rawUrl.replace(/^\//, '');
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

/** テスト用：CACHE_ENTRY の現在値を返す純粋ゲッター */
const getCacheEntry = () => CACHE_ENTRY;

/**
 * テスト用：モジュールレベルのキャッシュ変数をリセットする。
 * GAS本番は毎リクエスト新規実行のため不要。Jestのモジュールキャッシュ対策専用。
 */
const _resetCacheForTest = () => {
  CACHE = [];
  CACHE_ENTRY = {};
};

// Node.js（Jest）環境でのみエクスポート（GAS実行時は module が未定義のため無視される）
if (typeof module !== 'undefined') {
  module.exports = { isValidUTCString, processItems, parseByFormat, escapeXml, toAbsoluteUrl, purgeOrphanCache, initCache, getCacheEntry, _resetCacheForTest, buildRssXml };
}