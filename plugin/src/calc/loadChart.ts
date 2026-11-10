import type { IsoDate, Member } from '../model';
import { niceTicks } from './burnup';
import { compareJa } from './compare';
import type { CalcContext } from './context';
import { addDays } from './dates';
import { LOAD_MODES, loadValue, memberLoad, type LoadMode, type LoadScale, type MemberLoad } from './load';
import { periodOf, type Period } from './workdays';

/** 負荷率のグラフで選べる期間（設計書 11.16） */
export type LoadChartPeriod = 'thisWeek' | 'nextWeek' | 'thisMonth' | 'nextMonth';

export const LOAD_CHART_PERIODS: readonly { value: LoadChartPeriod; label: string }[] = [
	{ value: 'thisWeek', label: '今週' },
	{ value: 'nextWeek', label: '来週' },
	{ value: 'thisMonth', label: '今月' },
	{ value: 'nextMonth', label: '来月' },
];

export function isLoadChartPeriod(v: unknown): v is LoadChartPeriod {
	return LOAD_CHART_PERIODS.some((p) => p.value === v);
}

/** 負荷率のグラフの並び順（設計書 11.16） */
export type LoadChartSort = 'name' | 'rateDesc' | 'rateAsc';

export const LOAD_CHART_SORTS: readonly { value: LoadChartSort; label: string }[] = [
	{ value: 'name', label: '名前順' },
	{ value: 'rateDesc', label: '負荷率の高い順' },
	{ value: 'rateAsc', label: '負荷率の低い順' },
];

export function isLoadChartSort(v: unknown): v is LoadChartSort {
	return LOAD_CHART_SORTS.some((s) => s.value === v);
}

/** 選んだ期間の範囲。週は月曜始まり */
export function loadChartPeriod(today: IsoDate, key: LoadChartPeriod): Period {
	switch (key) {
		case 'thisWeek':
			return periodOf(today, 'week');
		case 'nextWeek':
			return periodOf(addDays(periodOf(today, 'week').end, 1), 'week');
		case 'thisMonth':
			return periodOf(today, 'month');
		case 'nextMonth':
			return periodOf(addDays(periodOf(today, 'month').end, 1), 'month');
	}
}

export interface LoadChartRow {
	member: Member;
	load: MemberLoad;
}

export interface LoadChart {
	period: Period;
	/** 選んだ並び順 */
	rows: LoadChartRow[];
	/** 表示する元（配分・予定・実績） */
	mode: LoadMode;
	/** 横軸の単位（負荷率(%)か工数(h)） */
	scale: LoadScale;
	/**
	 * 横軸の目盛り（% か h）。0 から、配分・予定・実績のどれでも全員の値・100%・負荷許容率が収まるまで。
	 * 配分・予定・実績を切り替えても軸が動かないように、3つの最大で決める
	 */
	ticks: number[];
	/** 横軸の右端（軸の単位）。工数の目盛りは右端と一致しないことがある */
	top: number;
	/** 段階ごとの人数 */
	counts: { caution: number; warning: number };
}

/** 横軸上の位置（軸の単位）。value＝棒の長さ、full＝その人の100%、limit＝負荷許容率。値が無ければ null */
export interface ChartPoint {
	value: number | null;
	full: number;
	limit: number;
}

export function chartPoint(row: LoadChartRow, mode: LoadMode, scale: LoadScale): ChartPoint {
	const v = loadValue(row.load, mode);
	const pct = row.member.loadLimitPct;
	if (scale === 'rate') return { value: v.rate === null ? null : v.rate * 100, full: 100, limit: pct };
	return { value: row.load.base > 0 || v.hours > 0 ? v.hours : null, full: row.load.base, limit: (row.load.base * pct) / 100 };
}

/**
 * 横軸の目盛りと右端。配分・予定・実績の3つの最大で決め、切り替えても動かさない。
 * 工数の右端は、負荷率の右端 × 働ける時間の最も長い人の時間。
 * 負荷率と工数を切り替えても、その人たちの 100% の線が同じ位置に来るようにするため
 */
export function chartAxis(rows: readonly LoadChartRow[], scale: LoadScale): { ticks: number[]; top: number } {
	const points = (s: LoadScale) => rows.flatMap((r) => LOAD_MODES.map((m) => chartPoint(r, m, s)));
	const rateTicks = niceTicks(Math.max(100, ...points('rate').flatMap((p) => [p.value ?? 0, p.limit])));
	const rateTop = rateTicks[rateTicks.length - 1] ?? 100;
	if (scale === 'rate') return { ticks: rateTicks, top: rateTop };
	const fullest = Math.max(0, ...rows.map((r) => r.load.base));
	if (fullest > 0) {
		const top = (rateTop / 100) * fullest;
		return { ticks: niceTicks(top).filter((t) => t <= top + 1e-9), top };
	}
	// 稼働日が無い期間：時間だけで決める
	const ticks = niceTicks(Math.max(0, ...points('hours').map((p) => p.value ?? 0)));
	return { ticks, top: ticks[ticks.length - 1] ?? 0 };
}

/** 並べ替え。負荷率の無い人（稼働日なし）はどちらの向きでも最後、同じなら名前順 */
export function sortLoadRows(rows: LoadChartRow[], sort: LoadChartSort, mode: LoadMode = 'allocated'): LoadChartRow[] {
	const byName = (a: LoadChartRow, b: LoadChartRow) => compareJa(a.member.title, b.member.title);
	if (sort === 'name') return rows.sort(byName);
	const sign = sort === 'rateDesc' ? -1 : 1;
	return rows.sort((a, b) => {
		const ra = loadValue(a.load, mode).rate;
		const rb = loadValue(b.load, mode).rate;
		if (ra === null || rb === null) return ra === rb ? byName(a, b) : ra === null ? 1 : -1;
		return ra === rb ? byName(a, b) : sign * (ra - rb);
	});
}

/** メンバーの負荷率の横棒グラフ（要件4.8b、設計書 11.16）。値は配分・予定・実績から選ぶ */
export function loadChart(
	ctx: CalcContext,
	members: readonly Member[],
	key: LoadChartPeriod,
	sort: LoadChartSort = 'name',
	mode: LoadMode = 'allocated',
	scale: LoadScale = 'rate',
): LoadChart {
	const period = loadChartPeriod(ctx.today, key);
	const rows = sortLoadRows(
		members.map((member) => ({ member, load: memberLoad(member, period, ctx.summary, ctx.calendar, ctx.allocations) })),
		sort,
		mode,
	);
	const { ticks, top } = chartAxis(rows, scale);
	const levels = rows.map((r) => loadValue(r.load, mode).level);
	return {
		period,
		rows,
		mode,
		scale,
		ticks,
		top,
		counts: {
			caution: levels.filter((l) => l === 'caution').length,
			warning: levels.filter((l) => l === 'warning').length,
		},
	};
}
