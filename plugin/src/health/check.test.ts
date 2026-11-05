import { describe, expect, it } from 'vitest';
import { defaultStatusSets } from '../config/defaults';
import { buildNote, type NoteSource } from '../store/buildNote';
import { VaultIndex } from '../store/vaultIndex';
import { checkHealth } from './check';

const U = (n: number) => `0192f3a0-1234-7abc-8def-${String(n).padStart(12, '0')}`;
const PJT = `PJT-${U(1)}`;
const PJT2 = `PJT-${U(2)}`;
const EPIC2 = `EPIC-${U(3)}`;
const USER = `USER-${U(4)}`;
const MISSING_USER = `USER-${U(99)}`;
const TASK = `TASK-${U(5)}`;

function indexOf(...sources: NoteSource[]): VaultIndex {
	const index = new VaultIndex();
	for (const src of sources) {
		const r = buildNote(src);
		if (r) index.set(r);
	}
	return index;
}

const project = (id: string, status = '進行中', content = ''): NoteSource => ({
	path: `${id}.md`,
	basename: id,
	frontmatter: { type: 'project', title: 'P', aliases: ['P'], case_id: '1', official_name: 'P', status },
	content,
});
const user: NoteSource = { path: 'u.md', basename: USER, frontmatter: { type: 'user', title: 'U', aliases: ['U'], daily_hours: 8, load_limit_pct: 120, active: true } };
const epicOfProject2: NoteSource = {
	path: 'e.md',
	basename: EPIC2,
	frontmatter: { type: 'epic', title: 'E', aliases: ['E'], project: `[[${PJT2}]]`, status: '進行中' },
};

describe('checkHealth', () => {
	it('問題のない Vault では何も出ない', () => {
		const index = indexOf(project(PJT), user, {
			path: 't.md',
			basename: TASK,
			frontmatter: { type: 'task', title: 'T', aliases: ['T'], project: `[[${PJT}]]`, status: '未着手', assignees: [`[[${USER}]]`] },
		});
		expect(checkHealth(index, defaultStatusSets())).toEqual([]);
	});

	it('存在しないノートへの参照、自分自身への依存、別プロジェクトのエピックを報告する', () => {
		const index = indexOf(project(PJT), project(PJT2), epicOfProject2, {
			path: 't.md',
			basename: TASK,
			frontmatter: {
				type: 'task',
				title: 'T',
				aliases: ['T'],
				project: `[[${PJT}]]`,
				epic: `[[${EPIC2}]]`,
				status: '未着手',
				assignees: [`[[${MISSING_USER}]]`],
				depends_on: [`[[${TASK}]]`],
			},
		});
		const messages = checkHealth(index, defaultStatusSets()).map((p) => p.message);
		expect(messages).toEqual([
			'epic が、タスクの project とは別のプロジェクトのエピックです',
			`assignees のメンバー（${MISSING_USER}）が見つかりません`,
			'depends_on に自分自身が入っています',
		]);
	});

	it('エピックの担当者（owner）が見つからなければ報告する', () => {
		const epic = { ...epicOfProject2, frontmatter: { ...epicOfProject2.frontmatter, owner: `[[${MISSING_USER}]]` } };
		const messages = checkHealth(indexOf(project(PJT2), user, epic), defaultStatusSets()).map((p) => p.message);
		expect(messages).toEqual([`owner のメンバー（${MISSING_USER}）が見つかりません`]);
		const ok = { ...epicOfProject2, frontmatter: { ...epicOfProject2.frontmatter, owner: `[[${USER}]]` } };
		expect(checkHealth(indexOf(project(PJT2), user, ok), defaultStatusSets())).toEqual([]);
	});

	it('depends_on の循環を、循環に入るタスクごとに報告する', () => {
		const TASK2 = `TASK-${U(6)}`;
		const taskOf = (id: string, title: string, dep: string): NoteSource => ({
			path: `${title}.md`,
			basename: id,
			frontmatter: { type: 'task', title, aliases: [title], project: `[[${PJT}]]`, status: '未着手', depends_on: [`[[${dep}]]`] },
		});
		const index = indexOf(project(PJT), taskOf(TASK, 'A', TASK2), taskOf(TASK2, 'B', TASK));
		const problems = checkHealth(index, defaultStatusSets());
		expect(problems.map((p) => p.path).sort()).toEqual(['A.md', 'B.md']);
		expect(problems[0]?.message).toMatch(/^depends_on が循環しています（(A → B → A|B → A → B)）/);
	});

	it('設定に無いステータスを報告し、旧名は問題にしない', () => {
		const statuses = defaultStatusSets();
		const first = statuses.project[0];
		if (first) first.aliases.push('提案前');
		const index = indexOf(project(PJT, '提案前'), project(PJT2, '検討中'));
		const problems = checkHealth(index, statuses);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatchObject({ path: `${PJT2}.md`, message: expect.stringMatching(/「検討中」が設定にありません/) as unknown });
	});

	it('aliases がタイトル1つだけでなければ報告する', () => {
		const differs = indexOf({ ...user, frontmatter: { ...user.frontmatter, aliases: ['旧名'] } });
		expect(checkHealth(differs, defaultStatusSets()).map((p) => p.message)).toEqual([
			expect.stringMatching(/aliases（別名）がタイトルと違います/) as unknown,
		]);
		const extra = indexOf({ ...user, frontmatter: { ...user.frontmatter, aliases: ['U', '旧名'] } });
		expect(checkHealth(extra, defaultStatusSets()).map((p) => p.message)).toEqual([
			expect.stringMatching(/タイトル以外の値があります/) as unknown,
		]);
	});

	it('本文の表の参照は行番号つきで報告する', () => {
		const content = [
			'## マイルストーン',
			'| 名前 | 日付 | 連動エピック |',
			'| --- | --- | --- |',
			`| 中間 | 2026-12-01 | [[${EPIC2}]] |`,
			'## 工数配分',
			'| 月 | メンバー | 配分(h) |',
			'| --- | --- | --- |',
			`| 2026-11 | [[${MISSING_USER}]] | 10 |`,
		].join('\n');
		const index = indexOf(project(PJT, '進行中', content), project(PJT2), epicOfProject2);
		const problems = checkHealth(index, defaultStatusSets());
		expect(problems.map((p) => p.line)).toEqual([3, 7]);
		expect(problems.map((p) => p.fix)).toEqual(['milestones', 'allocations']);
	});

	it('直す画面の印を付ける。プロパティはフォーム、作業ログのプロパティは無し、作業ログの表は表の編集画面', () => {
		const task: NoteSource = {
			path: 't.md',
			basename: TASK,
			frontmatter: { type: 'task', title: 'T', aliases: ['T'], project: `[[${PJT}]]`, status: '検討中', depends_on: [`[[${TASK}]]`] },
		};
		const worklog: NoteSource = {
			path: 'w.md',
			basename: `${MISSING_USER}_2026-11`,
			frontmatter: { type: 'worklog', member: `[[${MISSING_USER}]]`, month: '2026-11' },
			content: `## 作業ログ\n| 日付 | タスク | 予定(h) | 実績(h) | メモ |\n| --- | --- | --- | --- | --- |\n| 2026-11-02 | [[TASK-${U(98)}]] | 1 |  |  |\n`,
		};
		const problems = checkHealth(indexOf(project(PJT), task, worklog), defaultStatusSets());
		expect(problems.map((p) => [p.path, p.fix])).toEqual([
			['t.md', 'form'],
			['t.md', 'form'],
			['w.md', undefined],
			['w.md', 'worklog'],
		]);
	});
});
