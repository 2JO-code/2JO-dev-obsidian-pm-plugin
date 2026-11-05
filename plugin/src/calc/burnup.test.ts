import { describe, expect, it } from 'vitest';
import { defaultCalendar, defaultStatusSets } from '../config/defaults';
import { burnup, monthTicks, niceTicks, progressPlan } from './burnup';
import { buildContext } from './context';
import { indexOf, PJT, PJT2, project, task, USER, worklog } from './testData';

const index = indexOf([
	project(PJT, { start: '2026-11-02', due: '2026-11-06' }),
	project(PJT2),
	task('T1', { estimate: 10 }),
	task('T2', { estimate: 5.5 }),
	task('X', { project: PJT2 }),
	worklog(USER, '2026-11', [
		['2026-11-03', 'T1', 4, 3],
		['2026-11-03', 'T2', 2, 2],
		['2026-11-05', 'T1', 3, 0],
		['2026-11-04', 'X', 8, 8],
	]),
]);
const ctx = buildContext(index, defaultStatusSets(), defaultCalendar(), '2026-11-04');

describe('burnup', () => {
	const b = burnup(ctx, index.projects().find((p) => p.id === PJT)!);

	it('期間の毎日の予定・実績の累積。ほかのプロジェクトのタスクは数えない', () => {
		expect(b?.points.map((p) => [p.date, p.planned, p.actual])).toEqual([
			['2026-11-02', 0, 0],
			['2026-11-03', 6, 5],
			['2026-11-04', 6, 5],
			['2026-11-05', 9, undefined],
			['2026-11-06', 9, undefined],
		]);
	});

	it('見積の合計と、プロジェクトの期間', () => {
		expect(b?.estimate).toBe(15.5);
		expect([b?.projectStart, b?.projectDue]).toEqual(['2026-11-02', '2026-11-06']);
	});

	it('作業ログも日付も無ければ出さない', () => {
		expect(burnup(ctx, project('PJT-9'))).toBeUndefined();
	});
});

describe('progressPlan', () => {
	// T1 は 11/2〜11/3、P1 は 11/5 に終わる予定。停止系と日程の無いタスクは線に入らない
	const idx = indexOf([
		project(PJT),
		task('T1', { status: '完了', start: '2026-11-02', durationDays: 2 }),
		task('P1', { status: '進行中', start: '2026-11-05', durationDays: 1 }),
		task('S1', { status: '保留', start: '2026-11-02', durationDays: 1 }),
		task('N1', { status: '未着手' }),
	]);
	const c = buildContext(idx, defaultStatusSets(), defaultCalendar(), '2026-11-04');
	const plan = progressPlan(c, idx.projects()[0]!, { start: '2026-11-02', end: '2026-11-06' });

	it('その日までに計算上の終了日が来るタスクの数', () => {
		expect(plan.points.map((p) => p.planned)).toEqual([0, 1, 1, 2, 2]);
	});

	it('分母・完了は進捗率と同じ。日程の無いタスクを数える', () => {
		expect([plan.total, plan.done, plan.unscheduled]).toEqual([3, 1, 1]);
	});
});

describe('niceTicks', () => {
	it('0 から最大値以上のきりのよい値まで', () => {
		expect(niceTicks(9)).toEqual([0, 2, 4, 6, 8, 10]);
		expect(niceTicks(3685)).toEqual([0, 1000, 2000, 3000, 4000]);
		expect(niceTicks(0)).toEqual([0]);
	});
});

describe('monthTicks', () => {
	it('期間内の各月の1日', () => {
		expect(monthTicks('2026-10-15', '2027-01-01')).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
		expect(monthTicks('2026-11-01', '2026-11-30')).toEqual(['2026-11-01']);
	});
});
