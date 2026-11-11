import { describe, expect, it } from 'vitest';
import { defaultStatusSets } from '../config/defaults';
import type { Task } from '../model';
import { computeSchedules, findCycles } from './schedule';
import { task } from './testData';
import { taskWarnings } from './warnings';
import { WorkCalendar } from './workdays';
import { WorkSummary } from './worklogSummary';

const statuses = defaultStatusSets().task;
// 土日と 11/3(火) が休日
const calendar = new WorkCalendar({ weekendsOff: true, holidays: [{ date: '2026-11-03', name: '休日' }] });
const BEFORE = '2026-10-01';

const run = (tasks: Task[], today = BEFORE) => computeSchedules(tasks, statuses, calendar, today);
const dates = (tasks: Task[], id: string, today = BEFORE) => {
	const s = run(tasks, today).schedules.get(id);
	return s ? [s.start, s.end] : undefined;
};
const t = (id: string, o: Partial<Task>) => task(id, { status: '進行中', ...o });

describe('WorkCalendar の稼働日の送り戻し', () => {
	it('休日を飛ばして進める・戻す。0 ならそのまま', () => {
		expect(calendar.addWorkdays('2026-11-02', 1)).toBe('2026-11-04');
		expect(calendar.addWorkdays('2026-11-06', 1)).toBe('2026-11-09');
		expect(calendar.addWorkdays('2026-11-04', -1)).toBe('2026-11-02');
		expect(calendar.addWorkdays('2026-11-07', 0)).toBe('2026-11-07');
		expect(calendar.workdayOnOrAfter('2026-11-07')).toBe('2026-11-09');
		expect(calendar.workdayOnOrAfter('2026-11-08', true)).toBe('2026-11-06');
	});
});

describe('computeSchedules', () => {
	it('開始日〜期限日。開始日が休日なら次の稼働日から', () => {
		expect(dates([t('A', { start: '2026-11-02', due: '2026-11-05' })], 'A')).toEqual(['2026-11-02', '2026-11-05']);
		expect(dates([t('A', { start: '2026-11-07', due: '2026-11-09' })], 'A')).toEqual(['2026-11-09', '2026-11-09']);
	});

	it('先行タスクがあっても、自分の開始日で計算する（先行の日程・遅れは使わない）', () => {
		const tasks = [t('A', { start: '2026-11-02', due: '2026-11-10' }), t('B', { dependsOn: ['A'], start: '2026-11-04', due: '2026-11-04' })];
		expect(dates(tasks, 'B')).toEqual(['2026-11-04', '2026-11-04']);
		expect(dates([t('B', { dependsOn: ['A'] })], 'B')).toBeUndefined();
	});

	it('期限日が無いか開始日より前なら、開始日の1日だけ', () => {
		expect(dates([t('A', { start: '2026-11-02' })], 'A')).toEqual(['2026-11-02', '2026-11-02']);
		expect(dates([t('A', { start: '2026-11-10', due: '2026-11-05' })], 'A')).toEqual(['2026-11-10', '2026-11-10']);
	});

	it('開始日が無ければ期限日の1日だけ（開始は休日なら前の稼働日）。日付が何も無ければ日程なし', () => {
		expect(dates([t('A', { due: '2026-11-06' })], 'A')).toEqual(['2026-11-06', '2026-11-06']);
		expect(dates([t('A', { due: '2026-11-08' })], 'A')).toEqual(['2026-11-06', '2026-11-08']);
		expect(dates([t('A', {})], 'A')).toBeUndefined();
	});

	it('循環していても日程は出す。循環は findCycles で見つける', () => {
		const tasks = [
			t('X', { start: '2026-11-02', dependsOn: ['Y'] }),
			t('Y', { start: '2026-11-02', dependsOn: ['X'] }),
			t('S', { start: '2026-11-02', dependsOn: ['S'] }),
		];
		expect([...run(tasks).schedules.keys()]).toEqual(['X', 'Y', 'S']);
		expect(findCycles(tasks).map((c) => [...c].sort())).toEqual([['X', 'Y'], ['S']]);
		expect(findCycles([t('A', { dependsOn: ['B'] }), t('B', {})])).toEqual([]);
	});

	it('遅れ：未着手は今日から、完了系でないものは終了日を今日まで延ばす。完了系は計画どおり', () => {
		const today = '2026-11-10';
		const tasks = [
			t('N', { status: '未着手', start: '2026-11-02', due: '2026-11-20' }),
			t('L', { status: '未着手', start: '2026-11-02', due: '2026-11-06' }),
			t('A', { start: '2026-11-02', due: '2026-11-05' }),
			t('B', { status: '未着手', dependsOn: ['A'], start: '2026-11-05' }),
			t('D', { status: '完了', start: '2026-11-02', due: '2026-11-04' }),
		];
		const result = run(tasks, today);
		// 期限日が今日以降なら、開始日がずれても終了日は期限日のまま
		expect(result.schedules.get('N')).toEqual({ start: '2026-11-10', end: '2026-11-20', startDelayed: true, endDelayed: false });
		expect(result.schedules.get('L')).toEqual({ start: '2026-11-10', end: '2026-11-10', startDelayed: true, endDelayed: true });
		expect(result.schedules.get('A')).toEqual({ start: '2026-11-02', end: '2026-11-10', startDelayed: false, endDelayed: true });
		expect(result.schedules.get('B')).toEqual({ start: '2026-11-10', end: '2026-11-10', startDelayed: true, endDelayed: true });
		expect(result.schedules.get('D')).toEqual({ start: '2026-11-02', end: '2026-11-04', startDelayed: false, endDelayed: false });
	});
});

describe('期限超過見込み', () => {
	const summary = new WorkSummary([], []);
	const kinds = (x: Task, today: string) =>
		taskWarnings(x, statuses, summary, today, run([x], today).schedules.get(x.id)).map((w) => w.kind);

	it('見込み終了日が期限日より後なら出す。期限を過ぎていれば期限超過だけ。完了系・停止系には出さない', () => {
		const late = t('A', { start: '2026-11-09', due: '2026-11-06' });
		expect(kinds(late, BEFORE)).toEqual(['overdueRisk']);
		expect(kinds(late, '2026-11-09')).toEqual(['overdue']);
		expect(kinds({ ...late, status: '完了' }, BEFORE)).toEqual([]);
		expect(kinds({ ...late, status: '保留' }, BEFORE)).toEqual([]);
		expect(kinds({ ...late, due: '2026-11-09' }, BEFORE)).toEqual([]);
	});
});
