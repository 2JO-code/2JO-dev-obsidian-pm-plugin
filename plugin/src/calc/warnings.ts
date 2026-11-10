import { isFinished } from '../config/status';
import type { IsoDate, Member, NoteId, Project, StatusDef, Task, YearMonth } from '../model';
import type { MemberLoad } from './load';
import type { TaskSchedule } from './schedule';
import { categoryOf } from './progress';
import type { WorkCalendar } from './workdays';
import type { WorkSummary } from './worklogSummary';

/** 警告の種類（要件4.4） */
export type WarningKind = 'overdue' | 'overdueRisk' | 'overEstimate' | 'overAllocation' | 'loadCaution' | 'loadWarning' | 'holidayWork';

export const WARNING_LABELS: Record<WarningKind, string> = {
	overdue: '期限超過',
	overdueRisk: '期限超過見込み',
	overEstimate: '工数超過',
	overAllocation: '配分超過',
	loadCaution: '負荷注意',
	loadWarning: '負荷警告',
	holidayWork: '休日稼働',
};

export type WarningTarget =
	| { type: 'task'; task: NoteId }
	| { type: 'allocation'; project: NoteId; month: YearMonth; member: NoteId }
	| { type: 'memberPeriod'; member: NoteId; periodKey: string }
	| { type: 'memberDate'; member: NoteId; date: IsoDate };

export interface Warning {
	kind: WarningKind;
	target: WarningTarget;
	message: string;
}

const h = (n: number) => `${n}h`;

/**
 * タスクの警告：期限超過（期限日の翌日から）、期限超過見込み（見込み終了日が期限日より後）、工数超過（設計書 11.4）
 * @param schedule 見込みの日程。無ければ期限超過見込みは判定しない
 */
export function taskWarnings(
	task: Task,
	statuses: readonly StatusDef[],
	summary: WorkSummary,
	today: IsoDate,
	schedule?: TaskSchedule,
): Warning[] {
	const warnings: Warning[] = [];
	const target: WarningTarget = { type: 'task', task: task.id };
	const category = categoryOf(task, statuses);
	if (task.due && task.due < today && !isFinished(category)) {
		warnings.push({ kind: 'overdue', target, message: `期限日（${task.due}）を過ぎています` });
	} else if (task.due && schedule && schedule.end > task.due && !isFinished(category)) {
		warnings.push({
			kind: 'overdueRisk',
			target,
			message: `見込み終了日（${schedule.end}）が期限日（${task.due}）より後です`,
		});
	}
	const actual = summary.task(task.id).actual;
	if (task.estimate !== undefined && actual > task.estimate) {
		warnings.push({ kind: 'overEstimate', target, message: `実績 ${h(actual)} が見積 ${h(task.estimate)} を超えています` });
	}
	return warnings;
}

/** 配分超過：プロジェクト×月×メンバーの予定合計が配分工数を超えている（要件4.6） */
export function allocationWarnings(project: Project, summary: WorkSummary): Warning[] {
	const warnings: Warning[] = [];
	for (const a of project.allocations) {
		const planned = summary.allocation(project.id, a.month, a.member).planned;
		if (planned > a.hours) {
			warnings.push({
				kind: 'overAllocation',
				target: { type: 'allocation', project: project.id, month: a.month, member: a.member },
				message: `${a.month} の予定 ${h(planned)} が配分 ${h(a.hours)} を超えています`,
			});
		}
	}
	return warnings;
}

/** 負荷注意・負荷警告（予定負荷率で判定する） */
export function loadWarnings(member: Member, load: MemberLoad): Warning[] {
	if (load.plannedLevel !== 'caution' && load.plannedLevel !== 'warning') return [];
	const pct = Math.round((load.plannedRate ?? 0) * 100);
	return [
		{
			kind: load.plannedLevel === 'warning' ? 'loadWarning' : 'loadCaution',
			target: { type: 'memberPeriod', member: member.id, periodKey: load.period.key },
			message:
				load.plannedLevel === 'warning'
					? `予定負荷率 ${pct}% が負荷許容率 ${member.loadLimitPct}% を超えています`
					: `予定負荷率 ${pct}% が100%を超えています`,
		},
	];
}

/** 休日稼働：休日に予定・実績が入っている日 */
export function holidayWorkWarnings(member: Member, summary: WorkSummary, calendar: WorkCalendar): Warning[] {
	const warnings: Warning[] = [];
	for (const date of summary.memberDates(member.id).sort()) {
		if (calendar.isWorkday(date)) continue;
		let planned = 0;
		let actual = 0;
		for (const hours of summary.memberDay(member.id, date).values()) {
			planned += hours.planned;
			actual += hours.actual;
		}
		if (planned > 0 || actual > 0) {
			warnings.push({
				kind: 'holidayWork',
				target: { type: 'memberDate', member: member.id, date },
				message: `休日（${date}）に予定 ${h(planned)}／実績 ${h(actual)} が入っています`,
			});
		}
	}
	return warnings;
}
