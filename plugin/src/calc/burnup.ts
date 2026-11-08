import { findStatus } from '../config/status';
import type { IsoDate, Project } from '../model';
import type { CalcContext } from './context';
import { addDays, eachDate } from './dates';
import { countProgress } from './progress';

/** その日までの累積（時間） */
export interface BurnupPoint {
	date: IsoDate;
	planned: number;
	/** 今日より後は undefined（実績の線は今日で止める） */
	actual?: number;
}

export interface Burnup {
	points: BurnupPoint[];
	/** 見積の合計（上限の目安の線） */
	estimate: number;
	start: IsoDate;
	end: IsoDate;
	/** プロジェクトの開始日・期限日（期間の線。無ければ出さない） */
	projectStart?: IsoDate;
	projectDue?: IsoDate;
}

/**
 * プロジェクトの工数の累積（バーンアップ。設計書 11.15）。
 * 期間はプロジェクトの開始日・期限日、作業ログの最初〜最後の日、タスクの計算上の日程を合わせた範囲。
 * 作業ログも日付も無ければ undefined
 */
export function burnup(ctx: CalcContext, project: Project): Burnup | undefined {
	const tasks = ctx.byProject.get(project.id)?.tasks ?? [];
	const ids = new Set(tasks.map((t) => t.id));
	const daily = new Map<IsoDate, { planned: number; actual: number }>();
	for (const log of ctx.index.worklogs()) {
		for (const e of log.entries) {
			if (!ids.has(e.task)) continue;
			const d = daily.get(e.date) ?? { planned: 0, actual: 0 };
			daily.set(e.date, { planned: d.planned + e.planned, actual: d.actual + e.actual });
		}
	}

	const dates: IsoDate[] = [...daily.keys()];
	if (project.start) dates.push(project.start);
	if (project.due) dates.push(project.due);
	for (const t of tasks) {
		const s = ctx.schedule.schedules.get(t.id);
		if (s) dates.push(s.start, s.end);
	}
	if (dates.length === 0) return undefined;
	dates.sort();
	const start = dates[0] ?? ctx.today;
	const end = dates[dates.length - 1] ?? ctx.today;

	let planned = 0;
	let actual = 0;
	const points: BurnupPoint[] = [];
	for (const date of eachDate(start, end)) {
		const d = daily.get(date);
		planned += d?.planned ?? 0;
		actual += d?.actual ?? 0;
		points.push({ date, planned, ...(date <= ctx.today ? { actual } : {}) });
	}
	const estimate = tasks.reduce((sum, t) => sum + (t.estimate ?? 0), 0);
	return {
		points,
		estimate,
		start,
		end,
		...(project.start ? { projectStart: project.start } : {}),
		...(project.due ? { projectDue: project.due } : {}),
	};
}

/** その日までに終わるはずのタスクの数（予定の進捗） */
export interface ProgressPoint {
	date: IsoDate;
	planned: number;
}

export interface ProgressPlan {
	points: ProgressPoint[];
	/** 進捗率の分母（停止系を除いたタスクの数。要件4.3） */
	total: number;
	/** 今日の実際の完了数 */
	done: number;
	/** 日程を計算できないタスクの数（予定の線に入らない） */
	unscheduled: number;
}

/**
 * 予定の進捗（設計書 11.15）。その日までに計算上の終了日が来るタスクの数を、期間の毎日について数える。
 * 分母・完了の数え方は進捗率（`countProgress`）と同じ。完了した日は記録が無いので、実績は今日の値だけ
 */
export function progressPlan(ctx: CalcContext, project: Project, range: { start: IsoDate; end: IsoDate }): ProgressPlan {
	const tasks = ctx.byProject.get(project.id)?.tasks ?? [];
	const { done, total } = countProgress(tasks, ctx.statuses.task);
	const ends: IsoDate[] = [];
	let unscheduled = 0;
	for (const t of tasks) {
		if (findStatus(ctx.statuses.task, t.status)?.category === 'stopped') continue;
		const s = ctx.schedule.schedules.get(t.id);
		if (s) ends.push(s.end);
		else unscheduled++;
	}
	ends.sort();
	const points: ProgressPoint[] = [];
	let i = 0;
	for (const date of eachDate(range.start, range.end)) {
		while (i < ends.length && (ends[i] ?? '') <= date) i++;
		points.push({ date, planned: i });
	}
	return { points, total, done, unscheduled };
}

/** 縦軸の目盛り：0 から max 以上のきりのよい値まで、4〜6本ほど */
export function niceTicks(max: number): number[] {
	if (max <= 0) return [0];
	const raw = max / 5;
	const power = 10 ** Math.floor(Math.log10(raw));
	const step = ([1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power);
	const ticks: number[] = [];
	for (let v = 0; v < max + step; v += step) ticks.push(Math.round(v * 100) / 100);
	return ticks;
}

/** 横軸の目盛り：期間内の各月の1日 */
export function monthTicks(start: IsoDate, end: IsoDate): IsoDate[] {
	const nextMonth = (d: IsoDate) => `${addDays(`${d.slice(0, 7)}-01`, 40).slice(0, 7)}-01`;
	const ticks: IsoDate[] = [];
	for (let d = start.endsWith('-01') ? start : nextMonth(start); d <= end; d = nextMonth(d)) ticks.push(d);
	return ticks;
}
