import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, addMonths, dayOfWeek, daysBetween, eachDate, firstDayOf, lastDayOf, localToday, monthOfDate } from './dates';

describe('dates', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('日を足し引きする（月・年・うるう年をまたぐ）', () => {
		expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
		expect(addDays('2026-11-07', 0)).toBe('2026-11-07');
	});

	it('曜日（0=日曜）', () => {
		expect(dayOfWeek('2026-11-08')).toBe(0);
		expect(dayOfWeek('2026-11-07')).toBe(6);
	});

	it('両端を含む日数と、日付の並び', () => {
		expect(daysBetween('2026-11-01', '2026-11-01')).toBe(1);
		expect(daysBetween('2026-11-01', '2026-11-30')).toBe(30);
		expect(daysBetween('2026-11-02', '2026-11-01')).toBe(0);
		expect([...eachDate('2026-11-29', '2026-12-02')]).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
		expect([...eachDate('2026-11-02', '2026-11-01')]).toEqual([]);
	});

	it('月の計算（年をまたぐ・月の初日と末日）', () => {
		expect(monthOfDate('2026-11-07')).toBe('2026-11');
		expect(addMonths('2026-11', 2)).toBe('2027-01');
		expect(addMonths('2026-01', -1)).toBe('2025-12');
		expect(addMonths('2026-11', -23)).toBe('2024-12');
		expect(firstDayOf('2026-11')).toBe('2026-11-01');
		expect(lastDayOf('2026-11')).toBe('2026-11-30');
		expect(lastDayOf('2028-02')).toBe('2028-02-29');
		expect(lastDayOf('2026-12')).toBe('2026-12-31');
	});

	it('今日はこの PC の日付（UTC ではない）', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 10, 7, 23, 59));
		expect(localToday()).toBe('2026-11-07');
		vi.setSystemTime(new Date(2026, 0, 1, 0, 0));
		expect(localToday()).toBe('2026-01-01');
	});
});
