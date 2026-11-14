import { describe, expect, it } from 'vitest';
import { isChanged, linkCell, readRows } from './tableRows';

const TASK = 'TASK-0192f3a0-1234-7abc-8def-000000000001';
const SPEC = { heading: '作業ログ', columns: { date: '日付', task: 'タスク', memo: 'メモ' } };

const note = (...lines: string[]) => ['---', 'type: worklog', '---', '## 作業ログ', ...lines, ''].join('\n');
const read = (content: string) => readRows(content, SPEC, (get, line) => ({ line, date: get('date'), task: get('task'), memo: get('memo') }));

describe('readRows', () => {
	it('列名で読み、列の並び順は問わない。空の行は出さない', () => {
		const content = note('| メモ | 日付 | タスク |', '| --- | --- | --- |', '| 打合せ | 2026-11-02 | x |', '|  |  |  |');
		const { rows, snapshot, error } = read(content);
		expect(error).toBeUndefined();
		expect(rows).toEqual([{ line: 6, date: '2026-11-02', task: 'x', memo: '打合せ' }]);
		expect(snapshot).toHaveLength(2);
	});

	it('表が無ければ行も写しも無い', () => {
		expect(read(note('本文だけ'))).toEqual({ rows: [], snapshot: null });
	});

	it('必要な列が無ければ行を読まず、足りない列を知らせる', () => {
		const { rows, snapshot, error } = read(note('| 日付 | メモ |', '| --- | --- |', '| 2026-11-02 | a |'));
		expect(rows).toEqual([]);
		expect(snapshot).toHaveLength(1);
		expect(error).toContain('タスク');
	});
});

describe('linkCell', () => {
	it('読める ID はタイトル付きのリンクにする', () => {
		expect(linkCell(TASK, 'task', () => '設計')).toBe(`[[${TASK}\\|設計]]`);
	});

	it('読めない値は元のまま（| は \\| にする）', () => {
		expect(linkCell('謎|の値', 'task', () => '')).toBe('謎\\|の値');
	});

	it('空は空', () => {
		expect(linkCell('', 'task', () => '設計')).toBe('');
	});
});

describe('isChanged', () => {
	const initial: { line?: number; date: string; memo: string }[] = [{ line: 6, date: '2026-11-02', memo: 'a' }];

	it('前後の空白だけの違いは変えていないとみなす', () => {
		expect(isChanged({ line: 6, date: ' 2026-11-02 ', memo: 'a' }, initial, ['date', 'memo'])).toBe(false);
	});

	it('値が違えば変えた', () => {
		expect(isChanged({ line: 6, date: '2026-11-03', memo: 'a' }, initial, ['date', 'memo'])).toBe(true);
	});

	it('新しい行（行番号なし・元に無い行）は変えたとみなす', () => {
		expect(isChanged({ date: '2026-11-03', memo: 'a' }, initial, ['date', 'memo'])).toBe(true);
		expect(isChanged({ line: 9, date: '2026-11-02', memo: 'a' }, initial, ['date', 'memo'])).toBe(true);
	});
});
