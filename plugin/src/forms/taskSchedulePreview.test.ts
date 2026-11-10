import { describe, expect, it } from 'vitest';
import { task } from '../calc/testData';
import { WorkCalendar } from '../calc/workdays';
import { defaultStatusSets } from '../config/defaults';
import type { Task } from '../model';
import type { TaskForm } from './taskForm';
import { previewTaskSchedule } from './taskSchedulePreview';

const statuses = defaultStatusSets().task;
// 土日と 11/3(火) が休日
const calendar = new WorkCalendar({ weekendsOff: true, holidays: [{ date: '2026-11-03', name: '休日' }] });
const TODAY = '2026-10-01';

const SELF = 'TASK-0192f3a0-1234-7abc-8def-000000000001';
const PRED = 'TASK-0192f3a0-1234-7abc-8def-000000000002';

const form = (o: Partial<TaskForm> = {}): TaskForm => ({
	title: '作業',
	project: 'PJT-1',
	epic: '',
	wbs: '1',
	status: '進行中',
	assignees: [],
	estimate: '',
	dependsOn: [],
	lagDays: '',
	start: '',
	durationDays: '',
	due: '',
	planStart: '',
	planEnd: '',
	...o,
});

const self = task(SELF, { status: '進行中' });
const run = (f: TaskForm, tasks: Task[] = [self]) => previewTaskSchedule(f, self, tasks, statuses, calendar, TODAY);

describe('previewTaskSchedule', () => {
	it('開始日と所要日数から日程を出し、期限内かを添える', () => {
		expect(run(form({ start: '2026-11-02', durationDays: '3', due: '2026-11-20' }))).toEqual({
			kind: 'ok',
			text: '11/2(月)〜11/5(木)。期限内',
		});
	});

	it('期限日を過ぎるときは late にする', () => {
		expect(run(form({ start: '2026-11-02', durationDays: '5', due: '2026-11-05' }))).toEqual({
			kind: 'late',
			text: '11/2(月)〜11/9(月)。期限日 11/5(木) を過ぎます',
		});
	});

	it('当初終了日があれば、見込み終了日との差を添える', () => {
		const f = { start: '2026-11-02', durationDays: '3', planStart: '2026-11-02' };
		expect(run(form({ ...f, planEnd: '2026-11-02' })).plan).toEqual({ delay: 2, text: '当初 11/2(月) より2日遅れ' });
		expect(run(form({ ...f, planEnd: '2026-11-06' })).plan).toEqual({ delay: -1, text: '当初 11/2(月)〜11/6(金) より1日早い' });
		expect(run(form({ ...f, planEnd: '2026-11-05' })).plan).toEqual({ delay: 0, text: '当初 11/2(月)〜11/5(木) のとおり' });
		expect(run(form(f)).plan).toBeUndefined();
	});

	it('先行タスクがあれば、ファイルの値ではなくフォームの相対日数で計算する', () => {
		const pred = task(PRED, { status: '進行中', start: '2026-11-02', durationDays: 2 });
		const withFile = { ...self, lagDays: 5 };
		const result = previewTaskSchedule(form({ dependsOn: [PRED], lagDays: '1', durationDays: '1' }), withFile, [pred, withFile], statuses, calendar, TODAY);
		expect(result.text).toBe('11/5(木)');
	});

	it('開始日も期限日も無ければ、入れると計算すると出す', () => {
		expect(run(form())).toEqual({ kind: 'none', text: '開始日か期限日を入れると計算します' });
	});

	it('先行タスクが循環していれば、計算できないと出す', () => {
		const pred = task(PRED, { status: '進行中', dependsOn: [SELF] });
		expect(run(form({ dependsOn: [PRED] }), [self, pred]).text).toBe('先行タスクが循環しているため計算できません');
	});

	it('読めない数・日付は空欄として扱う', () => {
		expect(run(form({ start: '2026-11-02', durationDays: 'abc' })).text).toBe('11/2(月)');
	});
});
