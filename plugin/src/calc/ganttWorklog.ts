import { monthOfDate } from './dates';
import { cellHoursText } from './format';
import type { IsoDate, NoteId, Worklog } from '../model';

/** ガントに出す作業ログの値（設計書 9.8）。出さない・実績・予定・両方 */
export type GanttWorklogMode = 'none' | 'actual' | 'planned' | 'both';

const MODES: readonly GanttWorklogMode[] = ['none', 'actual', 'planned', 'both'];

/** 保存されていた値を読む。不正な値は出さない */
export function parseGanttWorklogMode(v: unknown): GanttWorklogMode {
	return MODES.find((m) => m === v) ?? 'none';
}

/** 1日の予定・実績(h) */
export interface DayHours {
	planned: number;
	actual: number;
}

/** タスクごと・日ごとの予定・実績 */
export type TaskDayHours = Map<NoteId, Map<IsoDate, DayHours>>;

/** 期間（両端を含む）の作業ログを、タスクごと・日ごとに全メンバーぶん合計する */
export function taskDayHours(logs: readonly Worklog[], start: IsoDate, end: IsoDate): TaskDayHours {
	const from = monthOfDate(start);
	const to = monthOfDate(end);
	const out: TaskDayHours = new Map();
	for (const log of logs) {
		if (log.month < from || log.month > to) continue;
		for (const e of log.entries) {
			if (e.date < start || e.date > end || (e.planned === 0 && e.actual === 0)) continue;
			let days = out.get(e.task);
			if (!days) out.set(e.task, (days = new Map<IsoDate, DayHours>()));
			const sum = days.get(e.date) ?? { planned: 0, actual: 0 };
			days.set(e.date, { planned: sum.planned + e.planned, actual: sum.actual + e.actual });
		}
	}
	return out;
}

/** 複数タスクの日ごとの合計（プロジェクト・エピックの行） */
export function sumDayHours(hours: TaskDayHours, tasks: readonly NoteId[]): Map<IsoDate, DayHours> {
	const out = new Map<IsoDate, DayHours>();
	for (const id of tasks) {
		for (const [date, h] of hours.get(id) ?? []) {
			const sum = out.get(date) ?? { planned: 0, actual: 0 };
			out.set(date, { planned: sum.planned + h.planned, actual: sum.actual + h.actual });
		}
	}
	return out;
}

/** マスに出す文字（予定・実績の順）。mode で出さない側は空。どちらも空なら undefined */
export function worklogCellTexts(mode: GanttWorklogMode, h: DayHours): { planned: string; actual: string } | undefined {
	const planned = mode === 'planned' || mode === 'both' ? cellHoursText(h.planned) : '';
	const actual = mode === 'actual' || mode === 'both' ? cellHoursText(h.actual) : '';
	return planned || actual ? { planned, actual } : undefined;
}
