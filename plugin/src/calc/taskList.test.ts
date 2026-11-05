import { describe, expect, it } from 'vitest';
import { defaultCalendar, defaultStatusSets } from '../config/defaults';
import { buildContext } from './context';
import {
	DEFAULT_TASK_LIST,
	filterTaskRows,
	groupTaskRows,
	parseTaskListOptions,
	sortTaskRows,
	taskRows,
	type TaskListOptions,
	type TaskRow,
} from './taskList';
import { EPIC, epic, indexOf, member, PJT, PJT2, project, task, USER, USER2, worklog } from './testData';

const statuses = defaultStatusSets();
const statusOrder = statuses.task.map((s) => s.name);
const labels = { project: (p: { title: string }) => p.title };
const today = '2026-11-10';

const index = indexOf([
	project(PJT, { title: 'B案件' }),
	project(PJT2, { title: 'A案件' }),
	epic(EPIC, { wbs: '1.10', title: '設計' }),
	epic('EPIC-2', { wbs: '1.2', title: '要件' }),
	member(USER, { title: '佐藤' }),
	member(USER2, { title: '伊藤' }),
	task('T1', { title: 'い', epic: EPIC, status: '進行中', due: '2026-11-05', estimate: 4 }),
	task('T2', { title: 'あ', project: PJT2, epic: 'EPIC-2', status: '完了', assignees: [USER, USER2], due: '2026-11-20' }),
	task('T3', { title: 'う', status: 'レビュー待ち', assignees: [], subtasks: { done: 1, total: 4 } }),
	task('T4', { title: 'え', status: '謎', assignees: ['USER-x'], epic: 'EPIC-x' }),
	worklog(USER, '2026-11', [
		['2026-11-02', 'T1', 3, 5],
		['2026-11-03', 'T2', 2, 1],
	]),
]);
const ctx = buildContext(index, statuses, defaultCalendar(), today);
const rows = taskRows(ctx, index.tasks());
const row = (id: string) => rows.find((r) => r.task.id === id) as TaskRow;
const ids = (rs: TaskRow[]) => rs.map((r) => r.task.id);
const opts = (o: Partial<TaskListOptions>): TaskListOptions => ({ ...DEFAULT_TASK_LIST, ...o });

describe('taskRows', () => {
	it('所属・担当者・工数・進捗・警告をまとめる', () => {
		const r = row('T1');
		expect(r.project?.title).toBe('B案件');
		expect(r.epic?.title).toBe('設計');
		expect(r.assignees.map((m) => m.title)).toEqual(['佐藤']);
		expect(r.hours).toEqual({ planned: 3, actual: 5 });
		expect(r.warnings.map((w) => w.kind)).toEqual(['overdue', 'overEstimate']);
		expect(row('T3').progress).toEqual({ done: false, subtaskRatio: 0.25 });
		expect(row('T2').progress.done).toBe(true);
	});

	it('計算上の日程を持つ。日付の無いタスクは日程なし', () => {
		expect(row('T1').schedule).toEqual({ start: '2026-11-05', end: '2026-11-10', startDelayed: false, endDelayed: true });
		expect(row('T3').schedule).toBeUndefined();
		expect(ids(sortTaskRows(rows, 'end', false, labels, statusOrder))).toEqual(['T1', 'T2', 'T3', 'T4']);
	});

	it('見つからないメンバー・設定に無いステータスはそのまま扱う', () => {
		const r = row('T4');
		expect(r.assignees).toEqual([]);
		expect(r.status).toBe('謎');
		expect(r.category).toBeUndefined();
		expect(r.epic).toBeUndefined();
	});
});

describe('filterTaskRows', () => {
	it('エピック・期限日の範囲・警告ありのみで絞り込む', () => {
		expect(ids(filterTaskRows(rows, opts({ epics: [EPIC] })))).toEqual(['T1']);
		expect(ids(filterTaskRows(rows, opts({ dueFrom: '2026-11-06' })))).toEqual(['T2']);
		expect(ids(filterTaskRows(rows, opts({ dueTo: '2026-11-05' })))).toEqual(['T1']);
		expect(ids(filterTaskRows(rows, opts({ warningsOnly: true })))).toEqual(['T1']);
	});
});

describe('sortTaskRows', () => {
	const sort = (key: TaskListOptions['sort'], desc = false) => ids(sortTaskRows(rows, key, desc, labels, statusOrder));

	it('期限日の無いものは昇順・降順どちらでも最後', () => {
		expect(sort('due')).toEqual(['T1', 'T2', 'T3', 'T4']);
		expect(sort('due', true)).toEqual(['T2', 'T1', 'T3', 'T4']);
	});

	it('ステータスは設定の並び順、設定に無いものは最後', () => {
		expect(sort('status')).toEqual(['T1', 'T3', 'T2', 'T4']);
	});

	it('エピックは WBS の数字の順（1.2 → 1.10）', () => {
		expect(sort('epic')).toEqual(['T2', 'T1', 'T3', 'T4']);
	});

	it('数値の列と、同じ値ならタイトル順', () => {
		expect(sort('actual', true)).toEqual(['T1', 'T2', 'T3', 'T4']);
		expect(sort('progress')).toEqual(['T1', 'T4', 'T3', 'T2']);
		expect(sort('title')).toEqual(['T2', 'T1', 'T3', 'T4']);
	});
});

describe('groupTaskRows', () => {
	const group = (by: TaskListOptions['groupBy']) =>
		groupTaskRows(rows, by, labels, statusOrder).map((g) => [g.label, ids(g.rows)]);

	it('グループ化しないときは1つにまとめる', () => {
		expect(group('none')).toEqual([['', ['T1', 'T2', 'T3', 'T4']]]);
	});

	it('プロジェクト・エピックは名前順、「なし」「見つからない」は最後', () => {
		expect(group('project')).toEqual([
			['A案件', ['T2']],
			['B案件', ['T1', 'T3', 'T4']],
		]);
		expect(group('epic')).toEqual([
			['1.2 要件', ['T2']],
			['1.10 設計', ['T1']],
			['（エピックなし）', ['T3']],
			['（見つからないエピック：EPIC-x）', ['T4']],
		]);
	});

	it('担当者が複数のタスクはそれぞれのグループに入る', () => {
		expect(group('assignee')).toEqual([
			['伊藤', ['T2']],
			['佐藤', ['T1', 'T2']],
			['（担当者なし）', ['T3', 'T4']],
		]);
	});

	it('ステータスは設定の並び順', () => {
		expect(group('status').map(([label]) => label)).toEqual(['進行中', 'レビュー待ち', '完了', '謎']);
	});
});

describe('parseTaskListOptions', () => {
	it('不正な値は既定値にする', () => {
		expect(parseTaskListOptions({ groupBy: 'x', sort: 1, epics: [1, 'E'], dueFrom: '11/1' })).toEqual({
			...DEFAULT_TASK_LIST,
			epics: ['E'],
		});
		expect(parseTaskListOptions(undefined)).toEqual(DEFAULT_TASK_LIST);
	});
});
