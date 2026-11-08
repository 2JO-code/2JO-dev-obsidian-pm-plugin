import { describe, expect, it } from 'vitest';
import { inRange, rangeLabel, taskRanges } from './taskRange';

const schedule = { start: '2026-11-05', end: '2026-11-10', startDelayed: false, endDelayed: false };

describe('taskRanges', () => {
	it('予定期間と計算上の日程を出す', () => {
		expect(taskRanges({ planStart: '2026-11-02', planEnd: '2026-11-06' }, schedule)).toEqual({
			plan: { start: '2026-11-02', end: '2026-11-06' },
			schedule: { start: '2026-11-05', end: '2026-11-10' },
		});
	});

	it('予定が片方だけ・逆順なら予定期間を出さない。日程が無ければ日程を出さない', () => {
		expect(taskRanges({ planStart: '2026-11-02' }, undefined)).toEqual({});
		expect(taskRanges({ planStart: '2026-11-06', planEnd: '2026-11-02' }, schedule)).toEqual({ schedule: { start: '2026-11-05', end: '2026-11-10' } });
	});
});

describe('inRange', () => {
	it('両端を含む', () => {
		const r = { start: '2026-11-05', end: '2026-11-10' };
		expect(inRange(r, '2026-11-04')).toBe(false);
		expect(inRange(r, '2026-11-05')).toBe(true);
		expect(inRange(r, '2026-11-10')).toBe(true);
		expect(inRange(r, '2026-11-11')).toBe(false);
	});

	it('範囲が無ければ false', () => {
		expect(inRange(undefined, '2026-11-05')).toBe(false);
	});
});

describe('rangeLabel', () => {
	const ranges = taskRanges({ planStart: '2026-11-02', planEnd: '2026-11-06' }, schedule);

	it('中にある範囲を並べる', () => {
		expect(rangeLabel(ranges, '2026-11-03')).toBe('予定期間の中');
		expect(rangeLabel(ranges, '2026-11-05')).toBe('予定期間・計算上の日程の中');
		expect(rangeLabel(ranges, '2026-11-09')).toBe('計算上の日程の中');
	});

	it('どちらの外でも空', () => {
		expect(rangeLabel(ranges, '2026-11-01')).toBe('');
	});
});

describe('rangeLabel の期限日', () => {
	it('期限日の日は「期限日」を足す', () => {
		const ranges = { plan: { start: '2026-11-02', end: '2026-11-06' } };
		expect(rangeLabel(ranges, '2026-11-06', '2026-11-06')).toBe('予定期間の中、期限日');
		expect(rangeLabel({}, '2026-11-20', '2026-11-20')).toBe('期限日');
		expect(rangeLabel({}, '2026-11-19', '2026-11-20')).toBe('');
	});

	it('開始日の日は「開始日」を足す（期限日より前に並べる）', () => {
		const ranges = { plan: { start: '2026-11-02', end: '2026-11-06' } };
		expect(rangeLabel(ranges, '2026-11-02', undefined, '2026-11-02')).toBe('予定期間の中、開始日');
		expect(rangeLabel({}, '2026-11-20', '2026-11-20', '2026-11-20')).toBe('開始日、期限日');
		expect(rangeLabel({}, '2026-11-19', '2026-11-20', '2026-11-18')).toBe('');
	});
});
