import { describe, expect, it } from 'vitest';
import { moveInOrder, nextTaskWbs, nextTaskWbsIn, nextWbs, renumberEpics, renumberTasks, sortByWbs, taskWbsLabel } from './wbsOrder';

describe('taskWbsLabel', () => {
	it('エピックの番号と連番をつなぐ', () => {
		expect(taskWbsLabel('1.2', '3')).toBe('1.2.3');
		expect(taskWbsLabel(undefined, '3')).toBe('3');
		expect(taskWbsLabel('1', undefined)).toBe('');
	});
});

describe('sortByWbs', () => {
	it('番号を数として並べ、番号の無いものは元の順で後ろ', () => {
		const items = [{ id: 'a' }, { id: 'b', wbs: '10' }, { id: 'c', wbs: '2' }, { id: 'd' }];
		expect(sortByWbs(items, (i) => i.wbs).map((i) => i.id)).toEqual(['c', 'b', 'a', 'd']);
	});
});

describe('moveInOrder', () => {
	const ids = ['a', 'b', 'c', 'd'];
	it('前・後ろに置く', () => {
		expect(moveInOrder(ids, 'd', 'b', false)).toEqual(['a', 'd', 'b', 'c']);
		expect(moveInOrder(ids, 'a', 'c', true)).toEqual(['b', 'c', 'a', 'd']);
	});
	it('同じもの・無いものは undefined', () => {
		expect(moveInOrder(ids, 'a', 'a', true)).toBeUndefined();
		expect(moveInOrder(ids, 'x', 'a', true)).toBeUndefined();
	});
});

describe('renumberTasks', () => {
	it('並べた順に 1 から振り、変わるものだけ返す', () => {
		const order = [{ id: 'b', wbs: '2' }, { id: 'a', wbs: '1' }, { id: 'c', wbs: '3' }, { id: 'd' }];
		expect(renumberTasks(order)).toEqual([
			{ id: 'b', wbs: '1' },
			{ id: 'a', wbs: '2' },
			{ id: 'd', wbs: '4' },
		]);
	});
});

describe('nextWbs', () => {
	it('末尾の数を進める', () => {
		expect(nextWbs('1.9')).toBe('1.10');
		expect(nextWbs('3')).toBe('4');
		expect(nextWbs('A')).toBe('A.1');
	});
});

describe('renumberEpics', () => {
	it('今の番号の組を、並べた順に配り直す', () => {
		const order = [{ id: 'c', wbs: '1.3' }, { id: 'a', wbs: '1.1' }, { id: 'b', wbs: '1.2' }];
		expect(renumberEpics(order)).toEqual([
			{ id: 'c', wbs: '1.1' },
			{ id: 'a', wbs: '1.2' },
			{ id: 'b', wbs: '1.3' },
		]);
	});
	it('番号が無い・重なるものには続きの番号を足す', () => {
		const order = [{ id: 'a', wbs: '2' }, { id: 'b' }, { id: 'c', wbs: '2' }];
		expect(renumberEpics(order)).toEqual([
			{ id: 'b', wbs: '3' },
			{ id: 'c', wbs: '4' },
		]);
	});
	it('どれにも番号が無ければ 1 から', () => {
		expect(renumberEpics([{ id: 'a' }, { id: 'b' }])).toEqual([
			{ id: 'a', wbs: '1' },
			{ id: 'b', wbs: '2' },
		]);
	});
});

describe('nextTaskWbs', () => {
	it('最大の連番＋1。数でない番号は数えない', () => {
		expect(nextTaskWbs([{ wbs: '2' }, { wbs: '10' }, { wbs: 'x' }, {}])).toBe('11');
		expect(nextTaskWbs([])).toBe('1');
	});
});

describe('nextTaskWbsIn', () => {
	const tasks = [
		{ id: 'A', project: 'P1', epic: 'E1', wbs: '1' },
		{ id: 'B', project: 'P1', epic: 'E1', wbs: '2' },
		{ id: 'C', project: 'P1', wbs: '5' },
		{ id: 'D', project: 'P2', wbs: '9' },
	];

	it('同じプロジェクト・エピックのタスクだけを数える。エピック無しは空文字でもよい', () => {
		expect(nextTaskWbsIn(tasks, 'P1', 'E1')).toBe('3');
		expect(nextTaskWbsIn(tasks, 'P1', '')).toBe('6');
		expect(nextTaskWbsIn(tasks, 'P1', undefined)).toBe('6');
		expect(nextTaskWbsIn(tasks, 'P2', 'E1')).toBe('1');
	});

	it('番号を付けるタスク自身は数えない', () => {
		expect(nextTaskWbsIn(tasks, 'P1', 'E1', 'B')).toBe('2');
	});
});
