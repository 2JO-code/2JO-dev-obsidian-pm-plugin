import { describe, expect, it } from 'vitest';
import { README_NOTICE, readmeContent, readmeNeedsWrite } from './readmeContent';

describe('readmeContent', () => {
	it('見出しの次に注意書きを入れる', () => {
		expect(readmeContent('# 使い方\n\n本文\n')).toBe(['# 使い方', '', ...README_NOTICE, '', '本文', ''].join('\n'));
	});

	it('見出しが無ければ先頭に入れる', () => {
		expect(readmeContent('本文\n')).toBe([...README_NOTICE, '', '本文', ''].join('\n'));
	});
});

describe('readmeNeedsWrite', () => {
	const content = readmeContent('# 使い方\n\n本文\n');

	it('同じ中身なら書かない', () => {
		expect(readmeNeedsWrite(content, content)).toBe(false);
	});

	it('改行コードだけの違いなら書かない', () => {
		expect(readmeNeedsWrite(content.replace(/\n/g, '\r\n'), content)).toBe(false);
	});

	it('中身が違えば書く', () => {
		expect(readmeNeedsWrite('# 使い方\n\n古い本文\n', content)).toBe(true);
	});
});
