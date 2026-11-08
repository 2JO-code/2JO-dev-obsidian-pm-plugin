import { describe, expect, it } from 'vitest';
import { worklog } from '../calc/testData';
import { TABLE_SPEC } from '../parse/bodyTables';
import { applyTableEdits, tableSnapshot } from '../write/markdownTable';
import {
	cellEdited,
	changesByMonth,
	savedInIndex,
	worklogSavedNotice,
	cellHours,
	defaultWorklogMember,
	assignedTaskIds,
	filterGridTasks,
	gridChanges,
	gridTaskIds,
	validateGridChanges,
	worklogGridEdits,
	type GridChange,
} from './worklogGrid';
import {
	gridHoursOf,
	gridKey,
	normalizeHours,
	periodDates,
	sumEstimates,
	sumHours,
	tasksWithHours,
	type GridHours,
} from '../calc/worklogCells';
import { worklogRows } from './worklogTable';

const U1 = 'USER-0192f3a0-1234-7abc-8def-000000000001';
const U2 = 'USER-0192f3a0-1234-7abc-8def-000000000002';
const T1 = 'TASK-0192f3a0-1234-7abc-8def-000000000001';
const T2 = 'TASK-0192f3a0-1234-7abc-8def-000000000002';
const T3 = 'TASK-0192f3a0-1234-7abc-8def-000000000003';

const NOTE = [
	'---',
	'type: worklog',
	'---',
	'## 作業ログ',
	'| 日付 | タスク | 予定(h) | 実績(h) | メモ |',
	'| --- | --- | --- | --- | --- |',
	`| 2026-11-02 | [[${T1}]] | 2 | 1.5 |  |`,
	'| 2026/11/03 | [[TASK-typo]] | 1.3 |  | 確認 |',
	`| 2026-11-05 | [[${T2}\\|設計]] | 3 | 3 | 前半 |`,
	`| 2026-11-05 | [[${T2}\\|設計]] | 1 |  | 後半 |`,
	`| 2026-11-09 | [[${T1}]] | 4 |  |  |`,
	'',
].join('\n');

const title = (id: string) => (id === T1 ? 'モデリング' : id === T2 ? '設計' : id === T3 ? 'テスト' : '');
const change = (date: string, task: string, planned: string, actual: string): GridChange => ({ date, task, planned, actual });
const save = (content: string, changes: GridChange[]) => {
	const result = worklogGridEdits(worklogRows(content).rows, changes, title);
	return { ...result, content: applyTableEdits(content, TABLE_SPEC.worklog, 'date', tableSnapshot(content, TABLE_SPEC.worklog), result.edits) };
};
const tableLines = (content: string) => content.split('\n').slice(6, -1);

describe('マスの値', () => {
	const logs = [
		worklog(U1, '2026-10', [['2026-10-30', T1, 2, 0]]),
		worklog(U1, '2026-11', [
			['2026-11-01', T1, 1, 1.5],
			['2026-11-01', T1, 0.5, 0],
			['2026-11-02', T2, 3, 3],
		]),
		worklog('USER-other', '2026-11', [['2026-11-01', T3, 8, 8]]),
	];
	const dates = periodDates('2026-10-26', 'week');

	it('月をまたぐ週は2つの作業ログから読み、同じ日付・タスクは合計する。0は空', () => {
		const hours = gridHoursOf(logs, U1, dates);
		expect(Object.fromEntries(hours)).toEqual({
			[gridKey('2026-10-30', T1)]: { planned: '2', actual: '' },
			[gridKey('2026-11-01', T1)]: { planned: '1.5', actual: '1.5' },
		});
		expect(tasksWithHours(hours)).toEqual([T1]);
	});

	it('入力したマスはその値、ほかは記録の値', () => {
		const base = gridHoursOf(logs, U1, dates);
		const edits = new Map([[gridKey('2026-10-30', T1), { planned: '3', actual: '' }]]);
		expect(cellHours(gridKey('2026-10-30', T1), edits, base)).toEqual({ planned: '3', actual: '' });
		expect(cellHours(gridKey('2026-11-01', T1), edits, base)).toEqual({ planned: '1.5', actual: '1.5' });
		expect(cellHours(gridKey('2026-10-27', T1), edits, base)).toEqual({ planned: '', actual: '' });
	});

	it('並べるタスクは重ねず、並び順の文字の順', () => {
		const key = (id: string) => title(id);
		expect(gridTaskIds([[T1, T2], [T2], [T3]], key)).toEqual([T3, T1, T2]);
	});

	it('プロジェクト・エピック・ステータスで絞る。見つからないタスクは絞るときだけ外す', () => {
		const tasks = new Map([
			[T1, { project: 'PJT-a', epic: 'EPIC-a', status: '進行中' }],
			[T2, { project: 'PJT-a', status: '未着手' }],
			[T3, { project: 'PJT-b', epic: 'EPIC-b', status: '進行中' }],
		]);
		const of = (id: string) => tasks.get(id);
		const ids = [T1, T2, T3, 'TASK-missing'];
		const none = { project: '', epic: '', status: '' };
		expect(filterGridTasks(ids, of, none)).toEqual(ids);
		expect(filterGridTasks(ids, of, { ...none, project: 'PJT-a' })).toEqual([T1, T2]);
		expect(filterGridTasks(ids, of, { ...none, project: 'PJT-a', epic: 'EPIC-a' })).toEqual([T1]);
		expect(filterGridTasks(ids, of, { ...none, status: '進行中' })).toEqual([T1, T3]);
		expect(filterGridTasks(ids, of, { ...none, project: 'PJT-a', status: '未着手' })).toEqual([T2]);
	});

	it('見積は、見積のあるタスクだけを足す。どれにも無ければ null', () => {
		const estimates: Record<string, number> = { [T1]: 8, [T2]: 2.5 };
		expect(sumEstimates([T1, T2, T3], (id) => estimates[id])).toBe(10.5);
		expect(sumEstimates([T3], (id) => estimates[id])).toBeNull();
	});

	it('合計は読める値だけを足す', () => {
		expect(sumHours(['1.5', '', 'abc', '2'])).toBe(3.5);
	});
});

describe('変えたマス', () => {
	const base = new Map<string, GridHours>([[gridKey('2026-11-02', T1), { planned: '2', actual: '1.5' }]]);

	it('記録と同じ値（書き方の違い・0と空）は変えていないとみなす', () => {
		expect(normalizeHours(' 2.50 ')).toBe('2.5');
		expect(normalizeHours('0')).toBe('');
		expect(normalizeHours('1.3')).toBe('1.3');
		const edits = new Map([
			[gridKey('2026-11-02', T1), { planned: '2.0', actual: '1.50' }],
			[gridKey('2026-11-03', T1), { planned: '0', actual: '' }],
		]);
		expect(gridChanges(edits, base)).toEqual([]);
	});

	it('違う値は日付の順に出す', () => {
		const edits = new Map([
			[gridKey('2026-11-04', T2), { planned: '1', actual: '' }],
			[gridKey('2026-11-02', T1), { planned: '2', actual: '' }],
		]);
		expect(gridChanges(edits, base)).toEqual([change('2026-11-02', T1, '2', ''), change('2026-11-04', T2, '1', '')]);
	});

	it('cellEdited は予定・実績ごとに、記録と違うかを見る', () => {
		const key = gridKey('2026-11-02', T1);
		const edits = new Map([[key, { planned: '2.0', actual: '3' }]]);
		expect(cellEdited(key, 'planned', edits, base)).toBe(false);
		expect(cellEdited(key, 'actual', edits, base)).toBe(true);
		// 入力していないマス・記録の無いマスに0を入れたマスは変えていない
		expect(cellEdited(key, 'actual', new Map(), base)).toBe(false);
		const empty = gridKey('2026-11-05', T1);
		expect(cellEdited(empty, 'planned', new Map([[empty, { planned: '0', actual: '' }]]), base)).toBe(false);
	});

	it('0.25刻みでない値は誤り', () => {
		const errors = validateGridChanges([change('2026-11-02', T1, '1.3', 'x'), change('2026-11-03', T1, '1', '')], (c) => c.date);
		expect(errors).toEqual([
			'2026-11-02 の予定は0以上で0.25刻みの数値で入力してください（例：1.5）',
			'2026-11-02 の実績は0以上で0.25刻みの数値で入力してください（例：1.5）',
		]);
	});
});

describe('作業ログの書き換え', () => {
	it('変えたマスの行だけを書き換え、ほかの行は1文字も変えない', () => {
		const result = save(NOTE, [change('2026-11-02', T1, '2', '2')]);
		expect(tableLines(result.content)).toEqual([
			`| 2026-11-02 | [[${T1}\\|モデリング]] | 2 | 2 |  |`,
			'| 2026/11/03 | [[TASK-typo]] | 1.3 |  | 確認 |',
			`| 2026-11-05 | [[${T2}\\|設計]] | 3 | 3 | 前半 |`,
			`| 2026-11-05 | [[${T2}\\|設計]] | 1 |  | 後半 |`,
			`| 2026-11-09 | [[${T1}]] | 4 |  |  |`,
		]);
	});

	it('同じ日付・タスクの行は1行にまとめ、メモをつなげる', () => {
		const result = save(NOTE, [change('2026-11-05', T2, '4', '3')]);
		expect(result.merged).toBe(1);
		expect(tableLines(result.content)).toContain(`| 2026-11-05 | [[${T2}\\|設計]] | 4 | 3 | 前半 / 後半 |`);
		expect(tableLines(result.content)).toHaveLength(4);
	});

	it('予定・実績とも空にしたマスは行を消し、消したメモを数える', () => {
		const result = save(NOTE, [change('2026-11-05', T2, '', ''), change('2026-11-09', T1, '', '')]);
		expect(result.droppedMemos).toBe(2);
		expect(tableLines(result.content)).toEqual([`| 2026-11-02 | [[${T1}]] | 2 | 1.5 |  |`, '| 2026/11/03 | [[TASK-typo]] | 1.3 |  | 確認 |']);
	});

	it('行の無いマスは日付の順の位置に足す', () => {
		const note = NOTE.replace('| 2026/11/03 | [[TASK-typo]] | 1.3 |  | 確認 |\n', '');
		const result = save(note, [change('2026-11-06', T3, '', '2'), change('2026-11-01', T3, '1', '')]);
		expect(tableLines(result.content)).toEqual([
			`| 2026-11-01 | [[${T3}\\|テスト]] | 1 |  |  |`,
			`| 2026-11-02 | [[${T1}]] | 2 | 1.5 |  |`,
			`| 2026-11-05 | [[${T2}\\|設計]] | 3 | 3 | 前半 |`,
			`| 2026-11-05 | [[${T2}\\|設計]] | 1 |  | 後半 |`,
			`| 2026-11-06 | [[${T3}\\|テスト]] |  | 2 |  |`,
			`| 2026-11-09 | [[${T1}]] | 4 |  |  |`,
		]);
	});

	it('空にした行の無いマスは何もしない', () => {
		expect(save(NOTE, [change('2026-11-06', T3, '', '')]).content).toBe(NOTE);
	});

	it('表が無ければ本文の末尾に作る', () => {
		const result = save('---\ntype: worklog\n---\n', [change('2026-11-06', T3, '1', '')]);
		expect(result.content).toBe(
			['---', 'type: worklog', '---', '## 作業ログ', '| 日付 | タスク | 予定(h) | 実績(h) | メモ |', '| --- | --- | --- | --- | --- |', `| 2026-11-06 | [[${T3}\\|テスト]] | 1 |  |  |`, ''].join('\n'),
		);
	});

	it('改行コード（CRLF）を保つ', () => {
		const crlf = NOTE.replace(/\n/g, '\r\n');
		const result = save(crlf, [change('2026-11-02', T1, '2', '2')]);
		expect(result.content).toBe(crlf.replace(`| 2026-11-02 | [[${T1}]] | 2 | 1.5 |  |`, `| 2026-11-02 | [[${T1}\\|モデリング]] | 2 | 2 |  |`));
	});
});

describe('defaultWorklogMember', () => {
	const [A, B, C] = ['USER-a', 'USER-b', 'USER-c'];
	it('前回の人が担当者ならその人', () => {
		expect(defaultWorklogMember(B, [A, B], [A, B, C])).toBe(B);
	});
	it('前回の人が担当外で、担当者が1人ならその人', () => {
		expect(defaultWorklogMember(C, [A], [A, B, C])).toBe(A);
		expect(defaultWorklogMember('', [A], [A])).toBe(A);
	});
	it('担当者が複数・いない・在籍していなければ前回の人', () => {
		expect(defaultWorklogMember(C, [A, B], [A, B, C])).toBe(C);
		expect(defaultWorklogMember(C, [], [A, B, C])).toBe(C);
		expect(defaultWorklogMember(C, [A], [B, C])).toBe(C);
	});
});

describe('assignedTaskIds', () => {
	const tasks = [
		{ id: T1, assignees: [U1] },
		{ id: T2, assignees: [U1, U2] },
		{ id: T3, assignees: [U2] },
	];
	const isOpen = (id: string) => id !== T2;

	it('担当の未完了タスクだけ', () => {
		expect(assignedTaskIds(tasks, U1, isOpen, false)).toEqual([T1]);
	});

	it('完了・停止も含める', () => {
		expect(assignedTaskIds(tasks, U1, isOpen, true)).toEqual([T1, T2]);
		expect(assignedTaskIds(tasks, U2, isOpen, true)).toEqual([T2, T3]);
	});
});

describe('保存', () => {
	it('savedInIndex は索引に同じ値が載ったキーだけ', () => {
		const a = gridKey('2026-11-02', T1);
		const b = gridKey('2026-11-03', T1);
		const c = gridKey('2026-11-04', T1);
		const saved = new Map<string, GridHours>([
			[a, { planned: '2.0', actual: '' }],
			[b, { planned: '1', actual: '' }],
			[c, { planned: '', actual: '' }],
		]);
		const index = new Map<string, GridHours>([
			[a, { planned: '2', actual: '' }],
			[b, { planned: '3', actual: '' }],
		]);
		// 消したマス（空）は、索引から消えたら載ったとみなす
		expect(savedInIndex(saved, index)).toEqual([a, c]);
	});

	it('changesByMonth は月ごとに分ける', () => {
		const changes = [change('2026-10-31', T1, '1', ''), change('2026-11-01', T1, '2', ''), change('2026-11-02', T2, '', '1')];
		expect(changesByMonth(changes)).toEqual([
			{ month: '2026-10', changes: [changes[0]] },
			{ month: '2026-11', changes: [changes[1], changes[2]] },
		]);
	});

	it('worklogSavedNotice はまとめた行・消えたメモがあるときだけ添える', () => {
		expect(worklogSavedNotice(3, 0, 0)).toEqual(['作業ログを保存しました（3 マス）']);
		expect(worklogSavedNotice(3, 2, 1)).toEqual([
			'作業ログを保存しました（3 マス）',
			'同じ日付・タスクの行 2 行を1行にまとめました',
			'消した記録のメモ 1 件も消えました',
		]);
	});
});
