/**
 * purgeOrphanCache の単体テスト
 *
 * カバーするシナリオ:
 *  1. シートに存在しない no のエントリが削除される
 *  2. シートに存在する no のエントリは保持される
 *  3. 有効エントリと孤立エントリが混在する場合、孤立のみ削除される
 *  4. 全エントリが孤立している場合、CACHE_JSON が空配列になる
 *  5. CACHE_JSON が空（エントリなし）の場合エラーにならない
 *  6. シート「取得元」が存在しない場合、CACHE_JSON が変更されない
 *  7. no の型が数値・文字列混在でも正しく照合される
 */

const { purgeOrphanCache } = require('../index');

/** シートデータ生成ヘルパー（先頭行はヘッダー） */
const makeSheetData = (nos) => [
  ['No', 'Code', 'Target URL', 'itemSelector', 'Title', 'Url', 'Description', 'Date', 'DateFormat', 'RSS Title'],
  ...nos.map(no => [no, `code${no}`, '', '', '', '', '', '', '', ''])
];

/** キャッシュエントリ生成ヘルパー */
const makeCacheEntry = (no) => ({ no, value: [{ url: `https://example.com/${no}` }] });

beforeEach(() => {
  // テストごとにモック状態をリセット
  global.__mockProps = {};
  global.__mockSheetData = null;
});

// ─────────────────────────────────────────
// シナリオ 1: 孤立エントリの削除
// ─────────────────────────────────────────
describe('シナリオ1: シートに存在しないnoのエントリが削除される', () => {
  test('no=3 が孤立 → 削除される', () => {
    global.__mockSheetData = makeSheetData([1, 2]);
    global.__mockProps['CACHE_JSON'] = JSON.stringify([
      makeCacheEntry(1),
      makeCacheEntry(3)  // 孤立
    ]);

    purgeOrphanCache();

    const result = JSON.parse(global.__mockProps['CACHE_JSON']);
    expect(result).toHaveLength(1);
    expect(result[0].no).toBe(1);
  });
});

// ─────────────────────────────────────────
// シナリオ 2: 有効エントリの保持
// ─────────────────────────────────────────
describe('シナリオ2: シートに存在するnoのエントリはすべて保持される', () => {
  test('全エントリが有効 → CACHE_JSON の件数が変わらない', () => {
    global.__mockSheetData = makeSheetData([1, 2, 3]);
    global.__mockProps['CACHE_JSON'] = JSON.stringify([
      makeCacheEntry(1),
      makeCacheEntry(2),
      makeCacheEntry(3)
    ]);

    purgeOrphanCache();

    const result = JSON.parse(global.__mockProps['CACHE_JSON']);
    expect(result).toHaveLength(3);
  });
});

// ─────────────────────────────────────────
// シナリオ 3: 有効エントリと孤立エントリの混在
// ─────────────────────────────────────────
describe('シナリオ3: 有効エントリと孤立エントリの混在', () => {
  test('no=2,4 が孤立 → 孤立のみ削除、no=1,3 は保持', () => {
    global.__mockSheetData = makeSheetData([1, 3]);
    global.__mockProps['CACHE_JSON'] = JSON.stringify([
      makeCacheEntry(1),
      makeCacheEntry(2),  // 孤立
      makeCacheEntry(3),
      makeCacheEntry(4)   // 孤立
    ]);

    purgeOrphanCache();

    const result = JSON.parse(global.__mockProps['CACHE_JSON']);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.no)).toEqual(expect.arrayContaining([1, 3]));
    expect(result.map(e => e.no)).not.toContain(2);
    expect(result.map(e => e.no)).not.toContain(4);
  });
});

// ─────────────────────────────────────────
// シナリオ 4: 全エントリが孤立
// ─────────────────────────────────────────
describe('シナリオ4: 全エントリが孤立している場合', () => {
  test('CACHE_JSON が空配列になる', () => {
    global.__mockSheetData = makeSheetData([]);
    global.__mockProps['CACHE_JSON'] = JSON.stringify([
      makeCacheEntry(1),
      makeCacheEntry(2)
    ]);

    purgeOrphanCache();

    const result = JSON.parse(global.__mockProps['CACHE_JSON']);
    expect(result).toHaveLength(0);
  });
});

// ─────────────────────────────────────────
// シナリオ 5: CACHE_JSON が空
// ─────────────────────────────────────────
describe('シナリオ5: CACHE_JSONが空または未設定の場合', () => {
  test('CACHE_JSON 未設定でもエラーにならない', () => {
    global.__mockSheetData = makeSheetData([1]);
    // __mockProps['CACHE_JSON'] を設定しない（getProperty が null を返す）

    expect(() => purgeOrphanCache()).not.toThrow();
    const result = JSON.parse(global.__mockProps['CACHE_JSON']);
    expect(result).toHaveLength(0);
  });

  test('CACHE_JSON が空配列でもエラーにならない', () => {
    global.__mockSheetData = makeSheetData([1]);
    global.__mockProps['CACHE_JSON'] = JSON.stringify([]);

    expect(() => purgeOrphanCache()).not.toThrow();
    expect(JSON.parse(global.__mockProps['CACHE_JSON'])).toHaveLength(0);
  });
});

// ─────────────────────────────────────────
// シナリオ 6: シートが存在しない
// ─────────────────────────────────────────
describe('シナリオ6: シート「取得元」が存在しない場合', () => {
  test('CACHE_JSON が変更されない', () => {
    global.__mockSheetData = null;  // シートなし
    const original = JSON.stringify([makeCacheEntry(1)]);
    global.__mockProps['CACHE_JSON'] = original;

    purgeOrphanCache();

    expect(global.__mockProps['CACHE_JSON']).toBe(original);
  });
});

// ─────────────────────────────────────────
// シナリオ 7: no の型が混在（数値・文字列）
// ─────────────────────────────────────────
describe('シナリオ7: noの型が数値・文字列混在でも正しく照合される', () => {
  test('シートの no が数値、キャッシュの no が文字列でも正しく保持・削除される', () => {
    global.__mockSheetData = makeSheetData([1, 2]);
    global.__mockProps['CACHE_JSON'] = JSON.stringify([
      { no: '1', value: [] },  // 文字列の '1'
      { no: '3', value: [] }   // 孤立（文字列の '3'）
    ]);

    purgeOrphanCache();

    const result = JSON.parse(global.__mockProps['CACHE_JSON']);
    expect(result).toHaveLength(1);
    expect(Number(result[0].no)).toBe(1);
  });
});
