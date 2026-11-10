import { dayOfWeek, monthDayText, WEEKDAYS } from '../calc/dates';
import { planDelayDays, planDelayText } from '../calc/planDelay';
import { computeSchedules } from '../calc/schedule';
import type { WorkCalendar } from '../calc/workdays';
import type { IsoDate, NoteId, StatusDef, Task } from '../model';
import { isIsoDate } from '../parse/values';
import type { TaskForm } from './taskForm';

/** フォームに出す見込みの日程（設計書 4.12。ファイルには書かない） */
export interface SchedulePreview {
	/** ok：期限内、late：期限日を過ぎる、none：計算できない */
	kind: 'ok' | 'late' | 'none';
	text: string;
	/** 当初との差。当初終了日と見込みの日程があるときだけ（設計書 11.18） */
	plan?: { delay: number; text: string };
}

/** 0以上の整数として読めれば数、読めなければ undefined */
function wholeNumber(value: string): number | undefined {
	const n = Number(value);
	return value.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : undefined;
}

const dateOf = (value: string): IsoDate | undefined => (isIsoDate(value) ? value : undefined);

/** 例：11/13(金) */
const shortDate = (date: IsoDate) => `${monthDayText(date)}(${WEEKDAYS[dayOfWeek(date)] ?? ''})`;

/**
 * 入力中の値で、そのタスクの見込みの日程を出す（設計書 4.12）。
 * @param self 編集中のタスク（索引の値）。フォームの日程の値で置き換えて計算する
 * @param tasks 先行タスクを引くため、アーカイブ内も含めて渡す
 */
export function previewTaskSchedule(
	form: TaskForm,
	self: Task,
	tasks: readonly Task[],
	statuses: readonly StatusDef[],
	calendar: WorkCalendar,
	today: IsoDate,
): SchedulePreview {
	const lagDays = wholeNumber(form.lagDays);
	const durationDays = wholeNumber(form.durationDays);
	const start = dateOf(form.start);
	const due = dateOf(form.due);
	const edited: Task = {
		...self,
		status: form.status,
		dependsOn: form.dependsOn,
		lagDays,
		start,
		durationDays,
		due,
	};
	// 空欄の項目はキーを消す（規約 4章）
	for (const key of ['lagDays', 'start', 'durationDays', 'due'] as const) if (edited[key] === undefined) delete edited[key];

	const others = tasks.filter((t) => t.id !== self.id);
	const result = computeSchedules([...others, edited], statuses, calendar, today);
	const s = result.schedules.get(self.id);
	if (!s) return { kind: 'none', text: noScheduleReason(self.id, form, result.cycles, start, due) };

	const delayed = s.startDelayed || s.endDelayed ? '（遅れを反映）' : '';
	const planEnd = dateOf(form.planEnd);
	const plan = planEnd ? planLine(dateOf(form.planStart), planEnd, planDelayDays(s.end, planEnd, calendar)) : undefined;
	const withPlan = plan ? { plan } : {};
	if (due && s.end > due) return { kind: 'late', text: `${rangeText(s.start, s.end)}${delayed}。期限日 ${shortDate(due)} を過ぎます`, ...withPlan };
	return { kind: 'ok', text: `${rangeText(s.start, s.end)}${delayed}${due ? '。期限内' : ''}`, ...withPlan };
}

const rangeText = (start: IsoDate, end: IsoDate) => (start === end ? shortDate(start) : `${shortDate(start)}〜${shortDate(end)}`);

/** 例：予定 11/2(月)〜11/4(水) より2日遅れ */
function planLine(planStart: IsoDate | undefined, planEnd: IsoDate, delay: number): { delay: number; text: string } {
	const range = planStart && planStart <= planEnd ? rangeText(planStart, planEnd) : shortDate(planEnd);
	return { delay, text: delay === 0 ? `当初 ${range} のとおり` : `当初 ${range} より${planDelayText(delay)}` };
}

/** 日程が出せない理由 */
function noScheduleReason(selfId: NoteId, form: TaskForm, cycles: NoteId[][], start?: IsoDate, due?: IsoDate): string {
	if (form.dependsOn.includes(selfId) || cycles.some((c) => c.includes(selfId))) return '先行タスクが循環しているため計算できません';
	if (form.dependsOn.length > 0) return '先行タスクの日程が出せないため計算できません';
	if (!start && !due) return '開始日か期限日を入れると計算します';
	return '計算できません';
}
