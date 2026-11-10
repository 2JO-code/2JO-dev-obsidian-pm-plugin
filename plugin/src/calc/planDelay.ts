import type { IsoDate, Task } from '../model';
import { addDays } from './dates';
import type { TaskSchedule } from './schedule';
import type { WorkCalendar } from './workdays';

/**
 * 当初終了日からの遅れ（稼働日。要件4.7「当初との差」、設計書 11.18）。
 * 正なら遅れ、負なら前倒し、0なら当初どおり
 */
export function planDelayDays(end: IsoDate, planEnd: IsoDate, calendar: WorkCalendar): number {
	if (end > planEnd) return calendar.countWorkdays(addDays(planEnd, 1), end);
	if (end < planEnd) return -calendar.countWorkdays(addDays(end, 1), planEnd);
	return 0;
}

/** タスクの当初との差。当初終了日か見込みの日程が無ければ undefined */
export function taskPlanDelay(task: Pick<Task, 'planEnd'>, schedule: TaskSchedule | undefined, calendar: WorkCalendar): number | undefined {
	if (!task.planEnd || !schedule) return undefined;
	return planDelayDays(schedule.end, task.planEnd, calendar);
}

/** タスクの当初期間。両方そろい、逆順でないときだけ（要件 3.5） */
export function taskPlanPeriod(task: Pick<Task, 'planStart' | 'planEnd'>): { start: IsoDate; end: IsoDate } | undefined {
	const { planStart, planEnd } = task;
	return planStart && planEnd && planStart <= planEnd ? { start: planStart, end: planEnd } : undefined;
}

/** 例：「3日遅れ」「2日早い」「当初どおり」 */
export function planDelayText(days: number): string {
	if (days > 0) return `${days}日遅れ`;
	if (days < 0) return `${-days}日早い`;
	return '当初どおり';
}
