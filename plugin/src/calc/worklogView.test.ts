import { gridHoursOf, type GridTaskInfo } from './worklogCells';
import { describe, expect, it } from 'vitest';
import { worklog } from './testData';
import { DEFAULT_WORKLOG_VIEW, parseWorklogViewOptions, worklogCellWidth, worklogColumns, worklogViewLines, worklogViewMembers, worklogViewTasks } from './worklogView';

const U1 = 'USER-0192f3a0-1234-7abc-8def-000000000001';
const U2 = 'USER-0192f3a0-1234-7abc-8def-000000000002';
const U3 = 'USER-0192f3a0-1234-7abc-8def-000000000003';
const T1 = 'TASK-0192f3a0-1234-7abc-8def-000000000011';
const T2 = 'TASK-0192f3a0-1234-7abc-8def-000000000012';
const T3 = 'TASK-0192f3a0-1234-7abc-8def-000000000013';

describe('parseWorklogViewOptions', () => {
	it('保存された値を読む', () => {
		expect(parseWorklogViewOptions({ unit: 'month', mode: 'planned', showAssigned: true, showFinished: true, collapsed: ['m:a', 1] })).toEqual({
			unit: 'month',
			mode: 'planned',
			showAssigned: true,
			showFinished: true,
			collapsed: ['m:a'],
		});
	});

	it('読めない値は既定値にする', () => {
		expect(parseWorklogViewOptions('x')).toEqual(DEFAULT_WORKLOG_VIEW);
		expect(parseWorklogViewOptions({ unit: 'day', mode: 'x', collapsed: 'a' })).toEqual(DEFAULT_WORKLOG_VIEW);
	});
});

describe('worklogColumns', () => {
	it('両方なら予定・実績の2列、ほかはその1列', () => {
		expect(worklogColumns('both')).toEqual(['planned', 'actual']);
		expect(worklogColumns('actual')).toEqual(['actual']);
	});
});

describe('worklogCellWidth', () => {
	it('文字が無い・短いときは最小の幅', () => {
		expect(worklogCellWidth([])).toBe(28);
		expect(worklogCellWidth(['1'])).toBe(28);
	});

	it('いちばん長い文字に合わせて広げる', () => {
		expect(worklogCellWidth(['1', '10.25', '7.5'])).toBe(8 + 5 * 7);
	});
});

describe('worklogViewMembers', () => {
	const members = [
		{ id: U1, title: '鈴木', active: true },
		{ id: U2, title: '佐藤', active: false },
		{ id: U3, title: '田中', active: false },
	];

	it('絞り込みが無ければ在籍者と、記録のある退職者を名前順に出す', () => {
		expect(worklogViewMembers(members, [], (id) => id === U2).map((m) => m.id)).toEqual([U2, U1]);
	});

	it('絞り込みがあれば、その人だけ（退職者も）', () => {
		expect(worklogViewMembers(members, [U3], () => false).map((m) => m.id)).toEqual([U3]);
	});
});

describe('worklogViewTasks', () => {
	const logs = [
		worklog(U1, '2026-11', [
			['2026-11-02', T1, 1, 2],
			['2026-11-20', T2, 0, 1],
		]),
		worklog(U2, '2026-11', [['2026-11-02', T3, 0, 1]]),
	];
	const infos: Record<string, { project: string; status: string }> = {
		[T1]: { project: 'PJT-a', status: '進行中' },
		[T2]: { project: 'PJT-a', status: '未着手' },
		[T3]: { project: 'PJT-b', status: '完了' },
	};
	const infoOf = (id: string) => infos[id];
	const none = { projects: [], statuses: [] };
	const week = ['2026-11-02', '2026-11-03'];

	it('期間に記録のあるタスクと、担当のタスクを出す（重ねない）', () => {
		expect(worklogViewTasks(gridHoursOf(logs, U1, week), [T1, T3], none, infoOf)).toEqual([T1, T3]);
	});

	it('期間の外の記録は出さない', () => {
		expect(worklogViewTasks(gridHoursOf(logs, U1, week), [], none, infoOf)).toEqual([T1]);
	});

	it('プロジェクトで絞る。見つからないタスクは出さない', () => {
		expect(worklogViewTasks(gridHoursOf(logs, U1, week), [T3, 'TASK-missing'], { ...none, projects: ['PJT-b'] }, infoOf)).toEqual([T3]);
	});

	it('ステータスで絞る。見つからないタスクは出さない', () => {
		expect(worklogViewTasks(gridHoursOf(logs, U1, week), [T2, T3, 'TASK-missing'], { ...none, statuses: ['未着手', '完了'] }, infoOf)).toEqual([T2, T3]);
	});

	it('プロジェクトとステータスの両方に合うものだけ', () => {
		expect(worklogViewTasks(gridHoursOf(logs, U1, week), [T2, T3], { projects: ['PJT-a'], statuses: ['進行中', '完了'] }, infoOf)).toEqual([T1]);
	});
});

describe('worklogViewLines', () => {
	const info: Record<string, GridTaskInfo> = {
		[T1]: { project: 'PJT-a', projectLabel: 'A案件', epic: 'EPIC-1', epicTitle: '準備', epicWbs: '1', title: '設計', wbs: '1' },
		[T2]: { project: 'PJT-a', projectLabel: 'A案件', epic: '', epicTitle: '', title: '雑務' },
	};
	const names: Record<string, string> = { [U1]: '鈴木', [U2]: '佐藤' };
	const lines = worklogViewLines(
		new Map([
			[T2, [U1]],
			[T1, [U1, U2]],
		]),
		(id) => info[id],
		(id) => names[id] ?? id,
	);

	it('プロジェクト → エピック → タスクの順。記録した人が2人以上のタスクだけ、下に人の行を名前順に置く', () => {
		expect(lines.map((l) => `${'  '.repeat(l.depth)}${l.wbs ? `${l.wbs} ` : ''}${l.label}`)).toEqual([
			'A案件',
			'  1 準備',
			'    1.1 設計',
			'      佐藤',
			'      鈴木',
			'  （エピックなし）',
			'    雑務',
		]);
	});

	it('記録した人が1人のタスクの行は、その人の行になる', () => {
		expect(lines.find((l) => l.key === T2)).toMatchObject({ kind: 'task', member: U1, pairs: [[T2, U1]] });
		expect(lines.find((l) => l.key === T1)?.member).toBe('');
	});

	it('メンバーの行は、タスクの行の下でたためる', () => {
		const member = lines.find((l) => l.kind === 'member' && l.member === U2);
		expect(member?.parents).toEqual(['p:PJT-a', 'e:PJT-a:EPIC-1', T1]);
		expect(member?.pairs).toEqual([[T1, U2]]);
	});

	it('プロジェクト・タスクの行は、配下のタスクとメンバーの組をまとめる', () => {
		expect(lines.find((l) => l.key === 'p:PJT-a')?.pairs).toHaveLength(3);
		expect(lines.find((l) => l.key === 'p:PJT-a')?.pairs).toContainEqual([T2, U1]);
		expect(lines.find((l) => l.key === T1)?.pairs).toEqual([
			[T1, U2],
			[T1, U1],
		]);
	});
});
