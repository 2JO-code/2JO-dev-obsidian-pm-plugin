import { describe, expect, it } from 'vitest';
import { defaultStatusSets } from '../config/defaults';
import { countProgress, taskProgress, workload } from './progress';
import { task, USER, worklog } from './testData';
import { WorkSummary } from './worklogSummary';

const statuses = defaultStatusSets().task;

describe('taskProgress', () => {
	it('完了系なら完了。サブタスクの割合は参考として返す', () => {
		expect(taskProgress(task('T', { status: '完了', subtasks: { done: 1, total: 4 } }), statuses)).toEqual({
			done: true,
			subtaskRatio: 0.25,
		});
		expect(taskProgress(task('T', { status: '進行中' }), statuses)).toEqual({ done: false, subtaskRatio: null });
	});
});

describe('countProgress', () => {
	it('完了系の件数 ÷ 対象件数。停止系は分母から除く', () => {
		const tasks = [
			task('A', { status: '完了' }),
			task('B', { status: '進行中' }),
			task('C', { status: '保留' }),
			task('D', { status: '中止' }),
			task('E', { status: '完了' }),
		];
		expect(countProgress(tasks, statuses)).toEqual({ done: 2, total: 3, ratio: 2 / 3 });
	});

	it('設定に無いステータスは未完了として分母に入れる', () => {
		expect(countProgress([task('A', { status: '完了' }), task('B', { status: '検討中' })], statuses).ratio).toBe(0.5);
	});

	it('旧名のステータスも分類で数える', () => {
		const renamed = statuses.map((s) => (s.name === '完了' ? { ...s, name: '済み', aliases: ['完了'] } : s));
		expect(countProgress([task('A', { status: '完了' })], renamed).done).toBe(1);
	});

	it('対象が無ければ進捗率は null', () => {
		expect(countProgress([task('A', { status: '保留' })], statuses)).toEqual({ done: 0, total: 0, ratio: null });
	});
});

describe('workload', () => {
	it('見積・予定・実績の合計。見積が無いタスクは0', () => {
		const tasks = [task('A', { estimate: 8 }), task('B')];
		const summary = new WorkSummary([worklog(USER, '2026-11', [['2026-11-02', 'A', 4, 3], ['2026-11-03', 'B', 2, 2]])], tasks);
		expect(workload(tasks, summary)).toEqual({ estimate: 8, planned: 6, actual: 5 });
	});
});
