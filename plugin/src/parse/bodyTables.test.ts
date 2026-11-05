import { describe, expect, it } from 'vitest';
import { countSubtasks, parseAllocations, parseMilestones, parsePersonalHolidays, parseWorklogEntries } from './bodyTables';
import { isIsoDate, parseHours, parseLinkId } from './values';

const U = '0192f3a0-1234-7abc-8def-0123456789ab';
const TASK = `TASK-${U}`;
const USER = `USER-${U}`;
const EPIC = `EPIC-${U}`;

describe('値の読み取り', () => {
	it('isIsoDate は実在しない日付を受け付けない', () => {
		expect(isIsoDate('2026-02-28')).toBe(true);
		expect(isIsoDate('2026-02-30')).toBe(false);
		expect(isIsoDate('2026/02/01')).toBe(false);
	});

	it('parseHours は0.25刻みの0以上の数値だけ', () => {
		expect(parseHours('3.75')).toBe(3.75);
		expect(parseHours('0')).toBe(0);
		expect(parseHours('0.3')).toBeNull();
		expect(parseHours('-1')).toBeNull();
		expect(parseHours('2h')).toBeNull();
	});

	it('parseLinkId はリンク・別名付きリンク・ID・フォルダ付きリンクからIDを取り出す', () => {
		expect(parseLinkId(`[[${TASK}|名前]]`)).toBe(TASK);
		expect(parseLinkId(`[[${TASK}]]`)).toBe(TASK);
		expect(parseLinkId(`[[Tasks/${TASK}#見出し]]`)).toBe(TASK);
		expect(parseLinkId(TASK)).toBe(TASK);
		expect(parseLinkId('[[ようこそ]]')).toBeNull();
		expect(parseLinkId(`[[${TASK}]]`, 'user')).toBeNull();
	});
});

describe('parseMilestones', () => {
	it('連動エピックは任意。不正な行は問題として報告し、読み飛ばす', () => {
		const text = [
			'## マイルストーン',
			'| 名前 | 日付 | 連動エピック |',
			'| --- | --- | --- |',
			`| 中間レビュー | 2026-12-15 | [[${EPIC}\\|モデリング]] |`,
			'| 納品 | 2027-02-28 |  |',
			'| 日付なし |  |  |',
			'|  |  |  |',
		].join('\n');
		const result = parseMilestones(text);
		expect(result.found).toBe(true);
		expect(result.rows).toEqual([
			{ line: 3, name: '中間レビュー', date: '2026-12-15', epic: EPIC },
			{ line: 4, name: '納品', date: '2027-02-28' },
		]);
		expect(result.problems.map((p) => p.line)).toEqual([5]);
	});

	it('表が無ければ found: false で問題なし', () => {
		expect(parseMilestones('本文のみ')).toEqual({ found: false, rows: [], problems: [] });
	});
});

describe('parsePersonalHolidays', () => {
	it('日付とメモを読む。誤った日付は問題として返し、同じ日付は最初の行だけ', () => {
		const text = ['## 個人休日', '| 日付 | メモ |', '| --- | --- |', '| 2026-11-20 | 有給 |', '| 2026/11/21 |  |', '| 2026-11-20 | 重複 |', '| 2026-12-28 |  |'].join('\n');
		const result = parsePersonalHolidays(text);
		expect(result.rows).toEqual([
			{ line: 3, date: '2026-11-20', memo: '有給' },
			{ line: 6, date: '2026-12-28', memo: '' },
		]);
		expect(result.problems).toEqual([{ line: 4, message: '個人休日の日付が YYYY-MM-DD ではありません: 2026/11/21' }]);
	});

	it('表が無ければ休日なし（問題にしない）', () => {
		expect(parsePersonalHolidays('本文だけ')).toEqual({ found: false, rows: [], problems: [] });
	});
});

describe('parseAllocations', () => {
	it('列の順番が違っても列名で読む', () => {
		const text = [
			'## 工数配分',
			'| メンバー | 配分（h） | 月 |',
			'| --- | --- | --- |',
			`| [[${USER}\\|山田 太郎]] | 80 | 2026-11 |`,
		].join('\n');
		expect(parseAllocations(text).rows).toEqual([{ line: 3, month: '2026-11', member: USER, hours: 80 }]);
	});

	it('必須の列が無ければ行を読まずに報告する', () => {
		const text = '## 工数配分\n| 月 | メンバー |\n| --- | --- |\n| 2026-11 | x |';
		const result = parseAllocations(text);
		expect(result.rows).toEqual([]);
		expect(result.problems).toEqual([{ line: 1, message: '「工数配分」の表に列がありません: 配分(h)' }]);
	});
});

describe('parseWorklogEntries', () => {
	const text = [
		'---',
		'type: worklog',
		'---',
		'## 作業ログ',
		'| 日付 | タスク | 予定(h) | 実績(h) | メモ |',
		'| --- | --- | --- | --- | --- |',
		`| 2026-11-04 | [[${TASK}\\|モデリング]] | 4 | 3.5 |  |`,
		`| 2026-11-05 | [[${TASK}\\|モデリング]] | 4 |  | 作業中 |`,
		`| 2026-12-01 | [[${TASK}]] | 1 | 1 |  |`,
		`| 2026-11-06 | [[${TASK}]] | 0.1 | 1 |  |`,
		`| 2026-11-07 | [[${USER}]] | 1 | 1 |  |`,
	].join('\n');

	it('予定・実績の空欄は 0。メモはそのまま', () => {
		const rows = parseWorklogEntries(text, '2026-11').rows;
		expect(rows).toEqual([
			{ line: 6, date: '2026-11-04', task: TASK, planned: 4, actual: 3.5, memo: '' },
			{ line: 7, date: '2026-11-05', task: TASK, planned: 4, actual: 0, memo: '作業中' },
		]);
	});

	it('対象月の外・0.25刻みでない工数・タスク以外へのリンクは報告して読み飛ばす', () => {
		const problems = parseWorklogEntries(text, '2026-11').problems;
		expect(problems.map((p) => p.line)).toEqual([8, 9, 10]);
		expect(problems[0]?.message).toMatch(/対象月（2026-11）の外/);
	});
});

describe('countSubtasks', () => {
	it('[x] を完了、[ ] を未完了として数え、他の記号・frontmatter・コードブロックは除く', () => {
		const text = [
			'---',
			'title: "- [x] frontmatter"',
			'---',
			'- [ ] 下書き',
			'- [x] 確認',
			'  * [X] 入れ子',
			'1. [ ] 番号付き',
			'- [-] 中止',
			'- [ ]',
			'```',
			'- [x] コード',
			'```',
		].join('\n');
		expect(countSubtasks(text)).toEqual({ done: 2, total: 5 });
	});
});
