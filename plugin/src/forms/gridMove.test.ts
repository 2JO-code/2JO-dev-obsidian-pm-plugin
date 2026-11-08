import { describe, expect, it } from 'vitest';
import { gridMove, isGridKey } from './gridMove';

const size = { rows: 3, cols: 4 };

describe('gridMove', () => {
	it('矢印キーで上下左右に動く', () => {
		expect(gridMove({ row: 1, col: 1 }, 'ArrowUp', false, size)).toEqual({ row: 0, col: 1 });
		expect(gridMove({ row: 1, col: 1 }, 'ArrowDown', false, size)).toEqual({ row: 2, col: 1 });
		expect(gridMove({ row: 1, col: 1 }, 'ArrowLeft', false, size)).toEqual({ row: 1, col: 0 });
		expect(gridMove({ row: 1, col: 1 }, 'ArrowRight', false, size)).toEqual({ row: 1, col: 2 });
	});

	it('Enter は下、Shift+Enter は上', () => {
		expect(gridMove({ row: 1, col: 2 }, 'Enter', false, size)).toEqual({ row: 2, col: 2 });
		expect(gridMove({ row: 1, col: 2 }, 'Enter', true, size)).toEqual({ row: 0, col: 2 });
	});

	it('端では止まる', () => {
		expect(gridMove({ row: 0, col: 0 }, 'ArrowUp', false, size)).toEqual({ row: 0, col: 0 });
		expect(gridMove({ row: 0, col: 0 }, 'ArrowLeft', false, size)).toEqual({ row: 0, col: 0 });
		expect(gridMove({ row: 2, col: 3 }, 'Enter', false, size)).toEqual({ row: 2, col: 3 });
		expect(gridMove({ row: 2, col: 3 }, 'ArrowRight', false, size)).toEqual({ row: 2, col: 3 });
	});

	it('動かすキーだけを見分ける', () => {
		expect(isGridKey('Enter')).toBe(true);
		expect(isGridKey('Tab')).toBe(false);
	});
});
