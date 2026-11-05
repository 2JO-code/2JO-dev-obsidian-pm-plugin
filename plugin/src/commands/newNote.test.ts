import { describe, expect, it } from 'vitest';
import { defaultStatusSets } from '../config/defaults';
import { parseAllocations, parseMilestones, parsePersonalHolidays } from '../parse/bodyTables';
import { DEFAULT_SETTINGS } from '../settings';
import { planNewNote } from './newNote';

const folders = DEFAULT_SETTINGS.folders;
const statuses = defaultStatusSets();
const none = () => false;
const fixedId = (kind: string) => `${kind.toUpperCase()}-ID`;

describe('planNewNote', () => {
	it('プロジェクト：必須項目と初期ステータス、空の表を持つ本文', () => {
		const plan = planNewNote(
			{ kind: 'project', title: ' 新製品CG ', caseId: '0123', officialName: '新製品プロモーションCG制作' },
			statuses,
			folders,
			none,
			fixedId,
		);
		expect(plan.path).toBe('Projects/PROJECT-ID.md');
		expect(plan.frontmatter).toEqual({
			type: 'project',
			title: '新製品CG',
			aliases: ['新製品CG'],
			case_id: '0123',
			official_name: '新製品プロモーションCG制作',
			status: '提案中',
			start: null,
			due: null,
			manager: null,
		});
		// 本文の空の表は、そのまま読み取れる形になっている
		expect(parseMilestones(plan.body)).toMatchObject({ found: true, problems: [] });
		expect(parseAllocations(plan.body)).toMatchObject({ found: true, problems: [] });
	});

	it('タスク：プロジェクトとエピックをリンクで持ち、ステータスはタスク用の先頭', () => {
		const plan = planNewNote(
			{ kind: 'task', title: 'モデリング', project: 'PJT-1', epic: 'EPIC-1', wbs: '3' },
			statuses,
			folders,
			none,
			fixedId,
		);
		expect(plan.path).toBe('Tasks/TASK-ID.md');
		expect(plan.frontmatter).toMatchObject({ project: '[[PJT-1]]', epic: '[[EPIC-1]]', wbs: '3', status: '未着手' });
		expect(plan.body).toBe('');
	});

	it('まだ入力していないプロパティも空の枠として入れる（リストは []、ほかは null）', () => {
		const plan = planNewNote({ kind: 'task', title: 'T', project: 'PJT-1' }, statuses, folders, none, fixedId);
		expect(plan.frontmatter).toEqual({
			type: 'task',
			title: 'T',
			aliases: ['T'],
			project: '[[PJT-1]]',
			status: '未着手',
			epic: null,
			wbs: null,
			assignees: [],
			estimate: null,
			depends_on: [],
			lag_days: null,
			start: null,
			duration_days: null,
			due: null,
		});
	});

	it('エピック：WBS番号は空なら空の枠', () => {
		const plan = planNewNote({ kind: 'epic', title: 'E', project: 'PJT-1', wbs: '' }, statuses, folders, none, fixedId);
		expect(plan.frontmatter).toMatchObject({ wbs: null, owner: null, start: null, due: null, inputs: [], outputs: [] });
		const withWbs = planNewNote({ kind: 'epic', title: 'E', project: 'PJT-1', wbs: '1.10' }, statuses, folders, none, fixedId);
		expect(withWbs.frontmatter.wbs).toBe('1.10');
	});

	it('メンバー：既定値（8h・120%・在籍）と、本文に空の個人休日の表', () => {
		const plan = planNewNote({ kind: 'user', title: '山田 太郎' }, statuses, folders, none, fixedId);
		expect(plan.path).toBe('Members/USER-ID.md');
		expect(plan.frontmatter).toMatchObject({ daily_hours: 8, load_limit_pct: 120, active: true });
		expect(parsePersonalHolidays(plan.body)).toMatchObject({ found: true, problems: [] });
	});

	it('入力の誤りはエラーにする', () => {
		expect(() => planNewNote({ kind: 'user', title: ' ' }, statuses, folders, none)).toThrow('氏名を入力してください');
		expect(() =>
			planNewNote({ kind: 'project', title: 'P', caseId: '', officialName: 'X' }, statuses, folders, none),
		).toThrow('案件IDを入力してください');
		expect(() => planNewNote({ kind: 'task', title: 'T', project: '' }, statuses, folders, none)).toThrow(
			'プロジェクトを選んでください',
		);
	});

	it('既存のIDと重ならないIDを作る', () => {
		const plan = planNewNote({ kind: 'user', title: 'A' }, statuses, folders, none);
		expect(plan.id).toMatch(/^USER-[0-9a-f-]{36}$/);
	});
});
