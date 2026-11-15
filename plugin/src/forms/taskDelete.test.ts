import { describe, expect, it } from 'vitest';
import { task, worklog } from '../calc/testData';
import { taskDeleteBlockers } from './taskDelete';

const names: Record<string, string> = { 'USER-1': '山田', 'USER-2': '佐藤' };
const title = (id: string) => names[id] ?? '';

describe('taskDeleteBlockers', () => {
	it('記録も参照も無ければ消せる', () => {
		const logs = [worklog('USER-1', '2026-11', [['2026-11-02', 'TASK-2', 1, 1]])];
		expect(taskDeleteBlockers('TASK-1', [task('TASK-1'), task('TASK-2')], logs, title)).toEqual([]);
	});

	it('作業ログに記録があれば、メンバー・月・行数を出す', () => {
		const logs = [
			worklog('USER-2', '2026-11', [['2026-11-02', 'TASK-1', 0, 2]]),
			worklog('USER-1', '2026-11', [
				['2026-11-02', 'TASK-1', 1, 0],
				['2026-11-03', 'TASK-1', 1, 0],
			]),
			worklog('USER-1', '2026-10', [['2026-10-30', 'TASK-1', 1, 0]]),
		];
		expect(taskDeleteBlockers('TASK-1', [task('TASK-1')], logs, title)).toEqual(['作業ログに記録があります：山田 2026-10（1行）、佐藤 2026-11（1行）、山田 2026-11（2行）']);
	});

	it('先行タスクにしているタスクがあれば、そのタイトルを出す（自分自身は除く）', () => {
		const tasks = [task('TASK-1', { dependsOn: ['TASK-1'] }), task('TASK-2', { title: '設計', dependsOn: ['TASK-1'] }), task('TASK-3')];
		expect(taskDeleteBlockers('TASK-1', tasks, [], title)).toEqual(['先行タスクにしているタスクがあります：設計']);
	});
});
