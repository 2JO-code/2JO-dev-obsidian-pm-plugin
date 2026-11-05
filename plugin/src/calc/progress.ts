import { findStatus } from '../config/status';
import type { StatusCategory, StatusDef, Task } from '../model';
import type { WorkSummary } from './worklogSummary';

/** そのタスクのステータスの分類。設定に無い名前は undefined */
export function categoryOf(task: Task, statuses: readonly StatusDef[]): StatusCategory | undefined {
	return findStatus(statuses, task.status)?.category;
}

export interface TaskProgress {
	done: boolean;
	/** サブタスクの完了割合（0〜1）。サブタスクが無ければ null（要件4.3：参考表示） */
	subtaskRatio: number | null;
}

export function taskProgress(task: Task, statuses: readonly StatusDef[]): TaskProgress {
	const { done, total } = task.subtasks;
	return { done: categoryOf(task, statuses) === 'done', subtaskRatio: total > 0 ? done / total : null };
}

export interface CountProgress {
	done: number;
	/** 分母（停止系を除く） */
	total: number;
	/** 0〜1。対象が無ければ null */
	ratio: number | null;
}

/** 件数ベースの進捗率。停止系は分母から除き、設定に無いステータスは未完了として数える（要件4.3, 4.8） */
export function countProgress(tasks: readonly Task[], statuses: readonly StatusDef[]): CountProgress {
	let done = 0;
	let total = 0;
	for (const t of tasks) {
		const category = categoryOf(t, statuses);
		if (category === 'stopped') continue;
		total++;
		if (category === 'done') done++;
	}
	return { done, total, ratio: total > 0 ? done / total : null };
}

export interface Workload {
	/** 見積の合計（見積が無いタスクは0） */
	estimate: number;
	planned: number;
	actual: number;
}

/** 見積・予定・実績の合計（要件4.3）。停止系も含めてすべて数える */
export function workload(tasks: readonly Task[], summary: WorkSummary): Workload {
	const result: Workload = { estimate: 0, planned: 0, actual: 0 };
	for (const t of tasks) {
		const h = summary.task(t.id);
		result.estimate += t.estimate ?? 0;
		result.planned += h.planned;
		result.actual += h.actual;
	}
	return result;
}
