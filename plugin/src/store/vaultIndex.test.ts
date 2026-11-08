import { describe, expect, it } from 'vitest';
import { buildNote, type NoteRecord, type NoteSource } from './buildNote';
import { VaultIndex } from './vaultIndex';

const U = (n: number) => `0192f3a0-1234-7abc-8def-${String(n).padStart(12, '0')}`;
const PJT = `PJT-${U(1)}`;
const USER = `USER-${U(2)}`;

function record(src: NoteSource): NoteRecord {
	const r = buildNote(src);
	if (!r) throw new Error('not a note');
	return r;
}

const task = (n: number, status: string, path = `Tasks/${n}.md`, archived = false) =>
	record({
		path,
		basename: `TASK-${U(100 + n)}`,
		archived,
		frontmatter: { type: 'task', title: `T${n}`, aliases: [`T${n}`], project: `[[${PJT}]]`, status },
	});

const worklog = record({
	path: 'Members/Logs/l.md',
	basename: `${USER}_2026-11`,
	frontmatter: { type: 'worklog', member: `[[${USER}]]`, month: '2026-11' },
	content: [
		'## 作業ログ',
		'| 日付 | タスク | 予定(h) | 実績(h) |',
		'| --- | --- | --- | --- |',
		`| 2026-11-03 | [[TASK-${U(101)}]] | 4 |  |`,
		`| 2026-11-03 | [[TASK-${U(102)}]] | 0 | 0 |`,
		`| 2026-11-04 | [[TASK-${U(101)}]] | 4 | 4 |`,
	].join('\n'),
});

describe('VaultIndex', () => {
	it('登録・削除・IDでの検索ができる', () => {
		const index = new VaultIndex();
		index.set(task(1, '進行中'));
		expect(index.hasId(`TASK-${U(101)}`)).toBe(true);
		expect(index.get(`TASK-${U(101)}`)).toMatchObject({ title: 'T1' });
		index.delete('Tasks/1.md');
		expect(index.hasId(`TASK-${U(101)}`)).toBe(false);
		expect(index.size).toBe(0);
	});

	it('IDでタイトルとパスを引ける。作業ログはタイトルが空、見つからなければ空・undefined', () => {
		const index = new VaultIndex();
		index.set(task(1, '進行中'));
		index.set(worklog);
		expect(index.title(`TASK-${U(101)}`)).toBe('T1');
		expect(index.pathOf(`TASK-${U(101)}`)).toBe('Tasks/1.md');
		expect(index.title(`${USER}_2026-11`)).toBe('');
		expect(index.pathOf(`${USER}_2026-11`)).toBe('Members/Logs/l.md');
		expect(index.title(`TASK-${U(999)}`)).toBe('');
		expect(index.pathOf(`TASK-${U(999)}`)).toBeUndefined();
	});

	it('同じパスを登録し直すと置き換わる（リネーム・変更時）', () => {
		const index = new VaultIndex();
		index.set(task(1, '進行中'));
		index.set(task(1, '完了'));
		expect(index.tasks().map((t) => t.status)).toEqual(['完了']);
	});

	it('アーカイブ内のノートは既定では一覧に含めない', () => {
		const index = new VaultIndex();
		index.set(task(1, '完了', 'Archive/1.md', true));
		index.set(task(2, '進行中'));
		expect(index.tasks().map((t) => t.title)).toEqual(['T2']);
		expect(index.tasks({ includeArchived: true })).toHaveLength(2);
	});

	it('種類ごとの一覧は、変更が無ければ同じものを返し、変更があれば作り直す', () => {
		const index = new VaultIndex();
		index.set(task(1, '進行中'));
		index.set(worklog);
		const first = index.tasks();
		expect(index.tasks()).toBe(first);
		expect(index.worklogs()).toHaveLength(1);
		index.set(task(2, '未着手'));
		expect(index.tasks().map((t) => t.title)).toEqual(['T1', 'T2']);
		index.delete('Tasks/1.md');
		expect(index.tasks().map((t) => t.title)).toEqual(['T2']);
		index.clear();
		expect(index.tasks()).toEqual([]);
	});

	it('アーカイブ内を含む一覧と含まない一覧を、登録の順のまま分ける', () => {
		const index = new VaultIndex();
		index.set(task(1, '進行中'));
		index.set(task(2, '完了', 'Archive/2.md', true));
		index.set(task(3, '未着手'));
		expect(index.tasks().map((t) => t.title)).toEqual(['T1', 'T3']);
		expect(index.tasks({ includeArchived: true }).map((t) => t.title)).toEqual(['T1', 'T2', 'T3']);
		expect(index.projects()).toEqual([]);
	});

	it('読めないノートもIDの重複確認の対象にする', () => {
		const index = new VaultIndex();
		index.set(record({ path: 'x.md', basename: `TASK-${U(9)}`, frontmatter: undefined }));
		expect(index.hasId(`TASK-${U(9)}`)).toBe(true);
		expect(index.tasks()).toEqual([]);
		expect(index.problems()).toHaveLength(1);
	});

	it('同じIDのファイルが複数あれば問題として報告する', () => {
		const index = new VaultIndex();
		index.set(task(1, '進行中', 'Tasks/a.md'));
		index.set(task(1, '進行中', 'Archive/a.md'));
		expect(index.problems().map((p) => p.path)).toEqual(['Tasks/a.md', 'Archive/a.md']);
	});

	it('ステータスごとのノート数を数える（タスク用はタスクとエピックが対象）', () => {
		const index = new VaultIndex();
		index.set(task(1, '進行中'));
		index.set(task(2, 'レビュー待ち'));
		index.set(task(3, '完了'));
		expect(index.countStatus('task', ['レビュー中', 'レビュー待ち', '進行中'])).toBe(2);
		expect(index.countStatus('project', ['進行中'])).toBe(0);
	});

	it('日付ごとに予定・実績が入っている作業ログの行を数える', () => {
		const index = new VaultIndex();
		index.set(worklog);
		expect(index.countWorklogEntriesOn('2026-11-03')).toBe(1);
		expect(index.countWorklogEntriesOn('2026-11-05')).toBe(0);
	});
});
