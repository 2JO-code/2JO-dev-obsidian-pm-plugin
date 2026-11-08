import type { IsoDate, NoteId, Task } from '../model';
import { daysBetween } from './dates';
import { periodsBetween, type Period, type PeriodUnit } from './workdays';
import { isRecord } from '../parse/values';

/** ガントの表示条件（要件4.8c）。期間が無ければ初期値（前月〜3か月先） */
export interface GanttOptions {
	unit: PeriodUnit;
	start?: IsoDate;
	end?: IsoDate;
	/** 依存のあるタスクに印を付けるか（既定は付けない。設計書 9.8） */
	showDependencies: boolean;
}

export const DEFAULT_GANTT: GanttOptions = { unit: 'week', showDependencies: false };

/** 表示名の欄の幅の範囲と初期値(px)。見出しの境をドラッグして変える（設計書 9.8） */
export const GANTT_LABEL_WIDTH = { min: 160, max: 800, initial: 320 };

/** 表示名の欄の幅。数でなければ初期値、範囲の外は端にそろえる */
export function ganttLabelWidthOf(v: unknown): number {
	if (typeof v !== 'number' || !Number.isFinite(v)) return GANTT_LABEL_WIDTH.initial;
	return Math.min(GANTT_LABEL_WIDTH.max, Math.max(GANTT_LABEL_WIDTH.min, Math.round(v)));
}

/** 1日の幅(px)。単位ごとに、期間の見出しが読める幅にする */
export const PX_PER_DAY: Record<PeriodUnit, number> = { day: 28, week: 8, month: 3 };

const UNITS: readonly PeriodUnit[] = ['day', 'week', 'month'];
const date = (v: unknown): IsoDate | undefined => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** 保存されていた表示条件を読む。不正な値は既定値にする */
export function parseGanttOptions(raw: unknown): GanttOptions {
	const data = isRecord(raw) ? raw : {};
	const start = date(data.start);
	const end = date(data.end);
	return {
		unit: UNITS.find((u) => u === data.unit) ?? DEFAULT_GANTT.unit,
		...(start ? { start } : {}),
		...(end ? { end } : {}),
		showDependencies: data.showDependencies === true,
	};
}

/** 横軸。範囲は期間の区切りまで広げる（週なら月曜〜日曜） */
export interface GanttScale {
	unit: PeriodUnit;
	start: IsoDate;
	end: IsoDate;
	pxPerDay: number;
	periods: Period[];
	width: number;
}

export function ganttScale(range: { start: IsoDate; end: IsoDate }, unit: PeriodUnit): GanttScale {
	const periods = periodsBetween(range.start, range.end, unit);
	const start = periods[0]?.start ?? range.start;
	const end = periods[periods.length - 1]?.end ?? range.end;
	const pxPerDay = PX_PER_DAY[unit];
	return { unit, start, end, pxPerDay, periods, width: daysBetween(start, end) * pxPerDay };
}

/** その日の左端の位置(px) */
export const xOf = (scale: GanttScale, d: IsoDate): number => (daysBetween(scale.start, d) - 1) * scale.pxPerDay;

/** 棒の位置。範囲の外にはみ出した側は切る（cutStart・cutEnd） */
export interface BarBox {
	left: number;
	width: number;
	cutStart: boolean;
	cutEnd: boolean;
}

/** start〜end（両端を含む）の棒。範囲と重ならなければ undefined */
export function barBox(scale: GanttScale, start: IsoDate, end: IsoDate): BarBox | undefined {
	if (end < scale.start || start > scale.end || end < start) return undefined;
	const from = start < scale.start ? scale.start : start;
	const to = end > scale.end ? scale.end : end;
	return {
		left: xOf(scale, from),
		width: daysBetween(from, to) * scale.pxPerDay,
		cutStart: start < scale.start,
		cutEnd: end > scale.end,
	};
}

/** 印（期限日・マイルストーン・今日）の位置(px)。その日の中央。範囲の外なら undefined */
export function markX(scale: GanttScale, d: IsoDate): number | undefined {
	if (d < scale.start || d > scale.end) return undefined;
	return xOf(scale, d) + scale.pxPerDay / 2;
}

/** 選んだタスクの先行と後続（要件4.8c）。見つからない先行のIDも含める */
export function dependencyLinks(tasks: readonly Task[], id: NoteId): { predecessors: NoteId[]; successors: NoteId[] } {
	const self = tasks.find((t) => t.id === id);
	return {
		predecessors: self ? [...new Set(self.dependsOn)].filter((p) => p !== id) : [],
		successors: tasks.filter((t) => t.id !== id && t.dependsOn.includes(id)).map((t) => t.id),
	};
}

/** 依存のあるタスク：先行があるか・後続があるか（棒の印。設計書 9.8）。見つからない先行は数えない */
export function dependencyFlags(tasks: readonly Task[]): Map<NoteId, { predecessor: boolean; successor: boolean }> {
	const ids = new Set(tasks.map((t) => t.id));
	const flags = new Map<NoteId, { predecessor: boolean; successor: boolean }>();
	const get = (id: NoteId) => {
		let f = flags.get(id);
		if (!f) flags.set(id, (f = { predecessor: false, successor: false }));
		return f;
	};
	for (const t of tasks) {
		for (const p of t.dependsOn) {
			if (p === t.id || !ids.has(p)) continue;
			get(t.id).predecessor = true;
			get(p).successor = true;
		}
	}
	return flags;
}

/**
 * 「プロジェクトの期間に合わせる」の範囲：プロジェクトの開始日・期限日と、タスクの日程の最初〜最後を合わせた範囲。
 * どれも無ければ undefined
 */
export function fitRange(items: readonly { start?: IsoDate; due?: IsoDate; span?: { start: IsoDate; end: IsoDate } }[]): { start: IsoDate; end: IsoDate } | undefined {
	const dates = items.flatMap((p) => [p.start, p.due, p.span?.start, p.span?.end]).filter((d): d is IsoDate => !!d);
	if (dates.length === 0) return undefined;
	dates.sort();
	const first = dates[0];
	const last = dates[dates.length - 1];
	return first && last ? { start: first, end: last } : undefined;
}
