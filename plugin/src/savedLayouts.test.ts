import { describe, expect, it } from 'vitest';
import { checkLayoutName, layoutLabel, parseSavedLayouts, putLayout, removeLayout, type SavedLayout } from './savedLayouts';

const layout = (name: string, savedAt = '2026-11-15'): SavedLayout => ({ name, savedAt, layout: { main: { id: name } } });

describe('parseSavedLayouts', () => {
	it('保存された一覧をそのまま読む', () => {
		expect(parseSavedLayouts([layout('A'), layout('B')])).toEqual([layout('A'), layout('B')]);
	});

	it('配列でなければ空にする', () => {
		expect(parseSavedLayouts(null)).toEqual([]);
		expect(parseSavedLayouts({ name: 'A' })).toEqual([]);
	});

	it('名前が無い・空・レイアウトがオブジェクトでないものは捨てる', () => {
		const stored = [{ name: '', layout: {} }, { layout: {} }, { name: 'A', layout: [] }, { name: 'B', layout: 'x' }, 'x', layout('C')];
		expect(parseSavedLayouts(stored)).toEqual([layout('C')]);
	});

	it('同じ名前は先のものだけ残す', () => {
		const first = layout('A', '2026-11-01');
		expect(parseSavedLayouts([first, layout('A', '2026-11-02')])).toEqual([first]);
	});

	it('保存日が日付でなければ空にする', () => {
		expect(parseSavedLayouts([{ name: 'A', savedAt: 'x', layout: {} }])).toEqual([{ name: 'A', savedAt: '', layout: {} }]);
	});
});

describe('checkLayoutName', () => {
	it('前後の空白を除いた名前を返す', () => {
		expect(checkLayoutName('  作業用 ', [])).toEqual({ name: '作業用', errors: [], exists: false });
	});

	it('空なら誤りにする', () => {
		expect(checkLayoutName('   ', []).errors).toEqual(['名前を入力してください']);
	});

	it('40文字を超えたら誤りにする', () => {
		expect(checkLayoutName('あ'.repeat(40), []).errors).toEqual([]);
		expect(checkLayoutName('あ'.repeat(41), []).errors).toEqual(['名前は40文字までにしてください']);
	});

	it('同じ名前があれば上書きになることを返す', () => {
		expect(checkLayoutName('A', [layout('A')]).exists).toBe(true);
		expect(checkLayoutName('B', [layout('A')]).exists).toBe(false);
	});
});

describe('putLayout', () => {
	it('新しい名前は末尾に足す', () => {
		expect(putLayout([layout('A')], layout('B')).map((l) => l.name)).toEqual(['A', 'B']);
	});

	it('同じ名前は同じ位置で置き換える', () => {
		const next = layout('A', '2026-12-01');
		expect(putLayout([layout('A'), layout('B')], next)).toEqual([next, layout('B')]);
	});
});

describe('removeLayout', () => {
	it('名前の一致するものを除く', () => {
		expect(removeLayout([layout('A'), layout('B')], 'A')).toEqual([layout('B')]);
	});
});

describe('layoutLabel', () => {
	it('名前と保存日を出す。保存日が無ければ名前だけ', () => {
		expect(layoutLabel(layout('A'))).toBe('A（2026-11-15 保存）');
		expect(layoutLabel(layout('A', ''))).toBe('A');
	});
});
