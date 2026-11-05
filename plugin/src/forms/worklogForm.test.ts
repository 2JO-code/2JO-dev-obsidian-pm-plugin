import { describe, expect, it } from 'vitest';
import { parseWorklogEntries } from '../parse/bodyTables';
import { defaultWorklogMember, formatWorklogRow, monthOf, upsertWorklogRow, validateWorklogInput, type WorklogEntryValue } from './worklogForm';

const U = (n: number) => `0192f3a0-1234-7abc-8def-${String(n).padStart(12, '0')}`;
const T1 = `TASK-${U(1)}`;
const T2 = `TASK-${U(2)}`;

const entry = (overrides: Partial<WorklogEntryValue> = {}): WorklogEntryValue => ({
	date: '2026-11-05',
	task: T1,
	taskTitle: 'モデリング',
	planned: 4,
	actual: null,
	memo: '',
	...overrides,
});

const log = [
	'---',
	'type: worklog',
	'---',
	'## 作業ログ',
	'| 日付         | タスク | 予定(h) | 実績(h) | メモ |',
	'| ---------- | --- | --- | --- | --- |',
	`| 2026-11-04 | [[${T1}\\|モデリング]] | 6     | 5.5   |      |`,
	`| 2026-11-06 | [[${T2}\\|背景]]     | 2     |       |      |`,
	'',
	'メモ欄',
].join('\n');

describe('validateWorklogInput', () => {
	const ok = { member: 'USER-1', date: '2026-11-05', task: T1, planned: '4', actual: '', memo: '' };
	it('正しい入力なら誤りなし', () => {
		expect(validateWorklogInput(ok)).toEqual([]);
	});
	it('予定・実績の両方が空、0.25刻みでない値は誤り', () => {
		expect(validateWorklogInput({ ...ok, planned: '' })).toEqual(['予定か実績のどちらかを入力してください']);
		expect(validateWorklogInput({ ...ok, actual: '0.3' })[0]).toMatch(/実績は0以上で0.25刻み/);
	});
	it('メンバー・日付・タスクが無ければ誤り', () => {
		expect(validateWorklogInput({ ...ok, member: '', date: '', task: '' })).toHaveLength(3);
	});
});

describe('defaultWorklogMember', () => {
	const [A, B, C] = ['USER-a', 'USER-b', 'USER-c'];
	it('前回の人が担当者ならその人', () => {
		expect(defaultWorklogMember(B, [A, B], [A, B, C])).toBe(B);
	});
	it('前回の人が担当外で、担当者が1人ならその人', () => {
		expect(defaultWorklogMember(C, [A], [A, B, C])).toBe(A);
		expect(defaultWorklogMember('', [A], [A])).toBe(A);
	});
	it('担当者が複数・いない・在籍していなければ前回の人', () => {
		expect(defaultWorklogMember(C, [A, B], [A, B, C])).toBe(C);
		expect(defaultWorklogMember(C, [], [A, B, C])).toBe(C);
		expect(defaultWorklogMember(C, [A], [B, C])).toBe(C);
	});
});

describe('monthOf', () => {
	it('日付から対象月を決める', () => {
		expect(monthOf('2026-11-05')).toBe('2026-11');
	});
});

describe('formatWorklogRow', () => {
	it('リンクにタイトルを添え、空の値は空欄。メモの | と改行は表を壊さないようにする', () => {
		expect(formatWorklogRow(entry({ memo: 'A|B\nC' }))).toBe(`| 2026-11-05 | [[${T1}\\|モデリング]] | 4 |  | A\\|B C |`);
	});
});

describe('upsertWorklogRow', () => {
	it('日付順の位置に1行追加し、他の行は変えない', () => {
		const { content, updated } = upsertWorklogRow(log, entry());
		expect(updated).toBe(false);
		const lines = content.split('\n');
		expect(lines[7]).toBe(formatWorklogRow(entry()));
		expect(lines.filter((l, i) => i !== 7)).toEqual(log.split('\n'));
		expect(parseWorklogEntries(content, '2026-11').rows.map((r) => r.date)).toEqual(['2026-11-04', '2026-11-05', '2026-11-06']);
	});

	it('一番古い日付は先頭の行の前、一番新しい日付は最後の行の後に入れる', () => {
		expect(upsertWorklogRow(log, entry({ date: '2026-11-01' })).content.split('\n')[6]).toMatch(/2026-11-01/);
		expect(upsertWorklogRow(log, entry({ date: '2026-11-30' })).content.split('\n')[8]).toMatch(/2026-11-30/);
	});

	it('同じ日付・同じタスクの行があれば書き換える', () => {
		const { content, updated } = upsertWorklogRow(log, entry({ date: '2026-11-04', planned: 6, actual: 6 }));
		expect(updated).toBe(true);
		expect(content.split('\n')).toHaveLength(log.split('\n').length);
		expect(parseWorklogEntries(content, '2026-11').rows[0]).toMatchObject({ planned: 6, actual: 6 });
	});

	it('表が無ければ本文の末尾に表を作る', () => {
		const { content } = upsertWorklogRow('---\ntype: worklog\n---\n', entry());
		expect(content).toBe(
			`---\ntype: worklog\n---\n## 作業ログ\n| 日付 | タスク | 予定(h) | 実績(h) | メモ |\n| --- | --- | --- | --- | --- |\n${formatWorklogRow(entry())}\n`,
		);
		expect(parseWorklogEntries(content, '2026-11').rows).toHaveLength(1);
	});

	it('行の無い表では区切り行の直後に追加する', () => {
		const empty = '## 作業ログ\n| 日付 | タスク | 予定(h) | 実績(h) | メモ |\n| --- | --- | --- | --- | --- |\n';
		const { content } = upsertWorklogRow(empty, entry());
		expect(content.split('\n')[3]).toBe(formatWorklogRow(entry()));
	});

	it('改行コードが CRLF のファイルでも CRLF のまま追加する', () => {
		const crlf = log.replace(/\n/g, '\r\n');
		const { content } = upsertWorklogRow(crlf, entry());
		expect(content.split('\r\n')[7]).toBe(formatWorklogRow(entry()));
	});
});
