/**
 * buildRssXml の単体テスト
 */

'use strict';

const { buildRssXml } = require('../index');

const BASE_CONFIG = {
  rssTitle: 'Test Feed',
  targetUrl: 'https://example.com/'
};
const ITEM = {
  title: 'Article 1',
  url: 'https://example.com/1',
  description: 'Desc 1',
  date: 'Thu, 14 Mar 2024 00:00:00 GMT',
  guid: 'https://example.com/1'
};

describe('buildRssXml - 基本構造', () => {
  test('RSS 2.0 宣言と channel 要素を含む', () => {
    const xml = buildRssXml(BASE_CONFIG, []);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('<channel>');
    expect(xml).toContain('</channel>');
  });

  test('アイテムなしでも有効なXMLを生成する', () => {
    const xml = buildRssXml(BASE_CONFIG, []);
    expect(xml).not.toContain('<item>');
  });

  test('アイテムが <item> タグで出力される', () => {
    const xml = buildRssXml(BASE_CONFIG, [ITEM]);
    expect(xml).toContain('<item>');
    expect(xml).toContain('<title>Article 1</title>');
    expect(xml).toContain('<pubDate>Thu, 14 Mar 2024 00:00:00 GMT</pubDate>');
  });
});

describe('buildRssXml - escapeXml 適用確認', () => {
  test('rssTitle の特殊文字がエスケープされる', () => {
    const xml = buildRssXml({ ...BASE_CONFIG, rssTitle: '<Test & Feed>' }, []);
    expect(xml).toContain('&lt;Test &amp; Feed&gt;');
  });

  test('item.title の特殊文字がエスケープされる', () => {
    const xml = buildRssXml(BASE_CONFIG, [{ ...ITEM, title: '<b>Bold</b>' }]);
    expect(xml).toContain('&lt;b&gt;Bold&lt;/b&gt;');
  });

  test('item.description の特殊文字がエスケープされる', () => {
    const xml = buildRssXml(BASE_CONFIG, [{ ...ITEM, description: 'a & b "c"' }]);
    expect(xml).toContain('a &amp; b &quot;c&quot;');
  });
});
