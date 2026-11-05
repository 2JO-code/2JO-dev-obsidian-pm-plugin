import { describe, expect, it } from 'vitest';
import { TABLE_SPEC } from '../parse/bodyTables';
import { applyTableEdits } from '../write/markdownTable';
import { holidayEdits, holidayRows, type HolidayRow } from './holidayTable';

// Obsidian が列幅をそろえた形の表
const NOTE = [
	'---',
	'type: user',
	'---',
	'## 個人休日',
	'| 日付         | メモ  |',
	'| ---------- | --- |',
	'| 2026-10-07 | 有給  |',
	'| 2026-12-01 | 通院  |',
	'|            |     |',
	'',
].join('\n');

const save = (content: string, change: (rows: HolidayRow[]) => HolidayRow[]) => {
	const { rows, snapshot } = holidayRows(content);
	const result = holidayEdits(change(rows.map((r) => ({ ...r }))), rows);
	return { ...result, content: applyTableEdits(content, TABLE_SPEC.holidays, 'date', snapshot, result.edits) };
};

describe('holidayRows', () => {
	it('表の行を読む。空の行は出さない', () => {
		expect(holidayRows(NOTE).rows).toEqual([
			{ line: 6, date: '2026-10-07', memo: '有給' },
			{ line: 7, date: '2026-12-01', memo: '通院' },
		]);
	});

	it('列が足りない表は編集できない', () => {
		expect(holidayRows('## 個人休日\n| 日付 |\n| --- |\n').error).toContain('メモ');
	});
});

describe('個人休日の書き換え', () => {
	it('変えていなければ1文字も変えない（そろえた列幅も保つ）', () => {
		expect(save(NOTE, (r) => r).content).toBe(NOTE);
	});

	it('新しい行は日付の順の位置に入れ、ほかの行と空の行はそのまま', () => {
		const { content } = save(NOTE, (r) => [...r, { date: '2026-11-20', memo: '有給' }]);
		expect(content.split('\n').slice(4, 9)).toEqual(['| 日付         | メモ  |', '| ---------- | --- |', '| 2026-10-07 | 有給  |', '| 2026-11-20 | 有給 |', '| 2026-12-01 | 通院  |']);
		expect(content.split('\n')[9]).toBe('|            |     |');
	});

	it('変えた行だけ書き換え、消した行は除く', () => {
		const { content } = save(NOTE, (r) => [{ ...r[1]!, memo: '午前 | 通院' }]);
		expect(content.split('\n').slice(6, 8)).toEqual(['| 2026-12-01 | 午前 \\| 通院 |', '|            |     |']);
	});

	it('誤りと、同じ日付の行を知らせる', () => {
		const bad = save(NOTE, (r) => [...r, { date: '2026-02-30', memo: '' }]);
		expect(bad.errors).toEqual(['個人休日 3行目：日付を選んでください']);
		const dup = save(NOTE, (r) => [...r, { date: '2026-10-07', memo: '' }]);
		expect(dup.errors).toEqual([]);
		expect(dup.warnings).toEqual(['個人休日 3行目：同じ日付の行がほかにもあります（最初の行だけ使います）']);
	});

	it('中身の無い新しい行は捨てる。表が無ければ本文の末尾に作る', () => {
		const content = '---\ntype: user\n---\n';
		const { content: out } = save(content, (r) => [...r, { date: '', memo: '' }, { date: '2026-11-20', memo: '' }]);
		expect(out).toBe('---\ntype: user\n---\n## 個人休日\n| 日付 | メモ |\n| --- | --- |\n| 2026-11-20 |  |\n');
	});
});
