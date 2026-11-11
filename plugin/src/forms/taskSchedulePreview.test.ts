import { describe, expect, it } from 'vitest';
import { task } from '../calc/testData';
import { WorkCalendar } from '../calc/workdays';
import { defaultStatusSets } from '../config/defaults';
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
	start: '',
	due: '',
	planStart: '',
	planEnd: '',
	...o,
});

const self = task(SELF, { status: '進行中' });
const run = (f: TaskForm) => previewTaskSchedule(f, self, statuses, calendar, TODAY);

describe('previewTaskSchedule', () => {
	it('開始日〜期限日を出し、期限内かを添える', () => {
		expect(run(form({ start: '2026-11-02', due: '2026-11-20' }))).toEqual({
			kind: 'ok',
			text: '11/2(月)〜11/20(金)。期限内',
		});
	});

	it('期限日を過ぎるときは late にする', () => {
		expect(run(form({ start: '2026-11-09', due: '2026-11-05' }))).toEqual({
			kind: 'late',
			text: '11/9(月)。期限日 11/5(木) を過ぎます',
		});
	});

	it('当初終了日があれば、見込み終了日との差を添える', () => {
		const f = { start: '2026-11-02', due: '2026-11-05', planStart: '2026-11-02' };
		expect(run(form({ ...f, planEnd: '2026-11-02' })).plan).toEqual({ delay: 2, text: '当初 11/2(月) より2日遅れ' });
		expect(run(form({ ...f, planEnd: '2026-11-06' })).plan).toEqual({ delay: -1, text: '当初 11/2(月)〜11/6(金) より1日早い' });
		expect(run(form({ ...f, planEnd: '2026-11-05' })).plan).toEqual({ delay: 0, text: '当初 11/2(月)〜11/5(木) のとおり' });
		expect(run(form(f)).plan).toBeUndefined();
	});

	it('先行タスクがあっても、フォームの開始日で計算する', () => {
		expect(run(form({ dependsOn: [PRED], start: '2026-11-04' })).text).toBe('11/4(水)');
	});

	it('開始日も期限日も無ければ、入れると計算すると出す', () => {
		expect(run(form())).toEqual({ kind: 'none', text: '開始日か期限日を入れると計算します' });
	});

	it('読めない日付は空欄として扱う', () => {
		expect(run(form({ start: '2026-11-02', due: 'abc' })).text).toBe('11/2(月)');
	});
});
