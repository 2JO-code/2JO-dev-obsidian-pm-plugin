import { gridHoursOf, type GridTaskInfo } from './worklogCells';
import { describe, expect, it } from 'vitest';
import { worklog } from './testData';
import {
	DEFAULT_WORKLOG_VIEW,
	parseWorklogViewOptions,
	worklogAssignedTasks,
	worklogCellWidth,
	worklogColumns,
	worklogViewLines,
	worklogViewMembers,
	worklogViewPairs,
	worklogViewTable,
	worklogViewTasks,
} from './worklogView';

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

describe('worklogAssignedTasks', () => {
	const tasks = [
		{ id: T1, assignees: [U1], done: false },
		{ id: T2, assignees: [U1, U2], done: true },
		{ id: T3, assignees: [], done: false },
	];

	it('メンバーごとに担当タスクをまとめる。完了・停止したものは除く', () => {
		expect(worklogAssignedTasks(tasks, false, (t) => t.done)).toEqual(new Map([[U1, [T1]]]));
	});

	it('完了・停止したものも含めるとき', () => {
		expect(worklogAssignedTasks(tasks, true, (t) => t.done)).toEqual(
			new Map([
				[U1, [T1, T2]],
				[U2, [T2]],
			]),
		);
	});
});

describe('worklogViewPairs', () => {
	const logs = [worklog(U1, '2026-11', [['2026-11-02', T1, 1, 2]]), worklog(U2, '2026-11', [['2026-11-02', T1, 0, 1]])];
	const week = ['2026-11-02', '2026-11-03'];
	const hoursOf = (m: string) => gridHoursOf(logs, m, week);
	const infoOf = (id: string) => (id === T3 ? undefined : { project: 'PJT-a', status: '進行中' });
	const none = { projects: [], statuses: [] };
	const members = [
		{ id: U1, active: true },
		{ id: U2, active: false },
	];
	const assigned = new Map([
		[U1, [T2]],
		[U2, [T3]],
	]);

	it('タスクごとに、記録した人と担当の人をメンバーの順に並べる', () => {
		expect(worklogViewPairs(members, hoursOf, assigned, none, infoOf)).toEqual(
			new Map([
				[T1, [U1, U2]],
				[T2, [U1]],
			]),
		);
	});

	it('退職者には担当タスクを足さない', () => {
		expect(worklogViewPairs(members, hoursOf, assigned, none, infoOf).has(T3)).toBe(false);
	});

	it('絞り込みに合わないタスクは出さない', () => {
		expect([...worklogViewPairs(members, hoursOf, assigned, { ...none, projects: ['PJT-b'] }, infoOf).keys()]).toEqual([]);
	});
});

describe('worklogViewTable', () => {
	const info: Record<string, GridTaskInfo> = {
		[T1]: { project: 'PJT-a', projectLabel: 'A案件', epic: '', epicTitle: '', title: '設計' },
		[T2]: { project: 'PJT-a', projectLabel: 'A案件', epic: '', epicTitle: '', title: '雑務' },
	};
	const lines = worklogViewLines(
		new Map([
			[T1, [U1, U2]],
			[T2, [U1]],
		]),
		(id) => info[id],
		(id) => (id === U1 ? '鈴木' : '佐藤'),
	);
	const hours: Record<string, { planned: string; actual: string }> = {
		[`${T1} ${U1} 2026-11-02`]: { planned: '1', actual: '2' },
		[`${T1} ${U2} 2026-11-03`]: { planned: '', actual: '1.5' },
		[`${T2} ${U1} 2026-11-02`]: { planned: '', actual: '0.5' },
	};
	const estimates: Record<string, number> = { [T1]: 8 };
	const table = (visible = lines) =>
		worklogViewTable({
			lines,
			visible,
			dates: ['2026-11-02', '2026-11-03'],
			columns: ['planned', 'actual'],
			value: (t, m, d, mode) => hours[`${t} ${m} ${d}`]?.[mode] ?? '',
			estimateOf: (id) => estimates[id],
		});
	const projectKey = 'p:PJT-a';
	const memberKey = `${T1}|m:${U2}`;

	it('行の日のマスは配下の合計。0 は空', () => {
		const { cells } = table();
		expect(cells.get(projectKey)).toEqual([
			['1', '2.5'],
			['', '1.5'],
		]);
		expect(cells.get(memberKey)).toEqual([
			['', ''],
			['', '1.5'],
		]);
	});

	it('日の合計・行の合計・全体の合計', () => {
		const { dayTotals, rowTotals, grandTotal, grandHours } = table();
		expect(dayTotals).toEqual([
			['1', '2.5'],
			['', '1.5'],
		]);
		expect(rowTotals.get(T1)).toEqual(['1', '3.5']);
		expect(rowTotals.get(T2)).toEqual(['', '0.5']);
		expect(grandTotal).toEqual(['1', '4']);
		expect(grandHours).toEqual([1, 4]);
	});

	it('たたんだ行は描く行に入れないが、全体の合計には入る', () => {
		const { cells, grandHours } = table(lines.filter((l) => l.kind === 'project'));
		expect([...cells.keys()]).toEqual([projectKey]);
		expect(grandHours).toEqual([1, 4]);
	});

	it('見積はタスクの見積の合計。メンバーの行と見積の無いタスクは空', () => {
		const { estimates: e, grandEstimate } = table();
		expect(e.get(projectKey)).toBe('8');
		expect(e.get(T2)).toBe('');
		expect(e.get(memberKey)).toBe('');
		expect(grandEstimate).toBe('8');
	});

	it('幅は最小の幅か、いちばん長い文字に合わせる', () => {
		const { cellWidth, totalWidth, estimateWidth } = table();
		expect(cellWidth).toBe(8 + 3 * 7);
		expect(totalWidth).toBe(32);
		expect(estimateWidth).toBe(56);
	});
});
