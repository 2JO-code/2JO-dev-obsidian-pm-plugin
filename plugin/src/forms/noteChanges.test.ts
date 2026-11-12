import { describe, expect, it } from 'vitest';
import { editedItems, formatItemValue, frameItems, isOverwritten, needsConfirm, noteChanges, sameAsChecked, sameItemValue, savedValue } from './noteChanges';

const U = (n: number) => `0192f3a0-1234-7abc-8def-${String(n).padStart(12, '0')}`;
const USER = `USER-${U(1)}`;
const labels = { status: 'ステータス', due: '期限日', assignees: '担当者', description: '説明' };

describe('sameItemValue', () => {
	it('空（undefined・null・空文字・空配列）どうしは同じ', () => {
		expect(sameItemValue(undefined, null)).toBe(true);
		expect(sameItemValue(null, '')).toBe(true);
		expect(sameItemValue('', [])).toBe(true);
	});

	it('数値と数字の文字列は同じ', () => {
		expect(sameItemValue(8, '8')).toBe(true);
		expect(sameItemValue(0.25, '0.25')).toBe(true);
		expect(sameItemValue(8, '9')).toBe(false);
	});

	it('配列は順序つきで要素ごとに比べる', () => {
		expect(sameItemValue(['a', 'b'], ['a', 'b'])).toBe(true);
		expect(sameItemValue(['a', 'b'], ['b', 'a'])).toBe(false);
		expect(sameItemValue([1], ['1'])).toBe(true);
	});

	it('真偽値は空と同じにしない', () => {
		expect(sameItemValue(false, null)).toBe(false);
		expect(sameItemValue(true, true)).toBe(true);
	});
});

describe('noteChanges', () => {
	const opened = { status: '未着手', due: '2026-11-20', assignees: [], description: '説明' };

	it('だれも変えていなければ行が無く、ダイアログを出さない', () => {
		const rows = noteChanges(opened, opened, opened, labels);
		expect(rows).toEqual([]);
		expect(needsConfirm(rows)).toBe(false);
	});

	it('フォームだけで変えた項目は行に出るが、ダイアログは出さない', () => {
		const rows = noteChanges(opened, opened, { ...opened, status: '進行中' }, labels);
		expect(rows.map((r) => [r.key, r.changedInNote, r.editedInForm])).toEqual([['status', false, true]]);
		expect(needsConfirm(rows)).toBe(false);
	});

	it('ノートだけで変わった項目があればダイアログを出し、上書きはしない', () => {
		const rows = noteChanges(opened, { ...opened, due: '2026-11-30' }, { ...opened, status: '進行中' }, labels);
		expect(rows.map((r) => r.key)).toEqual(['status', 'due']);
		expect(needsConfirm(rows)).toBe(true);
		expect(rows.some(isOverwritten)).toBe(false);
	});

	it('両方で同じ項目を違う値に変えたら、上書きされる行になる', () => {
		const rows = noteChanges(opened, { ...opened, due: '2026-11-30' }, { ...opened, due: '2026-12-01' }, labels);
		expect(needsConfirm(rows)).toBe(true);
		expect(rows.filter(isOverwritten).map((r) => r.key)).toEqual(['due']);
	});

	it('両方で同じ値に変えただけなら、ダイアログを出さない', () => {
		const rows = noteChanges(opened, { ...opened, due: '2026-11-30' }, { ...opened, due: '2026-11-30' }, labels);
		expect(needsConfirm(rows)).toBe(false);
	});

	it('保存後の値：変えた項目だけなら、フォームで変えていない項目は今のノートの値を残す', () => {
		const rows = noteChanges(opened, { ...opened, due: '2026-11-30' }, { ...opened, status: '進行中' }, labels);
		expect(rows.map((r) => [r.key, savedValue(r, 'edited')])).toEqual([
			['status', '進行中'],
			['due', '2026-11-30'],
		]);
	});

	it('保存後の値：すべて保存なら、ノートで変わった項目もフォームの値に戻す', () => {
		const rows = noteChanges(opened, { ...opened, due: '2026-11-30' }, { ...opened, status: '進行中' }, labels);
		expect(rows.map((r) => [r.key, savedValue(r, 'all')])).toEqual([
			['status', '進行中'],
			['due', '2026-11-20'],
		]);
	});

	it('項目名の無いキー（aliases など）は行に出さない', () => {
		const rows = noteChanges({ aliases: ['a'] }, { aliases: ['b'] }, { aliases: ['c'] }, labels);
		expect(rows).toEqual([]);
	});

	it('フォームに無い項目（ほかの人だけが変えた lag_days など）は見ない', () => {
		const rows = noteChanges({ ...opened, lag_days: 1 }, { ...opened, lag_days: 2 }, opened, { ...labels, lag_days: '遅れ' });
		expect(needsConfirm(rows)).toBe(false);
	});
});

describe('editedItems', () => {
	it('フォームで変えた項目だけを返す。消した値（空の枠）も含める', () => {
		const opened = { status: '未着手', due: '2026-11-20', estimate: 8 };
		expect(editedItems(opened, { status: '進行中', due: null, estimate: '8' })).toEqual({ status: '進行中', due: null });
	});

	it('ノートに無いキーを空のまま書いても、変えたことにしない', () => {
		expect(editedItems({}, { plan_start: null, assignees: [] })).toEqual({});
	});
});

describe('frameItems', () => {
	it('ノートに無いキーで、フォームの値が空のものを返す。説明は除く', () => {
		expect(frameItems({ plan_start: null, due: null, assignees: [], description: '' }, { due: '2026-11-20' })).toEqual({
			plan_start: null,
			assignees: [],
		});
	});
});

describe('sameAsChecked', () => {
	it('指定したキーだけ比べる', () => {
		expect(sameAsChecked({ a: 1, b: 2 }, { a: '1', b: 3 }, ['a'])).toBe(true);
		expect(sameAsChecked({ a: 1, b: 2 }, { a: '1', b: 3 }, ['a', 'b'])).toBe(false);
	});
});

describe('formatItemValue', () => {
	const titleOf = (id: string) => (id === USER ? '佐藤 一郎' : undefined);

	it('空は「なし」、真偽値は「はい／いいえ」', () => {
		expect(formatItemValue(null, titleOf)).toBe('なし');
		expect(formatItemValue([], titleOf)).toBe('なし');
		expect(formatItemValue(true, titleOf)).toBe('はい');
	});

	it('リンクはタイトルにし、見つからなければ ID のまま。配列は「、」でつなぐ', () => {
		expect(formatItemValue([`[[${USER}]]`, '[[TASK-x]]'], titleOf)).toBe('佐藤 一郎、TASK-x');
	});

	it('数値と文字列はそのまま', () => {
		expect(formatItemValue(0.25, titleOf)).toBe('0.25');
		expect(formatItemValue('進行中', titleOf)).toBe('進行中');
	});
});
