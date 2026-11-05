import { describe, expect, it } from 'vitest';
import { TABLE_SPEC } from '../parse/bodyTables';
import { applyTableEdits, tableSnapshot } from '../write/markdownTable';
import {
	allocationMatrix,
	allocationMatrixEdits,
	allocationRows,
	matrixKey,
	milestoneEdits,
	milestoneRows,
	monthRange,
	type AllocationMatrix,
} from './projectTables';

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

describe('工数配分のマス目', () => {
	const NO_EXTRA: { months: string[]; members: string[] } = { months: [], members: [] };
	const save = (content: string, change: (m: AllocationMatrix) => void, extra = NO_EXTRA) => {
		const { rows, snapshot } = allocationRows(content);
		const matrix = allocationMatrix(rows, extra, title);
		change(matrix);
		const result = allocationMatrixEdits(matrix, rows, title);
		return { ...result, content: applyTableEdits(content, TABLE_SPEC.allocations, 'month', snapshot, result.edits) };
	};

	it('月の範囲', () => {
		expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
		expect(monthRange('2026-11', '2026-10')).toEqual([]);
	});

	it('行をマス目にする。期間の月・ほかのメンバーも並べ、メンバーは名前順', () => {
		const { rows } = allocationRows(NOTE);
		const m = allocationMatrix(rows, { months: ['2027-01'], members: [USER2] }, title);
		expect(m.months).toEqual(['2026-11', '2026-12', '2027-01']);
		expect(m.members).toEqual([USER2, USER]);
		expect(m.cells.get(matrixKey(USER, '2026-12'))).toBe('60');
		expect(m.others).toEqual([]);
	});

	it('変えていなければ1文字も変えない', () => {
		expect(save(NOTE, () => {}, { months: ['2027-01'], members: [USER2] }).content).toBe(NOTE);
	});

	it('変えたマスは行を書き換え、空にしたマスは行を消し、新しいマスは月の順の位置に入れる', () => {
		const { content, errors } = save(
			NOTE,
			(m) => {
				m.cells.set(matrixKey(USER, '2026-11'), '70');
				m.cells.set(matrixKey(USER, '2026-12'), '');
				m.cells.set(matrixKey(USER2, '2026-11'), '40');
				m.cells.set(matrixKey(USER2, '2027-01'), '20');
			},
			{ months: ['2027-01'], members: [USER2] },
		);
		expect(errors).toEqual([]);
		expect(content.split('\n').slice(12, 16)).toEqual([
			`| 2026-11 | [[${USER}\\|山田]] | 70 |`,
			`| 2026-11 | [[${USER2}\\|佐藤]] | 40 |`,
			`| 2027-01 | [[${USER2}\\|佐藤]] | 20 |`,
			'',
		]);
	});

	it('同じ月・メンバーの行は合計を出し、変えたら1行にまとめる', () => {
		const dup = NOTE.replace('| 60 |', '| 60 |\n| 2026-12 | [[' + USER + '\\|山田]] | 20 |');
		const { rows } = allocationRows(dup);
		expect(allocationMatrix(rows, NO_EXTRA, title).cells.get(matrixKey(USER, '2026-12'))).toBe('80');
		expect(save(dup, () => {}).content).toBe(dup);
		const { content, warnings } = save(dup, (m) => m.cells.set(matrixKey(USER, '2026-12'), '90'));
		expect(content.split('\n').slice(12, 15)).toEqual([`| 2026-11 | [[${USER}\\|山田]] | 80 |`, `| 2026-12 | [[${USER}\\|山田]] | 90 |`, '']);
		expect(warnings).toEqual(['工数配分 山田 2026-12：同じ月・メンバーの行を1行にまとめました']);
	});

	it('読めない行はマス目に置かず、消さなければ残す', () => {
		const bad = NOTE.replace('| 60 |', '| 60 |\n| 2026/12 | 田中 | 10 |');
		const { rows } = allocationRows(bad);
		expect(allocationMatrix(rows, NO_EXTRA, title).others).toEqual([{ line: 14, month: '2026/12', member: '田中', hours: '10' }]);
		expect(save(bad, (m) => m.cells.set(matrixKey(USER, '2026-11'), '1')).content).toContain('| 2026/12 | 田中 | 10 |');
		expect(save(bad, (m) => m.others.splice(0)).content).toBe(NOTE);
	});

	it('配分の誤りを返す', () => {
		const { errors } = save(NOTE, (m) => m.cells.set(matrixKey(USER, '2026-11'), '1.3'));
		expect(errors).toEqual(['工数配分 山田 2026-11：配分は0以上で0.25刻みの数値で入力してください（例：80）']);
	});
});
