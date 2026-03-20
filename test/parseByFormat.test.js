/**
 * parseByFormat の単体テスト
 */

const { parseByFormat } = require('../index');

describe('parseByFormat - 正常系', () => {
  test('YYYY.MM.DD 形式', () => {
    const result = parseByFormat('2024.03.14', 'YYYY.MM.DD');
    expect(result).not.toBeNull();
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(2); // 0-indexed
    expect(result.getDate()).toBe(14);
  });

  test('YYYY/MM/DD hh:mm:ss 形式', () => {
    const result = parseByFormat('2024/03/14 12:30:45', 'YYYY/MM/DD hh:mm:ss');
    expect(result.getHours()).toBe(12);
    expect(result.getMinutes()).toBe(30);
    expect(result.getSeconds()).toBe(45);
  });

  test('YY.MM.DD 形式（2000年代と仮定）', () => {
    const result = parseByFormat('24.03.14', 'YY.MM.DD');
    expect(result.getFullYear()).toBe(2024);
  });

  test('M/D 形式（月・日のみ）', () => {
    const result = parseByFormat('3/14', 'M/D');
    expect(result).not.toBeNull();
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(14);
  });

  test('ワイルドカード (xxx) をスキップする（ASCII区切り）', () => {
    // "posted 2024-03-14 JST" のように前後に任意文字列が付く場合
    const result = parseByFormat('posted 2024-03-14 JST', '(posted )YYYY-MM-DD( JST)');
    expect(result).not.toBeNull();
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(14);
  });
});

describe('parseByFormat - 異常系', () => {
  test('null を渡すと null を返す', () => {
    expect(parseByFormat(null, 'YYYY.MM.DD')).toBeNull();
  });

  test('format が null のとき null を返す', () => {
    expect(parseByFormat('2024.03.14', null)).toBeNull();
  });

  test('フォーマット不一致のとき null を返す', () => {
    expect(parseByFormat('not-a-date', 'YYYY.MM.DD')).toBeNull();
  });
});

describe('escapeXml', () => {
  const { escapeXml } = require('../index');

  test('< > & \' " をエスケープする', () => {
    expect(escapeXml('<a>&\'\"</a>')).toBe('&lt;a&gt;&amp;&apos;&quot;&lt;/a&gt;');
  });

  test('null/undefined は空文字を返す', () => {
    expect(escapeXml(null)).toBe('');
    expect(escapeXml(undefined)).toBe('');
  });

  test('数値0はfalsyのため空文字を返す', () => {
    expect(escapeXml(0)).toBe('');
  });

  test('数値42は文字列に変換して返す', () => {
    expect(escapeXml(42)).toBe('42');
  });
});

describe('isValidUTCString', () => {
  const { isValidUTCString } = require('../index');

  test('有効なUTC文字列を受け入れる', () => {
    expect(isValidUTCString('Thu, 14 Mar 2024 00:00:00 GMT')).toBe(true);
  });

  test('不正な形式を拒否する', () => {
    expect(isValidUTCString('2024-03-14')).toBe(false);
    expect(isValidUTCString('not a date')).toBe(false);
    expect(isValidUTCString('')).toBe(false);
    expect(isValidUTCString(null)).toBe(false);
  });
});
