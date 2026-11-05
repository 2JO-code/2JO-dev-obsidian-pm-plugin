import { describe, expect, it } from 'vitest';
import type { StatusDef } from '../model';
import { addStatus, changeCategory, findStatus, moveStatus, removeStatus, renameStatus } from './status';

const defs: StatusDef[] = [
	{ name: '未着手', category: 'not_started', aliases: [] },
	{ name: 'レビュー中', category: 'in_progress', aliases: ['レビュー待ち'] },
	{ name: '完了', category: 'done', aliases: [] },
];

describe('findStatus', () => {
	it('名前で探す', () => {
		expect(findStatus(defs, '完了')?.category).toBe('done');
	});

	it('旧名でも見つかる', () => {
		expect(findStatus(defs, 'レビュー待ち')?.name).toBe('レビュー中');
	});

	it('前後の空白は無視し、無ければ undefined', () => {
		expect(findStatus(defs, ' 完了 ')?.name).toBe('完了');
		expect(findStatus(defs, '保留')).toBeUndefined();
	});
});

describe('renameStatus', () => {
	it('旧名を aliases に残す', () => {
		const result = renameStatus(defs, '完了', '済み');
		expect(result[2]).toEqual({ name: '済み', category: 'done', aliases: ['完了'] });
		expect(findStatus(result, '完了')?.name).toBe('済み');
	});

	it('以前の名前に戻すと、その名前は aliases から外れる', () => {
		const result = renameStatus(defs, 'レビュー中', 'レビュー待ち');
		expect(result[1]).toEqual({ name: 'レビュー待ち', category: 'in_progress', aliases: ['レビュー中'] });
	});

	it('他のステータスの名前・旧名と重なる場合はエラー', () => {
		expect(() => renameStatus(defs, '完了', '未着手')).toThrow();
		expect(() => renameStatus(defs, '完了', 'レビュー待ち')).toThrow();
	});

	it('元の配列は変更しない', () => {
		renameStatus(defs, '完了', '済み');
		expect(defs[2]?.name).toBe('完了');
	});

	it('空の名前はエラー', () => {
		expect(() => renameStatus(defs, '完了', ' ')).toThrow('ステータス名を入力してください');
	});
});

describe('addStatus / removeStatus / moveStatus / changeCategory', () => {
	it('末尾に追加する。名前・旧名と重なる場合はエラー', () => {
		expect(addStatus(defs, ' 保留 ', 'stopped').at(-1)).toEqual({ name: '保留', category: 'stopped', aliases: [] });
		expect(() => addStatus(defs, 'レビュー待ち', 'stopped')).toThrow(/すでに使われています/);
	});

	it('削除する。最後の1つは削除できない', () => {
		expect(removeStatus(defs, '完了').map((d) => d.name)).toEqual(['未着手', 'レビュー中']);
		expect(() => removeStatus([defs[0] as StatusDef], '未着手')).toThrow();
	});

	it('並び順を動かす。端ではそのまま', () => {
		expect(moveStatus(defs, '完了', -1).map((d) => d.name)).toEqual(['未着手', '完了', 'レビュー中']);
		expect(moveStatus(defs, '未着手', -1).map((d) => d.name)).toEqual(['未着手', 'レビュー中', '完了']);
	});

	it('分類を変える', () => {
		expect(changeCategory(defs, '完了', 'stopped')[2]?.category).toBe('stopped');
	});
});
