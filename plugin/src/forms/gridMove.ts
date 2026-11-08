/** 表計算のようなマス目の移動（設計書 4.7） */

export interface GridPos {
	row: number;
	col: number;
}

export type GridKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Enter';

/** キーで動いた先のマス。端では止まる。Shift+Enter は上へ */
export function gridMove(pos: GridPos, key: GridKey, shift: boolean, size: { rows: number; cols: number }): GridPos {
	const clamp = (v: number, n: number) => Math.min(Math.max(v, 0), n - 1);
	const delta: Record<GridKey, [number, number]> = {
		ArrowUp: [-1, 0],
		ArrowDown: [1, 0],
		ArrowLeft: [0, -1],
		ArrowRight: [0, 1],
		Enter: [shift ? -1 : 1, 0],
	};
	const [dr, dc] = delta[key];
	return { row: clamp(pos.row + dr, size.rows), col: clamp(pos.col + dc, size.cols) };
}

/** 動かすキーか */
export const isGridKey = (key: string): key is GridKey => ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(key);
