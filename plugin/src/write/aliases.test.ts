import { describe, expect, it } from 'vitest';
import { isSynced, syncAliases } from './aliases';

describe('syncAliases', () => {
	it('aliases をタイトル1つだけにする', () => {
		expect(syncAliases('新', ['旧'])).toEqual(['新']);
	});

	it('手で足した別名や、以前のタイトルは残さない（ユーザー確認済み 2026-11-01）', () => {
		expect(syncAliases('新', ['旧', '略称'])).toEqual(['新']);
		expect(syncAliases('新', ['新', '旧'])).toEqual(['新']);
	});

	it('すでにタイトル1つだけなら変更しない（書き込みの繰り返しを防ぐ）', () => {
		expect(syncAliases('新', ['新'])).toBeNull();
		expect(syncAliases(' 新 ', ['新'])).toBeNull();
	});

	it('aliases が空なら入れる。タイトルが空なら何もしない', () => {
		expect(syncAliases('新', [])).toEqual(['新']);
		expect(syncAliases(' ', ['旧'])).toBeNull();
	});
});

describe('isSynced', () => {
	it('タイトル1つだけのときだけ true', () => {
		expect(isSynced('A', ['A'])).toBe(true);
		expect(isSynced('A', ['A', 'B'])).toBe(false);
		expect(isSynced('A', [])).toBe(false);
	});
});
