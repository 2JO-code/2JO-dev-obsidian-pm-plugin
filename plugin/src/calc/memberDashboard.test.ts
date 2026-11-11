import { describe, expect, it } from 'vitest';
import { defaultCalendar, defaultStatusSets } from '../config/defaults';
import { buildContext } from './context';
import { assignedProjects, memberMonthTasks, monthLoad, parseMemberDashboardOptions, pickMember } from './memberDashboard';
import { indexOf, member, PJT, PJT2, project, task, USER, USER2, worklog } from './testData';

const today = '2026-11-12';
const alloc = (month: string, m: string, hours: number, line = 1) => ({ line, month, member: m, hours });
const index = indexOf([
	project(PJT, { title: 'A案件', allocations: [alloc('2026-11', USER, 40), alloc('2026-11', USER, 20, 2), alloc('2026-12', USER, 80, 3)] }),
	project(PJT2, { title: 'B案件', allocations: [alloc('2026-11', USER, 100), alloc('2026-11', USER2, 50, 2)] }),
	project('PJT-3', { title: 'C案件', allocations: [alloc('2026-10', USER, 10)] }),
	member(USER, { title: '佐藤' }),
	member(USER2, { title: '伊藤' }),
	member('USER-3', { title: '上田', active: false }),
	// 11月にかかる
	task('T-in', { start: '2026-11-20', due: '2026-11-30' }),
	// 10月〜12月をまたぐ
	task('T-span', { start: '2026-10-01', due: '2026-12-31', status: '進行中' }),
	// 10月に完了（11月にかからない）
	task('T-oct', { start: '2026-10-01', due: '2026-10-10', status: '完了' }),
	// 日程は10月だが、11月に作業ログがある
	task('T-log', { start: '2026-10-01', due: '2026-10-05', status: '完了' }),
	// 日程が無い
	task('T-none'),
	// 日程は無いが 11月に作業ログがある
	task('T-none-log'),
	// 別の人の担当
	task('T-other', { start: '2026-11-01', due: '2026-11-30', assignees: [USER2] }),
	// 11月に完了したもの（完了も出す）
	task('T-done', { start: '2026-11-02', due: '2026-11-04', status: '完了' }),
	worklog(USER, '2026-11', [
		['2026-11-02', 'T-log', 2, 1.5],
		['2026-11-03', 'T-log', 1, 1],
		['2026-11-05', 'T-none-log', 4, 0],
	]),
	worklog(USER, '2026-10', [['2026-10-02', 'T-oct', 3, 3]]),
]);
const ctx = buildContext(index, defaultStatusSets(), defaultCalendar(), today);
const sato = ctx.members.get(USER);
if (!sato) throw new Error('テストデータの誤り');
const result = { load: monthLoad(ctx, sato, '2026-11'), projects: assignedProjects(ctx, sato, '2026-11'), ...memberMonthTasks(ctx, sato, '2026-11') };

describe('memberDashboard', () => {
	it('その月に工数配分のある案件を、配分の多い順に出す（同じ案件の行は合算）', () => {
		expect(result.projects.map((p) => [p.project.title, p.allocated])).toEqual([
			['B案件', 100],
			['A案件', 60],
		]);
	});

	it('案件ごとにその月の作業ログの予定・実績を並べる', () => {
		expect(result.projects.find((p) => p.project.id === PJT)?.hours).toEqual({ planned: 7, actual: 2.5 });
	});

	it('別の月を選ぶと、その月の配分の案件だけ', () => {
		expect(assignedProjects(ctx, sato, '2026-12').map((p) => p.project.title)).toEqual(['A案件']);
	});

	it('担当タスクのうち、日程がその月にかかるか作業ログがあるものを、見込み開始の順に出す（完了も含む）', () => {
		expect(result.tasks.map((r) => r.task.id)).toEqual(['T-log', 'T-span', 'T-done', 'T-in', 'T-none-log']);
	});

	it('タスクにはこのメンバーのその月の予定・実績を付ける', () => {
		expect(result.tasks.find((r) => r.task.id === 'T-log')?.monthHours).toEqual({ planned: 3, actual: 2.5 });
		expect(result.tasks.find((r) => r.task.id === 'T-in')?.monthHours).toEqual({ planned: 0, actual: 0 });
	});

	it('日程も作業ログも無い担当タスクは数だけ返す', () => {
		expect(result.undatedTasks).toBe(1);
	});

	it('月の負荷は配分の合計で計算する', () => {
		expect(result.load.allocated).toBe(160);
	});
});

describe('pickMember', () => {
	const members = index.members();
	it('指定があればその人（在籍していなくても）', () => {
		expect(pickMember(members, 'USER-3')?.title).toBe('上田');
	});
	it('指定が無いか見つからなければ在籍者の名前順の先頭', () => {
		expect(pickMember(members, undefined)?.title).toBe('伊藤');
		expect(pickMember(members, 'USER-9')?.title).toBe('伊藤');
	});
});

describe('parseMemberDashboardOptions', () => {
	it('不正な値は捨てる', () => {
		expect(parseMemberDashboardOptions({ member: USER, month: '2026-11' })).toEqual({ member: USER, month: '2026-11' });
		expect(parseMemberDashboardOptions({ member: 3, month: '2026-11-01' })).toEqual({});
		expect(parseMemberDashboardOptions(null)).toEqual({});
	});
});
