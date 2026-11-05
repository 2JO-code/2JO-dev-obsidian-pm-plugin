import { describe, expect, it } from 'vitest';
import { defaultStatusSets } from '../config/defaults';
import { applyFrontmatter } from '../write/frontmatter';
import { epicFormFromFrontmatter, epicFormToUpdate, type EpicForm } from './epicForm';

const U = (n: number) => `0192f3a0-1234-7abc-8def-${String(n).padStart(12, '0')}`;
const PJT = `PJT-${U(1)}`;
const PJT2 = `PJT-${U(2)}`;
const USER = `USER-${U(3)}`;
const statuses = defaultStatusSets().task;

const form = (overrides: Partial<EpicForm> = {}): EpicForm => ({
	title: '設計',
	project: PJT,
	status: '未着手',
	owner: '',
	wbs: '',
	start: '',
	due: '',
	inputs: '',
	outputs: '',
	...overrides,
});

describe('epicFormFromFrontmatter', () => {
	it('frontmatter からフォームの値を作る（リンクはIDに、数値は文字列に、リストは1行に1つ）', () => {
		expect(
			epicFormFromFrontmatter({
				title: '設計',
				project: `[[${PJT}]]`,
				status: '進行中',
				owner: `[[${USER}|佐藤]]`,
				wbs: 1.1,
				start: '2026-11-04',
				inputs: ['要件定義書', '画面案'],
				outputs: '設計書',
			}),
		).toEqual(form({ status: '進行中', owner: USER, wbs: '1.1', start: '2026-11-04', inputs: '要件定義書\n画面案', outputs: '設計書' }));
	});

	it('文字列でない値は空欄にする', () => {
		expect(epicFormFromFrontmatter({ title: '設計', owner: ['x'] }).owner).toBe('');
	});

	it('読めない担当者は消さずに残す', () => {
		expect(epicFormFromFrontmatter({ title: '設計', owner: '[[佐藤]]' }).owner).toBe('[[佐藤]]');
	});
});

describe('epicFormToUpdate', () => {
	it('入力を frontmatter の変更内容にする。空欄の任意項目は空の枠（null）', () => {
		const { errors, update } = epicFormToUpdate(form({ owner: USER, wbs: ' 1.10 ', start: '2026-11-04' }), statuses);
		expect(errors).toEqual([]);
		expect(update).toEqual({
			type: 'epic',
			title: '設計',
			aliases: ['設計'],
			project: `[[${PJT}]]`,
			status: '未着手',
			owner: `[[${USER}]]`,
			wbs: '1.10',
			start: '2026-11-04',
			due: null,
			inputs: [],
			outputs: [],
		});
	});

	it('インプット・アウトプットは空の行を除いてリストにする', () => {
		const { update } = epicFormToUpdate(form({ inputs: ' 要件定義書 \n\n画面案\n', outputs: '設計書' }), statuses);
		expect(update.inputs).toEqual(['要件定義書', '画面案']);
		expect(update.outputs).toEqual(['設計書']);
	});

	it('書き込むと、キーは決めた順になる', () => {
		const fm: Record<string, unknown> = { outputs: ['図面'], due: '2026-12-01', type: 'epic', project: `[[${PJT}]]`, owner: `[[${USER}]]` };
		applyFrontmatter(fm, 'epic', epicFormToUpdate(form({ owner: USER, start: '2026-11-04', due: '2026-11-30', outputs: '図面' }), statuses).update);
		expect(Object.keys(fm)).toEqual(['type', 'title', 'aliases', 'project', 'status', 'owner', 'wbs', 'start', 'due', 'inputs', 'outputs']);
		expect(fm.wbs).toBeNull();
		expect(fm.outputs).toEqual(['図面']);
		expect(fm.due).toBe('2026-11-30');
	});

	it('タスクなどがあるエピックは、プロジェクトを変えられない', () => {
		expect(epicFormToUpdate(form({ project: PJT2 }), statuses, PJT).errors).toEqual(['タスクかマイルストーンの連動があるエピックは、プロジェクトを変えられません']);
		expect(epicFormToUpdate(form(), statuses, PJT).errors).toEqual([]);
		expect(epicFormToUpdate(form({ project: PJT2 }), statuses).errors).toEqual([]);
	});

	it('担当者を空にしてもキーは残し、値を空にする', () => {
		const fm: Record<string, unknown> = { type: 'epic', owner: `[[${USER}]]` };
		applyFrontmatter(fm, 'epic', epicFormToUpdate(form(), statuses).update);
		expect(fm.owner).toBeNull();
	});

	it('入力の誤りと、保存はできるが知らせることを返す', () => {
		expect(epicFormToUpdate(form({ title: ' ', project: '', status: '謎', due: '2026-02-30' }), statuses).errors).toEqual([
			'タイトルを入力してください',
			'プロジェクトを選んでください',
			'ステータスを選んでください',
			'完了予定日の日付が正しくありません',
		]);
		const late = epicFormToUpdate(form({ start: '2026-11-10', due: '2026-11-01' }), statuses);
		expect(late.errors).toEqual([]);
		expect(late.warnings).toEqual(['完了予定日が開始日より前になっています']);
	});

	it('読めない担当者は元のまま書き、知らせる', () => {
		const { errors, warnings, update } = epicFormToUpdate(form({ owner: '[[佐藤]]' }), statuses);
		expect(errors).toEqual([]);
		expect(update.owner).toBe('[[佐藤]]');
		expect(warnings).toEqual(['担当者の読めない値（[[佐藤]]）はそのまま残しました。直すか、外してください']);
	});
});
