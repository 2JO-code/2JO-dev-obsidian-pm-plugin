import type { Member, NoteId } from '../model';
import type { AllocationSummary } from './allocationLoad';
import { hoursText } from './format';
import { countDays, type Period, type WorkCalendar } from './workdays';
import type { Hours, WorkSummary } from './worklogSummary';

/** 負荷の段階（要件4.4, 4.8の色分け） */
export type LoadLevel = 'none' | 'normal' | 'caution' | 'warning';

/** 負荷率の元：配分・予定・実績（要件4.5） */
export type LoadMode = 'allocated' | 'planned' | 'actual';

export const LOAD_MODES: readonly LoadMode[] = ['allocated', 'planned', 'actual'];

export const LOAD_MODE_LABEL: Record<LoadMode, string> = { allocated: '配分', planned: '予定', actual: '実績' };

/** 数値の出し方：負荷率(%)か工数(h) */
export type LoadScale = 'rate' | 'hours';

export const LOAD_SCALES: readonly { value: LoadScale; label: string }[] = [
	{ value: 'rate', label: '負荷率(%)' },
	{ value: 'hours', label: '工数(h)' },
];

export const isLoadScale = (v: unknown): v is LoadScale => v === 'rate' || v === 'hours';

export interface MemberLoad {
	period: Period;
	/** 基準工数（100%）＝期間内の勤務日数（稼働日−個人休日）× 1日の通常稼働時間 */
	base: number;
	/** 期間内の配分（全プロジェクトの合計。月の配分を稼働日で按分） */
	allocated: number;
	allocatedRate: number | null;
	allocatedLevel: LoadLevel;
	/** プロジェクト別の配分 */
	allocatedByProject: Map<NoteId, number>;
	/** 勤務日の予定・実績（負荷率の計算に使う） */
	work: Hours;
	/** 勤務日でない日（休日・個人休日）の予定・実績（負荷率に入れず、休日稼働として別に示す） */
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
export function memberLoad(
	member: Member,
	period: Period,
	summary: WorkSummary,
	calendar: WorkCalendar,
	allocations: AllocationSummary,
): MemberLoad {
	// 勤務日＝稼働日のうち、その人の個人休日でない日（要件4.5）
	const isDuty = calendar.dutyDayOf(member);
	const base = countDays(period.start, period.end, isDuty) * member.dailyHours;
	const work = summary.memberRange(member.id, period.start, period.end, isDuty);
	const holiday = summary.memberRange(member.id, period.start, period.end, (d) => !isDuty(d));
	const byProject = new Map(work.byProject);
	for (const [project, h] of holiday.byProject) {
		const sum = byProject.get(project) ?? { planned: 0, actual: 0 };
		byProject.set(project, { planned: sum.planned + h.planned, actual: sum.actual + h.actual });
	}
	const rate = (hours: number) => (base > 0 ? hours / base : null);
	const allocated = allocations.memberRange(member, period.start, period.end);
	const allocatedRate = rate(allocated.total);
	const plannedRate = rate(work.total.planned);
	const actualRate = rate(work.total.actual);
	return {
		period,
		base,
		allocated: allocated.total,
		allocatedRate,
		allocatedLevel: loadLevel(allocatedRate, member.loadLimitPct),
		allocatedByProject: allocated.byProject,
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

export interface LoadValue {
	/** 稼働日の時間 */
	hours: number;
	rate: number | null;
	level: LoadLevel;
	/** 休日の時間（配分は休日に置かないので0） */
	holiday: number;
}

/** 表示中の元（配分・予定・実績）の値。負荷注意・負荷警告もこの値で判定する（要件4.5） */
export function loadValue(load: MemberLoad, mode: LoadMode): LoadValue {
	switch (mode) {
		case 'allocated':
			return { hours: load.allocated, rate: load.allocatedRate, level: load.allocatedLevel, holiday: 0 };
		case 'planned':
			return { hours: load.work.planned, rate: load.plannedRate, level: load.plannedLevel, holiday: load.holiday.planned };
		case 'actual':
			return { hours: load.work.actual, rate: load.actualRate, level: load.actualLevel, holiday: load.holiday.actual };
	}
}

export const isLoadMode = (v: unknown): v is LoadMode => LOAD_MODES.some((m) => m === v);

/** 配分・予定・実績の時間と基準工数の説明（マウスを乗せたときの文。要件4.8） */
export function loadHoursText(load: MemberLoad): string {
	const parts = [
		`配分 ${hoursText(load.allocated)}h`,
		`予定 ${hoursText(load.work.planned)}h`,
		`実績 ${hoursText(load.work.actual)}h`,
		`基準 ${hoursText(load.base)}h`,
	];
	if (load.holiday.planned > 0 || load.holiday.actual > 0) {
		parts.push(`休日 予定 ${hoursText(load.holiday.planned)}h・実績 ${hoursText(load.holiday.actual)}h（負荷率に入れない）`);
	}
	return parts.join('／');
}
