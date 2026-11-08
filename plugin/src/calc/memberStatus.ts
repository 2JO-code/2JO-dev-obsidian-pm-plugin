import type { IsoDate, Member, NoteId } from '../model';
import { compareJa } from './compare';
import type { CalcContext } from './context';
import { memberLoad, type MemberLoad } from './load';
import { defaultRange, periodsBetween, type Period, type PeriodUnit } from './workdays';
import { isRecord } from '../parse/values';

export type LoadMode = 'planned' | 'actual';

/** メンバー状況だけの表示条件（ビュー共通の絞り込みは ViewFilter） */
export interface MemberStatusOptions {
	unit: PeriodUnit;
	mode: LoadMode;
	/** 表示期間。無ければ初期値（前月〜3か月先） */
	start?: IsoDate;
	end?: IsoDate;
	activeOnly: boolean;
}

export const DEFAULT_MEMBER_STATUS: MemberStatusOptions = { unit: 'week', mode: 'planned', activeOnly: true };

const UNITS: readonly PeriodUnit[] = ['day', 'week', 'month'];
const MODES: readonly LoadMode[] = ['planned', 'actual'];

const date = (v: unknown): IsoDate | undefined => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
	allowed.find((a) => a === v) ?? fallback;

/** 保存されていた表示条件を読む。不正な値は既定値にする */
export function parseMemberStatusOptions(raw: unknown): MemberStatusOptions {
	const data = isRecord(raw) ? raw : {};
	const start = date(data.start);
	const end = date(data.end);
	return {
		unit: pick(data.unit, UNITS, DEFAULT_MEMBER_STATUS.unit),
		mode: pick(data.mode, MODES, DEFAULT_MEMBER_STATUS.mode),
		...(start ? { start } : {}),
		...(end ? { end } : {}),
		activeOnly: data.activeOnly !== false,
	};
}

/** 表示期間（メンバー状況・ガント）。片方だけ指定されていればもう片方は初期値。逆転していれば入れ替える */
export function displayRange(options: { start?: IsoDate; end?: IsoDate }, today: IsoDate): { start: IsoDate; end: IsoDate } {
	const fallback = defaultRange(today);
	const start = options.start ?? fallback.start;
	const end = options.end ?? fallback.end;
	return start <= end ? { start, end } : { start: end, end: start };
}

/**
 * そのプロジェクトに関わるメンバー（設計書 11.7）。
 * タスクの担当者、工数配分表のメンバー、プロジェクトのタスクに作業ログを付けた人、責任者
 */
export function membersOfProjects(ctx: CalcContext, projects: readonly NoteId[]): Set<NoteId> {
	const targets = new Set(projects);
	const result = new Set<NoteId>();
	const tasks = ctx.index.tasks({ includeArchived: true }).filter((t) => targets.has(t.project));
	const taskIds = new Set(tasks.map((t) => t.id));
	for (const t of tasks) for (const a of t.assignees) result.add(a);
	for (const id of targets) {
		const project = ctx.projects.get(id);
		if (!project) continue;
		for (const a of project.allocations) result.add(a.member);
		if (project.manager) result.add(project.manager);
	}
	for (const log of ctx.index.worklogs()) {
		if (result.has(log.member)) continue;
		if (log.entries.some((e) => taskIds.has(e.task))) result.add(log.member);
	}
	return result;
}

export interface MemberStatusRow {
	member: Member;
	cells: MemberLoad[];
}

export interface MemberStatusTable {
	periods: Period[];
	rows: MemberStatusRow[];
}

/** メンバー×期間の表（要件4.8）。メンバーは名前順 */
export function memberStatusTable(
	ctx: CalcContext,
	members: readonly Member[],
	range: { start: IsoDate; end: IsoDate },
	unit: PeriodUnit,
): MemberStatusTable {
	const periods = periodsBetween(range.start, range.end, unit);
	const rows = [...members]
		.sort((a, b) => compareJa(a.title, b.title))
		.map((member) => ({ member, cells: periods.map((p) => memberLoad(member, p, ctx.summary, ctx.calendar)) }));
	return { periods, rows };
}
