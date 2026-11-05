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
	it('開始日を1日目として所要日数の稼働日目が終了日。開始日が休日なら次の稼働日から', () => {
		expect(dates([t('A', { start: '2026-11-02', durationDays: 3 })], 'A')).toEqual(['2026-11-02', '2026-11-05']);
		expect(dates([t('A', { start: '2026-11-07', durationDays: 1 })], 'A')).toEqual(['2026-11-09', '2026-11-09']);
	});

	it('先行の終了日から lag_days 稼働日後に開始。0 なら同じ日', () => {
		const a = t('A', { start: '2026-11-02', durationDays: 3 });
		const b = (lag: number) => [a, t('B', { dependsOn: ['A'], lagDays: lag, durationDays: 1 })];
		expect(dates(b(0), 'B')).toEqual(['2026-11-05', '2026-11-05']);
		expect(dates(b(1), 'B')).toEqual(['2026-11-06', '2026-11-06']);
		expect(dates(b(2), 'B')).toEqual(['2026-11-09', '2026-11-09']);
		expect(dates([...b(0).slice(1), a], 'B')).toEqual(['2026-11-05', '2026-11-05']);
	});

	it('先行が複数なら最も遅い終了日を基準にする', () => {
		const tasks = [
			t('A', { start: '2026-11-02', durationDays: 1 }),
			t('B', { start: '2026-11-02', durationDays: 5 }),
			t('C', { dependsOn: ['A', 'B'], lagDays: 1, durationDays: 2 }),
		];
		expect(dates(tasks, 'C')).toEqual(['2026-11-10', '2026-11-11']);
	});

	it('所要日数が空なら期限日が終了日、期限日も無ければ1日', () => {
		expect(dates([t('A', { start: '2026-11-02', due: '2026-11-10' })], 'A')).toEqual(['2026-11-02', '2026-11-10']);
		expect(dates([t('A', { start: '2026-11-02' })], 'A')).toEqual(['2026-11-02', '2026-11-02']);
	});

	it('開始日も先行も無ければ期限日から逆算。日付が何も無ければ日程なし', () => {
		expect(dates([t('A', { due: '2026-11-06', durationDays: 3 })], 'A')).toEqual(['2026-11-04', '2026-11-06']);
		expect(dates([t('A', { due: '2026-11-06', durationDays: 4 })], 'A')).toEqual(['2026-11-02', '2026-11-06']);
		expect(dates([t('A', { due: '2026-11-06' })], 'A')).toEqual(['2026-11-06', '2026-11-06']);
		expect(dates([t('A', {})], 'A')).toBeUndefined();
	});

	it('循環しているタスクと、それに続くタスクは日程なし', () => {
		const tasks = [
			t('X', { start: '2026-11-02', dependsOn: ['Y'] }),
			t('Y', { start: '2026-11-02', dependsOn: ['X'] }),
			t('Z', { dependsOn: ['X'] }),
			t('S', { start: '2026-11-02', dependsOn: ['S'] }),
			t('OK', { start: '2026-11-02', dependsOn: ['missing'] }),
		];
		const result = run(tasks);
		expect([...result.schedules.keys()]).toEqual(['OK']);
		expect(result.cycles.map((c) => [...c].sort())).toEqual([['X', 'Y'], ['S']]);
		expect(findCycles([t('A', { dependsOn: ['B'] }), t('B', {})])).toEqual([]);
	});

	it('遅れ：未着手は今日から、完了系でないものは終了日を今日まで延ばす。先行の遅れは後続の開始日の遅れになる。完了系は計画どおり', () => {
		const today = '2026-11-10';
		const tasks = [
			t('N', { status: '未着手', start: '2026-11-02', durationDays: 2 }),
			t('A', { start: '2026-11-02', durationDays: 3 }),
			t('B', { status: '未着手', dependsOn: ['A'], durationDays: 1 }),
			t('D', { status: '完了', start: '2026-11-02', durationDays: 2 }),
		];
		const result = run(tasks, today);
		expect(result.schedules.get('N')).toEqual({ start: '2026-11-10', end: '2026-11-11', startDelayed: true, endDelayed: true });
		expect(result.schedules.get('A')).toEqual({ start: '2026-11-02', end: '2026-11-10', startDelayed: false, endDelayed: true });
		expect(result.schedules.get('B')).toEqual({ start: '2026-11-10', end: '2026-11-10', startDelayed: true, endDelayed: true });
		expect(result.schedules.get('D')).toEqual({ start: '2026-11-02', end: '2026-11-04', startDelayed: false, endDelayed: false });
		// 所要日数が無く期限日が終了日のときは、開始日がずれても終了日は期限日のまま
		const due = run([t('U', { status: '未着手', start: '2026-11-02', due: '2026-11-20' })], today).schedules.get('U');
		expect(due).toEqual({ start: '2026-11-10', end: '2026-11-20', startDelayed: true, endDelayed: false });
	});
});

describe('期限超過見込み', () => {
	const summary = new WorkSummary([], []);
	const kinds = (x: Task, today: string) =>
		taskWarnings(x, statuses, summary, today, run([x], today).schedules.get(x.id)).map((w) => w.kind);

	it('計算上の終了日が期限日より後なら出す。期限を過ぎていれば期限超過だけ。完了系・停止系には出さない', () => {
		const late = t('A', { start: '2026-11-09', durationDays: 5, due: '2026-11-12' });
		expect(kinds(late, BEFORE)).toEqual(['overdueRisk']);
		expect(kinds(late, '2026-11-13')).toEqual(['overdue']);
		expect(kinds({ ...late, status: '完了' }, BEFORE)).toEqual([]);
		expect(kinds({ ...late, status: '保留' }, BEFORE)).toEqual([]);
		expect(kinds({ ...late, durationDays: 4 }, BEFORE)).toEqual([]);
	});
});
