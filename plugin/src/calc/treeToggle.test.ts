import { describe, expect, it } from 'vitest';
import { TreeToggle } from './treeToggle';
import { wbsKey } from './wbs';

const PJT = 'PJT-0192f3a0-1234-7abc-8def-000000000001';
const EPIC = 'EPIC-0192f3a0-1234-7abc-8def-000000000002';

describe('TreeToggle', () => {
	it('初期はプロジェクトが開き、エピックは閉じている', () => {
		const tree = new TreeToggle();
		expect(tree.isOpen(wbsKey.project(PJT))).toBe(true);
		expect(tree.isOpen(wbsKey.epic(PJT, EPIC))).toBe(false);
	});

	it('切り替えると開閉が逆になり、そのたびに知らせる', () => {
		let changes = 0;
		const tree = new TreeToggle(() => changes++);
		const key = wbsKey.epic(PJT, EPIC);
		expect(tree.flip(key)).toBe(true);
		expect(tree.isOpen(key)).toBe(true);
		expect(tree.flip(key)).toBe(false);
		expect(changes).toBe(2);
	});

	it('保存した形を読み直すと同じ状態になる', () => {
		const tree = new TreeToggle();
		tree.flip(wbsKey.project(PJT));
		tree.flip(wbsKey.epic(PJT, undefined));
		const copy = new TreeToggle();
		copy.load(tree.saved());
		expect(copy.isOpen(wbsKey.project(PJT))).toBe(false);
		expect(copy.isOpen(wbsKey.epic(PJT, undefined))).toBe(true);
	});

	it('保存されていた値の文字列だけを読む', () => {
		const tree = new TreeToggle();
		tree.load(['a', 1, 'b']);
		expect(tree.saved()).toEqual(['a', 'b']);
	});

	it('すべて開く・閉じる・元に戻すでも知らせる', () => {
		let changes = 0;
		const tree = new TreeToggle(() => changes++);
		tree.flip(wbsKey.epic(PJT, EPIC));
		tree.setAll([], true);
		expect(tree.saved()).toEqual([]);
		tree.flip(wbsKey.epic(PJT, EPIC));
		tree.clear();
		expect(tree.isOpen(wbsKey.epic(PJT, EPIC))).toBe(false);
		expect(changes).toBe(4);
	});
});
