import { describe, expect, it } from 'vitest';
import { cellHoursText as hoursText } from './format';
import { parseGanttWorklogMode, sumDayHours, taskDayHours, worklogCellTexts } from './ganttWorklog';
import { worklog } from './testData';

describe('parseGanttWorklogMode', () => {
	it('不正な値は出さない', () => {
		expect(parseGanttWorklogMode('both')).toBe('both');
		expect(parseGanttWorklogMode('x')).toBe('none');
		expect(parseGanttWorklogMode(undefined)).toBe('none');
	});
});

describe('taskDayHours', () => {
	const logs = [
		worklog('USER-a', '2026-11', [
			['2026-11-02', 'TASK-1', 4, 3],
			['2026-11-02', 'TASK-1', 1, 0.5],
			['2026-11-30', 'TASK-1', 2, 0],
			['2026-11-03', 'TASK-2', 0, 0],
		]),
		worklog('USER-b', '2026-11', [['2026-11-02', 'TASK-1', 0, 2]]),
		worklog('USER-a', '2026-10', [['2026-10-31', 'TASK-1', 8, 8]]),
	];

	it('同じ日・タスクは人をまたいで合計し、期間の外と 0 の行は除く', () => {
		const hours = taskDayHours(logs, '2026-11-01', '2026-11-15');
		expect([...(hours.get('TASK-1') ?? [])]).toEqual([['2026-11-02', { planned: 5, actual: 5.5 }]]);
		expect(hours.has('TASK-2')).toBe(false);
	});

	it('月をまたぐ期間も読む', () => {
		const hours = taskDayHours(logs, '2026-10-31', '2026-11-02');
		expect(hours.get('TASK-1')?.get('2026-10-31')).toEqual({ planned: 8, actual: 8 });
	});

	it('複数タスクの日ごとの合計', () => {
		const hours = taskDayHours(logs, '2026-10-01', '2026-11-30');
		const sum = sumDayHours(hours, ['TASK-1', 'TASK-9']);
		expect(sum.get('2026-11-02')).toEqual({ planned: 5, actual: 5.5 });
		expect(sum.size).toBe(3);
	});
});

describe('hoursText・worklogCellTexts', () => {
	it('0 は空、小数は2けたまで', () => {
		expect(hoursText(0)).toBe('');
		expect(hoursText(7.5)).toBe('7.5');
		expect(hoursText(0.1 + 0.2)).toBe('0.3');
	});

	it('表示する値だけを出し、どちらも空なら出さない', () => {
		const h = { planned: 4, actual: 0 };
		expect(worklogCellTexts('both', h)).toEqual({ planned: '4', actual: '' });
		expect(worklogCellTexts('actual', h)).toBeUndefined();
		expect(worklogCellTexts('planned', h)).toEqual({ planned: '4', actual: '' });
	});
});
