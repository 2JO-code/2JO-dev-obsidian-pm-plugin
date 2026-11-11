import { describe, expect, it } from 'vitest';
import {
	gridKey,
	gridKeyDates,
	gridLines,
	monthDates,
	monthsOf,
	parseGridKey,
	parseGridUnit,
	periodDates,
	periodStartOf,
	shiftPeriod,
	visibleGridLines,
	type GridTaskInfo,
} from './worklogCells';

const T1 = 'TASK-0192f3a0-1234-7abc-8def-000000000001';
const T2 = 'TASK-0192f3a0-1234-7abc-8def-000000000002';
const T3 = 'TASK-0192f3a0-1234-7abc-8def-000000000003';

describe('週', () => {
	it('月曜日から7日分を並べる。日曜日は前の月曜日の週', () => {
		expect(periodStartOf('2026-11-08', 'week')).toBe('2026-11-02');
		expect(periodStartOf('2026-11-09', 'week')).toBe('2026-11-09');
		expect(periodDates('2026-10-26', 'week')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
	});
});

describe('期間', () => {
	it('週は月曜から、月は1日から', () => {
		expect(periodStartOf('2026-11-08', 'week')).toBe('2026-11-02');
		expect(periodStartOf('2026-11-08', 'month')).toBe('2026-11-01');
	});

	it('月はその月の全日を並べる', () => {
		expect(periodDates('2026-02-01', 'month')).toHaveLength(28);
		expect(monthDates('2026-11').at(-1)).toBe('2026-11-30');
	});

	it('前後の期間へ動く', () => {
		expect(shiftPeriod('2026-11-02', 'week', -1)).toBe('2026-10-26');
		expect(shiftPeriod('2026-11-01', 'month', 2)).toBe('2027-01-01');
		expect(shiftPeriod('2026-03-01', 'month', -1)).toBe('2026-02-01');
	});

	it('並びに出てくる月。月をまたぐ週は2つ', () => {
		expect(monthsOf(periodDates('2026-10-26', 'week'))).toEqual(['2026-10', '2026-11']);
		expect(monthsOf(periodDates('2026-11-02', 'week'))).toEqual(['2026-11']);
	});

	it('保存されていた単位を読む', () => {
		expect(parseGridUnit('month')).toBe('month');
		expect(parseGridUnit(null)).toBe('week');
	});
});

describe('行の階層', () => {
	const T4 = 'TASK-0192f3a0-1234-7abc-8def-000000000004';
	const info: Record<string, GridTaskInfo> = {
		[T1]: { project: 'PJT-b', projectLabel: 'B案件', epic: 'EPIC-2', epicTitle: '実装', epicWbs: '2', title: 'モデリング', wbs: '2' },
		[T2]: { project: 'PJT-b', projectLabel: 'B案件', epic: 'EPIC-2', epicTitle: '実装', epicWbs: '2', title: '設計', wbs: '1' },
		[T3]: { project: 'PJT-b', projectLabel: 'B案件', epic: 'EPIC-1', epicTitle: '準備', epicWbs: '1', title: 'テスト' },
		[T4]: { project: 'PJT-a', projectLabel: 'A案件', epic: '', epicTitle: '', title: '雑務' },
	};
	const lines = gridLines([T1, T2, T3, T4, 'TASK-missing'], (id) => info[id]);
	const brief = (ls: typeof lines) => ls.map((l) => `${'  '.repeat(l.depth)}${l.wbs ? `${l.wbs} ` : ''}${l.label}`);

	it('プロジェクト名 → エピックの番号 → タスクの番号の順。エピックなし・見つからないタスクは後ろ', () => {
		expect(brief(lines)).toEqual([
			'A案件',
			'  （エピックなし）',
			'    雑務',
			'B案件',
			'  1 準備',
			'    テスト',
			'  2 実装',
			'    2.1 設計',
			'    2.2 モデリング',
			'（見つからないタスク）',
			'  TASK-missing',
		]);
	});

	it('プロジェクト・エピックの行は配下のタスクをまとめる', () => {
		expect(lines.find((l) => l.key === 'p:PJT-b')?.tasks).toEqual([T1, T2, T3]);
		expect(lines.find((l) => l.key === 'e:PJT-b:EPIC-2')?.tasks).toEqual([T1, T2]);
	});

	it('「エピックなし」のまとまりの行だけに noEpic を付ける（同じ名前のエピックとは区別する）', () => {
		const same = { project: 'PJT-a', projectLabel: 'A案件', epic: 'EPIC-x', epicTitle: '（エピックなし）', title: 'モデリング' };
		expect(gridLines([T1], () => same).find((l) => l.kind === 'epic')?.noEpic).toBeUndefined();
		expect(lines.filter((l) => l.noEpic).map((l) => l.key)).toEqual(['e:PJT-a:']);
	});

	it('たたんだ行の配下は出さない', () => {
		expect(brief(visibleGridLines(lines, new Set(['p:PJT-a', 'e:PJT-b:EPIC-2'])))).toEqual([
			'A案件',
			'B案件',
			'  1 準備',
			'    テスト',
			'  2 実装',
			'（見つからないタスク）',
			'  TASK-missing',
		]);
	});
});

describe('マスのキー', () => {
	it('parseGridKey は gridKey の逆', () => {
		expect(parseGridKey(gridKey('2026-11-02', T1))).toEqual({ date: '2026-11-02', task: T1 });
	});

	it('gridKeyDates は日付を重ねずに出す', () => {
		expect(gridKeyDates([gridKey('2026-11-02', T1), gridKey('2026-11-02', T2), gridKey('2026-11-03', T1)])).toEqual(['2026-11-02', '2026-11-03']);
	});
});
