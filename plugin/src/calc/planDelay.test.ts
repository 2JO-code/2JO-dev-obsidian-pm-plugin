import { describe, expect, it } from 'vitest';
import { planDelayDays, planDelayText, taskPlanDelay, taskPlanPeriod } from './planDelay';
import { WorkCalendar } from './workdays';

// 土日休み。11/3(火) は会社休日
const calendar = new WorkCalendar({ weekendsOff: true, holidays: [{ date: '2026-11-03', name: '文化の日' }] });

describe('planDelayDays', () => {
	it('同じ日なら0', () => {
		expect(planDelayDays('2026-11-04', '2026-11-04', calendar)).toBe(0);
	});

	it('予定より後なら、間の稼働日の数だけ遅れ（休日は数えない）', () => {
		expect(planDelayDays('2026-11-06', '2026-11-04', calendar)).toBe(2); // 木・金
		expect(planDelayDays('2026-11-09', '2026-11-06', calendar)).toBe(1); // 土日をはさんで月
		expect(planDelayDays('2026-11-04', '2026-11-02', calendar)).toBe(1); // 11/3 は休日
	});

	it('予定より前なら負の数', () => {
		expect(planDelayDays('2026-11-04', '2026-11-06', calendar)).toBe(-2);
	});

	it('当初終了日が休日でも、次の稼働日に終われば1日遅れ', () => {
		expect(planDelayDays('2026-11-09', '2026-11-07', calendar)).toBe(1);
		expect(planDelayDays('2026-11-08', '2026-11-07', calendar)).toBe(0);
	});
});

describe('taskPlanDelay', () => {
	const schedule = { start: '2026-11-02', end: '2026-11-06', startDelayed: false, endDelayed: false };
	it('当初終了日か日程が無ければ出さない', () => {
		expect(taskPlanDelay({}, schedule, calendar)).toBeUndefined();
		expect(taskPlanDelay({ planEnd: '2026-11-04' }, undefined, calendar)).toBeUndefined();
	});
	it('見込み終了日と比べる', () => {
		expect(taskPlanDelay({ planEnd: '2026-11-04' }, schedule, calendar)).toBe(2);
	});
});

describe('planDelayText', () => {
	it('遅れ・前倒し・当初どおり', () => {
		expect(planDelayText(3)).toBe('3日遅れ');
		expect(planDelayText(-2)).toBe('2日早い');
		expect(planDelayText(0)).toBe('当初どおり');
	});
});

describe('taskPlanPeriod', () => {
	it('両方そろえば期間を返す', () => {
		expect(taskPlanPeriod({ planStart: '2026-11-02', planEnd: '2026-11-04' })).toEqual({ start: '2026-11-02', end: '2026-11-04' });
	});

	it('片方だけ・逆順なら undefined', () => {
		expect(taskPlanPeriod({ planEnd: '2026-11-04' })).toBeUndefined();
		expect(taskPlanPeriod({ planStart: '2026-11-05', planEnd: '2026-11-04' })).toBeUndefined();
	});
});
