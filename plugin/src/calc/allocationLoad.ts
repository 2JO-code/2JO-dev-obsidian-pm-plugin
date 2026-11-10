import type { IsoDate, NoteId, Project, YearMonth } from '../model';
import { addDays } from './dates';
import { periodOf, type WorkCalendar } from './workdays';

export interface AllocatedHours {
	total: number;
	/** プロジェクト別の配分 */
	byProject: Map<NoteId, number>;
}

/** 工数配分の集計。月の配分を稼働日で按分して期間の配分を出す（要件4.5） */
export class AllocationSummary {
	/** メンバー → 月 → プロジェクト → 配分(h) */
	private readonly byMember = new Map<NoteId, Map<YearMonth, Map<NoteId, number>>>();
	/** 月 → 稼働日数 */
	private readonly workdaysOfMonth = new Map<YearMonth, number>();

	/** @param projects すべてのプロジェクト（ステータス・アーカイブに関係なく） */
	constructor(
		projects: readonly Project[],
		private readonly calendar: WorkCalendar,
	) {
		for (const project of projects) {
			for (const a of project.allocations) {
				const months = this.byMember.get(a.member) ?? new Map<YearMonth, Map<NoteId, number>>();
				this.byMember.set(a.member, months);
				const byProject = months.get(a.month) ?? new Map<NoteId, number>();
				months.set(a.month, byProject);
				byProject.set(project.id, (byProject.get(project.id) ?? 0) + a.hours);
			}
		}
	}

	/** start〜end の配分。月ごとに、月の配分 × 期間内の稼働日数 ÷ 月の稼働日数 を足す */
	memberRange(member: NoteId, start: IsoDate, end: IsoDate): AllocatedHours {
		const result: AllocatedHours = { total: 0, byProject: new Map() };
		const months = this.byMember.get(member);
		if (!months || start > end) return result;
		for (let m = periodOf(start, 'month'); m.start <= end; m = periodOf(addDays(m.end, 1), 'month')) {
			const byProject = months.get(m.key);
			if (!byProject) continue;
			const all = this.monthWorkdays(m.key, m.start, m.end);
			if (all === 0) continue;
			const part = this.calendar.countWorkdays(start > m.start ? start : m.start, end < m.end ? end : m.end);
			if (part === 0) continue;
			for (const [project, hours] of byProject) {
				const h = (hours * part) / all;
				result.byProject.set(project, (result.byProject.get(project) ?? 0) + h);
				result.total += h;
			}
		}
		return result;
	}

	private monthWorkdays(month: YearMonth, start: IsoDate, end: IsoDate): number {
		let n = this.workdaysOfMonth.get(month);
		if (n === undefined) {
			n = this.calendar.countWorkdays(start, end);
			this.workdaysOfMonth.set(month, n);
		}
		return n;
	}
}
