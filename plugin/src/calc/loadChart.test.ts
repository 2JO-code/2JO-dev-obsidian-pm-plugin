import { describe, expect, it } from 'vitest';
import { defaultCalendar, defaultStatusSets } from '../config/defaults';
import { buildContext } from './context';
import { loadChart, loadChartPeriod, sortLoadRows, type LoadChartRow } from './loadChart';
import { indexOf, member, task, USER, USER2, worklog } from './testData';

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
		const chart = loadChart(ctx, members, 'thisWeek');
		expect(chart.rows.map((r) => [r.member.title, r.load.plannedLevel])).toEqual([
			['伊藤', 'normal'],
			['佐藤', 'caution'],
			['上田', 'normal'],
		]);
		expect(chart.counts).toEqual({ caution: 1, warning: 0 });
	});

	it('負荷率の高い順・低い順に並べ替える（同じなら名前順）', () => {
		const titles = (sort: 'rateDesc' | 'rateAsc') => loadChart(ctx, members, 'thisWeek', sort).rows.map((r) => r.member.title);
		// 今週：佐藤 110%、伊藤・上田 0%
		expect(titles('rateDesc')).toEqual(['佐藤', '伊藤', '上田']);
		expect(titles('rateAsc')).toEqual(['伊藤', '上田', '佐藤']);
	});

	it('負荷率の無い人はどちらの向きでも最後', () => {
		const row = (title: string, rate: number | null) => ({ member: member(title, { title }), load: { plannedRate: rate } }) as LoadChartRow;
		const rows = () => [row('甲', null), row('乙', 0.5), row('丙', 1.2)];
		expect(sortLoadRows(rows(), 'rateDesc').map((r) => r.member.title)).toEqual(['丙', '乙', '甲']);
		expect(sortLoadRows(rows(), 'rateAsc').map((r) => r.member.title)).toEqual(['乙', '丙', '甲']);
	});

	it('来週を選ぶとその週の負荷率になる', () => {
		const chart = loadChart(ctx, members, 'nextWeek');
		const ito = chart.rows.find((r) => r.member.title === '伊藤');
		expect(ito?.load.plannedRate).toBeCloseTo(1.6);
		expect(chart.counts).toEqual({ caution: 0, warning: 1 });
	});

	it('目盛りは予定負荷率と負荷許容率がすべて収まるまで', () => {
		expect(loadChart(ctx, members, 'thisWeek').ticks.at(-1)).toBeGreaterThanOrEqual(150);
		expect(loadChart(ctx, members, 'nextWeek').ticks.at(-1)).toBeGreaterThanOrEqual(160);
	});

	it('メンバーがいなくても 100% までの目盛りを出す', () => {
		expect(loadChart(ctx, [], 'thisMonth').ticks.at(-1)).toBeGreaterThanOrEqual(100);
	});
});
