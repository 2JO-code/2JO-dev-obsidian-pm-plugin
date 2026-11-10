import { describe, expect, it } from 'vitest';
import { defaultCalendar, defaultStatusSets } from '../config/defaults';
import { buildContext } from './context';
import { cellKey, projectStatus } from './projectStatus';
import { epic, indexOf, member, PJT, PJT2, project, task, USER, USER2, worklog } from './testData';

const pjt = project(PJT, {
	milestones: [
		{ line: 3, name: '設計完了', date: '2026-11-30', epic: 'E1' },
		{ line: 2, name: '要件確定', date: '2026-11-05', epic: 'E2' },
		{ line: 4, name: '納品', date: '2026-12-25' },
	],
	allocations: [
		{ line: 8, month: '2026-11', member: USER, hours: 5 },
		{ line: 9, month: '2026-12', member: USER2, hours: 10 },
	],
});
const index = indexOf([
	pjt,
	project(PJT2),
	epic('E1', { wbs: '1.10', title: '設計', due: '2026-12-05' }),
	epic('E2', { wbs: '1.2', title: '要件', status: '進行中', due: '2026-11-04' }),
	epic('E3', { title: 'WBSなし' }),
	epic('E9', { project: PJT2 }),
	member(USER),
	member(USER2),
	task('T1', { epic: 'E1', status: '完了', estimate: 2 }),
	task('T2', { epic: 'E1', status: '進行中', due: '2026-11-01' }),
	task('T3', { epic: 'E2', status: '中止' }),
	task('T4', { status: '未着手' }),
	task('T5', { project: PJT2 }),
	worklog(USER, '2026-11', [
		['2026-11-02', 'T1', 4, 3],
		['2026-11-03', 'T2', 2, 1],
		['2026-11-04', 'T5', 8, 8],
	]),
	worklog(USER2, '2026-10', [['2026-10-30', 'T4', 1, 1]]),
]);
const ctx = buildContext(index, defaultStatusSets(), defaultCalendar(), '2026-11-10');
const status = projectStatus(ctx, pjt);

describe('projectStatus', () => {
	it('全体の進捗・工数・警告（タスクの警告と配分超過）', () => {
		expect(status.progress).toEqual({ done: 1, total: 3, ratio: 1 / 3 });
		expect(status.workload).toEqual({ estimate: 2, planned: 7, actual: 5 });
		expect(status.warnings.map((w) => w.kind).sort()).toEqual(['overAllocation', 'overEstimate', 'overdue']);
	});

	it('エピックは WBS 順（WBS の無いものは後）、エピックなしのタスクは最後にまとめる', () => {
		expect(status.epics.map((r) => r.epic?.id ?? '-')).toEqual(['E2', 'E1', 'E3', '-']);
		const e1 = status.epics[1];
		expect(e1?.progress).toEqual({ done: 1, total: 2, ratio: 0.5 });
		expect(e1?.warnings).toHaveLength(2);
		expect(status.epics[0]?.progress.ratio).toBeNull();
		expect(status.epics[3]?.tasks.map((t) => t.id)).toEqual(['T4']);
	});

	it('マイルストーンは日付順。連動エピックの遅れと未達を出す', () => {
		expect(status.milestones.map((m) => [m.milestone.name, m.late, m.missed])).toEqual([
			['要件確定', false, true],
			['設計完了', true, false],
			['納品', false, false],
		]);
	});

	it('マイルストーンの注意の文を組み立てる', () => {
		expect(status.milestones.map((m) => m.notes)).toEqual([['日付を過ぎたが未完了'], ['期限日がマイルストーンより後'], []]);
		const lost = project(PJT2, { milestones: [{ line: 2, name: '検収', date: '2026-12-01', epic: 'E-NONE' }] });
		const other = buildContext(indexOf([lost]), defaultStatusSets(), defaultCalendar(), '2026-11-10');
		expect(projectStatus(other, lost).milestones[0]?.notes).toEqual(['連動エピックが見つかりません']);
	});

	it('配分表は配分の行と、作業ログのある月×メンバーを合わせる', () => {
		const { months, members, cells } = status.allocation;
		expect(months).toEqual(['2026-10', '2026-11', '2026-12']);
		expect(new Set(members)).toEqual(new Set([USER, USER2]));
		expect(cells.get(cellKey(USER, '2026-11'))).toEqual({ hours: 5, line: 8, planned: 6, actual: 4, over: true });
		expect(cells.get(cellKey(USER2, '2026-10'))).toEqual({ planned: 1, actual: 1, over: false });
		expect(cells.get(cellKey(USER2, '2026-12'))).toEqual({ hours: 10, line: 9, planned: 0, actual: 0, over: false });
	});
});

describe('buildContext の前もっての計算', () => {
	it('タスクとエピックをプロジェクトごとに分ける（アーカイブ内も含む）', () => {
		expect(ctx.byProject.get(PJT)?.tasks.map((t) => t.id)).toEqual(['T1', 'T2', 'T3', 'T4']);
		expect(ctx.byProject.get(PJT2)?.epics.map((e) => e.id)).toEqual(['E9']);
		expect(ctx.byProject.get('PJT-none')).toBeUndefined();
	});

	it('タスクの警告は1回だけ計算し、全体とエピックの行で同じものを使う', () => {
		const t2 = ctx.index.get('T2');
		if (t2?.type !== 'task') throw new Error('T2 が無い');
		expect(ctx.warningsOf(t2)).toBe(ctx.warningsOf(t2));
		const e1 = status.epics.find((r) => r.epic?.id === 'E1');
		expect(e1?.warnings.map((w) => w.kind).sort()).toEqual(['overEstimate', 'overdue']);
	});
});
