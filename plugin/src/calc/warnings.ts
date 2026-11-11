import { isFinished } from '../config/status';
import type { IsoDate, NoteId, Project, StatusDef, Task, YearMonth } from '../model';
import type { TaskSchedule } from './schedule';
import { categoryOf } from './progress';
import type { WorkSummary } from './worklogSummary';

/** 警告の種類（要件4.4）。負荷注意・負荷警告・休日稼働は負荷の計算で印を出す（設計書 11.4） */
export type WarningKind = 'overdue' | 'overdueRisk' | 'overEstimate' | 'overAllocation';

export const WARNING_LABELS: Record<WarningKind, string> = {
	overdue: '期限超過',
	overdueRisk: '期限超過見込み',
	overEstimate: '工数超過',
	overAllocation: '配分超過',
};

export type WarningTarget =
	| { type: 'task'; task: NoteId }
	| { type: 'allocation'; project: NoteId; month: YearMonth; member: NoteId };

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
