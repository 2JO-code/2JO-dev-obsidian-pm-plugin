import type { IsoDate, YearMonth } from '../model';

const DAY = 86400000;
const toTime = (date: IsoDate) => Date.parse(`${date}T00:00:00Z`);
const fromTime = (time: number): IsoDate => new Date(time).toISOString().slice(0, 10);

export function addDays(date: IsoDate, days: number): IsoDate {
	return fromTime(toTime(date) + days * DAY);
}

/** 曜日（0=日曜〜6=土曜） */
export function dayOfWeek(date: IsoDate): number {
	return new Date(toTime(date)).getUTCDay();
}

/** start〜end（両端を含む）の日数 */
export function daysBetween(start: IsoDate, end: IsoDate): number {
	return Math.round((toTime(end) - toTime(start)) / DAY) + 1;
}

/** start〜end（両端を含む）の日付を順に返す */
export function* eachDate(start: IsoDate, end: IsoDate): Generator<IsoDate> {
	for (let t = toTime(start); t <= toTime(end); t += DAY) yield fromTime(t);
}

export function monthOfDate(date: IsoDate): YearMonth {
	return date.slice(0, 7);
}

export function addMonths(month: YearMonth, months: number): YearMonth {
	const [y = 0, m = 1] = month.split('-').map(Number);
	const index = y * 12 + (m - 1) + months;
	return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function firstDayOf(month: YearMonth): IsoDate {
	return `${month}-01`;
}

export function lastDayOf(month: YearMonth): IsoDate {
	return addDays(firstDayOf(addMonths(month, 1)), -1);
}

/** この PC の今日の日付 */
export function localToday(): IsoDate {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
