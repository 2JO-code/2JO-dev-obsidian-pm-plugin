import { describe, expect, it } from 'vitest';
import { AllocationSummary } from './allocationLoad';
import { defaultStatusSets } from '../config/defaults';
import { memberLoad } from './load';
import { member, PJT, project, task, USER, USER2, worklog } from './testData';
import { allocationWarnings, holidayWorkWarnings, loadWarnings, taskWarnings } from './warnings';
import { periodOf, WorkCalendar } from './workdays';
import { WorkSummary } from './worklogSummary';

const statuses = defaultStatusSets().task;
const calendar = new WorkCalendar({ weekendsOff: true, holidays: [] });
const noAllocations = new AllocationSummary([], calendar);
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

describe('loadWarnings', () => {
	const tasks = [task('T1')];
	const summary = new WorkSummary([worklog(USER, '2026-11', [['2026-11-02', 'T1', 9, 0], ['2026-11-04', 'T1', 10, 0]])], tasks);
	const m = member(USER);

	it('100%超は負荷注意、負荷許容率超は負荷警告。100%以下は出さない', () => {
		expect(kinds(loadWarnings(m, memberLoad(m, periodOf('2026-11-02', 'day'), summary, calendar, noAllocations)))).toEqual(['loadCaution']);
		expect(kinds(loadWarnings(m, memberLoad(m, periodOf('2026-11-04', 'day'), summary, calendar, noAllocations)))).toEqual(['loadWarning']);
		expect(kinds(loadWarnings(m, memberLoad(m, periodOf('2026-11-03', 'day'), summary, calendar, noAllocations)))).toEqual([]);
	});
});

describe('holidayWorkWarnings', () => {
	it('休日に予定か実績が入っている日（0hだけの日は出さない）', () => {
		const summary = new WorkSummary(
			[worklog(USER, '2026-11', [['2026-11-07', 'T1', 0, 2], ['2026-11-08', 'T1', 0, 0], ['2026-11-09', 'T1', 8, 8]])],
			[task('T1')],
		);
		const ws = holidayWorkWarnings(member(USER), summary, calendar);
		expect(ws.map((w) => w.target)).toEqual([{ type: 'memberDate', member: USER, date: '2026-11-07' }]);
	});

	it('その人の個人休日に入っている記録も休日稼働', () => {
		const summary = new WorkSummary([worklog(USER, '2026-11', [['2026-11-09', 'T1', 8, 0]])], [task('T1')]);
		const off = member(USER, { holidays: [{ line: 0, date: '2026-11-09', memo: '有給' }] });
		expect(holidayWorkWarnings(off, summary, calendar).map((w) => w.target)).toEqual([{ type: 'memberDate', member: USER, date: '2026-11-09' }]);
		expect(holidayWorkWarnings(member(USER), summary, calendar)).toEqual([]);
	});
});
