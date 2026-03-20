/**
 * processItems アルゴリズムの単体テスト
 *
 * テスト基準日: 2024-03-14 00:00:00 UTC
 * CACHE_PERIOD: 7日
 *
 * カバーするシナリオ:
 *  1. HTMLにあるアイテム（dateあり）→ そのままRSS
 *  2. HTMLにあるアイテム（dateなし・キャッシュなし）→ NOWをdate
 *  3. HTMLにあるアイテム（dateなし・キャッシュあり）→ savedDateをdate
 *  4. orphan・期間内（CACHE_PERIOD以内）→ ghost itemとしてRSSに追加
 *  5. orphan・期限切れ（CACHE_PERIOD超過）→ RSS不掲載・キャッシュ削除
 *  6. previewモード → orphan処理・キャッシュ書き込みなし
 *  7. HTML在籍アイテムとorphanの混在
 *  8. キャッシュ内のtitle/descriptionがghost itemに引き継がれる
 *  9. targetUrl変更後（initCache自動リセット済み）→ 旧サイトのorphanがRSSに混入しない
 */

const { processItems, initCache, getCacheEntry, _resetCacheForTest } = require('../index');

const CACHE_PERIOD = 7;
const BASE_DATE = new Date('2024-03-14T00:00:00Z');
const BASE_UTC = BASE_DATE.toUTCString(); // 'Thu, 14 Mar 2024 00:00:00 GMT'

/** テスト用HTMLアイテム生成ヘルパー */
const makeHtmlItem = (id, dateUTC = null) => ({
  title: `Title ${id}`,
  url: `https://example.com/${id}`,
  description: `Desc ${id}`,
  rawDate: null,
  date: dateUTC,
  guid: `https://example.com/${id}`
});

/** テスト用日付ヘルパー（BASE_DATEではなく実行時刻基準） */
const makeDateDaysAgo = (daysAgo) => {
  const d = new Date(BASE_DATE);
  d.setDate(d.getDate() - daysAgo);
  return d;
};

/** テスト用キャッシュアイテム生成ヘルパー（savedDaysAgo日前を savedDate とする） */
const makeCacheItem = (id, savedDaysAgo, overrides = {}) => {
  const savedDate = new Date(BASE_DATE);
  savedDate.setDate(savedDate.getDate() - savedDaysAgo);
  return {
    url: `https://example.com/${id}`,
    title: `Cached Title ${id}`,
    description: `Cached Desc ${id}`,
    savedDate: savedDate.toUTCString(),
    lastSeen: savedDate.toUTCString(),
    ...overrides
  };
};

// ─────────────────────────────────────────
// シナリオ 1: HTMLにあるアイテム（dateあり）
// ─────────────────────────────────────────
describe('シナリオ1: HTMLにあるアイテム（dateあり）', () => {
  test('RSSに追加される', () => {
    const items = [makeHtmlItem(1, 'Thu, 14 Mar 2024 00:00:00 GMT')];
    const { rssItems } = processItems(items, [], BASE_DATE, CACHE_PERIOD, false);
    expect(rssItems).toHaveLength(1);
    expect(rssItems[0].date).toBe('Thu, 14 Mar 2024 00:00:00 GMT');
  });

  test('キャッシュに新規登録される（savedDate = item.date）', () => {
    const items = [makeHtmlItem(1, 'Thu, 14 Mar 2024 00:00:00 GMT')];
    const { updatedCache } = processItems(items, [], BASE_DATE, CACHE_PERIOD, false);
    expect(updatedCache).toHaveLength(1);
    expect(updatedCache[0].savedDate).toBe('Thu, 14 Mar 2024 00:00:00 GMT');
  });

  test('既存キャッシュのtitle/descriptionが更新される', () => {
    const oldCache = [makeCacheItem(1, 2, { title: 'Old Title', description: 'Old Desc' })];
    const items = [makeHtmlItem(1, 'Thu, 14 Mar 2024 00:00:00 GMT')];
    const { updatedCache } = processItems(items, oldCache, BASE_DATE, CACHE_PERIOD, false);
    expect(updatedCache[0].title).toBe('Title 1');
    expect(updatedCache[0].description).toBe('Desc 1');
  });
});

// ─────────────────────────────────────────
// シナリオ 2: HTMLにあるアイテム（dateなし・キャッシュなし）
// ─────────────────────────────────────────
describe('シナリオ2: HTMLにあるアイテム（dateなし・キャッシュなし）', () => {
  test('NOWをdateとしてRSSに追加される', () => {
    const items = [makeHtmlItem(1)];
    const { rssItems } = processItems(items, [], BASE_DATE, CACHE_PERIOD, false);
    expect(rssItems).toHaveLength(1);
    expect(rssItems[0].date).toBe(BASE_UTC);
  });

  test('キャッシュにsavedDate=NOWで登録される', () => {
    const items = [makeHtmlItem(1)];
    const { updatedCache } = processItems(items, [], BASE_DATE, CACHE_PERIOD, false);
    expect(updatedCache[0].savedDate).toBe(BASE_UTC);
    expect(updatedCache[0].title).toBe('Title 1');
    expect(updatedCache[0].description).toBe('Desc 1');
  });
});

// ─────────────────────────────────────────
// シナリオ 3: HTMLにあるアイテム（dateなし・キャッシュあり）
// ─────────────────────────────────────────
describe('シナリオ3: HTMLにあるアイテム（dateなし・キャッシュあり）', () => {
  const savedDate = 'Mon, 11 Mar 2024 00:00:00 GMT'; // 3日前

  test('キャッシュのsavedDateをdateとして使用する', () => {
    const cache = [makeCacheItem(1, 3, { savedDate })];
    const { rssItems } = processItems([makeHtmlItem(1)], cache, BASE_DATE, CACHE_PERIOD, false);
    expect(rssItems[0].date).toBe(savedDate);
  });

  test('キャッシュのlastSeenがNOWに更新される', () => {
    const cache = [makeCacheItem(1, 3, { savedDate })];
    const { updatedCache } = processItems([makeHtmlItem(1)], cache, BASE_DATE, CACHE_PERIOD, false);
    expect(updatedCache[0].lastSeen).toBe(BASE_UTC);
  });

  test('キャッシュのtitle/descriptionがHTMLの値に更新される', () => {
    const cache = [makeCacheItem(1, 3, { savedDate, title: 'Old', description: 'Old Desc' })];
    const { updatedCache } = processItems([makeHtmlItem(1)], cache, BASE_DATE, CACHE_PERIOD, false);
    expect(updatedCache[0].title).toBe('Title 1');
    expect(updatedCache[0].description).toBe('Desc 1');
  });
});

// ─────────────────────────────────────────
// シナリオ 4: orphan・期間内（ghost item）
// ─────────────────────────────────────────
describe('シナリオ4: orphan・CACHE_PERIOD以内 → ghost itemとしてRSS追加', () => {
  test('RSSに追加される（3日前のアイテム、期限7日）', () => {
    const cache = [makeCacheItem(1, 3)];
    const { rssItems } = processItems([], cache, BASE_DATE, CACHE_PERIOD, false);
    expect(rssItems).toHaveLength(1);
    expect(rssItems[0].url).toBe('https://example.com/1');
  });

  test('ghost itemのdateはsavedDateと一致する', () => {
    const cache = [makeCacheItem(1, 3)];
    const { rssItems } = processItems([], cache, BASE_DATE, CACHE_PERIOD, false);
    expect(rssItems[0].date).toBe(cache[0].savedDate);
  });

  test('ghost itemのtitle/descriptionがキャッシュから引き継がれる', () => {
    const cache = [makeCacheItem(1, 3, { title: 'Ghost Article', description: 'Ghost Desc' })];
    const { rssItems } = processItems([], cache, BASE_DATE, CACHE_PERIOD, false);
    expect(rssItems[0].title).toBe('Ghost Article');
    expect(rssItems[0].description).toBe('Ghost Desc');
  });

  test('キャッシュにはそのまま残る', () => {
    const cache = [makeCacheItem(1, 3)];
    const { updatedCache } = processItems([], cache, BASE_DATE, CACHE_PERIOD, false);
    expect(updatedCache).toHaveLength(1);
    expect(updatedCache[0].url).toBe('https://example.com/1');
  });

  test('境界値: ちょうどCACHE_PERIOD日前 → 期間内とみなしRSSに追加', () => {
    const cache = [makeCacheItem(1, 7)]; // ちょうど7日前
    const { rssItems, updatedCache } = processItems([], cache, BASE_DATE, CACHE_PERIOD, false);
    expect(rssItems).toHaveLength(1);
    expect(updatedCache).toHaveLength(1);
  });
});

// ─────────────────────────────────────────
// シナリオ 5: orphan・期限切れ
// ─────────────────────────────────────────
describe('シナリオ5: orphan・CACHE_PERIOD超過 → RSS不掲載・キャッシュ削除', () => {
  test('RSSに追加されない（8日前のアイテム、期限7日）', () => {
    const cache = [makeCacheItem(1, 8)];
    const { rssItems } = processItems([], cache, BASE_DATE, CACHE_PERIOD, false);
    expect(rssItems).toHaveLength(0);
  });

  test('キャッシュから削除される', () => {
    const cache = [makeCacheItem(1, 8)];
    const { updatedCache } = processItems([], cache, BASE_DATE, CACHE_PERIOD, false);
    expect(updatedCache).toHaveLength(0);
  });

  test('複数アイテムの一部だけ期限切れの場合、期限切れのみ削除', () => {
    const cache = [
      makeCacheItem(1, 3),  // 期間内
      makeCacheItem(2, 10), // 期限切れ
      makeCacheItem(3, 5)   // 期間内
    ];
    const { rssItems, updatedCache } = processItems([], cache, BASE_DATE, CACHE_PERIOD, false);
    expect(rssItems).toHaveLength(2);
    expect(updatedCache.map(v => v.url)).not.toContain('https://example.com/2');
    expect(updatedCache).toHaveLength(2);
  });
});

// ─────────────────────────────────────────
// シナリオ 6: previewモード
// ─────────────────────────────────────────
describe('シナリオ6: preview=true', () => {
  test('orphan処理が行われない（期間内のorphanもRSSに出ない）', () => {
    const cache = [makeCacheItem(1, 3)];
    const { rssItems } = processItems([], cache, BASE_DATE, CACHE_PERIOD, true);
    expect(rssItems).toHaveLength(0);
  });

  test('キャッシュが変更されない', () => {
    const cache = [makeCacheItem(1, 3)];
    const { updatedCache } = processItems([], cache, BASE_DATE, CACHE_PERIOD, true);
    expect(updatedCache).toHaveLength(1);
    expect(updatedCache[0]).toEqual(cache[0]);
  });

  test('新規HTMLアイテムはRSSに追加されるがキャッシュ登録はされない', () => {
    const items = [makeHtmlItem(99)];
    const { rssItems, updatedCache } = processItems(items, [], BASE_DATE, CACHE_PERIOD, true);
    expect(rssItems).toHaveLength(1);
    expect(updatedCache).toHaveLength(0);
  });
});

// ─────────────────────────────────────────
// シナリオ 7: 混在ケース
// ─────────────────────────────────────────
describe('シナリオ7: HTML在籍アイテムとorphanの混在', () => {
  test('HTML在籍1件 + orphan期間内1件 + orphan期限切れ1件 → RSS2件・キャッシュ2件', () => {
    const htmlItems = [makeHtmlItem(1)];
    const cache = [
      makeCacheItem(2, 3),  // orphan・期間内
      makeCacheItem(3, 10)  // orphan・期限切れ
    ];
    const { rssItems, updatedCache } = processItems(htmlItems, cache, BASE_DATE, CACHE_PERIOD, false);

    expect(rssItems).toHaveLength(2);
    expect(rssItems.map(i => i.url)).toContain('https://example.com/1');
    expect(rssItems.map(i => i.url)).toContain('https://example.com/2');
    expect(rssItems.map(i => i.url)).not.toContain('https://example.com/3');

    // アイテム1（HTMLから新規登録）+ アイテム2（キャッシュ保持）= 2件
    expect(updatedCache).toHaveLength(2);
    expect(updatedCache.map(v => v.url)).not.toContain('https://example.com/3');
  });
});

// ─────────────────────────────────────────
// シナリオ 8: 元のキャッシュ配列を破壊しないこと
// ─────────────────────────────────────────
describe('シナリオ8: イミュータビリティ', () => {
  test('元のcacheValues配列が変更されない', () => {
    const cache = [makeCacheItem(1, 3)];
    const originalLastSeen = cache[0].lastSeen;
    processItems([makeHtmlItem(1)], cache, BASE_DATE, CACHE_PERIOD, false);
    // 元の配列のlastSeenは変わっていない
    expect(cache[0].lastSeen).toBe(originalLastSeen);
  });
});

// ─────────────────────────────────────────
// シナリオ 9: targetUrl変更後の統合確認
// ─────────────────────────────────────────
describe('シナリオ9: targetUrl変更後（initCache自動リセット）→ 旧サイトのorphanがRSSに混入しない', () => {
  beforeEach(() => {
    global.__mockProps = {};
    _resetCacheForTest();
  });

  test('旧サイトのキャッシュ（期間内）がRSSに現れない', () => {
    const OLD_URL = 'https://old-site.example.com/';
    const NEW_URL = 'https://new-site.example.com/';
    const NO = 9;

    // 旧サイトのキャッシュ（期間内のorphan候補）をセット
    // CACHE_PERIOD(7日)以内の日付を使い、時間フィルタではなくフィンガープリントでリセットされることを確認
    const recentUTC = new Date(Date.now() - 24 * 60 * 60 * 1000).toUTCString(); // 1日前
    global.__mockProps['CACHE_JSON'] = JSON.stringify([{
      no: NO,
      targetUrl: OLD_URL,
      value: [
        { url: 'https://old-site.example.com/article/1', title: '旧記事1', description: '', savedDate: recentUTC, lastSeen: recentUTC },
        { url: 'https://old-site.example.com/article/2', title: '旧記事2', description: '', savedDate: recentUTC, lastSeen: recentUTC }
      ]
    }]);

    // targetUrl変更でinitCacheを呼ぶ → 自動リセット発動
    initCache(NO, false, false, NEW_URL);

    // 新サイトのHTMLアイテムでprocessItemsを実行
    const newHtmlItems = [makeHtmlItem(100)];
    const { rssItems } = processItems(newHtmlItems, getCacheEntry().value, BASE_DATE, CACHE_PERIOD, false);

    // 新記事のみRSSに含まれる
    expect(rssItems).toHaveLength(1);
    expect(rssItems[0].url).toBe('https://example.com/100');

    // 旧サイトのURLはRSSに混入していない
    const rssUrls = rssItems.map(i => i.url);
    expect(rssUrls).not.toContain('https://old-site.example.com/article/1');
    expect(rssUrls).not.toContain('https://old-site.example.com/article/2');
  });
});

// ─────────────────────────────────────────
// シナリオ 10: savedDate vs lastSeen 乖離ケース
// ─────────────────────────────────────────
describe('シナリオ10: savedDateが期限切れ・lastSeenが期間内のorphan', () => {
  test('initCacheを通過するがprocessItemsでキャッシュ削除・RSS不掲載', () => {
    // savedDate=10日前（CACHE_PERIOD=7超過）、lastSeen=1日前（期間内）
    // → initCache は lastSeen が新しいので通過
    // → processItems orphan処理は savedDate が古いので削除
    const cache = [makeCacheItem(1, 3, {
      savedDate: makeDateDaysAgo(10).toUTCString(), // 10日前
      lastSeen:  makeDateDaysAgo(1).toUTCString()   // 1日前
    })];
    const { rssItems, updatedCache } = processItems([], cache, BASE_DATE, CACHE_PERIOD, false);
    expect(rssItems).toHaveLength(0);
    expect(updatedCache).toHaveLength(0);
  });

  test('savedDateが期間内・lastSeenが期限切れの場合はinitCache段階で既に除外済み（参考テスト）', () => {
    // processItemsに到達する前にinitCacheで弾かれる想定の動作をドキュメント化
    // processItems単独ではlastSeenを使わないため、ghost itemとして追加される
    const cache = [makeCacheItem(1, 3, {
      savedDate: makeDateDaysAgo(1).toUTCString(),  // 1日前（期間内）
      lastSeen:  makeDateDaysAgo(10).toUTCString()  // 10日前（期限切れ）
    })];
    // processItems単独ではlastSeenを使わないため、savedDateが期間内ならghost item扱い
    const { rssItems } = processItems([], cache, BASE_DATE, CACHE_PERIOD, false);
    expect(rssItems).toHaveLength(1); // savedDateが期間内なのでghost item
  });
});
