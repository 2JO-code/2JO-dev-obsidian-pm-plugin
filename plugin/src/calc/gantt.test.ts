import { describe, expect, it } from 'vitest';
import { barBox, DEFAULT_GANTT, dependencyFlags, dependencyLinks, fitRange, ganttLabelWidthOf, ganttScale, markX, parseGanttOptions, xOf } from './gantt';
import { task } from './testData';

describe('ganttScale', () => {
	it('週の単位では月曜〜日曜まで広げる', () => {
		const scale = ganttScale({ start: '2026-11-04', end: '2026-11-10' }, 'week');
		expect(scale.start).toBe('2026-11-02');
		expect(scale.end).toBe('2026-11-15');
		expect(scale.periods).toHaveLength(2);
		expect(scale.width).toBe(14 * 8);
	});

	it('月の単位では月初〜月末', () => {
		const scale = ganttScale({ start: '2026-11-10', end: '2026-12-03' }, 'month');
		expect([scale.start, scale.end]).toEqual(['2026-11-01', '2026-12-31']);
	});
});

describe('barBox・markX', () => {
	const scale = ganttScale({ start: '2026-11-02', end: '2026-11-08' }, 'day');

	it('開始日の左端から終了日の右端まで', () => {
		expect(xOf(scale, '2026-11-02')).toBe(0);
		expect(barBox(scale, '2026-11-03', '2026-11-04')).toEqual({ left: 28, width: 56, cutStart: false, cutEnd: false });
	});

	it('範囲からはみ出した側は切り、重ならなければ出さない', () => {
		expect(barBox(scale, '2026-10-30', '2026-11-02')).toEqual({ left: 0, width: 28, cutStart: true, cutEnd: false });
		expect(barBox(scale, '2026-11-08', '2026-11-20')).toEqual({ left: 168, width: 28, cutStart: false, cutEnd: true });
		expect(barBox(scale, '2026-11-09', '2026-11-10')).toBeUndefined();
	});

	it('印はその日の中央。範囲の外は出さない', () => {
		expect(markX(scale, '2026-11-03')).toBe(42);
		expect(markX(scale, '2026-11-09')).toBeUndefined();
	});
});

describe('dependencyLinks', () => {
	it('先行と後続', () => {
		const tasks = [task('A'), task('B', { dependsOn: ['A'] }), task('C', { dependsOn: ['A', 'B', 'X'] })];
		expect(dependencyLinks(tasks, 'B')).toEqual({ predecessors: ['A'], successors: ['C'] });
		expect(dependencyLinks(tasks, 'C')).toEqual({ predecessors: ['A', 'B', 'X'], successors: [] });
	});
});

describe('dependencyFlags', () => {
	it('先行のあるタスクと後続のあるタスク。見つからない先行・自分自身は数えない', () => {
		const flags = dependencyFlags([task('A'), task('B', { dependsOn: ['A', 'X'] }), task('C', { dependsOn: ['C'] })]);
		expect(flags.get('A')).toEqual({ predecessor: false, successor: true });
		expect(flags.get('B')).toEqual({ predecessor: true, successor: false });
		expect(flags.has('C')).toBe(false);
	});
});

describe('fitRange', () => {
	it('プロジェクトの開始日・期限日とタスクの日程を合わせた範囲', () => {
		expect(
			fitRange([
				{ start: '2026-11-05', due: '2026-12-20', span: { start: '2026-11-02', end: '2026-12-01' } },
				{ due: '2027-01-10' },
			]),
		).toEqual({ start: '2026-11-02', end: '2027-01-10' });
		expect(fitRange([{}])).toBeUndefined();
	});
});

describe('parseGanttOptions', () => {
	it('不正な値は既定値にする', () => {
		expect(parseGanttOptions({ unit: 'year', start: 'x' })).toEqual(DEFAULT_GANTT);
		expect(parseGanttOptions({ unit: 'day', start: '2026-11-01', showDependencies: true })).toEqual({
			unit: 'day',
			start: '2026-11-01',
			showDependencies: true,
		});
	});
});

describe('ganttLabelWidthOf', () => {
	it('数でなければ初期値、範囲の外は端にそろえ、小数は丸める', () => {
		expect(ganttLabelWidthOf(undefined)).toBe(320);
		expect(ganttLabelWidthOf('400')).toBe(320);
		expect(ganttLabelWidthOf(Number.NaN)).toBe(320);
		expect(ganttLabelWidthOf(100)).toBe(160);
		expect(ganttLabelWidthOf(1200)).toBe(800);
		expect(ganttLabelWidthOf(250.6)).toBe(251);
	});
});
