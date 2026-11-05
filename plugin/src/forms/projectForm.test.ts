import { describe, expect, it } from 'vitest';
import { defaultStatusSets } from '../config/defaults';
import { applyFrontmatter } from '../write/frontmatter';
import { projectFormFromFrontmatter, projectFormToUpdate, type ProjectForm } from './projectForm';

const U = (n: number) => `0192f3a0-1234-7abc-8def-${String(n).padStart(12, '0')}`;
const USER = `USER-${U(3)}`;
const statuses = defaultStatusSets().project;
const firstStatus = statuses[0]?.name ?? '';

const form = (overrides: Partial<ProjectForm> = {}): ProjectForm => ({
	title: '新製品',
	officialName: '新製品開発案件',
	caseId: 'A-001',
	status: firstStatus,
	start: '',
	due: '',
	manager: '',
	...overrides,
});

describe('projectFormFromFrontmatter', () => {
	it('frontmatter からフォームの値を作る（リンクはIDに、数値は文字列に）', () => {
		expect(
			projectFormFromFrontmatter({
				title: '新製品',
				official_name: '新製品開発案件',
				case_id: 1234,
				status: firstStatus,
				start: '2026-11-04',
				manager: `[[${USER}|佐藤]]`,
			}),
		).toEqual(form({ caseId: '1234', start: '2026-11-04', manager: USER }));
	});

	it('読めない責任者は消さずに残す', () => {
		expect(projectFormFromFrontmatter({ title: '新製品', manager: '[[佐藤]]' }).manager).toBe('[[佐藤]]');
	});
});

describe('projectFormToUpdate', () => {
	it('入力を frontmatter の変更内容にする。空欄の任意項目は空の枠（null）', () => {
		const { errors, update } = projectFormToUpdate(form({ title: ' 新製品2 ', caseId: ' 0012 ', manager: USER, due: '2027-03-31' }), statuses);
		expect(errors).toEqual([]);
		expect(update).toEqual({
			type: 'project',
			title: '新製品2',
			aliases: ['新製品2'],
			case_id: '0012',
			official_name: '新製品開発案件',
			status: firstStatus,
			start: null,
			due: '2027-03-31',
			manager: `[[${USER}]]`,
		});
	});

	it('書き込むと、ほかのキーは残り、キーは決めた順になる', () => {
		const fm: Record<string, unknown> = { manager: `[[${USER}]]`, memo: 'x', type: 'project', due: '2027-01-01' };
		applyFrontmatter(fm, 'project', projectFormToUpdate(form(), statuses).update);
		expect(Object.keys(fm)).toEqual(['type', 'title', 'aliases', 'case_id', 'official_name', 'status', 'start', 'due', 'manager', 'memo']);
		expect(fm.manager).toBeNull();
		expect(fm.due).toBeNull();
		expect(fm.memo).toBe('x');
	});

	it('入力の誤りと、保存はできるが知らせることを返す', () => {
		expect(projectFormToUpdate(form({ title: ' ', officialName: '', caseId: '', status: '謎', due: '2026-02-30' }), statuses).errors).toEqual([
			'簡易プロジェクト名を入力してください',
			'正式案件名を入力してください',
			'案件IDを入力してください',
			'ステータスを選んでください',
			'期限日の日付が正しくありません',
		]);
		const late = projectFormToUpdate(form({ start: '2026-11-10', due: '2026-11-01' }), statuses);
		expect(late.errors).toEqual([]);
		expect(late.warnings).toEqual(['期限日が開始日より前になっています']);
	});

	it('読めない責任者は元のまま書き、知らせる', () => {
		const { warnings, update } = projectFormToUpdate(form({ manager: '[[佐藤]]' }), statuses);
		expect(update.manager).toBe('[[佐藤]]');
		expect(warnings).toEqual(['責任者の読めない値（[[佐藤]]）はそのまま残しました。直すか、外してください']);
	});
});
