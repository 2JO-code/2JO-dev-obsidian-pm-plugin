import { findStatus } from '../config/status';
import type { IsoDate, NoteId, StatusDef, Task } from '../model';
import type { WorkCalendar } from './workdays';

/** 見込みの日程（要件4.7。ファイルには書かない） */
export interface TaskSchedule {
	start: IsoDate;
	end: IsoDate;
	/** 遅れ（自分の遅れか、先行の遅れ）で開始日がずれたか */
	startDelayed: boolean;
	/** 遅れで終了日がずれたか */
	endDelayed: boolean;
}

export interface ScheduleResult {
	/** 日程を出せないタスク（日付が無い、循環している、先行の日程が出せない）は入らない */
	schedules: Map<NoteId, TaskSchedule>;
	/** depends_on の循環。1つの循環に入るタスクのID（自分自身への依存も含む） */
	cycles: NoteId[][];
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
 * @param tasks 先行タスクを引くため、アーカイブ内も含めて渡す
 */
export function computeSchedules(
	tasks: readonly Task[],
	statuses: readonly StatusDef[],
	calendar: WorkCalendar,
	today: IsoDate,
): ScheduleResult {
	const byId = new Map(tasks.map((t) => [t.id, t]));
	const cycles = findCycles(tasks);
	const inCycle = new Set(cycles.flat());
	const memo = new Map<NoteId, TaskSchedule | null>();

	const compute = (task: Task): TaskSchedule | null => {
		const cached = memo.get(task.id);
		if (cached !== undefined) return cached;
		const result = inCycle.has(task.id) ? null : scheduleOf(task);
		memo.set(task.id, result);
		return result;
	};

	const scheduleOf = (task: Task): TaskSchedule | null => {
		const category = findStatus(statuses, task.status)?.category;
		const duration = task.durationDays !== undefined ? Math.max(task.durationDays, 1) : undefined;

		let start: IsoDate;
		let startDelayed = false;
		const preds = task.dependsOn.flatMap((id) => byId.get(id) ?? []);
		if (preds.length > 0) {
			// 先行の終了日（遅れは反映済み）の最も遅い日から lag_days 稼働日後
			let latest: TaskSchedule | undefined;
			for (const p of preds) {
				const s = compute(p);
				if (!s) return null;
				if (!latest || s.end > latest.end) latest = s;
			}
			if (!latest) return null;
			start = calendar.workdayOnOrAfter(calendar.addWorkdays(latest.end, task.lagDays ?? 0));
			startDelayed = latest.endDelayed;
		} else if (task.start) {
			start = calendar.workdayOnOrAfter(task.start);
		} else if (task.due) {
			// 期限日に終わるように逆算する
			const last = calendar.workdayOnOrAfter(task.due, true);
			start = duration ? calendar.addWorkdays(last, -(duration - 1)) : last;
		} else {
			return null;
		}

		if (category === 'not_started' && start < today) {
			start = calendar.workdayOnOrAfter(today);
			startDelayed = true;
		}

		// 終了日が開始日から決まるとき（所要日数あり・期限日なし・期限日より遅い開始）は、開始日のずれが伝わる
		let end: IsoDate;
		let endFollowsStart = true;
		if (duration) end = calendar.addWorkdays(start, duration - 1);
		else if (task.due && task.due >= start) {
			end = task.due;
			endFollowsStart = false;
		} else end = start;
		let endDelayed = startDelayed && endFollowsStart;

		if (category !== 'done' && end < today) {
			end = today;
			endDelayed = true;
		}
		return { start, end, startDelayed, endDelayed };
	};

	const schedules = new Map<NoteId, TaskSchedule>();
	for (const t of tasks) {
		const s = compute(t);
		if (s) schedules.set(t.id, s);
	}
	return { schedules, cycles };
}
