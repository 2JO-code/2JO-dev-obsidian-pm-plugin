import { describe, expect, it } from 'vitest';
import { TABLE_SPEC } from '../parse/bodyTables';
import { applyTableEdits, tableSnapshot } from '../write/markdownTable';
import { allocationRows, milestoneEdits, milestoneRows } from './projectTables';

const U = (n: number) => `0192f3a0-1234-7abc-8def-${String(n).padStart(12, '0')}`;
const EPIC = `EPIC-${U(2)}`;
const USER = `USER-${U(3)}`;
const USER2 = `USER-${U(4)}`;
const titles: Record<string, string> = { [EPIC]: 'モデリング', [USER]: '山田', [USER2]: '佐藤' };
const title = (id: string) => titles[id] ?? '';

const NOTE = [
	'---',
	'type: project',
	'---',
	'## マイルストーン',
	'| 名前 | 日付 | 連動エピック |',
	'| --- | --- | --- |',
	`| 中間レビュー | 2026-12-15 | [[${EPIC}]] |`,
	'| 納品 | 2027-02-28 |  |',
	'',
	'## 工数配分',
	'| 月 | メンバー | 配分(h) |',
	'| --- | --- | --- |',
	`| 2026-11 | [[${USER}\\|山田]] | 80 |`,
	`| 2026-12 | [[${USER}\\|山田]] | 60 |`,
	'',
].join('\n');

describe('milestoneRows / allocationRows', () => {
	it('表の行を読む（リンクはIDに）', () => {
		expect(milestoneRows(NOTE).rows).toEqual([
			{ line: 6, name: '中間レビュー', date: '2026-12-15', epic: EPIC },
			{ line: 7, name: '納品', date: '2027-02-28', epic: '' },
		]);
		expect(allocationRows(NOTE).rows[0]).toEqual({ line: 12, month: '2026-11', member: USER, hours: '80' });
	});

	it('列が足りない表は編集できない', () => {
		const result = milestoneRows('## マイルストーン\n| 名前 | 日付 |\n| --- | --- |\n| a | 2026-01-01 |\n');
		expect(result.error).toContain('連動エピック');
	});
});

type Rows = ReturnType<typeof milestoneRows>['rows'];

describe('マイルストーンの書き換え', () => {
	const save = (content: string, change: (rows: Rows) => Rows) => {
		const { rows, snapshot } = milestoneRows(content);
		const result = milestoneEdits(change(rows.map((r) => ({ ...r }))), rows, title);
		return { ...result, content: applyTableEdits(content, TABLE_SPEC.milestones, 'date', snapshot, result.edits) };
	};

	it('変えていなければ1文字も変えない', () => {
		expect(save(NOTE, (r) => r).content).toBe(NOTE);
	});

	it('変えた行だけ書き換え、リンクにタイトルを添える', () => {
		const { content } = save(NOTE, (r) => {
			r[1]!.epic = EPIC;
			return r;
		});
		const lines = content.split('\n');
		expect(lines[6]).toBe(`| 中間レビュー | 2026-12-15 | [[${EPIC}]] |`);
		expect(lines[7]).toBe(`| 納品 | 2027-02-28 | [[${EPIC}\\|モデリング]] |`);
	});

	it('新しい行は日付の順の位置に入れ、消した行は除く', () => {
		const { content } = save(NOTE, (r) => [r[1]!, { name: '要件確定', date: '2026-11-30', epic: '' }, { name: '', date: '', epic: '' }]);
		expect(content.split('\n').slice(6, 9)).toEqual(['| 要件確定 | 2026-11-30 |  |', '| 納品 | 2027-02-28 |  |', '']);
	});

	it('名前の | は \\| にする', () => {
		const { content } = save(NOTE, (r) => [...r, { name: 'A|B', date: '2027-03-01', epic: '' }]);
		expect(content).toContain('| A\\|B | 2027-03-01 |  |');
	});

	it('誤りを返す', () => {
		const { errors } = save(NOTE, (r) => [...r, { name: ' ', date: '2027-02-30', epic: '' }]);
		expect(errors).toEqual(['マイルストーン 3行目：名前を入力してください', 'マイルストーン 3行目：日付を選んでください']);
	});

	it('CRLF を保つ', () => {
		const crlf = NOTE.replace(/\n/g, '\r\n');
		const { content } = save(crlf, (r) => [...r, { name: '検収', date: '2027-03-10', epic: '' }]);
		expect(content.split('\r\n')[8]).toBe('| 検収 | 2027-03-10 |  |');
		expect(content.replace(/\r\n/g, '')).not.toContain('\n');
	});

	it('表が無ければ本文の末尾に作る', () => {
		const content = '---\ntype: project\n---\n';
		const { rows, snapshot } = milestoneRows(content);
		const { edits } = milestoneEdits([...rows, { name: '納品', date: '2027-02-28', epic: '' }], rows, title);
		expect(applyTableEdits(content, TABLE_SPEC.milestones, 'date', snapshot, edits)).toBe(
			'---\ntype: project\n---\n## マイルストーン\n| 名前 | 日付 | 連動エピック |\n| --- | --- | --- |\n| 納品 | 2027-02-28 |  |\n',
		);
	});

	it('開いたあとに表が変わっていたら書き換えない', () => {
		const snapshot = tableSnapshot(NOTE, TABLE_SPEC.milestones);
		const changed = NOTE.replace('納品', '最終納品');
		expect(() => applyTableEdits(changed, TABLE_SPEC.milestones, 'date', snapshot, [])).toThrow('画面を開き直してください');
	});

	it('列の順が違う表や、決めていない列も保つ', () => {
		const content = '## マイルストーン\n| 日付 | 名前 | メモ | 連動エピック |\n| --- | --- | --- | --- |\n| 2026-12-15 | 中間 | 大事 |  |\n';
		const { content: out } = save(content, (r) => {
			r[0]!.name = '中間レビュー';
			return r;
		});
		expect(out.split('\n')[3]).toBe('| 2026-12-15 | 中間レビュー | 大事 |  |');
	});
});
