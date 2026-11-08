import { describe, expect, it } from 'vitest';
import { Coercer } from './coerce';

const U = '0192f3a0-1234-7abc-8def-000000000001';
const PJT = `PJT-${U}`;
const USER = `USER-${U}`;

describe('Coercer', () => {
	it('空の値（null・空文字・空配列）は未入力として、問題にしない', () => {
		const c = new Coercer({ a: null, b: '  ', c: [], d: undefined });
		expect(c.has('a')).toBe(false);
		expect(c.string('b')).toBeUndefined();
		expect(c.strings('c')).toEqual([]);
		expect(c.number('d')).toBeUndefined();
		expect(c.boolean('a')).toBeUndefined();
		expect(c.link('b', 'project')).toBeUndefined();
		expect(c.links('c', 'user')).toEqual([]);
		expect(c.problems).toEqual([]);
	});

	it('文字列：前後の空白を除き、数値・真偽値は文字列にする。数値は求められれば警告', () => {
		const c = new Coercer({ s: ' A ', n: 1.1, b: true, o: { x: 1 } });
		expect(c.string('s')).toBe('A');
		expect(c.string('b')).toBe('true');
		expect(c.string('n')).toBe('1.1');
		expect(c.problems).toEqual([]);
		expect(c.string('n', true)).toBe('1.1');
		expect(c.string('o')).toBeUndefined();
		expect(c.problems).toHaveLength(2);
		expect(c.problems[0]).toContain('数値として読まれています');
	});

	it('文字列のリスト：1つだけの値もリストにし、空の要素は除く', () => {
		const c = new Coercer({ one: 'a', list: ['a', ' ', 2, null, { x: 1 }] });
		expect(c.strings('one')).toEqual(['a']);
		expect(c.strings('list')).toEqual(['a', '2']);
		expect(c.problems).toEqual(['list に文字列でない値があります']);
	});

	it('数値：最小値と刻みを確かめる。文字列の数字も読む', () => {
		const c = new Coercer({ h: 1.25, s: '8', neg: -1, step: 0.3, text: 'abc' });
		expect(c.number('h', { step: 0.25 })).toBe(1.25);
		expect(c.number('s')).toBe(8);
		expect(c.number('neg')).toBeUndefined();
		expect(c.number('neg', { min: -5 })).toBe(-1);
		expect(c.number('step', { step: 0.25 })).toBeUndefined();
		expect(c.number('text')).toBeUndefined();
		expect(c.problems).toHaveLength(3);
	});

	it('真偽値と日付', () => {
		const c = new Coercer({ yes: true, str: 'true', d: '2026-11-07', bad: '2026/11/07' });
		expect(c.boolean('yes')).toBe(true);
		expect(c.boolean('str')).toBeUndefined();
		expect(c.date('d')).toBe('2026-11-07');
		expect(c.date('bad')).toBeUndefined();
		expect(c.problems).toHaveLength(2);
	});

	it('リンク：その種類の ID だけを読み、違う種類・形は問題にする', () => {
		const c = new Coercer({ p: `[[${PJT}]]`, wrong: `[[${USER}]]`, list: [`[[${USER}]]`, 'x', null], num: 3 });
		expect(c.link('p', 'project')).toBe(PJT);
		expect(c.link('wrong', 'project')).toBeUndefined();
		expect(c.link('num', 'project')).toBeUndefined();
		expect(c.links('list', 'user')).toEqual([USER]);
		expect(c.problems).toEqual([
			`wrong がプロジェクトへのリンクではありません: [[${USER}]]`,
			'num がプロジェクトへのリンクではありません: 3',
			'list にメンバーへのリンクでない値があります: x',
		]);
	});
});
