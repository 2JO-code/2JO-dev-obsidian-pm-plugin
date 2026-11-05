import { describe, expect, it } from 'vitest';
import { defaultCalendar, defaultStatusSets } from '../config/defaults';
import { buildContext } from './context';
import {
	DEFAULT_MEMBER_STATUS,
	displayRange,
	memberStatusTable,
	membersOfProjects,
	parseMemberStatusOptions,
} from './memberStatus';
import { indexOf, member, PJT, PJT2, project, task, USER, USER2, worklog } from './testData';

const index = indexOf([
	project(PJT, { manager: 'USER-M' }),
	project(PJT2, { allocations: [{ line: 0, month: '2026-11', member: 'USER-A', hours: 10 }] }),
	member(USER, { title: '佐藤' }),
	member(USER2, { title: '伊藤', dailyHours: 4 }),
	task('T1', { assignees: [USER] }),
	task('T2', { project: PJT2, assignees: [] }),
	worklog(USER2, '2026-11', [
		['2026-11-02', 'T2', 4, 0],
		['2026-11-03', 'T2', 6, 2],
		['2026-11-07', 'T2', 1, 1],
	]),
]);
const ctx = buildContext(index, defaultStatusSets(), defaultCalendar(), '2026-11-10');

describe('membersOfProjects', () => {
	it('担当者・責任者・配分表のメンバー・作業ログを付けた人', () => {
		expect([...membersOfProjects(ctx, [PJT])].sort()).toEqual([USER, 'USER-M']);
		expect([...membersOfProjects(ctx, [PJT2])].sort()).toEqual([USER2, 'USER-A']);
	});
});

describe('memberStatusTable', () => {
	it('メンバーは名前順、期間ごとに負荷を出す', () => {
		const table = memberStatusTable(ctx, index.members(), { start: '2026-11-02', end: '2026-11-08' }, 'day');
		expect(table.periods).toHaveLength(7);
		expect(table.rows.map((r) => r.member.title)).toEqual(['伊藤', '佐藤']);
		const cells = table.rows[0]?.cells ?? [];
		expect(cells[0]?.plannedRate).toBe(1);
		expect(cells[1]?.plannedLevel).toBe('warning');
		expect(cells[1]?.actualLevel).toBe('normal');
		expect(cells[5]?.holiday).toEqual({ planned: 1, actual: 1 });
	});

	it('週の単位では月曜始まりで区切る', () => {
		const table = memberStatusTable(ctx, index.members(), { start: '2026-11-04', end: '2026-11-10' }, 'week');
		expect(table.periods.map((p) => p.key)).toEqual(['2026-11-02', '2026-11-09']);
		expect(table.rows[0]?.cells[0]?.work).toEqual({ planned: 10, actual: 2 });
	});
});

describe('displayRange', () => {
	it('指定が無ければ前月〜3か月先、逆転していれば入れ替える', () => {
		expect(displayRange(DEFAULT_MEMBER_STATUS, '2026-11-10')).toEqual({ start: '2026-10-01', end: '2027-02-28' });
		expect(displayRange({ ...DEFAULT_MEMBER_STATUS, start: '2026-12-01', end: '2026-11-01' }, '2026-11-10')).toEqual({
			start: '2026-11-01',
			end: '2026-12-01',
		});
	});
});

describe('parseMemberStatusOptions', () => {
	it('不正な値は既定値にする。在籍者のみは既定で有効', () => {
		expect(parseMemberStatusOptions({ unit: 'year', mode: 'actual', start: 'x' })).toEqual({ ...DEFAULT_MEMBER_STATUS, mode: 'actual' });
		expect(parseMemberStatusOptions({ activeOnly: false }).activeOnly).toBe(false);
	});
});
