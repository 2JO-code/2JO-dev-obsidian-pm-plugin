import { describe, expect, it } from 'vitest';
import { defaultStatusSets } from '../config/defaults';
import { EMPTY_FILTER, filterProjects, filterTasks, parseFilter, type ViewFilter } from './filter';
import { PJT, PJT2, project, task, USER, USER2 } from './testData';

const statuses = defaultStatusSets();
const projects = new Map([
	[PJT, project(PJT)],
	[PJT2, project(PJT2, { status: 'クローズ' })],
]);
const tasks = [
	task('A', { status: '進行中', start: '2026-11-02', due: '2026-11-06' }),
	task('B', { status: '完了', assignees: [USER2], due: '2026-12-10' }),
	task('C', { project: PJT2, status: '未着手' }),
	task('D', { status: 'レビュー待ち' }),
];
const ids = (ts: { id: string }[]) => ts.map((t) => t.id);
const f = (overrides: Partial<ViewFilter>): ViewFilter => ({ ...EMPTY_FILTER, ...overrides });

describe('filterTasks', () => {
	it('何も指定しなければ、クローズ済みプロジェクトのタスク以外すべて', () => {
		expect(ids(filterTasks(tasks, EMPTY_FILTER, projects, statuses))).toEqual(['A', 'B', 'D']);
		expect(ids(filterTasks(tasks, f({ includeClosed: true }), projects, statuses))).toEqual(['A', 'B', 'C', 'D']);
	});

	it('プロジェクト・担当者・ステータスで絞り込む', () => {
		expect(ids(filterTasks(tasks, f({ projects: [PJT2], includeClosed: true }), projects, statuses))).toEqual(['C']);
		expect(ids(filterTasks(tasks, f({ members: [USER2] }), projects, statuses))).toEqual(['B']);
		expect(ids(filterTasks(tasks, f({ statuses: ['進行中', '完了'] }), projects, statuses))).toEqual(['A', 'B']);
	});

	it('旧名のステータスは現在の名前で絞り込める', () => {
		const renamed = {
			...statuses,
			task: statuses.task.map((s) => (s.name === 'レビュー待ち' ? { ...s, name: 'レビュー中', aliases: ['レビュー待ち'] } : s)),
		};
		expect(ids(filterTasks(tasks, f({ statuses: ['レビュー中'] }), projects, renamed))).toEqual(['D']);
	});


	it('担当者が複数のタスクは、誰かが一致すれば対象', () => {
		const multi = [task('E', { assignees: [USER, USER2] })];
		expect(ids(filterTasks(multi, f({ members: [USER2] }), projects, statuses))).toEqual(['E']);
	});
});

describe('filterProjects', () => {
	it('クローズ済み（完了系）は既定で除く', () => {
		expect(ids(filterProjects([...projects.values()], EMPTY_FILTER, statuses))).toEqual([PJT]);
		expect(ids(filterProjects([...projects.values()], f({ includeClosed: true }), statuses))).toEqual([PJT, PJT2]);
	});
});

describe('parseFilter', () => {
	it('保存されていた値を読み、不正な値は既定値にする', () => {
		expect(parseFilter({ projects: [PJT, 3], includeClosed: true })).toEqual({
			...EMPTY_FILTER,
			projects: [PJT],
			includeClosed: true,
		});
		expect(parseFilter(null)).toEqual(EMPTY_FILTER);
	});

	it('以前に保存された期間は読まない（画面に出ないまま絞り込まないように）', () => {
		expect(parseFilter({ start: '2026-11-01', end: '2026-11-30' })).toEqual(EMPTY_FILTER);
	});
});
