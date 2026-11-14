import { describe, expect, it } from 'vitest';
import { defaultStatusSets } from '../config/defaults';
import { PJT, project, task, USER, USER2, worklog } from './testData';
import { allocationWarnings, groupWarnings, taskWarnings } from './warnings';
import { WorkSummary } from './worklogSummary';

const statuses = defaultStatusSets().task;
const kinds = (ws: { kind: string }[]) => ws.map((w) => w.kind);

describe('taskWarnings', () => {
	const tasks = [task('T1', { estimate: 4 })];
	const summary = new WorkSummary([worklog(USER, '2026-11', [['2026-11-02', 'T1', 4, 5]])], tasks);

	it('期限超過は期限日の翌日から。完了系・停止系なら出さない', () => {
		const t = task('T', { due: '2026-11-30' });
		expect(kinds(taskWarnings(t, statuses, summary, '2026-11-30'))).toEqual([]);
		expect(kinds(taskWarnings(t, statuses, summary, '2026-12-01'))).toEqual(['overdue']);
		expect(kinds(taskWarnings({ ...t, status: '完了' }, statuses, summary, '2026-12-01'))).toEqual([]);
		expect(kinds(taskWarnings({ ...t, status: '保留' }, statuses, summary, '2026-12-01'))).toEqual([]);
		expect(kinds(taskWarnings({ ...t, status: '中止' }, statuses, summary, '2026-12-01'))).toEqual([]);
	});

	it('設定に無いステータスは期限超過の対象（未完了として扱う）', () => {
		const t = task('T', { due: '2026-11-30', status: '検討中' });
		expect(kinds(taskWarnings(t, statuses, summary, '2026-12-01'))).toEqual(['overdue']);
	});

	it('工数超過は実績が見積を超えたとき。見積が無ければ出さない', () => {
		expect(taskWarnings(tasks[0] ?? task('x'), statuses, summary, '2026-11-01')).toEqual([
			{ kind: 'overEstimate', target: { type: 'task', task: 'T1' }, message: '実績 5h が見積 4h を超えています' },
		]);
		expect(kinds(taskWarnings(task('T1'), statuses, summary, '2026-11-01'))).toEqual([]);
	});
});

describe('allocationWarnings', () => {
	it('予定合計が配分工数を超えた月×メンバーだけ', () => {
		const p = project(PJT, {
			allocations: [
				{ line: 1, month: '2026-11', member: USER, hours: 8 },
				{ line: 2, month: '2026-11', member: USER2, hours: 8 },
			],
		});
		const summary = new WorkSummary(
			[worklog(USER, '2026-11', [['2026-11-02', 'T1', 9, 0]]), worklog(USER2, '2026-11', [['2026-11-02', 'T1', 8, 0]])],
			[task('T1')],
		);
		const ws = allocationWarnings(p, summary);
		expect(ws).toHaveLength(1);
		expect(ws[0]?.target).toEqual({ type: 'allocation', project: PJT, month: '2026-11', member: USER });
	});
});

describe('groupWarnings', () => {
	const sched = (end: string) => ({ start: '2026-11-02', end, startDelayed: false, endDelayed: false });
	const tasks = [task('T1', { title: '設計' }), task('T2', { title: '実装' }), task('T3', { title: '済み', status: '完了' })];
	const schedules = new Map([
		['T1', sched('2026-11-20')],
		['T2', sched('2026-11-25')],
		['T3', sched('2026-12-10')],
	]);
	const epicGroup = { type: 'epic' as const, id: 'E1', due: '2026-11-20' };

	it('期限日より後のタスクがあれば1件。いちばん遅いタスクを文に出す。完了系のタスクは見ない', () => {
		expect(groupWarnings(epicGroup, false, tasks, statuses, schedules)).toEqual([
			{
				kind: 'groupOverdueRisk',
				target: { type: 'epic', epic: 'E1' },
				message: '「実装」の見込み終了日（2026-11-25）がエピックの期限日（2026-11-20）より後です',
			},
		]);
	});

	it('期限日と同じ日なら出さない', () => {
		expect(groupWarnings({ ...epicGroup, due: '2026-11-25' }, false, tasks, statuses, schedules)).toEqual([]);
	});

	it('期限日が無いか、まとまりが完了系なら出さない', () => {
		expect(groupWarnings({ type: 'epic', id: 'E1' }, false, tasks, statuses, schedules)).toEqual([]);
		expect(groupWarnings(epicGroup, true, tasks, statuses, schedules)).toEqual([]);
	});

	it('プロジェクトの文と対象', () => {
		const [w] = groupWarnings({ type: 'project', id: PJT, due: '2026-11-24' }, false, tasks, statuses, schedules);
		expect(w?.target).toEqual({ type: 'project', project: PJT });
		expect(w?.message).toContain('プロジェクトの期限日（2026-11-24）');
	});
});
