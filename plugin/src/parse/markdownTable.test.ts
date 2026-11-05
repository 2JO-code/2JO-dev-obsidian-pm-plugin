import { describe, expect, it } from 'vitest';
import { findTableUnderHeading, splitRow } from './markdownTable';

describe('splitRow', () => {
	it('セルに分け、前後の空白を除く', () => {
		expect(splitRow('| a | b |  |')).toEqual(['a', 'b', '']);
	});

	it('\\| は文字の | として扱う', () => {
		expect(splitRow('| [[TASK-1\\|名前]] | 4 |')).toEqual(['[[TASK-1|名前]]', '4']);
	});

	it('末尾の | が無くてもよい。| で始まらない行は null', () => {
		expect(splitRow('| a | b')).toEqual(['a', 'b']);
		expect(splitRow('a | b')).toBeNull();
	});
});

describe('findTableUnderHeading', () => {
	const text = [
		'---', // 0
		'type: project', // 1
		'---', // 2
		'## マイルストーン', // 3
		'説明文', // 4
		'', // 5
		'| 名前 | 日付 |', // 6
		'| --- | :---: |', // 7
		'| A | 2026-12-01 |', // 8
		'| B | 2027-01-01 |', // 9
		'', // 10
		'| 別 | 表 |', // 11
		'| --- | --- |', // 12
		'## 工数配分', // 13
		'### 補足', // 14
		'| 月 | メンバー |', // 15
		'| --- | --- |', // 16
	].join('\n');

	it('見出しの直後の最初の表を、ファイル先頭からの行番号つきで返す', () => {
		const table = findTableUnderHeading(text, 'マイルストーン');
		expect(table?.headers).toEqual(['名前', '日付']);
		expect(table?.headerLine).toBe(6);
		expect(table?.rows).toEqual([
			{ line: 8, cells: ['A', '2026-12-01'] },
			{ line: 9, cells: ['B', '2027-01-01'] },
		]);
	});

	it('下位の見出しの中の表も対象にする', () => {
		expect(findTableUnderHeading(text, '工数配分')?.headerLine).toBe(15);
	});

	it('見出しが無い、または次の見出しまでに表が無ければ null', () => {
		expect(findTableUnderHeading(text, '作業ログ')).toBeNull();
		expect(findTableUnderHeading('## 作業ログ\n本文だけ\n## 次\n| a |\n| - |', '作業ログ')).toBeNull();
	});

	it('見出し名の全角括弧・空白の違いは無視する。コードブロックの中は無視する', () => {
		const t = '```\n## 作業ログ\n```\n##  作業 ログ\n| 予定（h） |\n| --- |\n| 1 |';
		const table = findTableUnderHeading(t, '作業ログ');
		expect(table?.headers).toEqual(['予定(h)']);
		expect(table?.headerLine).toBe(4);
	});
});
