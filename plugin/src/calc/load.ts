import type { Member, NoteId } from '../model';
import type { Period, WorkCalendar } from './workdays';
import type { Hours, WorkSummary } from './worklogSummary';

/** 負荷の段階（要件4.4, 4.8の色分け） */
export type LoadLevel = 'none' | 'normal' | 'caution' | 'warning';

export interface MemberLoad {
	period: Period;
	/** 基準工数（100%）＝期間内の稼働日数 × 1日の通常稼働時間 */
	base: number;
	/** 稼働日の予定・実績（負荷率の計算に使う） */
	work: Hours;
	/** 休日の予定・実績（負荷率に入れず、休日稼働として別に示す） */
	holiday: Hours;
	/** 予定負荷率・実績稼働率（1 = 100%）。基準工数が0なら null */
	plannedRate: number | null;
	actualRate: number | null;
	/** 上限 ＝ 基準工数 × 負荷許容率 */
	limit: number;
	plannedLevel: LoadLevel;
	actualLevel: LoadLevel;
	/** プロジェクト別の内訳（稼働日と休日の合計） */
	byProject: Map<NoteId, Hours>;
}

/** 負荷率の段階。100%以下／100%超（注意）／負荷許容率超（警告） */
export function loadLevel(rate: number | null, loadLimitPct: number): LoadLevel {
	if (rate === null) return 'none';
	if (rate > loadLimitPct / 100) return 'warning';
	if (rate > 1) return 'caution';
	return 'normal';
}

/** メンバー×期間の負荷（要件4.5） */
export function memberLoad(member: Member, period: Period, summary: WorkSummary, calendar: WorkCalendar): MemberLoad {
	const base = calendar.countWorkdays(period.start, period.end) * member.dailyHours;
	const work = summary.memberRange(member.id, period.start, period.end, (d) => calendar.isWorkday(d));
	const holiday = summary.memberRange(member.id, period.start, period.end, (d) => !calendar.isWorkday(d));
	const byProject = new Map(work.byProject);
	for (const [project, h] of holiday.byProject) {
		const sum = byProject.get(project) ?? { planned: 0, actual: 0 };
		byProject.set(project, { planned: sum.planned + h.planned, actual: sum.actual + h.actual });
	}
	const rate = (hours: number) => (base > 0 ? hours / base : null);
	const plannedRate = rate(work.total.planned);
	const actualRate = rate(work.total.actual);
	return {
		period,
		base,
		work: work.total,
		holiday: holiday.total,
		plannedRate,
		actualRate,
		limit: (base * member.loadLimitPct) / 100,
		plannedLevel: loadLevel(plannedRate, member.loadLimitPct),
		actualLevel: loadLevel(actualRate, member.loadLimitPct),
		byProject,
	};
}
