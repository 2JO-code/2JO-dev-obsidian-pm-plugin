import type { IsoDate, Task } from '../model';
import { taskPlanPeriod } from './planDelay';
import type { TaskSchedule } from './schedule';

/** 作業ログに出すタスクの作業範囲（ガントの予定期間の帯と棒。設計書 9.10） */

export interface DateRange {
	start: IsoDate;
	end: IsoDate;
}

/** タスクの予定期間と計算上の日程。出せないものは入れない */
export interface TaskRanges {
	plan?: DateRange;
	schedule?: DateRange;
}

export function taskRanges(task: Pick<Task, 'planStart' | 'planEnd'>, schedule: TaskSchedule | undefined): TaskRanges {
	const plan = taskPlanPeriod(task);
	return { ...(plan ? { plan } : {}), ...(schedule ? { schedule: { start: schedule.start, end: schedule.end } } : {}) };
}

/** 日付が範囲（両端を含む）の中か。範囲が無ければ false */
export function inRange(range: DateRange | undefined, date: IsoDate): boolean {
	return !!range && range.start <= date && date <= range.end;
}

/** 日のマスの読み上げに足す文字。例：「予定期間・計算上の日程の中、開始日」。どれでもなければ空 */
export function rangeLabel(ranges: TaskRanges, date: IsoDate, due?: IsoDate, start?: IsoDate): string {
	const names = [inRange(ranges.plan, date) ? '予定期間' : '', inRange(ranges.schedule, date) ? '計算上の日程' : ''].filter(Boolean);
	const parts = [names.length > 0 ? `${names.join('・')}の中` : '', date === start ? '開始日' : '', date === due ? '期限日' : ''].filter(Boolean);
	return parts.join('、');
}
