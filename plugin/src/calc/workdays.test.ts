import { describe, expect, it } from 'vitest';
import { addMonths, daysBetween, lastDayOf } from './dates';
import { defaultRange, periodOf, periodsBetween, WorkCalendar } from './workdays';

const calendar = new WorkCalendar({ weekendsOff: true, holidays: [{ date: '2026-11-03', name: '文化の日' }] });

describe('dates', () => {
	it('月の末日（うるう年を含む）と月の加算', () => {
		expect(lastDayOf('2028-02')).toBe('2028-02-29');
		expect(lastDayOf('2026-02')).toBe('2026-02-28');
		expect(addMonths('2026-11', 3)).toBe('2027-02');
		expect(addMonths('2026-01', -1)).toBe('2025-12');
	});

	it('両端を含む日数', () => {
		expect(daysBetween('2026-11-01', '2026-11-30')).toBe(30);
	});
});

describe('WorkCalendar', () => {
	it('土日と会社の休日は稼働日でない', () => {
		expect(calendar.isWorkday('2026-11-02')).toBe(true); // 月
		expect(calendar.isWorkday('2026-11-03')).toBe(false); // 祝日
		expect(calendar.isWorkday('2026-11-07')).toBe(false); // 土
		expect(calendar.isWorkday('2026-11-08')).toBe(false); // 日
	});

	it('土日を休日にしない設定では土日も稼働日', () => {
		const c = new WorkCalendar({ weekendsOff: false, holidays: [] });
		expect(c.isWorkday('2026-11-07')).toBe(true);
	});

	it('休日の種類と理由：会社休日は名前、土日は曜日、稼働日は空', () => {
		expect(calendar.holidayMarks('2026-11-03')).toEqual([{ kind: 'company', label: '文化の日' }]);
		expect(calendar.holidayMarks('2026-11-07')).toEqual([{ kind: 'weekend', label: '土曜' }]);
		expect(calendar.holidayMarks('2026-11-08')).toEqual([{ kind: 'weekend', label: '日曜' }]);
		expect(calendar.holidayMarks('2026-11-02')).toEqual([]);
		expect(new WorkCalendar({ weekendsOff: false, holidays: [{ date: '2026-11-04', name: '' }] }).holidayMarks('2026-11-04')).toEqual([
			{ kind: 'company', label: '会社の休日' },
		]);
		expect(new WorkCalendar({ weekendsOff: false, holidays: [] }).holidayMarks('2026-11-07')).toEqual([]);
	});

	it('個人休日は休むメンバーの名前（メモ）を並べる。種類が重なればすべて出す。稼働日の判定には入れない', () => {
		const sato = { title: '佐藤', holidays: [{ line: 3, date: '2026-11-07', memo: '' }, { line: 4, date: '2026-11-10', memo: '有給' }] };
		const ito = { title: '伊藤', holidays: [{ line: 3, date: '2026-11-10', memo: '' }] };
		expect(calendar.holidayMarks('2026-11-10', [sato, ito])).toEqual([{ kind: 'personal', label: '佐藤（有給）、伊藤' }]);
		expect(calendar.holidayMarks('2026-11-07', [sato]).map((m) => m.kind)).toEqual(['personal', 'weekend']);
		expect(calendar.isWorkday('2026-11-10')).toBe(true);
	});

	it('期間内の稼働日数（2026年11月：平日21日−祝日1日）', () => {
		expect(calendar.countWorkdays('2026-11-01', '2026-11-30')).toBe(20);
	});
});

describe('periodOf / periodsBetween', () => {
	it('週は月曜始まり', () => {
		expect(periodOf('2026-11-08', 'week')).toMatchObject({ start: '2026-11-02', end: '2026-11-08' }); // 日曜
		expect(periodOf('2026-11-02', 'week')).toMatchObject({ start: '2026-11-02', end: '2026-11-08' }); // 月曜
	});

	it('月は初日〜末日で、識別子は YYYY-MM', () => {
		expect(periodOf('2026-11-15', 'month')).toEqual({ unit: 'month', key: '2026-11', start: '2026-11-01', end: '2026-11-30' });
	});

	it('範囲を含む期間を順に並べる', () => {
		expect(periodsBetween('2026-10-15', '2027-01-10', 'month').map((p) => p.key)).toEqual([
			'2026-10',
			'2026-11',
			'2026-12',
			'2027-01',
		]);
		expect(periodsBetween('2026-11-01', '2026-11-10', 'week').map((p) => p.start)).toEqual([
			'2026-10-26',
			'2026-11-02',
			'2026-11-09',
		]);
		expect(periodsBetween('2026-11-01', '2026-11-03', 'day')).toHaveLength(3);
	});
});

describe('defaultRange', () => {
	it('前月の初日〜3か月先の末日', () => {
		expect(defaultRange('2026-11-15')).toEqual({ start: '2026-10-01', end: '2027-02-28' });
	});
});
