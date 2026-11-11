import { describe, expect, it } from 'vitest';
import { defaultStatusSets } from '../config/defaults';
import { WorkCalendar } from '../calc/workdays';
import { epic, PJT, PJT2, project, task, USER } from '../calc/testData';
import { parseMilestones } from '../parse/bodyTables';
import { DEFAULT_SETTINGS } from '../settings';
import { copyBody, planProjectCopy, type ProjectCopyInput, type ProjectCopySource } from './projectCopy';

const folders = DEFAULT_SETTINGS.folders;
const statuses = defaultStatusSets();
const calendar = new WorkCalendar({ weekendsOff: true, holidays: [] });
const none = () => false;

/** 種類ごとの連番の ID（PROJECT-1, EPIC-1, …） */
function counterId() {
	const counts = new Map<string, number>();
	return (kind: string) => {
		const n = (counts.get(kind) ?? 0) + 1;
		counts.set(kind, n);
		return `NEW-${kind.toUpperCase()}-${n}`;
	};
}

const input = (dates: ProjectCopyInput['dates']): ProjectCopyInput => ({ title: ' 新案件 ', caseId: '0456', officialName: '新案件の正式名', dates });

function source(overrides: Partial<ProjectCopySource> = {}): ProjectCopySource {
	return {
		project: project(PJT, {
			start: '2026-11-02',
			due: '2026-11-30',
			manager: USER,
			milestones: [{ line: 10, name: '中間レビュー', date: '2026-11-13', epic: 'EPIC-A' }],
			allocations: [{ line: 20, month: '2026-11', member: USER, hours: 80 }],
		}),
		epics: [
			epic('EPIC-A', { title: '設計', wbs: '1', owner: USER, start: '2026-11-02', due: '2026-11-13', inputs: ['要件書'], outputs: ['設計書'] }),
			epic('EPIC-X', { project: PJT2 }),
		],
		tasks: [
			task('TASK-1', { title: '調査', epic: 'EPIC-A', wbs: '1', status: '完了', estimate: 8, start: '2026-11-02', due: '2026-11-03', planStart: '2026-11-02', planEnd: '2026-11-03' }),
			task('TASK-2', { title: '作図', epic: 'EPIC-A', wbs: '2', estimate: 16, dependsOn: ['TASK-1', 'TASK-OUT'], start: '2026-11-06', due: '2026-11-10' }),
			task('TASK-3', { title: 'エピックなし' }),
			task('TASK-OUT', { project: PJT2 }),
		],
		bodies: new Map([['TASK-2', '---\ntitle: 作図\n---\n\n図を描く\n\n- [x] 下書き\n- [ ] 清書\n']]),
		...overrides,
	};
}

describe('planProjectCopy', () => {
	it('元のプロジェクトのエピック・タスクを、プロジェクト → エピック → タスクの順に作る', () => {
		const notes = planProjectCopy(input({ mode: 'clear' }), source(), statuses, folders, calendar, none, counterId());
		expect(notes.map((n) => n.id)).toEqual(['NEW-PROJECT-1', 'NEW-EPIC-1', 'NEW-TASK-1', 'NEW-TASK-2', 'NEW-TASK-3']);
		expect(notes[0]?.frontmatter).toMatchObject({ title: '新案件', case_id: '0456', official_name: '新案件の正式名', status: '提案中', manager: null });
	});

	it('構成・見積工数・インプットとアウトプットを写し、担当者は写さず、ステータスは最初のもの', () => {
		const notes = planProjectCopy(input({ mode: 'clear' }), source(), statuses, folders, calendar, none, counterId());
		expect(notes[1]?.frontmatter).toMatchObject({
			title: '設計',
			project: '[[NEW-PROJECT-1]]',
			wbs: '1',
			owner: null,
			status: '未着手',
			inputs: ['要件書'],
			outputs: ['設計書'],
		});
		expect(notes[2]?.frontmatter).toMatchObject({
			title: '調査',
			project: '[[NEW-PROJECT-1]]',
			epic: '[[NEW-EPIC-1]]',
			wbs: '1',
			status: '未着手',
			assignees: [],
			estimate: 8,
		});
		expect(notes[4]?.frontmatter).toMatchObject({ title: 'エピックなし', epic: null });
	});

	it('先行タスクは新しいタスクにつなぎ直し、元のプロジェクトの外のものは写さない', () => {
		const notes = planProjectCopy(input({ mode: 'clear' }), source(), statuses, folders, calendar, none, counterId());
		expect(notes[3]?.frontmatter.depends_on).toEqual(['[[NEW-TASK-1]]']);
	});

	it('日付を空にするときは、日付をすべて空の枠にし、マイルストーンも写さない', () => {
		const notes = planProjectCopy(input({ mode: 'clear' }), source(), statuses, folders, calendar, none, counterId());
		expect(notes[0]?.frontmatter).toMatchObject({ start: null, due: null });
		expect(notes[2]?.frontmatter).toMatchObject({ start: null, due: null, plan_start: null, plan_end: null });
		expect(parseMilestones(notes[0]?.body ?? '')).toMatchObject({ found: true, rows: [], problems: [] });
	});

	it('日付をずらすときは、元の開始日からの稼働日数を新しい開始日から数える', () => {
		const notes = planProjectCopy(input({ mode: 'shift', start: '2027-01-04' }), source(), statuses, folders, calendar, none, counterId());
		// 元 11/2(月)開始 → 新 1/4(月)開始。11/30(月)は20稼働日後 → 2/1(月)
		expect(notes[0]?.frontmatter).toMatchObject({ start: '2027-01-04', due: '2027-02-01' });
		// 11/6(金)・11/10(火) → 1/8(金)・1/12(火)
		expect(notes[3]?.frontmatter).toMatchObject({ start: '2027-01-08', due: '2027-01-12' });
		expect(notes[2]?.frontmatter).toMatchObject({ plan_start: '2027-01-04', plan_end: '2027-01-05' });
	});

	it('ずらすときはマイルストーンも写し、連動エピックを新しいエピックにする', () => {
		const notes = planProjectCopy(input({ mode: 'shift', start: '2027-01-04' }), source(), statuses, folders, calendar, none, counterId());
		const milestones = parseMilestones(notes[0]?.body ?? '');
		expect(milestones.rows).toMatchObject([{ name: '中間レビュー', date: '2027-01-15' }]);
		expect(notes[0]?.body).toContain('| 中間レビュー | 2027-01-15 | [[NEW-EPIC-1\\|設計]] |');
		expect(notes[0]?.body).toContain('## 工数配分');
		expect(notes[0]?.body).not.toContain('80');
	});

	it('元の開始日が無ければ、元の中で最も早い日付を基準にする', () => {
		const src = source({ project: project(PJT, { due: '2026-11-30' }) });
		const notes = planProjectCopy(input({ mode: 'shift', start: '2027-01-04' }), src, statuses, folders, calendar, none, counterId());
		expect(notes[2]?.frontmatter).toMatchObject({ start: '2027-01-04' });
		expect(notes[0]?.frontmatter.start).toBe('2027-01-04');
	});

	it('基準日より前の日付は、前にずらす', () => {
		const src = source({ tasks: [task('TASK-1', { start: '2026-10-30' })] });
		const notes = planProjectCopy(input({ mode: 'shift', start: '2027-01-04' }), src, statuses, folders, calendar, none, counterId());
		// 10/30(金)は1稼働日前 → 1/1(金)
		expect(notes[2]?.frontmatter.start).toBe('2027-01-01');
	});

	it('ずらすのに開始日が無ければ誤り', () => {
		expect(() => planProjectCopy(input({ mode: 'shift', start: '' }), source(), statuses, folders, calendar, none, counterId())).toThrow('開始日');
	});

	it('一式の中で ID が重ならないよう、作った ID も「ある」として採番する', () => {
		const seen: boolean[] = [];
		planProjectCopy(input({ mode: 'clear' }), source(), statuses, folders, calendar, none, (kind, exists) => {
			seen.push(exists('NEW-PROJECT-1'));
			return `NEW-${kind.toUpperCase()}-1`;
		});
		expect(seen).toEqual([false, true, true, true, true]);
	});

	it('タスクの本文の説明とチェックリストを写す', () => {
		const notes = planProjectCopy(input({ mode: 'clear' }), source(), statuses, folders, calendar, none, counterId());
		expect(notes[3]?.body).toBe('図を描く\n\n- [ ] 下書き\n- [ ] 清書\n');
		expect(notes[2]?.body).toBe('');
	});
});

describe('copyBody', () => {
	it('frontmatter を除き、チェックを外す。入れ子と改行コードも扱う', () => {
		expect(copyBody('---\r\na: 1\r\n---\r\n説明\r\n- [X] 一\r\n  - [x] 二 [x]\r\n')).toBe('説明\n- [ ] 一\n  - [ ] 二 [x]\n');
	});

	it('コードブロックの中は変えない', () => {
		expect(copyBody('```\n- [x] 例\n```\n')).toBe('```\n- [x] 例\n```\n');
	});

	it('本文が無ければ空', () => {
		expect(copyBody(undefined)).toBe('');
		expect(copyBody('---\na: 1\n---\n\n')).toBe('');
	});
});
