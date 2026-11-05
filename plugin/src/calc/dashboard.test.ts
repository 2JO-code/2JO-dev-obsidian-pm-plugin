import { describe, expect, it } from 'vitest';
import { defaultCalendar, defaultStatusSets } from '../config/defaults';
import { buildContext } from './context';
import { dashboard } from './dashboard';
import { indexOf, member, PJT, PJT2, project, task, USER, USER2, worklog } from './testData';

const today = '2026-11-04';
const index = indexOf([
	project(PJT, {
		milestones: [
			{ line: 1, name: '過去', date: '2026-11-03' },
			{ line: 2, name: '今日', date: '2026-11-04' },
			{ line: 3, name: '2週間後', date: '2026-11-18' },
			{ line: 4, name: '先すぎる', date: '2026-11-19' },
		],
	}),
	project(PJT2, { milestones: [{ line: 1, name: '別PJ', date: '2026-11-10' }] }),
	member(USER, { title: '佐藤' }),
	member(USER2, { title: '伊藤' }),
	member('USER-3', { title: '上田' }),
	task('T1', { assignees: [USER] }),
	// 佐藤：今週（11/2〜8、稼働5日＝40h）に 44h → 注意。伊藤：今月だけ多い
	worklog(USER, '2026-11', [
		['2026-11-02', 'T1', 22, 0],
		['2026-11-04', 'T1', 22, 0],
	]),
	// 11月は稼働21日＝168h。210h で125%（許容率120%超）
	worklog(USER2, '2026-11', [['2026-11-20', 'T1', 210, 0]]),
	worklog('USER-3', '2026-11', [['2026-11-05', 'T1', 8, 0]]),
]);
const ctx = buildContext(index, defaultStatusSets(), defaultCalendar(), today);
const result = dashboard(ctx, index.projects(), index.members());

describe('dashboard', () => {
	it('プロジェクトごとの状況をまとめる', () => {
		expect(result.projects.map((p) => p.project.id)).toEqual([PJT, PJT2]);
	});

	it('今週か今月に負荷注意・警告のメンバーだけ、名前順', () => {
		expect(result.members.map((m) => [m.member.title, m.week.plannedLevel, m.month.plannedLevel])).toEqual([
			['伊藤', 'normal', 'warning'],
			['佐藤', 'caution', 'normal'],
		]);
	});

	it('マイルストーンは今日〜2週間後、日付順', () => {
		expect(result.milestones.map((m) => m.milestone.name)).toEqual(['今日', '別PJ', '2週間後']);
	});
});
