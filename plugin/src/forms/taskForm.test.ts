import { describe, expect, it } from 'vitest';
import { defaultStatusSets } from '../config/defaults';
import { applyFrontmatter } from '../write/frontmatter';
import { taskFormFromFrontmatter, taskFormToUpdate, type TaskForm } from './taskForm';

const U = (n: number) => `0192f3a0-1234-7abc-8def-${String(n).padStart(12, '0')}`;
const PJT = `PJT-${U(1)}`;
const EPIC = `EPIC-${U(2)}`;
const USER = `USER-${U(3)}`;
const TASK = `TASK-${U(4)}`;
const SELF = `TASK-${U(5)}`;
const statuses = defaultStatusSets().task;

const form = (overrides: Partial<TaskForm> = {}): TaskForm => ({
	title: 'モデリング',
	project: PJT,
	epic: '',
	wbs: '',
	status: '未着手',
	assignees: [],
	estimate: '',
	dependsOn: [],
	lagDays: '',
	start: '',
	durationDays: '',
	due: '',
	planStart: '',
	planEnd: '',
	...overrides,
});

describe('taskFormFromFrontmatter', () => {
	it('frontmatter からフォームの値を作る（リンクはIDに、数値は文字列に）', () => {
		expect(
			taskFormFromFrontmatter({
				title: 'モデリング',
				project: `[[${PJT}]]`,
				epic: `[[${EPIC}|名前]]`,
				wbs: 3,
				status: '進行中',
				assignees: [`[[${USER}]]`],
				estimate: 7.5,
				depends_on: `[[${TASK}]]`,
				start: '2026-11-04',
				plan_start: '2026-11-04',
				plan_end: '2026-11-06',
			}),
		).toEqual(
			form({
				epic: EPIC,
				wbs: '3',
				status: '進行中',
				assignees: [USER],
				estimate: '7.5',
				dependsOn: [TASK],
				start: '2026-11-04',
				planStart: '2026-11-04',
				planEnd: '2026-11-06',
			}),
		);
	});

	it('読めないリンクは消さずに元の文字列のまま残す（種類の違う ID も）', () => {
		const result = taskFormFromFrontmatter({
			title: 'A',
			project: 'プロジェクトA',
			assignees: [`[[${USER}]]`, '[[佐藤]]', null],
			depends_on: [`[[${PJT}]]`],
		});
		expect(result.project).toBe('プロジェクトA');
		expect(result.assignees).toEqual([USER, '[[佐藤]]']);
		expect(result.dependsOn).toEqual([`[[${PJT}]]`]);
	});
});

describe('taskFormToUpdate', () => {
	it('入力を frontmatter の変更内容にする。空欄の任意項目は空の枠（リストは []、ほかは null）', () => {
		const { errors, update } = taskFormToUpdate(
			form({
				epic: EPIC,
				wbs: ' 12 ',
				assignees: [USER, USER],
				estimate: '7.5',
				start: '2026-11-04',
				due: '2026-11-10',
				planStart: '2026-11-04',
				planEnd: '2026-11-09',
			}),
			statuses,
			SELF,
		);
		expect(errors).toEqual([]);
		expect(update).toEqual({
			type: 'task',
			title: 'モデリング',
			aliases: ['モデリング'],
			project: `[[${PJT}]]`,
			epic: `[[${EPIC}]]`,
			wbs: '12',
			status: '未着手',
			assignees: [`[[${USER}]]`],
			estimate: 7.5,
			depends_on: [],
			lag_days: null,
			start: '2026-11-04',
			duration_days: null,
			due: '2026-11-10',
			plan_start: '2026-11-04',
			plan_end: '2026-11-09',
		});
	});

	it('書き込むと、日付は YYYY-MM-DD の文字列のまま、キーは決めた順になる', () => {
		const fm: Record<string, unknown> = { due: '2026-12-01', type: 'task', memo: 'x' };
		applyFrontmatter(fm, 'task', taskFormToUpdate(form({ due: '2026-11-10' }), statuses, SELF).update);
		expect(fm).toEqual({
			type: 'task',
			title: 'モデリング',
			aliases: ['モデリング'],
			project: `[[${PJT}]]`,
			epic: null,
			wbs: null,
			status: '未着手',
			assignees: [],
			estimate: null,
			depends_on: [],
			lag_days: null,
			start: null,
			duration_days: null,
			due: '2026-11-10',
			plan_start: null,
			plan_end: null,
			memo: 'x',
		});
	});

	it('旧名のステータスは現在の名前で書く', () => {
		const renamed = statuses.map((s) => (s.name === 'レビュー待ち' ? { ...s, name: 'レビュー中', aliases: ['レビュー待ち'] } : s));
		expect(taskFormToUpdate(form({ status: 'レビュー待ち' }), renamed, SELF).update.status).toBe('レビュー中');
	});

	it('入力の誤りを返す', () => {
		const { errors } = taskFormToUpdate(
			form({ title: ' ', project: '', status: '謎', wbs: '0', estimate: '0.3', lagDays: '1.5', due: '2026-02-30', dependsOn: [SELF] }),
			statuses,
			SELF,
		);
		expect(errors).toEqual([
			'タイトルを入力してください',
			'プロジェクトを選んでください',
			'ステータスを選んでください',
			'先行タスクに自分自身は選べません',
			'WBS番号は1以上の整数で入力してください',
			'見積工数は0以上で0.25刻みの数値で入力してください',
			'相対日数は0以上の整数で入力してください',
			'期限日の日付が正しくありません',
		]);
	});

	it('予定開始日・予定終了日は両方そろえ、終了日を開始日より前にしない', () => {
		const errorsOf = (o: Partial<TaskForm>) => taskFormToUpdate(form(o), statuses, SELF).errors;
		expect(errorsOf({ planStart: '2026-11-04' })).toEqual(['予定開始日と予定終了日は両方入れてください']);
		expect(errorsOf({ planEnd: '2026-11-04' })).toEqual(['予定開始日と予定終了日は両方入れてください']);
		expect(errorsOf({ planStart: '2026-11-05', planEnd: '2026-11-04' })).toEqual(['予定終了日が予定開始日より前になっています']);
		expect(errorsOf({ planStart: '2026-11-04', planEnd: '2026-11-04' })).toEqual([]);
	});

	it('担当者が2人以上なら誤りにする（同じ人の重なりは1人と数える）', () => {
		const other = `USER-${U(6)}`;
		expect(taskFormToUpdate(form({ assignees: [USER, other] }), statuses, SELF).errors).toContain('担当者は1人だけ選んでください');
		expect(taskFormToUpdate(form({ assignees: [USER, USER] }), statuses, SELF).errors).toEqual([]);
	});

	it('保存はできるが知らせること（期限日が開始日より前、使われない入力）', () => {
		const { errors, warnings } = taskFormToUpdate(
			form({ start: '2026-11-10', due: '2026-11-01', lagDays: '2' }),
			statuses,
			SELF,
		);
		expect(errors).toEqual([]);
		expect(warnings).toEqual(['期限日が開始日より前になっています', '相対日数は先行タスクがあるときだけ使われます']);
	});

	it('読めないリンクは元のまま書き、知らせる（読めるものはリンクにする）', () => {
		const { errors, warnings, update } = taskFormToUpdate(
			form({ assignees: ['[[佐藤]]'], dependsOn: [TASK, `[[${PJT}]]`] }),
			statuses,
			SELF,
		);
		expect(errors).toEqual([]);
		expect(update.assignees).toEqual(['[[佐藤]]']);
		expect(update.depends_on).toEqual([`[[${TASK}]]`, `[[${PJT}]]`]);
		expect(warnings).toEqual([
			'担当者の読めない値（[[佐藤]]）はそのまま残しました。直すか、外してください',
			`先行タスクの読めない値（[[${PJT}]]）はそのまま残しました。直すか、外してください`,
		]);
	});
});
