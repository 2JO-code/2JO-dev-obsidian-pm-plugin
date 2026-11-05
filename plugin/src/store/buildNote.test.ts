import { describe, expect, it } from 'vitest';
import { buildNote } from './buildNote';

const U = '0192f3a0-1234-7abc-8def-0123456789ab';
const id = (prefix: string) => `${prefix}-${U}`;

describe('buildNote', () => {
	it('ノートIDの形式でないファイルは対象外（null）', () => {
		expect(buildNote({ path: 'ようこそ.md', basename: 'ようこそ', frontmatter: {} })).toBeNull();
	});

	it('frontmatter が読めないときはモデルを作らず問題を返す', () => {
		const r = buildNote({ path: 't.md', basename: id('TASK'), frontmatter: undefined });
		expect(r?.note).toBeUndefined();
		expect(r?.problems[0]?.message).toMatch(/frontmatter/);
		// フォームでも開けないので、直す画面は無い
		expect(r?.problems[0]?.fix).toBeUndefined();
	});

	it('タスクを読み、任意項目が空ならキーを持たない', () => {
		const r = buildNote({
			path: 'Tasks/t.md',
			basename: id('TASK'),
			frontmatter: {
				type: 'task',
				title: 'モデリング',
				aliases: ['モデリング'],
				project: `[[${id('PJT')}]]`,
				status: '進行中',
				assignees: [`[[${id('USER')}|山田]]`],
				estimate: 7.5,
				start: '2026-11-04',
				due: null,
			},
			subtasks: { done: 1, total: 3 },
		});
		expect(r?.problems).toEqual([]);
		expect(r?.note).toEqual({
			id: id('TASK'),
			path: 'Tasks/t.md',
			type: 'task',
			title: 'モデリング',
			aliases: ['モデリング'],
			project: id('PJT'),
			status: '進行中',
			assignees: [id('USER')],
			dependsOn: [],
			estimate: 7.5,
			start: '2026-11-04',
			subtasks: { done: 1, total: 3 },
		});
	});

	it('必須項目が欠けたタスクはモデルを作らず、欠けた項目を報告する', () => {
		const r = buildNote({ path: 't.md', basename: id('TASK'), frontmatter: { type: 'task', title: 'A', aliases: ['A'] } });
		expect(r?.note).toBeUndefined();
		expect(r?.problems.map((p) => p.message)).toEqual(['必須のプロパティがありません: project, status']);
	});

	it('必須項目が欠けていても、他の項目の誤りもまとめて報告する（開発用Vaultのサンプルと同じ内容）', () => {
		const r = buildNote({
			path: 't.md',
			basename: id('TASK'),
			frontmatter: { type: 'task', title: 'A', aliases: ['A'], status: '未着手', estimate: 0.3, due: '2026/11/30' },
		});
		expect(r?.note).toBeUndefined();
		expect(r?.problems.map((p) => p.message)).toEqual([
			'必須のプロパティがありません: project',
			'estimate が0以上で0.25刻みの数値ではありません: 0.3',
			'due が YYYY-MM-DD の日付ではありません: 2026/11/30',
		]);
		expect(r?.problems.map((p) => p.fix)).toEqual(['form', 'form', 'form']);
	});

	it('不正な値は報告し、その項目だけ無視する', () => {
		const r = buildNote({
			path: 't.md',
			basename: id('TASK'),
			frontmatter: {
				type: 'task',
				title: 'A',
				aliases: ['A'],
				project: `[[${id('PJT')}]]`,
				status: '未着手',
				estimate: 0.3,
				due: '2026/11/30',
				epic: `[[${id('TASK')}]]`,
			},
		});
		expect(r?.note).toBeDefined();
		expect(r?.note).not.toHaveProperty('estimate');
		expect(r?.problems).toHaveLength(3);
	});

	it('type とファイル名の種類が違えば報告する', () => {
		const r = buildNote({ path: 'u.md', basename: id('USER'), frontmatter: { type: 'task', title: 'A', aliases: ['A'] } });
		expect(r?.problems[0]?.message).toMatch(/ファイル名はメンバー/);
	});

	it('メンバーの数値が無ければ既定値を使い、必須項目の欠落を報告する', () => {
		const r = buildNote({ path: 'u.md', basename: id('USER'), frontmatter: { type: 'user', title: '山田', aliases: ['山田'] } });
		expect(r?.note).toMatchObject({ dailyHours: 8, loadLimitPct: 120, active: true });
		expect(r?.problems[0]?.message).toMatch(/daily_hours, load_limit_pct, active/);
	});

	it('メンバーの本文の個人休日の表を読み、読めない行は行番号つきで報告する', () => {
		const content = ['---', 'type: user', '---', '## 個人休日', '| 日付 | メモ |', '| --- | --- |', '| 2026-11-20 | 有給 |', '| 11/21 |  |'].join('\n');
		const frontmatter = { type: 'user', title: '山田', aliases: ['山田'], daily_hours: 8, load_limit_pct: 120, active: true };
		const r = buildNote({ path: 'u.md', basename: id('USER'), frontmatter, content });
		expect(r?.note).toMatchObject({ holidays: [{ line: 6, date: '2026-11-20', memo: '有給' }] });
		expect(r?.problems).toEqual([{ path: 'u.md', line: 7, message: '個人休日の日付が YYYY-MM-DD ではありません: 11/21', fix: 'holidays' }]);
	});

	it('wbs・case_id が数値で読まれたら文字列に戻して警告する', () => {
		const r = buildNote({
			path: 'p.md',
			basename: id('PJT'),
			frontmatter: { type: 'project', title: 'P', aliases: ['P'], case_id: 123, official_name: 'P', status: '進行中' },
		});
		expect(r?.note).toMatchObject({ caseId: '123' });
		expect(r?.problems[0]?.message).toMatch(/case_id が数値として読まれています.*入力補助フォームで入れ直してください/);
	});

	it('作業ログはファイル名からメンバーと月を決め、本文の表を読む', () => {
		const content = [
			'---',
			'type: worklog',
			'---',
			'## 作業ログ',
			'| 日付 | タスク | 予定(h) | 実績(h) | メモ |',
			'| --- | --- | --- | --- | --- |',
			`| 2026-11-04 | [[${id('TASK')}]] | 4 | 3 |  |`,
			`| 2026-12-01 | [[${id('TASK')}]] | 4 | 3 |  |`,
		].join('\n');
		const r = buildNote({
			path: 'l.md',
			basename: `${id('USER')}_2026-11`,
			frontmatter: { type: 'worklog', member: `[[${id('USER')}]]`, month: '2026-10' },
			content,
		});
		expect(r?.note).toMatchObject({ type: 'worklog', member: id('USER'), month: '2026-11' });
		expect(r?.note?.type === 'worklog' && r.note.entries).toHaveLength(1);
		expect(r?.problems.map((p) => p.line)).toEqual([undefined, 7]);
		// プロパティは直す画面が無く、表は作業ログの表の編集画面
		expect(r?.problems.map((p) => p.fix)).toEqual([undefined, 'worklog']);
	});
});
