import { describe, expect, it } from 'vitest';
import { loadLevel, memberLoad } from './load';
import { member, PJT, PJT2, task, USER, worklog } from './testData';
import { periodOf, WorkCalendar } from './workdays';
import { WorkSummary } from './worklogSummary';

const calendar = new WorkCalendar({ weekendsOff: true, holidays: [{ date: '2026-11-03', name: '祝日' }] });
const tasks = [task('T1'), task('T2', { project: PJT2 })];
const summary = new WorkSummary(
	[
		worklog(USER, '2026-11', [
			['2026-11-02', 'T1', 6, 5], // 月
			['2026-11-02', 'T2', 4, 4],
			['2026-11-03', 'T1', 2, 2], // 祝日
			['2026-11-07', 'T1', 3, 0], // 土
		]),
	],
	tasks,
);
const yamada = member(USER);

describe('loadLevel', () => {
	it('100%以下／注意／警告', () => {
		expect(loadLevel(1, 120)).toBe('normal');
		expect(loadLevel(1.01, 120)).toBe('caution');
		expect(loadLevel(1.2, 120)).toBe('caution');
		expect(loadLevel(1.21, 120)).toBe('warning');
		expect(loadLevel(null, 120)).toBe('none');
	});
});

describe('memberLoad', () => {
	it('日：稼働日の基準工数は1日の通常稼働時間', () => {
		const load = memberLoad(yamada, periodOf('2026-11-02', 'day'), summary, calendar);
		expect(load.base).toBe(8);
		expect(load.work).toEqual({ planned: 10, actual: 9 });
		expect(load.plannedRate).toBe(1.25);
		expect(load.plannedLevel).toBe('warning');
		expect(load.actualLevel).toBe('caution');
		expect(load.limit).toBe(9.6);
	});

	it('日：休日は基準工数0で負荷率なし。記録は休日稼働として別に示す', () => {
		const load = memberLoad(yamada, periodOf('2026-11-03', 'day'), summary, calendar);
		expect(load.base).toBe(0);
		expect(load.plannedRate).toBeNull();
		expect(load.holiday).toEqual({ planned: 2, actual: 2 });
	});

	it('週：稼働日数（祝日と土日を除く4日）× 8h。休日の記録は負荷率に入れない', () => {
		const load = memberLoad(yamada, periodOf('2026-11-04', 'week'), summary, calendar);
		expect(load.base).toBe(32);
		expect(load.work.planned).toBe(10);
		expect(load.holiday.planned).toBe(5);
		expect(load.plannedRate).toBe(10 / 32);
	});

	it('月：稼働日20日 × 1日の通常稼働時間。内訳はプロジェクト別（休日分も含む）', () => {
		const load = memberLoad(member(USER, { dailyHours: 6 }), periodOf('2026-11-15', 'month'), summary, calendar);
		expect(load.base).toBe(120);
		expect(load.byProject.get(PJT)).toEqual({ planned: 11, actual: 7 });
		expect(load.byProject.get(PJT2)).toEqual({ planned: 4, actual: 4 });
	});
});
