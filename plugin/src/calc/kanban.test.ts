import { describe, expect, it } from 'vitest';
import { defaultCalendar, defaultStatusSets } from '../config/defaults';
import { buildContext } from './context';
import { kanbanColumns, parseDraggedCard, statusMove, UNKNOWN_COLUMN } from './kanban';
import { taskRows } from './taskList';
import { indexOf, project, PJT, task } from './testData';

const statuses = defaultStatusSets();
const renamed = {
	...statuses,
	task: statuses.task.map((s) => (s.name === 'レビュー待ち' ? { ...s, name: 'レビュー中', aliases: ['レビュー待ち'] } : s)),
};

describe('statusMove', () => {
	const statuses = defaultStatusSets().task;
	it('動かした先の列のステータスを書く。同じ列なら何もしない', () => {
		expect(statusMove('未着手', '進行中', statuses)).toEqual({ status: '進行中' });
		expect(statusMove(UNKNOWN_COLUMN, '完了', statuses)).toEqual({ status: '完了' });
		expect(statusMove('進行中', '進行中', statuses)).toBeNull();
	});

	it('設定に無いステータスの列へは動かせない', () => {
		expect(statusMove('進行中', UNKNOWN_COLUMN, statuses)).toHaveProperty('error');
		expect(statusMove('進行中', '消えた名前', statuses)).toHaveProperty('error');
	});
});

describe('parseDraggedCard', () => {
	it('カードの形ならそのまま戻す', () => {
		const card = { path: 'tasks/TASK-1.md', title: '設計', from: UNKNOWN_COLUMN };
		expect(parseDraggedCard(JSON.stringify(card))).toEqual(card);
	});

	it('JSON でない・形が違うときは undefined', () => {
		expect(parseDraggedCard('{壊れた')).toBeUndefined();
		expect(parseDraggedCard('null')).toBeUndefined();
		expect(parseDraggedCard('"文字列"')).toBeUndefined();
		expect(parseDraggedCard(JSON.stringify({ path: 'a.md', title: 'x' }))).toBeUndefined();
		expect(parseDraggedCard(JSON.stringify({ path: '', title: 'x', from: '' }))).toBeUndefined();
		expect(parseDraggedCard(JSON.stringify({ path: 1, title: 'x', from: '' }))).toBeUndefined();
	});
});

describe('kanbanColumns', () => {
	const index = indexOf([
		project(PJT),
		task('A', { status: '進行中' }),
		task('B', { status: 'レビュー待ち' }),
		task('C', { status: '完了' }),
		task('D', { status: '謎' }),
		task('E', { status: '進行中' }),
	]);
	const ctx = buildContext(index, renamed, defaultCalendar(), '2026-11-01');
	const columns = kanbanColumns(taskRows(ctx, index.tasks()), renamed.task);
	const summary = columns.map((c) => [c.name, c.rows.map((r) => r.task.id), c.collapsedByDefault]);

	it('列は設定の並び順で、空の列も出す。完了系・停止系は初めからたたむ', () => {
		expect(summary).toEqual([
			['未着手', [], false],
			['進行中', ['A', 'E'], false],
			['レビュー中', ['B'], false],
			['差し戻し', [], false],
			['保留', [], true],
			['中止', [], true],
			['完了', ['C'], true],
			[UNKNOWN_COLUMN, ['D'], false],
		]);
	});

	it('設定に無いステータスが無ければ、その列は出さない', () => {
		expect(kanbanColumns([], renamed.task).map((c) => c.name)).not.toContain(UNKNOWN_COLUMN);
	});
});
