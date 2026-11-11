import type { Warning } from '../calc/warnings';
import type { WorkCalendar } from '../calc/workdays';
import { isFinished } from '../config/status';
import type { IsoDate, StatusCategory } from '../model';
import { dateCell, holidayMark, type People } from './badges';

/** セルに出す日程。エピック・プロジェクトの期間は遅れの印を持たない */
interface ScheduleLike {
	start: IsoDate;
	end: IsoDate;
	startDelayed?: boolean;
	endDelayed?: boolean;
}

const DELAYED = '遅れを反映して、ずらしています（未着手は今日から始め、未完了は今日まで延びたとみなす）';

/** 期限日のセル。期限超過なら赤にし、マウスを乗せたときに警告の文を出す。休日なら種類の印 */
export function dueCell(tr: HTMLElement, calendar: WorkCalendar, row: { task: { due?: IsoDate }; warnings: readonly Warning[]; assignees: People }): HTMLElement {
	const td = dateCell(tr, calendar, row.task.due, row.assignees);
	const overdue = row.warnings.find((w) => w.kind === 'overdue');
	if (overdue) {
		td.addClass('pm-text-error');
		td.setAttr('aria-label', overdue.message);
	}
	return td;
}

/**
 * 見込み開始日・終了日の2つのセル（設計書 9.2）。遅れでずらした日・期限日より後の終了日に印を付ける
 * @param category ステータスの分類。完了系・停止系なら期限日より後でも赤にしない（期限超過見込みと同じ）
 * @param people 個人休日の印を見るメンバー（担当者など）
 */
export function scheduleCells(
	tr: HTMLElement,
	calendar: WorkCalendar,
	row: { schedule?: ScheduleLike; task: { due?: IsoDate } },
	category: StatusCategory | undefined,
	people: People = [],
): void {
	scheduleStartCell(tr, calendar, row.schedule, people);
	scheduleEndCell(tr, calendar, row, category, people);
}

/** 日程が無いときの印。薄い「—」にし、マウスを乗せると理由を出す */
function noSchedule(td: HTMLElement): HTMLElement {
	td.addClass('pm-text-faint');
	td.setAttr('aria-label', '日程を計算できません（開始日も期限日もありません）');
	return td;
}

/** 見込み開始日のセル。遅れでずらした日に印を付ける */
export function scheduleStartCell(tr: HTMLElement, calendar: WorkCalendar, schedule: ScheduleLike | undefined, people: People = []): HTMLElement {
	const start = tr.createEl('td', { text: schedule?.start ?? '—' });
	if (!schedule) return noSchedule(start);
	holidayMark(start, calendar, schedule.start, people);
	if (schedule.startDelayed) {
		start.addClass('pm-text-warning');
		start.setAttr('aria-label', DELAYED);
	}
	return start;
}

/** 見込み終了日のセル。期限日より後なら赤、遅れでずらしたなら橙 */
export function scheduleEndCell(
	tr: HTMLElement,
	calendar: WorkCalendar,
	row: { schedule?: ScheduleLike; task: { due?: IsoDate } },
	category: StatusCategory | undefined,
	people: People = [],
): HTMLElement {
	const { schedule } = row;
	const end = tr.createEl('td', { text: schedule?.end ?? '—' });
	if (!schedule) return noSchedule(end);
	holidayMark(end, calendar, schedule.end, people);
	// 色は赤（期限日より後）を橙（遅れ）より優先し、理由は両方出す
	const open = !isFinished(category);
	const late = open && row.task.due && schedule.end > row.task.due ? `期限日（${row.task.due}）より後に終わる見込みです` : '';
	if (late) {
		end.addClass('pm-text-error');
		end.setAttr('aria-label', schedule.endDelayed ? `${DELAYED}。${late}` : late);
	} else if (schedule.endDelayed) {
		end.addClass('pm-text-warning');
		end.setAttr('aria-label', DELAYED);
	}
	return end;
}
