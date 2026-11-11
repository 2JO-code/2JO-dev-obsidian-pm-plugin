import { describe, expect, it } from 'vitest';
import { defaultCalendar, defaultStatusSets } from '../config/defaults';
import { buildContext } from './context';
import { epic, indexOf, PJT, project, task, USER, USER2 } from './testData';
import { EMPTY_FILTER } from './filter';
import { isOpen, isOpenByDefault, parseToggled, toggledForAll, wbsKey, wbsTree, wbsTreeFor } from './wbs';

const statuses = defaultStatusSets();
const index = indexOf([
	project(PJT),
	epic('E1', { wbs: '2' }),
	epic('E2', { wbs: '1' }),
	task('T1', { epic: 'E1', start: '2026-11-10', assignees: [USER] }),
	task('T2', { epic: 'E1', start: '2026-11-02', assignees: [USER2], status: '完了' }),
	task('T3', { epic: 'E2', start: '2026-11-05', assignees: [USER2] }),
	task('T4', { start: '2026-11-03' }),
]);
const ctx = buildContext(index, statuses, defaultCalendar(), '2026-10-01');
const labels = { project: (p: { title: string }) => p.title };
const order = statuses.task.map((s) => s.name);
const shape = (visible?: Set<string>) =>
	wbsTree(ctx, index.projects(), visible, labels, order).map((p) => [
		p.status.project.id,
		p.epics.map((e) => [e.row.epic?.id ?? '-', e.tasks.map((t) => t.task.id)]),
	]);

describe('wbsTree', () => {
	it('エピックは WBS 順、エピックなしは最後。タスクは見込み開始日の順', () => {
		expect(shape()).toEqual([[PJT, [['E2', ['T3']], ['E1', ['T2', 'T1']], ['-', ['T4']]]]]);
	});

	it('タスクは番号順で、番号の無いものは開始日の順で後ろ。order は絞り込まない全タスク', () => {
		const numbered = indexOf([
			project(PJT),
			epic('E1', { wbs: '1' }),
			task('A', { epic: 'E1', start: '2026-11-02' }),
			task('B', { epic: 'E1', start: '2026-11-03', wbs: '2' }),
			task('C', { epic: 'E1', start: '2026-11-04', wbs: '1' }),
			task('D', { epic: 'E1', start: '2026-10-28' }),
		]);
		const c = buildContext(numbered, statuses, defaultCalendar(), '2026-10-01');
		const e1 = wbsTree(c, numbered.projects(), new Set(['A', 'B']), labels, order)[0]?.epics[0];
		expect(e1?.tasks.map((t) => t.task.id)).toEqual(['B', 'A']);
		expect(e1?.order).toEqual([{ id: 'C', wbs: '1' }, { id: 'B', wbs: '2' }, { id: 'D' }, { id: 'A' }]);
	});

	it('絞り込むと表示するタスクの無いエピックを出さない。進捗はエピック全体のまま', () => {
		const visible = new Set(['T1']);
		expect(shape(visible)).toEqual([[PJT, [['E1', ['T1']]]]]);
		const e1 = wbsTree(ctx, index.projects(), visible, labels, order)[0]?.epics[0];
		expect(e1?.row.progress).toEqual({ done: 1, total: 2, ratio: 0.5 });
	});

	it('初期の開閉はプロジェクトだけ開く', () => {
		expect(isOpenByDefault(wbsKey.project(PJT))).toBe(true);
		expect(isOpenByDefault(wbsKey.epic(PJT, 'E1'))).toBe(false);
		expect(wbsKey.epic(PJT, undefined)).toBe(`n:${PJT}`);
	});
});

describe('wbsTreeFor', () => {
	it('担当者で絞り込んだときだけ表示するタスクを絞る', () => {
		expect(wbsTreeFor(ctx, EMPTY_FILTER, labels).narrowed).toBe(false);
		const { tree, narrowed } = wbsTreeFor(ctx, { ...EMPTY_FILTER, members: [USER] }, labels);
		expect(narrowed).toBe(true);
		// T4 は担当者の既定値が USER（testData）
		expect(tree[0]?.epics.map((e) => e.tasks.map((t) => t.task.id))).toEqual([['T1'], ['T4']]);
	});

	it('出してよいタスクを渡すと、その中だけ。タスクの無いプロジェクトは出さない', () => {
		const { tree, narrowed } = wbsTreeFor(ctx, EMPTY_FILTER, labels, new Set(['T4']));
		expect(narrowed).toBe(true);
		expect(tree.map((p) => p.epics.map((e) => e.tasks.map((t) => t.task.id)))).toEqual([[['T4']]]);
		expect(wbsTreeFor(ctx, EMPTY_FILTER, labels, new Set()).tree).toEqual([]);
	});
});

describe('開閉の状態', () => {
	const { tree } = wbsTreeFor(ctx, EMPTY_FILTER, labels);

	it('すべて開く・すべて閉じる', () => {
		const open = toggledForAll(tree, true);
		expect([wbsKey.epic(PJT, 'E1'), wbsKey.epic(PJT, undefined)].every((k) => isOpen(open, k))).toBe(true);
		const closed = toggledForAll(tree, false);
		expect(isOpen(closed, wbsKey.project(PJT))).toBe(false);
	});

	it('保存されていた値の文字列だけを読む', () => {
		expect([...parseToggled(['a', 1, 'b'])]).toEqual(['a', 'b']);
		expect(parseToggled(undefined).size).toBe(0);
	});
});
