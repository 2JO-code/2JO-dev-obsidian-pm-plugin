import { describe, expect, it } from 'vitest';
import { groupsInOrder } from './paneGroups';

describe('groupsInOrder', () => {
	it('最初に出てきた順にまとめる', () => {
		const leaves = [
			{ id: 1, parent: 'L' },
			{ id: 2, parent: 'R' },
			{ id: 3, parent: 'L' },
		];
		expect(groupsInOrder(leaves, (l) => l.parent).map((g) => g.map((l) => l.id))).toEqual([[1, 3], [2]]);
	});

	it('空なら空', () => {
		expect(groupsInOrder([], (x) => x)).toEqual([]);
	});
});
