import { describe, expect, it } from 'vitest';
import { AllocationSummary } from './allocationLoad';
import { project, PJT, PJT2, USER, USER2 } from './testData';
import { WorkCalendar } from './workdays';

// 2026-11 は祝日（11/3）と土日を除いて稼働日20日。2026-12 は23日
const calendar = new WorkCalendar({ weekendsOff: true, holidays: [{ date: '2026-11-03', name: '祝日' }] });
const allocations = new AllocationSummary(
	[
		project(PJT, {
			allocations: [
				{ line: 0, month: '2026-11', member: USER, hours: 60 },
				{ line: 1, month: '2026-11', member: USER, hours: 20 }, // 同じ月・同じ人の行は合算
				{ line: 2, month: '2026-12', member: USER, hours: 46 },
				{ line: 3, month: '2026-11', member: USER2, hours: 10 },
			],
		}),
		project(PJT2, { status: 'クローズ', allocations: [{ line: 0, month: '2026-11', member: USER, hours: 40 }] }),
	],
	calendar,
);

describe('AllocationSummary.memberRange', () => {
	it('月：全プロジェクトの配分の合計。ステータスに関係なく数える', () => {
		const r = allocations.memberRange(USER, '2026-11-01', '2026-11-30');
		expect(r.total).toBe(120);
		expect(r.byProject.get(PJT)).toBe(80);
		expect(r.byProject.get(PJT2)).toBe(40);
	});

	it('週：月の配分 × 期間内の稼働日数 ÷ 月の稼働日数', () => {
		// 11/2〜11/8 の稼働日は4日（11/3 は祝日）
		expect(allocations.memberRange(USER, '2026-11-02', '2026-11-08').total).toBe((120 * 4) / 20);
	});

	it('日：稼働日は1日分、休日は0', () => {
		expect(allocations.memberRange(USER, '2026-11-02', '2026-11-02').total).toBe(6);
		expect(allocations.memberRange(USER, '2026-11-03', '2026-11-03').total).toBe(0);
		expect(allocations.memberRange(USER, '2026-11-07', '2026-11-07').total).toBe(0);
	});

	it('月をまたぐ期間は月ごとに按分して足す', () => {
		// 11/30(月) は11月の1日分、12/1〜12/4 は12月の4日分
		const r = allocations.memberRange(USER, '2026-11-30', '2026-12-06');
		expect(r.total).toBeCloseTo((120 * 1) / 20 + (46 * 4) / 23);
		expect(r.byProject.get(PJT)).toBeCloseTo((80 * 1) / 20 + (46 * 4) / 23);
	});

	it('配分の無いメンバー・月は0', () => {
		expect(allocations.memberRange('USER-X', '2026-11-01', '2026-11-30').total).toBe(0);
		expect(allocations.memberRange(USER2, '2027-01-01', '2027-01-31').total).toBe(0);
	});
});
