import { findStatus } from '../config/status';
import type { IsoDate, NoteId, StatusDef, Task } from '../model';
import type { WorkCalendar } from './workdays';

/** 見込みの日程（要件4.7。ファイルには書かない） */
export interface TaskSchedule {
	start: IsoDate;
	end: IsoDate;
	/** 未着手のまま開始日を過ぎて、開始日をずらしたか */
	startDelayed: boolean;
	/** 遅れで終了日がずれたか */
	endDelayed: boolean;
}

export interface ScheduleResult {
	/** 日程を出せないタスク（開始日も期限日も無い）は入らない */
	schedules: Map<NoteId, TaskSchedule>;
}

/** depends_on の循環を探す（Tarjan の強連結成分。設計書 11.9） */
export function findCycles(tasks: readonly Task[]): NoteId[][] {
	const byId = new Map(tasks.map((t) => [t.id, t]));
	const order = new Map<NoteId, number>();
	const low = new Map<NoteId, number>();
	const stack: NoteId[] = [];
	const onStack = new Set<NoteId>();
	const cycles: NoteId[][] = [];
	let counter = 0;

	const visit = (id: NoteId) => {
		order.set(id, counter);
		low.set(id, counter);
		counter++;
		stack.push(id);
		onStack.add(id);
		for (const next of byId.get(id)?.dependsOn ?? []) {
			if (!byId.has(next)) continue;
			if (!order.has(next)) {
				visit(next);
				low.set(id, Math.min(low.get(id) ?? 0, low.get(next) ?? 0));
			} else if (onStack.has(next)) {
				low.set(id, Math.min(low.get(id) ?? 0, order.get(next) ?? 0));
			}
		}
		if (low.get(id) !== order.get(id)) return;
		const group: NoteId[] = [];
		let top: NoteId | undefined;
		do {
			top = stack.pop();
			if (top === undefined) break;
			onStack.delete(top);
			group.push(top);
		} while (top !== id);
		const self = byId.get(id)?.dependsOn.includes(id) ?? false;
		if (group.length > 1 || self) cycles.push(group.reverse());
	};
	for (const t of tasks) if (!order.has(t.id)) visit(t.id);
	return cycles;
}

/**
 * 全タスクの見込みの日程（要件4.7「日程計算の細かい決まり」、設計書 11.9）。
 * 先行タスク・相対日数・所要日数は使わない（自分の開始日・期限日だけで決める）
 */
export function computeSchedules(
	tasks: readonly Task[],
	statuses: readonly StatusDef[],
	calendar: WorkCalendar,
	today: IsoDate,
): ScheduleResult {
	const schedules = new Map<NoteId, TaskSchedule>();
	for (const t of tasks) {
		const s = scheduleOf(t, statuses, calendar, today);
		if (s) schedules.set(t.id, s);
	}
	return { schedules };
}

/** 1件の見込みの日程。開始日も期限日も無ければ null */
function scheduleOf(task: Task, statuses: readonly StatusDef[], calendar: WorkCalendar, today: IsoDate): TaskSchedule | null {
	const category = findStatus(statuses, task.status)?.category;
	let start: IsoDate;
	let startDelayed = false;
	if (task.start) {
		start = calendar.workdayOnOrAfter(task.start);
	} else if (task.due) {
		// 開始日が無ければ期限日の1日だけ（休日なら前の稼働日）
		start = calendar.workdayOnOrAfter(task.due, true);
	} else {
		return null;
	}

	if (category === 'not_started' && start < today) {
		start = calendar.workdayOnOrAfter(today);
		startDelayed = true;
	}

	// 終了日は期限日。期限日が無いか開始日より前なら開始日（このときは開始日のずれが伝わる）
	const due = task.due;
	const endIsDue = due !== undefined && due >= start;
	let end: IsoDate = endIsDue ? due : start;
	let endDelayed = startDelayed && !endIsDue;

	if (category !== 'done' && end < today) {
		end = today;
		endDelayed = true;
	}
	return { start, end, startDelayed, endDelayed };
}
