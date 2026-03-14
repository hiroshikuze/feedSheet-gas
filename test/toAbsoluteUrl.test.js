/**
 * toAbsoluteUrl の単体テスト
 *
 * カバーするシナリオ:
 *  1. http/https で始まる絶対URL → そのまま返す
 *  2. // で始まるプロトコル相対URL → https: を付与して返す
 *  3. / で始まる相対パス → ベースURLのoriginを付加して返す
 *  4. パス相対URL（/ なし）→ originを付加して返す
 *  5. 空文字・null → 空文字を返す
 */

const { toAbsoluteUrl } = require('../index');

const BASE = 'https://example.com/some/page';

// ─────────────────────────────────────────
// シナリオ 1: 絶対URL
// ─────────────────────────────────────────
describe('シナリオ1: http/https で始まる絶対URL', () => {
  test('https URL はそのまま返す', () => {
    expect(toAbsoluteUrl('https://other.com/path', BASE)).toBe('https://other.com/path');
  });

  test('http URL はそのまま返す', () => {
    expect(toAbsoluteUrl('http://other.com/path', BASE)).toBe('http://other.com/path');
  });
});

// ─────────────────────────────────────────
// シナリオ 2: プロトコル相対URL
// ─────────────────────────────────────────
describe('シナリオ2: // で始まるプロトコル相対URL', () => {
  test('//example.com/path → https://example.com/path', () => {
    expect(toAbsoluteUrl('//example.com/path', BASE)).toBe('https://example.com/path');
  });

  test('//fushimi-kyoto.mypl.net/article/107009 → https://fushimi-kyoto.mypl.net/article/107009', () => {
    expect(toAbsoluteUrl(
      '//fushimi-kyoto.mypl.net/article/saijiki_fushimi-kyoto/107009',
      'https://fushimi-kyoto.mypl.net/article/saijiki_fushimi-kyoto/107009'
    )).toBe('https://fushimi-kyoto.mypl.net/article/saijiki_fushimi-kyoto/107009');
  });

  test('ベースURLのoriginとは無関係なドメインでも正しく変換する', () => {
    expect(toAbsoluteUrl('//cdn.other.com/img/photo.jpg', BASE))
      .toBe('https://cdn.other.com/img/photo.jpg');
  });
});

// ─────────────────────────────────────────
// シナリオ 3: / で始まる相対パス
// ─────────────────────────────────────────
describe('シナリオ3: / で始まる相対パス', () => {
  test('/article/1 → https://example.com/article/1', () => {
    expect(toAbsoluteUrl('/article/1', BASE)).toBe('https://example.com/article/1');
  });

  test('ベースURLがトレイリングスラッシュ付きでも重複しない', () => {
    expect(toAbsoluteUrl('/article/1', 'https://example.com/')).toBe('https://example.com/article/1');
  });
});

// ─────────────────────────────────────────
// シナリオ 4: パス相対URL（/ なし）
// ─────────────────────────────────────────
describe('シナリオ4: パス相対URL', () => {
  test('article/1 → https://example.com/article/1', () => {
    expect(toAbsoluteUrl('article/1', BASE)).toBe('https://example.com/article/1');
  });
});

// ─────────────────────────────────────────
// シナリオ 5: 空・null
// ─────────────────────────────────────────
describe('シナリオ5: 空・null', () => {
  test('空文字を渡すと空文字を返す', () => {
    expect(toAbsoluteUrl('', BASE)).toBe('');
  });

  test('null を渡すと空文字を返す', () => {
    expect(toAbsoluteUrl(null, BASE)).toBe('');
  });
});
