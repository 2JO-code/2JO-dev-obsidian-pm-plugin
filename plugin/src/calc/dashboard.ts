import type { IsoDate, Member, Project } from '../model';
import { compareJa } from './compare';
import type { CalcContext } from './context';
import { addDays } from './dates';
import { memberLoad, type MemberLoad } from './load';
import { projectStatus, type MilestoneRow, type ProjectStatus } from './projectStatus';
import { periodOf } from './workdays';

/** マイルストーンを出す日数（今日から2週間。要件4.8b） */
export const MILESTONE_DAYS = 14;

export interface OverloadedMember {
	member: Member;
	week: MemberLoad;
	month: MemberLoad;
}

export interface UpcomingMilestone extends MilestoneRow {
	project: Project;
}

export interface Dashboard {
	projects: ProjectStatus[];
	/** 今週か今月の予定負荷率が注意・警告のメンバー（名前順） */
	members: OverloadedMember[];
	/** 今日〜2週間後のマイルストーン（日付順） */
	milestones: UpcomingMilestone[];
}

const isHigh = (load: MemberLoad) => load.plannedLevel === 'caution' || load.plannedLevel === 'warning';

/**
 * ダッシュボード（要件4.8b、設計書 11.10）。
 * @param projects 表示するプロジェクト（絞り込み済み）。マイルストーンもこの中から出す
 * @param members 負荷を見るメンバー
 */
export function dashboard(ctx: CalcContext, projects: readonly Project[], members: readonly Member[]): Dashboard {
	const statuses = projects.map((p) => projectStatus(ctx, p));

	const week = periodOf(ctx.today, 'week');
	const month = periodOf(ctx.today, 'month');
	const overloaded = members
		.map((member) => ({
			member,
			week: memberLoad(member, week, ctx.summary, ctx.calendar),
			month: memberLoad(member, month, ctx.summary, ctx.calendar),
		}))
		.filter((m) => isHigh(m.week) || isHigh(m.month))
		.sort((a, b) => compareJa(a.member.title, b.member.title));

	const last: IsoDate = addDays(ctx.today, MILESTONE_DAYS);
	const milestones = statuses
		.flatMap((s) => s.milestones.map((m) => ({ ...m, project: s.project })))
		.filter((m) => m.milestone.date >= ctx.today && m.milestone.date <= last)
		.sort((a, b) => a.milestone.date.localeCompare(b.milestone.date));

	return { projects: statuses, members: overloaded, milestones };
}
