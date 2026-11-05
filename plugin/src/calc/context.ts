import type { Calendar, IsoDate, NoteId, Project, StatusSets } from '../model';
import type { VaultIndex } from '../store/vaultIndex';
import { computeSchedules, type ScheduleResult } from './schedule';
import { WorkCalendar } from './workdays';
import { WorkSummary } from './worklogSummary';

/** ビューが計算に使うデータ。表示のたびに作る（設計書 11章） */
export interface CalcContext {
	index: VaultIndex;
	statuses: StatusSets;
	calendar: WorkCalendar;
	summary: WorkSummary;
	/** プロジェクトをIDで引く（アーカイブ内も含む） */
	projects: ReadonlyMap<NoteId, Project>;
	/** 計算上の日程（11.9） */
	schedule: ScheduleResult;
	today: IsoDate;
}

/** 最後に作った計算用のデータを、索引・共有設定・今日が変わるまで使い回す（設計書 11章） */
export class ContextCache {
	private last: { version: number; ctx: CalcContext; statuses: StatusSets; calendar: Calendar } | null = null;

	get(index: VaultIndex, statuses: StatusSets, calendar: Calendar, today: IsoDate): CalcContext {
		const last = this.last;
		if (
			last &&
			last.ctx.index === index &&
			last.version === index.version &&
			last.statuses === statuses &&
			last.calendar === calendar &&
			last.ctx.today === today
		) {
			return last.ctx;
		}
		const ctx = buildContext(index, statuses, calendar, today);
		this.last = { version: index.version, ctx, statuses, calendar };
		return ctx;
	}
}

export function buildContext(index: VaultIndex, statuses: StatusSets, calendar: Calendar, today: IsoDate): CalcContext {
	const all = { includeArchived: true };
	const tasks = index.tasks(all);
	const work = new WorkCalendar(calendar);
	return {
		index,
		statuses,
		calendar: work,
		summary: new WorkSummary(index.worklogs(), tasks),
		schedule: computeSchedules(tasks, statuses.task, work, today),
		projects: new Map(index.projects(all).map((p) => [p.id, p])),
		today,
	};
}
