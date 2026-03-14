/**
 * Jest セットアップファイル
 * index.gs がモジュールトップレベルで参照する GAS グローバルAPIをモックします。
 *
 * __mockProps      : scriptProperties の読み書き先。テストから直接操作可能。
 * __mockSheetData  : SpreadsheetApp のシートデータ。null のときシートが存在しない扱い。
 */

global.Logger = { log: () => {} };

// scriptProperties のモック（stateful: global.__mockProps を経由して操作）
global.__mockProps = {};
global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (key) => (key in global.__mockProps ? global.__mockProps[key] : null),
    setProperty: (key, value) => { global.__mockProps[key] = value; }
  })
};

// SpreadsheetApp のモック（stateful: global.__mockSheetData を経由して操作）
// null のときは getSheetByName が null を返す（シートなし扱い）
global.__mockSheetData = null;
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: (name) => {
      if (name === '取得元' && global.__mockSheetData !== null) {
        return {
          getDataRange: () => ({ getValues: () => global.__mockSheetData })
        };
      }
      return null;
    }
  })
};

global.UrlFetchApp = {};
global.ContentService = {};
global.Cheerio = {};
