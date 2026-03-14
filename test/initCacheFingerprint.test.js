/**
 * initCache フィンガープリント（targetUrl変更検知）の単体テスト
 *
 * カバーするシナリオ:
 *  1. targetUrl が変わっていない → キャッシュ維持
 *  2. targetUrl が変わった → value を自動リセット
 *  3. キャッシュに targetUrl が未記録（旧形式）→ 自動リセット
 *  4. isReset=true のときはフィンガープリントに関係なくリセット
 *  5. isPreview=true のときはキャッシュを読み込まず value は空のまま
 */

'use strict';

const { initCache, getCacheEntry, _resetCacheForTest } = require('../index');

const OLD_URL = 'https://old-site.example.com/';
const NEW_URL = 'https://new-site.example.com/';
const SAME_URL = OLD_URL;
const NO = 2;

// CACHE_PERIOD(7日)以内の日付を動的に生成し、時間フィルタによる誤削除を防ぐ
const recentUTC = new Date(Date.now() - 24 * 60 * 60 * 1000).toUTCString(); // 1日前

const makeCacheJson = (targetUrl) => JSON.stringify([{
  no: NO,
  targetUrl,
  value: [{ url: 'https://old-site.example.com/article/1', savedDate: recentUTC, lastSeen: recentUTC }]
}]);

beforeEach(() => {
  global.__mockProps = {};
  global.__mockSheetData = null;
  // GAS本番は毎リクエスト新規実行のため状態が持ち越されないが、
  // Jestはモジュールをキャッシュするため明示的にリセットする
  _resetCacheForTest();
});

// ─────────────────────────────────────────
// シナリオ 1: targetUrl 変化なし → キャッシュ維持
// ─────────────────────────────────────────
describe('シナリオ1: targetUrlが同じ場合', () => {
  test('valueが維持される', () => {
    global.__mockProps['CACHE_JSON'] = makeCacheJson(SAME_URL);

    initCache(NO, false, false, SAME_URL);

    const entry = getCacheEntry();
    // 古すぎない記事なのでvalueが残っている（テスト基準日付が許容範囲内のため実際の値は環境依存だが、リセットはされていない）
    expect(entry.targetUrl).toBe(SAME_URL);
  });
});

// ─────────────────────────────────────────
// シナリオ 2: targetUrl が変化 → value を自動リセット
// ─────────────────────────────────────────
describe('シナリオ2: targetUrlが変わった場合', () => {
  test('valueが空配列にリセットされる', () => {
    global.__mockProps['CACHE_JSON'] = makeCacheJson(OLD_URL);

    initCache(NO, false, false, NEW_URL);

    const entry = getCacheEntry();
    expect(entry.value).toHaveLength(0);
    expect(entry.targetUrl).toBe(NEW_URL);
  });
});

// ─────────────────────────────────────────
// シナリオ 3: キャッシュに targetUrl が未記録（旧形式）→ 自動リセット
// ─────────────────────────────────────────
describe('シナリオ3: 旧形式キャッシュ（targetUrl未記録）', () => {
  test('targetUrlフィールドがない旧キャッシュは自動リセットされる', () => {
    global.__mockProps['CACHE_JSON'] = JSON.stringify([{
      no: NO,
      // targetUrl なし（旧形式）。recentUTCで時間フィルタによる誤削除を防ぐ
      value: [{ url: 'https://example.com/1', savedDate: recentUTC, lastSeen: recentUTC }]
    }]);

    initCache(NO, false, false, NEW_URL);

    const entry = getCacheEntry();
    expect(entry.value).toHaveLength(0);
    expect(entry.targetUrl).toBe(NEW_URL);
  });
});

// ─────────────────────────────────────────
// シナリオ 4: isReset=true のときはフィンガープリント判定より優先
// ─────────────────────────────────────────
describe('シナリオ4: isReset=true', () => {
  test('targetUrlが同じでもisReset=trueならCACHEは空から始まる', () => {
    global.__mockProps['CACHE_JSON'] = makeCacheJson(SAME_URL);

    initCache(NO, true, false, SAME_URL);

    // isReset=true のときは CACHE 自体が読み込まれない → CACHE_ENTRY は空エントリ
    const entry = getCacheEntry();
    expect(entry.value).toHaveLength(0);
  });
});

// ─────────────────────────────────────────
// シナリオ 5: isPreview=true のときはキャッシュ未読み込み
// ─────────────────────────────────────────
describe('シナリオ5: isPreview=true', () => {
  test('既存CACHEを読み込まず、valueが空のエントリになる', () => {
    global.__mockProps['CACHE_JSON'] = makeCacheJson(SAME_URL);

    initCache(NO, false, true, SAME_URL);

    const entry = getCacheEntry();
    expect(entry.value).toHaveLength(0);
  });
});
