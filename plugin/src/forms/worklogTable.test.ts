import { describe, expect, it } from 'vitest';
import { TABLE_SPEC } from '../parse/bodyTables';
import { applyTableEdits } from '../write/markdownTable';
import { worklogEdits, worklogRows, type WorklogRow } from './worklogTable';

const T1 = 'TASK-0192f3a0-1234-7abc-8def-000000000001';
const T2 = 'TASK-0192f3a0-1234-7abc-8def-000000000002';
const NOTE = [
	'---',
	'type: worklog',
	'---',
	'## 作業ログ',
	'| 日付 | タスク | 予定(h) | 実績(h) | メモ |',
	'| --- | --- | --- | --- | --- |',
	`| 2026-11-02 | [[${T1}]] | 2 | 1.5 |  |`,
	'| 2026/11/03 | [[TASK-typo]] | 1.3 |  | 確認 |',
	`| 2026-11-05 | [[${T2}\\|設計]] | 3 | 3 |  |`,
	'',
].join('\n');

const title = (id: string) => (id === T1 ? 'モデリング' : id === T2 ? '設計' : '');
const save = (content: string, change: (rows: WorklogRow[]) => WorklogRow[]) => {
	const { rows, snapshot } = worklogRows(content);
	const result = worklogEdits(change(rows.map((r) => ({ ...r }))), rows, '2026-11', title);
	return { ...result, content: applyTableEdits(content, TABLE_SPEC.worklog, 'date', snapshot, result.edits) };
};

describe('worklogRows', () => {
	it('読めない行も元の文字のまま出す。タスクは ID にする', () => {
		expect(worklogRows(NOTE).rows).toEqual([
			{ line: 6, date: '2026-11-02', task: T1, planned: '2', actual: '1.5', memo: '' },
			{ line: 7, date: '2026/11/03', task: '[[TASK-typo]]', planned: '1.3', actual: '', memo: '確認' },
			{ line: 8, date: '2026-11-05', task: T2, planned: '3', actual: '3', memo: '' },
		]);
	});
});

describe('作業ログの書き換え', () => {
	it('誤りのある行が残っていれば保存しない', () => {
		const { errors, warnings } = save(NOTE, (r) => r);
		expect(errors).toEqual(['作業ログ 2行目：日付を選んでください', '作業ログ 2行目：予定は0以上で0.25刻みの数値で入力してください（例：1.5）']);
		expect(warnings).toEqual(['作業ログ 2行目：タスクの読めない値（[[TASK-typo]]）はそのまま残しました']);
	});

	it('直した行だけ書き換え、ほかの行は1文字も変えない', () => {
		const { errors, content } = save(NOTE, (r) => [r[0]!, { ...r[1]!, date: '2026-11-03', task: T1, planned: '1.25' }, r[2]!]);
		expect(errors).toEqual([]);
		const lines = content.split('\n');
		expect(lines[6]).toBe(`| 2026-11-02 | [[${T1}]] | 2 | 1.5 |  |`);
		expect(lines[7]).toBe(`| 2026-11-03 | [[${T1}\\|モデリング]] | 1.25 |  | 確認 |`);
		expect(lines[8]).toBe(`| 2026-11-05 | [[${T2}\\|設計]] | 3 | 3 |  |`);
	});

	it('対象月の外の日付、予定・実績の両方が空の行は誤り。同じ日付・タスクは知らせる', () => {
		const rows = (r: WorklogRow[]) => [r[0]!, r[2]!];
		expect(save(NOTE, (r) => [...rows(r), { date: '2026-12-01', task: T1, planned: '1', actual: '', memo: '' }]).errors).toEqual([
			'作業ログ 3行目：日付は 2026-11 の日にしてください（ほかの月の記録は、この行を消して「作業ログを入力」で入れ直します）',
		]);
		expect(save(NOTE, (r) => [...rows(r), { date: '2026-11-04', task: T1, planned: '', actual: '', memo: 'x' }]).errors).toEqual([
			'作業ログ 3行目：予定か実績のどちらかを入力してください',
		]);
		const dup = save(NOTE, (r) => [...rows(r), { date: '2026-11-02', task: T1, planned: '1', actual: '', memo: '' }]);
		expect(dup.errors).toEqual([]);
		expect(dup.warnings).toEqual(['作業ログ 3行目：同じ日付・タスクの行がほかにもあります（合計されます）']);
	});

	it('新しい行は日付の順の位置に入れ、時間は数値の形にそろえる。消した行は除く', () => {
		const { content } = save(NOTE, (r) => [r[0]!, r[2]!, { date: '2026-11-04', task: T2, planned: '', actual: '2.50', memo: '' }]);
		expect(content.split('\n').slice(6, 9)).toEqual([
			`| 2026-11-02 | [[${T1}]] | 2 | 1.5 |  |`,
			`| 2026-11-04 | [[${T2}\\|設計]] |  | 2.5 |  |`,
			`| 2026-11-05 | [[${T2}\\|設計]] | 3 | 3 |  |`,
		]);
	});
});
