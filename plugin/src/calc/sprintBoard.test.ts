import { describe, expect, it } from 'vitest';
import { defaultCalendar, defaultStatusSets } from '../config/defaults';
import type { Task } from '../model';
import { buildContext } from './context';
import { BACKLOG, dependencyGroups, linkCounts, dependencyLanes, sortSprints, sprintBoardRows, sprintBoardLinks, sprintColumns, sprintMove, sprintPeriodText, sprintPhase } from './sprintBoard';
import { taskRows, type TaskRow } from './taskList';
import { indexOf, PJT, PJT2, project, sprint, task } from './testData';

const statuses = defaultStatusSets();
const TODAY = '2026-11-10';
const S1 = sprint('SPRINT-1', { title: 'スプリント 1', start: '2026-11-02', end: '2026-11-06' });
const S2 = sprint('SPRINT-2', { title: 'スプリント 2', start: '2026-11-09', end: '2026-11-13' });
const S3 = sprint('SPRINT-3', { title: 'スプリント 3', start: '2026-11-16', end: '2026-11-20' });

describe('sprintPhase', () => {
	it('今日と期間から状態を決める（両端を含む）', () => {
		expect(sprintPhase(S1, TODAY)).toBe('done');
		expect(sprintPhase(S2, TODAY)).toBe('active');
		expect(sprintPhase(S2, '2026-11-13')).toBe('active');
		expect(sprintPhase(S3, TODAY)).toBe('planned');
	});

	it('日付が欠けていれば状態なし', () => {
		expect(sprintPhase({ start: '2026-11-02' }, TODAY)).toBeUndefined();
	});
});

describe('sprintPeriodText', () => {
	it('月/日で期間を出す', () => {
		expect(sprintPeriodText(S1)).toBe('11/2〜11/6');
		expect(sprintPeriodText({})).toBe('期間なし');
	});
});

describe('sortSprints', () => {
	it('開始日の順。開始日の無いものは最後', () => {
		const none = sprint('SPRINT-9', { title: 'あとで' });
		expect(sortSprints([S3, none, S1, S2]).map((s) => s.id)).toEqual(['SPRINT-1', 'SPRINT-2', 'SPRINT-3', 'SPRINT-9']);
	});
});

describe('sprintColumns', () => {
	const tasks = [
		task('TASK-1', { sprint: S2.id, estimate: 4, status: '完了' }),
		task('TASK-2', { sprint: S2.id, estimate: 2 }),
		task('TASK-3', { sprint: S2.id, estimate: 8, status: '中止' }),
		task('TASK-4'),
		task('TASK-5', { sprint: 'SPRINT-X' }),
	];
	const index = indexOf([project(PJT), S1, S2, S3, ...tasks]);
	const ctx = buildContext(index, statuses, defaultCalendar(), TODAY);
	const columns = sprintColumns(taskRows(ctx, tasks), [S3, S1, S2], TODAY);

	it('未割り当て、スプリント（開始日の順）の列。タスクの無い列も出す', () => {
		expect(columns.map((c) => c.id)).toEqual([BACKLOG, 'SPRINT-1', 'SPRINT-2', 'SPRINT-3']);
		expect(columns.map((c) => c.rows.length)).toEqual([2, 0, 3, 0]);
	});

	it('ほかのスプリントへのリンクは未割り当てに入れる', () => {
		expect(columns[0]?.rows.map((r) => r.task.id)).toEqual(['TASK-4', 'TASK-5']);
	});

	it('見積の合計と完了の割合は停止系を除く', () => {
		expect(columns[2]).toMatchObject({ estimate: 6, done: 1, counted: 2, phase: 'active' });
	});

	it('終わったスプリントだけ初めからたたむ', () => {
		expect(columns.map((c) => c.collapsedByDefault)).toEqual([false, true, false, false]);
	});
});

describe('dependencyLanes', () => {
	const ctx = buildContext(indexOf([project(PJT)]), statuses, defaultCalendar(), TODAY);
	const lanes = (tasks: Task[]) => dependencyLanes(taskRows(ctx, tasks)).map((lane) => lane.map((r) => r.task.id));

	it('同じ列の先行タスクより右の段に置く。段の中は元の並び', () => {
		const a = task('TASK-A');
		const b = task('TASK-B', { dependsOn: ['TASK-A'] });
		const c = task('TASK-C');
		const d = task('TASK-D', { dependsOn: ['TASK-A', 'TASK-B'] });
		expect(lanes([d, c, b, a])).toEqual([['TASK-C', 'TASK-A'], ['TASK-B'], ['TASK-D']]);
	});

	it('列の外の先行タスクは見ない', () => {
		expect(lanes([task('TASK-B', { dependsOn: ['TASK-X'] })])).toEqual([['TASK-B']]);
	});

	it('循環していても止まる', () => {
		const a = task('TASK-A', { dependsOn: ['TASK-B'] });
		const b = task('TASK-B', { dependsOn: ['TASK-A'] });
		expect(lanes([a, b]).flat().sort()).toEqual(['TASK-A', 'TASK-B']);
	});

	it('タスクが無ければ空の段が1つ', () => {
		expect(lanes([])).toEqual([[]]);
	});
});

describe('dependencyGroups', () => {
	const ctx = buildContext(indexOf([project(PJT)]), statuses, defaultCalendar(), TODAY);
	const groups = (tasks: Task[]) => {
		const { linked, alone } = dependencyGroups(taskRows(ctx, tasks));
		return { linked: linked.map((g) => g.map((r) => r.task.id)), alone: alone.map((r) => r.task.id) };
	};

	it('依存でつながったまとまりごとに分け、つながらないタスクは別にまとめる', () => {
		const a = task('TASK-A');
		const b = task('TASK-B', { dependsOn: ['TASK-A'] });
		const x = task('TASK-X');
		const c = task('TASK-C');
		const d = task('TASK-D', { dependsOn: ['TASK-C'] });
		const e = task('TASK-E', { dependsOn: ['TASK-B', 'TASK-OUT'] });
		expect(groups([x, d, a, c, b, e])).toEqual({ linked: [['TASK-D', 'TASK-C'], ['TASK-A', 'TASK-B', 'TASK-E']], alone: ['TASK-X'] });
	});

	it('2つの先行で合流するまとまりは1つ', () => {
		const a = task('TASK-A');
		const b = task('TASK-B');
		const c = task('TASK-C', { dependsOn: ['TASK-A', 'TASK-B'] });
		expect(groups([a, b, c])).toEqual({ linked: [['TASK-A', 'TASK-B', 'TASK-C']], alone: [] });
	});
});

describe('sprintBoardRows', () => {
	const ctx = buildContext(indexOf([project(PJT)]), statuses, defaultCalendar(), TODAY);
	const ids = (cells: TaskRow[][][]) => cells.map((lanes) => lanes.map((lane) => lane.map((r) => r.task.id)));
	const board = (tasks: Task[]) => {
		const columns = sprintColumns(taskRows(ctx, tasks), [S1, S2], TODAY);
		const rows = sprintBoardRows(columns);
		return { columns, rows: rows.map((r) => ({ linked: r.linked, cells: ids(r.cells) })) };
	};

	it('スプリントをまたいでつながったまとまりを1行にする。つながりの無いタスクは最後の行', () => {
		const a = task('TASK-A', { sprint: S1.id });
		const b = task('TASK-B', { sprint: S2.id, dependsOn: ['TASK-A'] });
		const c = task('TASK-C', { sprint: S1.id });
		const d = task('TASK-D', { sprint: S2.id, dependsOn: ['TASK-C'] });
		const x = task('TASK-X', { sprint: S2.id });
		expect(board([a, b, c, d, x]).rows).toEqual([
			{ linked: true, cells: [[[]], [['TASK-A']], [['TASK-B']]] },
			{ linked: true, cells: [[[]], [['TASK-C']], [['TASK-D']]] },
			{ linked: false, cells: [[[]], [[]], [['TASK-X']]] },
		]);
	});

	it('行の中の同じスプリントの依存は段に分け、列の段の数はいちばん多い行に合わせる', () => {
		const a = task('TASK-A', { sprint: S1.id });
		const b = task('TASK-B', { sprint: S1.id, dependsOn: ['TASK-A'] });
		const c = task('TASK-C', { sprint: S2.id, dependsOn: ['TASK-B'] });
		const x = task('TASK-X', { sprint: S1.id });
		const { columns, rows } = board([a, b, c, x]);
		expect(rows[0]?.cells[1]).toEqual([['TASK-A'], ['TASK-B']]);
		expect(rows[1]?.cells[1]).toEqual([['TASK-X']]);
		expect(columns.map((col) => col.laneCount)).toEqual([1, 2, 1]);
	});

	it('未割り当ての列も、依存があれば段に分ける', () => {
		const a = task('TASK-A');
		const b = task('TASK-B', { dependsOn: ['TASK-A'] });
		const { columns, rows } = board([a, b]);
		expect(rows[0]?.cells[0]).toEqual([['TASK-A'], ['TASK-B']]);
		expect(columns[0]?.laneCount).toBe(2);
	});

	it('タスクが無ければ空の行が1つ', () => {
		expect(board([]).rows).toEqual([{ linked: false, cells: [[[]], [[]], [[]]] }]);
	});
});

describe('sprintBoardLinks', () => {
	const sprints = [S1, S2];
	const links = (tasks: Task[], all = tasks) => {
		const byId = new Map(all.map((t) => [t.id, t]));
		return sprintBoardLinks(tasks, (id) => byId.get(id), sprints, statuses.task);
	};

	it('先行から後続へ線を引く。同じか前のスプリントなら順番違いにしない', () => {
		const a = task('TASK-A', { sprint: S1.id });
		const b = task('TASK-B', { sprint: S2.id, dependsOn: ['TASK-A'] });
		const c = task('TASK-C', { sprint: S2.id, dependsOn: ['TASK-B'] });
		const result = links([a, b, c]);
		expect(result.links).toEqual([
			{ from: 'TASK-A', to: 'TASK-B', reversed: false },
			{ from: 'TASK-B', to: 'TASK-C', reversed: false },
		]);
		expect(result.notes.size).toBe(0);
	});

	it('先行が後のスプリントか未割り当てにあれば順番違い', () => {
		const a = task('TASK-A', { sprint: S2.id });
		const b = task('TASK-B', { sprint: S1.id, dependsOn: ['TASK-A'] });
		const c = task('TASK-C');
		const d = task('TASK-D', { sprint: S2.id, dependsOn: ['TASK-C'] });
		const result = links([a, b, c, d]);
		expect(result.links.map((l) => l.reversed)).toEqual([true, true]);
		expect(result.notes.get('TASK-B')?.warnings).toEqual(['先行タスク「TASK-A」が後のスプリントにあります']);
		expect(result.notes.get('TASK-D')?.warnings).toEqual(['先行タスク「TASK-C」が未割り当てにあります']);
	});

	it('どちらも未割り当て、またはどちらかが完了系なら順番違いにしない', () => {
		const a = task('TASK-A');
		const b = task('TASK-B', { dependsOn: ['TASK-A'] });
		const c = task('TASK-C', { sprint: S2.id, status: '完了' });
		const d = task('TASK-D', { sprint: S1.id, dependsOn: ['TASK-C'] });
		expect(links([a, b, c, d]).links.every((l) => !l.reversed)).toBe(true);
	});

	it('出していない先行タスクには線を引かないが、順番は確かめる', () => {
		const a = task('TASK-A', { sprint: S2.id });
		const b = task('TASK-B', { sprint: S1.id, dependsOn: ['TASK-A'] });
		const result = links([b], [a, b]);
		expect(result.links).toEqual([]);
		expect(result.notes.get('TASK-B')?.warnings).toHaveLength(1);
	});

	it('別のプロジェクトの先行タスクは印の数だけ数える', () => {
		const other = task('TASK-O', { project: PJT2 });
		const b = task('TASK-B', { sprint: S1.id, dependsOn: ['TASK-O'] });
		const result = links([b], [other, b]);
		expect(result.links).toEqual([]);
		expect(result.notes.get('TASK-B')).toEqual({ warnings: [], external: 1 });
	});

	it('期限日がスプリントの期間の外なら警告。完了系は除く', () => {
		const early = task('TASK-1', { sprint: S2.id, due: '2026-11-06' });
		const late = task('TASK-2', { sprint: S2.id, due: '2026-11-16' });
		const inside = task('TASK-3', { sprint: S2.id, due: '2026-11-13' });
		const done = task('TASK-4', { sprint: S2.id, due: '2026-11-30', status: '完了' });
		const result = links([early, late, inside, done]);
		expect(result.notes.get('TASK-1')?.warnings).toEqual(['期限日（2026-11-06）がスプリントの開始日（2026-11-09）より前です']);
		expect(result.notes.get('TASK-2')?.warnings).toEqual(['期限日（2026-11-16）がスプリントの終了日（2026-11-13）より後です']);
		expect(result.notes.has('TASK-3')).toBe(false);
		expect(result.notes.has('TASK-4')).toBe(false);
	});
});

describe('sprintMove', () => {
	it('動かした先のスプリントを書く。未割り当てへは空にする。同じ列なら何もしない', () => {
		expect(sprintMove(BACKLOG, 'SPRINT-1')).toEqual({ sprint: 'SPRINT-1' });
		expect(sprintMove('SPRINT-1', BACKLOG)).toEqual({ sprint: null });
		expect(sprintMove('SPRINT-1', 'SPRINT-1')).toBeNull();
	});
});

describe('linkCounts', () => {
	it('カードごとに先行・後続の線の数を数える', () => {
		const counts = linkCounts([
			{ from: 'TASK-A', to: 'TASK-B', reversed: false },
			{ from: 'TASK-A', to: 'TASK-C', reversed: false },
			{ from: 'TASK-B', to: 'TASK-C', reversed: true },
		]);
		expect(counts.get('TASK-A')).toEqual({ pred: 0, succ: 2 });
		expect(counts.get('TASK-C')).toEqual({ pred: 2, succ: 0 });
		expect(counts.get('TASK-X')).toBeUndefined();
	});
});
