import type { IsoDate, NoteId, Task, Worklog, YearMonth } from '../model';

export interface Hours {
	planned: number;
	actual: number;
}

/** 予定・実績が 0 の時間 */
export const zeroHours = (): Hours => ({ planned: 0, actual: 0 });

/** sum に h の予定・実績を足す（sum を書き換える） */
export function addHours(sum: Hours, h: Hours): void {
	sum.planned += h.planned;
	sum.actual += h.actual;
}

/** map のキーの時間に h を足す。無ければ作る */
export function addHoursTo<K>(map: Map<K, Hours>, key: K, h: Hours): void {
	const sum = map.get(key) ?? zeroHours();
	addHours(sum, h);
	map.set(key, sum);
}

/** 所属プロジェクトが分からない（タスクが見つからない）記録のキー */
export const UNKNOWN_PROJECT = '';

/** 作業ログの集計結果（設計書 11.1） */
export class WorkSummary {
	private readonly byTask = new Map<NoteId, Hours>();
	/** メンバー → 日付 → プロジェクト → 時間 */
	private readonly byMemberDate = new Map<NoteId, Map<IsoDate, Map<NoteId, Hours>>>();
	private readonly byAllocation = new Map<string, Hours>();

	/** @param tasks 作業ログが参照するタスク（アーカイブ内も含めて渡す） */
	constructor(worklogs: readonly Worklog[], tasks: readonly Task[]) {
		const projectOf = new Map(tasks.map((t) => [t.id, t.project]));
		for (const log of worklogs) {
			const days = this.byMemberDate.get(log.member) ?? new Map<IsoDate, Map<NoteId, Hours>>();
			this.byMemberDate.set(log.member, days);
			for (const e of log.entries) {
				const h = { planned: e.planned, actual: e.actual };
				const project = projectOf.get(e.task) ?? UNKNOWN_PROJECT;
				addHoursTo(this.byTask, e.task, h);
				const projects = days.get(e.date) ?? new Map<NoteId, Hours>();
				days.set(e.date, projects);
				addHoursTo(projects, project, h);
				addHoursTo(this.byAllocation, allocationKey(project, log.month, log.member), h);
			}
		}
	}

	/** タスクの予定・実績の合計 */
	task(id: NoteId): Hours {
		return { ...(this.byTask.get(id) ?? zeroHours()) };
	}

	/** プロジェクト×月×メンバーの予定・実績の合計（工数配分と比べる。要件4.6） */
	allocation(project: NoteId, month: YearMonth, member: NoteId): Hours {
		return { ...(this.byAllocation.get(allocationKey(project, month, member)) ?? zeroHours()) };
	}

	/** そのプロジェクトに記録のある月×メンバー */
	allocationKeys(project: NoteId): { month: YearMonth; member: NoteId }[] {
		const result: { month: YearMonth; member: NoteId }[] = [];
		for (const key of this.byAllocation.keys()) {
			const [p, month = '', member = ''] = key.split('|');
			if (p === project) result.push({ month, member });
		}
		return result;
	}

	/** メンバーのその日の記録（プロジェクト別） */
	memberDay(member: NoteId, date: IsoDate): ReadonlyMap<NoteId, Hours> {
		return this.byMemberDate.get(member)?.get(date) ?? new Map();
	}

	/** メンバーの、ある期間の合計（プロジェクト別と全体） */
	memberRange(member: NoteId, start: IsoDate, end: IsoDate, include: (date: IsoDate) => boolean = () => true): RangeHours {
		const total = zeroHours();
		const byProject = new Map<NoteId, Hours>();
		for (const [date, projects] of this.byMemberDate.get(member) ?? []) {
			if (date < start || date > end || !include(date)) continue;
			for (const [project, h] of projects) {
				addHoursTo(byProject, project, h);
				addHours(total, h);
			}
		}
		return { total, byProject };
	}
}

export interface RangeHours {
	total: Hours;
	byProject: Map<NoteId, Hours>;
}

function allocationKey(project: NoteId, month: YearMonth, member: NoteId): string {
	return `${project}|${month}|${member}`;
}
