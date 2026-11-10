import { describe, expect, it } from 'vitest';
import { defaultCalendar, defaultStatusSets } from '../config/defaults';
import { buildContext } from './context';
import { chartPoint, loadChart, loadChartPeriod, sortLoadRows, type LoadChartRow } from './loadChart';
import { indexOf, member, project, task, USER, USER2, worklog } from './testData';

const today = '2026-11-04';
const index = indexOf([
	member(USER, { title: '佐藤' }),
	member(USER2, { title: '伊藤', loadLimitPct: 150 }),
	member('USER-3', { title: '上田' }),
	task('T1', { assignees: [USER] }),
	// 佐藤：今週（11/2〜8、稼働5日＝40h）に 44h → 110%（注意）
	worklog(USER, '2026-11', [
		['2026-11-02', 'T1', 22, 0],
		['2026-11-04', 'T1', 22, 0],
	]),
	// 伊藤：来週（11/9〜15）に 64h → 160%（許容率150%超で警告）
	worklog(USER2, '2026-11', [['2026-11-10', 'T1', 64, 0]]),
]);
const ctx = buildContext(index, defaultStatusSets(), defaultCalendar(), today);
const members = index.members();

describe('loadChartPeriod', () => {
	it('今週・来週は月曜始まり、今月・来月は月の初日〜末日', () => {
		expect(loadChartPeriod(today, 'thisWeek')).toMatchObject({ start: '2026-11-02', end: '2026-11-08' });
		expect(loadChartPeriod(today, 'nextWeek')).toMatchObject({ start: '2026-11-09', end: '2026-11-15' });
		expect(loadChartPeriod(today, 'thisMonth')).toMatchObject({ start: '2026-11-01', end: '2026-11-30' });
		expect(loadChartPeriod('2026-12-31', 'nextMonth')).toMatchObject({ key: '2027-01', start: '2027-01-01', end: '2027-01-31' });
	});
});

describe('loadChart', () => {
	it('全員を名前順に出し、段階ごとの人数を数える', () => {
		const chart = loadChart(ctx, members, 'thisWeek', 'name', 'planned');
		expect(chart.rows.map((r) => [r.member.title, r.load.plannedLevel])).toEqual([
			['伊藤', 'normal'],
			['佐藤', 'caution'],
			['上田', 'normal'],
		]);
		expect(chart.counts).toEqual({ caution: 1, warning: 0 });
	});

	it('負荷率の高い順・低い順に並べ替える（同じなら名前順）', () => {
		const titles = (sort: 'rateDesc' | 'rateAsc') => loadChart(ctx, members, 'thisWeek', sort, 'planned').rows.map((r) => r.member.title);
		// 今週：佐藤 110%、伊藤・上田 0%
		expect(titles('rateDesc')).toEqual(['佐藤', '伊藤', '上田']);
		expect(titles('rateAsc')).toEqual(['伊藤', '上田', '佐藤']);
	});

	it('負荷率の無い人はどちらの向きでも最後', () => {
		const row = (title: string, rate: number | null) => ({ member: member(title, { title }), load: { plannedRate: rate, plannedLevel: 'normal', work: { planned: 0, actual: 0 }, holiday: { planned: 0, actual: 0 } } }) as unknown as LoadChartRow;
		const rows = () => [row('甲', null), row('乙', 0.5), row('丙', 1.2)];
		expect(sortLoadRows(rows(), 'rateDesc', 'planned').map((r) => r.member.title)).toEqual(['丙', '乙', '甲']);
		expect(sortLoadRows(rows(), 'rateAsc', 'planned').map((r) => r.member.title)).toEqual(['乙', '丙', '甲']);
	});

	it('来週を選ぶとその週の負荷率になる', () => {
		const chart = loadChart(ctx, members, 'nextWeek', 'name', 'planned');
		const ito = chart.rows.find((r) => r.member.title === '伊藤');
		expect(ito?.load.plannedRate).toBeCloseTo(1.6);
		expect(chart.counts).toEqual({ caution: 0, warning: 1 });
	});

	it('目盛りは予定負荷率と負荷許容率がすべて収まるまで', () => {
		expect(loadChart(ctx, members, 'thisWeek', 'name', 'planned').ticks.at(-1)).toBeGreaterThanOrEqual(150);
		expect(loadChart(ctx, members, 'nextWeek', 'name', 'planned').ticks.at(-1)).toBeGreaterThanOrEqual(160);
	});

	it('初期は配分の負荷率で並べ、段階を数える', () => {
		// 上田：11月の配分 189h ÷ 稼働21日 × 今週の稼働5日 = 45h → 112.5%（注意）
		const withAllocation = indexOf([
			...index.members(),
			project('PJT-A', { allocations: [{ line: 0, month: '2026-11', member: 'USER-3', hours: 189 }] }),
		]);
		const chart = loadChart(buildContext(withAllocation, defaultStatusSets(), defaultCalendar(), today), members, 'thisWeek', 'rateDesc');
		expect(chart.mode).toBe('allocated');
		expect(chart.rows[0]?.member.title).toBe('上田');
		expect(chart.rows[0]?.load.allocatedRate).toBeCloseTo(1.125);
		expect(chart.counts).toEqual({ caution: 1, warning: 0 });
	});

	it('メンバーがいなくても 100% までの目盛りを出す', () => {
		expect(loadChart(ctx, [], 'thisMonth').ticks.at(-1)).toBeGreaterThanOrEqual(100);
	});
});

describe('負荷率のグラフの軸と工数', () => {
	// 佐藤：今週の配分 0h・予定 44h。上田：今週の配分 45h（112.5%）
	const withAllocation = indexOf([
		...index.members(),
		...index.tasks(),
		...index.worklogs(),
		project('PJT-A', { allocations: [{ line: 0, month: '2026-11', member: 'USER-3', hours: 189 }] }),
	]);
	const c = buildContext(withAllocation, defaultStatusSets(), defaultCalendar(), today);

	it('配分・予定・実績を切り替えても目盛りは同じ', () => {
		const ticks = (mode: 'allocated' | 'planned' | 'actual') => loadChart(c, members, 'thisWeek', 'name', mode).ticks;
		expect(ticks('planned')).toEqual(ticks('allocated'));
		expect(ticks('actual')).toEqual(ticks('allocated'));
	});

	it('工数では時間の軸。100% はその人の働ける時間、負荷許容率はその時間 × 率', () => {
		const chart = loadChart(c, members, 'thisWeek', 'name', 'planned', 'hours');
		const sato = chart.rows.find((r) => r.member.title === '佐藤');
		if (!sato) throw new Error('佐藤がいない');
		expect(chartPoint(sato, 'planned', 'hours')).toEqual({ value: 44, full: 40, limit: 48 });
		const rate = chartPoint(sato, 'planned', 'rate');
		expect(rate.value).toBeCloseTo(110);
		expect([rate.full, rate.limit]).toEqual([100, 120]);
		expect(chart.ticks.at(-1)).toBeGreaterThanOrEqual(60); // 伊藤の負荷許容率 150% × 40h
		expect(loadChart(c, members, 'thisWeek', 'name', 'allocated', 'hours').ticks).toEqual(chart.ticks);
	});

	it('負荷率と工数を切り替えても、働ける時間が最も長い人の 100% の線は同じ位置', () => {
		const rate = loadChart(c, members, 'thisWeek', 'name', 'planned', 'rate');
		const hours = loadChart(c, members, 'thisWeek', 'name', 'planned', 'hours');
		const row = rate.rows[0];
		if (!row) throw new Error('行が無い');
		expect(chartPoint(row, 'planned', 'hours').full / hours.top).toBeCloseTo(100 / rate.top);
		// 目盛りは右端を超えない
		expect(hours.ticks.every((t) => t <= hours.top)).toBe(true);
	});

	it('働ける時間が短い人の 100% の線は手前に来る', () => {
		const short = [member('USER-S', { title: '短時間', dailyHours: 6 }), member('USER-L', { title: '通常' })];
		const chart = loadChart(c, short, 'thisWeek', 'name', 'planned', 'hours');
		const [a, b] = chart.rows.map((r) => chartPoint(r, 'planned', 'hours').full);
		expect([a, b]).toEqual([30, 40]);
	});
});
