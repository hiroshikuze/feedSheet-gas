/**
 * Jest セットアップファイル
 * index.gs がモジュールトップレベルで参照する GAS グローバルAPIをモックします。
 * テスト対象は純粋関数（processItems, parseByFormat, escapeXml, isValidUTCString）のみ。
 * GAS 固有の副作用（UrlFetchApp, SpreadsheetApp 等）は呼び出されません。
 */

global.Logger = { log: () => {} };

global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: () => null,
    setProperty: () => {}
  })
};

// 以下は純粋関数テストでは呼ばれないが、モジュールロード時のエラーを防ぐために定義
global.SpreadsheetApp = {};
global.UrlFetchApp = {};
global.ContentService = {};
global.Cheerio = {};
