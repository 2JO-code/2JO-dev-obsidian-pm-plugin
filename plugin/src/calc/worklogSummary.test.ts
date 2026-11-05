import { describe, expect, it } from 'vitest';
import { PJT, PJT2, task, USER, USER2, worklog } from './testData';
import { UNKNOWN_PROJECT, WorkSummary } from './worklogSummary';

const tasks = [task('T1'), task('T2', { project: PJT2 })];
const summary = new WorkSummary(
	[
		worklog(USER, '2026-11', [
			['2026-11-02', 'T1', 4, 3],
			['2026-11-02', 'T1', 1, 1], // 同じ日付・同じタスクは合算
			['2026-11-02', 'T2', 3, 3],
			['2026-11-04', 'T1', 2, 0],
			['2026-11-05', 'T-missing', 1, 1],
		]),
		worklog(USER2, '2026-11', [['2026-11-02', 'T1', 8, 8]]),
		worklog(USER, '2026-12', [['2026-12-01', 'T1', 5, 0]]),
	],
	tasks,
);

describe('WorkSummary', () => {
	it('タスク別の合計（メンバー・月をまたいで合算）', () => {
		expect(summary.task('T1')).toEqual({ planned: 20, actual: 12 });
		expect(summary.task('T3')).toEqual({ planned: 0, actual: 0 });
	});

	it('プロジェクト×月×メンバーの合計', () => {
		expect(summary.allocation(PJT, '2026-11', USER)).toEqual({ planned: 7, actual: 4 });
		expect(summary.allocation(PJT2, '2026-11', USER)).toEqual({ planned: 3, actual: 3 });
		expect(summary.allocation(PJT, '2026-12', USER)).toEqual({ planned: 5, actual: 0 });
	});

	it('メンバーの日別・期間の合計とプロジェクト別の内訳。タスクが見つからない記録は所属不明', () => {
		expect([...summary.memberDay(USER, '2026-11-02')]).toEqual([
			[PJT, { planned: 5, actual: 4 }],
			[PJT2, { planned: 3, actual: 3 }],
		]);
		const range = summary.memberRange(USER, '2026-11-01', '2026-11-30');
		expect(range.total).toEqual({ planned: 11, actual: 8 });
		expect(range.byProject.get(UNKNOWN_PROJECT)).toEqual({ planned: 1, actual: 1 });
	});

	it('期間の合計で日付を絞り込める（休日を除くなど）', () => {
		const range = summary.memberRange(USER, '2026-11-01', '2026-11-30', (d) => d !== '2026-11-02');
		expect(range.total).toEqual({ planned: 3, actual: 1 });
	});

	it('返した値を変えても集計結果は変わらない', () => {
		summary.task('T1').planned = 999;
		expect(summary.task('T1').planned).toBe(20);
	});
});
