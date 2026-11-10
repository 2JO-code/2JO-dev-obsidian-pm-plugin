import type { Calendar, IsoDate, Member } from '../model';
import { addDays, addMonths, dayOfWeek, eachDate, firstDayOf, lastDayOf, monthOfDate } from './dates';

/** 稼働日を探す上限（休日ばかりのカレンダーで止まらなくならないように） */
const MAX_SEARCH_DAYS = 3660;

/** 会社カレンダーで稼働日を判定する（要件3.6, 4.5） */
export class WorkCalendar {
	private readonly holidays: Set<IsoDate>;

	constructor(private readonly calendar: Calendar) {
		this.holidays = new Set(calendar.holidays.map((h) => h.date));
	}

	isWorkday(date: IsoDate): boolean {
		const day = dayOfWeek(date);
		if (this.calendar.weekendsOff && (day === 0 || day === 6)) return false;
		return !this.holidays.has(date);
	}

	/** その日が稼働日ならその日、休日なら次（back なら前）の稼働日 */
	workdayOnOrAfter(date: IsoDate, back = false): IsoDate {
		let d = date;
		for (let i = 0; i < MAX_SEARCH_DAYS && !this.isWorkday(d); i++) d = addDays(d, back ? -1 : 1);
		return d;
	}

	/**
	 * date から n 稼働日だけ進めた（負なら戻した）日。n=0 なら date のまま。
	 * 休日から数えるときは、最初の稼働日を1日目とする（設計書 11.9）
	 */
	addWorkdays(date: IsoDate, n: number): IsoDate {
		const step = n < 0 ? -1 : 1;
		let d = date;
		let left = Math.abs(n);
		for (let i = 0; i < MAX_SEARCH_DAYS && left > 0; i++) {
			d = addDays(d, step);
			if (this.isWorkday(d)) left--;
		}
		return d;
	}

	/** start〜end（両端を含む）の稼働日数 */
	countWorkdays(start: IsoDate, end: IsoDate): number {
		let count = 0;
		for (const date of eachDate(start, end)) if (this.isWorkday(date)) count++;
		return count;
	}

	/**
	 * そのメンバーの勤務日か：稼働日のうち、その人の個人休日でない日（要件4.5）。
	 * 負荷の計算だけに使う。日程の計算は isWorkday のまま（要件3.6）
	 */
	dutyDayOf(member: Pick<Member, 'holidays'>): (date: IsoDate) => boolean {
		if (member.holidays.length === 0) return (date) => this.isWorkday(date);
		const off = new Set(member.holidays.map((h) => h.date));
		return (date) => this.isWorkday(date) && !off.has(date);
	}

	/**
	 * その日の休日の種類と理由（一覧の休みの印。設計書 9.1）。会社休日・個人休日・土日休日の順。稼働日なら空。
	 * 個人休日は印のためだけで、稼働日の判定（isWorkday）には入れない（要件3.6）
	 * @param members 個人休日を見るメンバー（行の担当者など）
	 */
	holidayMarks(date: IsoDate, members: readonly Pick<Member, 'title' | 'holidays'>[] = []): HolidayMark[] {
		const marks: HolidayMark[] = [];
		const holiday = this.calendar.holidays.find((h) => h.date === date);
		if (holiday) marks.push({ kind: 'company', label: holiday.name || '会社の休日' });
		const off = members.flatMap((m) => {
			const h = m.holidays.find((x) => x.date === date);
			return h ? [h.memo ? `${m.title}（${h.memo}）` : m.title] : [];
		});
		if (off.length > 0) marks.push({ kind: 'personal', label: off.join('、') });
		const day = dayOfWeek(date);
		if (this.calendar.weekendsOff && (day === 0 || day === 6)) marks.push({ kind: 'weekend', label: day === 0 ? '日曜' : '土曜' });
		return marks;
	}
}

/** 休日の種類（要件3.6）：会社休日・個人休日・土日休日 */
export type HolidayKind = 'company' | 'personal' | 'weekend';

export interface HolidayMark {
	kind: HolidayKind;
	/** 理由：会社休日の名前、休むメンバー（メモ）、曜日 */
	label: string;
}

/** 期間の単位。週は月曜始まり（要件4.5） */
export type PeriodUnit = 'day' | 'week' | 'month';

export interface Period {
	unit: PeriodUnit;
	/** 期間の識別子（日・週は開始日、月は YYYY-MM） */
	key: string;
	start: IsoDate;
	end: IsoDate;
}

/** その日を含む期間 */
export function periodOf(date: IsoDate, unit: PeriodUnit): Period {
	switch (unit) {
		case 'day':
			return { unit, key: date, start: date, end: date };
		case 'week': {
			const start = addDays(date, -((dayOfWeek(date) + 6) % 7));
			return { unit, key: start, start, end: addDays(start, 6) };
		}
		case 'month': {
			const month = monthOfDate(date);
			return { unit, key: month, start: firstDayOf(month), end: lastDayOf(month) };
		}
	}
}

/** start〜end を含む期間を順に並べる（端の期間は範囲からはみ出してよい） */
export function periodsBetween(start: IsoDate, end: IsoDate, unit: PeriodUnit): Period[] {
	const periods: Period[] = [];
	for (let p = periodOf(start, unit); p.start <= end; p = periodOf(addDays(p.end, 1), unit)) periods.push(p);
	return periods;
}

/** メンバー状況の表示期間の初期値：前月の初日〜3か月先の末日（要件4.8） */
export function defaultRange(today: IsoDate): { start: IsoDate; end: IsoDate } {
	const month = monthOfDate(today);
	return { start: firstDayOf(addMonths(month, -1)), end: lastDayOf(addMonths(month, 3)) };
}

/** start〜end（両端を含む）のうち、条件に合う日の数 */
export function countDays(start: IsoDate, end: IsoDate, match: (date: IsoDate) => boolean): number {
	let count = 0;
	for (const date of eachDate(start, end)) if (match(date)) count++;
	return count;
}
