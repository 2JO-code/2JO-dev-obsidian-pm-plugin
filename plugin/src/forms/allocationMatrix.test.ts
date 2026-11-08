import { describe, expect, it } from 'vitest';
import { TABLE_SPEC } from '../parse/bodyTables';
import { applyTableEdits } from '../write/markdownTable';
import {
	addMatrixMember,
	addMatrixMonth,
	allocationExtra,
	allocationMatrix,
	allocationMatrixEdits,
	matrixKey,
	memberAllocations,
	memberCandidates,
	monthRange,
	overAllocated,
	removedAllocationText,
	removeMatrixMember,
	type AllocationMatrix,
} from './allocationMatrix';
import { allocationRows } from './projectTables';

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

const matrixOf = (cells: [string, string][] = []): AllocationMatrix => ({
	months: ['2026-10', '2026-11', '2026-12'],
	members: [USER, USER2],
	cells: new Map(cells),
	others: [],
});

describe('並べる月・メンバー', () => {
	it('期間の月・責任者と、作業ログのある月×メンバー', () => {
		const extra = allocationExtra({ start: '2026-11-10', due: '2027-01-05', manager: USER }, [{ month: '2027-03', member: USER2 }]);
		expect(extra).toEqual({ months: ['2026-11', '2026-12', '2027-01', '2027-03'], members: [USER, USER2] });
	});

	it('期間が片方だけ・プロジェクトが無ければ期間の月は並べない', () => {
		expect(allocationExtra({ start: '2026-11-10' }, [])).toEqual({ months: [], members: [] });
		expect(allocationExtra(null, [])).toEqual({ months: [], members: [] });
	});
});

describe('マス目のメンバー・月を変える', () => {
	it('足せるメンバーは、在籍者のうちマス目にいない人を名前順', () => {
		const USER3 = `USER-${U(5)}`;
		const USER4 = `USER-${U(6)}`;
		const members = [
			{ id: USER, title: '山田', active: true },
			{ id: USER3, title: '鈴木', active: true },
			{ id: USER4, title: '伊藤', active: false },
			{ id: `USER-${U(7)}`, title: '阿部', active: true },
		];
		expect(memberCandidates(members, matrixOf()).map((m) => m.title)).toEqual(['阿部', '鈴木']);
	});

	it('メンバーを足すと、その人の最初の月のマスのキーを返す。いる人・空は足さない', () => {
		const m = matrixOf();
		const USER3 = `USER-${U(5)}`;
		expect(addMatrixMember(m, USER3)).toBe(matrixKey(USER3, '2026-10'));
		expect(m.members).toEqual([USER, USER2, USER3]);
		expect(addMatrixMember(m, USER)).toBeUndefined();
		expect(addMatrixMember(m, '')).toBeUndefined();
		expect(addMatrixMember({ ...matrixOf(), months: [] }, USER3)).toBeNull();
	});

	it('月を足すと月の順に並べ、最初のメンバーのそのマスのキーを返す。ある月・読めない値は足さない', () => {
		const m = matrixOf();
		expect(addMatrixMonth(m, ' 2026-09 ')).toBe(matrixKey(USER, '2026-09'));
		expect(m.months).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
		expect(addMatrixMonth(m, '2026-11')).toBeUndefined();
		expect(addMatrixMonth(m, '')).toBeUndefined();
		expect(addMatrixMonth(m, '2026-13')).toBeUndefined();
		expect(addMatrixMonth({ ...matrixOf(), members: [] }, '2027-01')).toBeNull();
	});

	it('メンバーを消すと、その人のマスも消す', () => {
		const m = matrixOf([
			[matrixKey(USER, '2026-11'), '40'],
			[matrixKey(USER2, '2026-11'), '8'],
		]);
		removeMatrixMember(m, USER);
		expect(m.members).toEqual([USER2]);
		expect([...m.cells.keys()]).toEqual([matrixKey(USER2, '2026-11')]);
		removeMatrixMember(m, USER);
		expect(m.members).toEqual([USER2]);
	});
});

describe('メンバーの配分の一覧', () => {
	const m = matrixOf([
		[matrixKey(USER, '2026-12'), '20'],
		[matrixKey(USER, '2026-10'), ' 40 '],
		[matrixKey(USER, '2026-11'), ''],
		[matrixKey(USER2, '2026-11'), '8'],
	]);

	it('配分の入っている月だけを月の順に返す', () => {
		expect(memberAllocations(m, USER)).toEqual([
			{ month: '2026-10', hours: '40' },
			{ month: '2026-12', hours: '20' },
		]);
	});

	it('消す前の確認の説明', () => {
		expect(removedAllocationText(m, USER)).toBe('消す配分：2026-10 40h、2026-12 20h');
		expect(removedAllocationText(matrixOf(), USER)).toBe('配分の入っているマスはありません');
	});
});

describe('配分の超過', () => {
	it('予定が配分を超えたら配分を返す。空・読めない配分は超過にしない', () => {
		expect(overAllocated('20', 24)).toBe(20);
		expect(overAllocated('0', 1)).toBe(0);
		expect(overAllocated('20', 20)).toBeNull();
		expect(overAllocated('', 24)).toBeNull();
		expect(overAllocated('abc', 24)).toBeNull();
	});
});
