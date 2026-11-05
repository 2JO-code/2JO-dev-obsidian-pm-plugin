import type { IsoDate, Member } from '../model';
import { niceTicks } from './burnup';
import { compareJa } from './compare';
import type { CalcContext } from './context';
import { addDays } from './dates';
import { memberLoad, type MemberLoad } from './load';
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
	/** 横軸の目盛り（%。0 から、予定負荷率・負荷許容率・100% がすべて収まるまで） */
	ticks: number[];
	/** 段階ごとの人数 */
	counts: { caution: number; warning: number };
}

/** 並べ替え。負荷率の無い人（稼働日なし）はどちらの向きでも最後、同じなら名前順 */
export function sortLoadRows(rows: LoadChartRow[], sort: LoadChartSort): LoadChartRow[] {
	const byName = (a: LoadChartRow, b: LoadChartRow) => compareJa(a.member.title, b.member.title);
	if (sort === 'name') return rows.sort(byName);
	const sign = sort === 'rateDesc' ? -1 : 1;
	return rows.sort((a, b) => {
		const ra = a.load.plannedRate;
		const rb = b.load.plannedRate;
		if (ra === null || rb === null) return ra === rb ? byName(a, b) : ra === null ? 1 : -1;
		return ra === rb ? byName(a, b) : sign * (ra - rb);
	});
}

/** メンバーの予定負荷率の横棒グラフ（要件4.8b、設計書 11.16） */
export function loadChart(ctx: CalcContext, members: readonly Member[], key: LoadChartPeriod, sort: LoadChartSort = 'name'): LoadChart {
	const period = loadChartPeriod(ctx.today, key);
	const rows = sortLoadRows(
		members.map((member) => ({ member, load: memberLoad(member, period, ctx.summary, ctx.calendar) })),
		sort,
	);
	const max = Math.max(100, ...rows.map((r) => Math.max((r.load.plannedRate ?? 0) * 100, r.member.loadLimitPct)));
	return {
		period,
		rows,
		ticks: niceTicks(max),
		counts: {
			caution: rows.filter((r) => r.load.plannedLevel === 'caution').length,
			warning: rows.filter((r) => r.load.plannedLevel === 'warning').length,
		},
	};
}
