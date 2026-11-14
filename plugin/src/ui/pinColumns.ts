/**
 * 見出しに pinClass の付いた列を、横に流しても左に固定する（設計書 4.3）。
 * 左からの位置は、左にある見出しのマスの幅の合計（列の幅が中身で変わるため）。
 * offsetLeft は固定したマスでは表ではなく画面の枠からの位置になるので使わない。
 * 表の大きさが変わるたびに測り直す。返した ResizeObserver は画面を閉じるときに止める
 */
export function pinColumns(table: HTMLTableElement, pinClass: string): ResizeObserver {
	const pin = () => {
		const head = table.tHead?.rows[0];
		if (!head) return;
		const cells = Array.from(head.cells);
		const pinned = cells.filter((c) => c.hasClass(pinClass));
		const last = pinned[pinned.length - 1];
		// 開くときの拡大・縮小の動きの途中でも、元の大きさで測る
		const rect = table.getBoundingClientRect().width;
		const scale = rect > 0 ? table.offsetWidth / rect : 1;
		const lefts: number[] = [];
		cells.reduce((left, th) => {
			lefts.push(left);
			return left + th.getBoundingClientRect().width * scale;
		}, 0);
		for (const row of Array.from(table.rows)) {
			if (row.cells.length !== cells.length) continue;
			cells.forEach((th, i) => {
				const cell = row.cells[i];
				if (!cell || !th.hasClass(pinClass)) return;
				cell.setCssProps({ '--pm-pin-left': `${lefts[i] ?? 0}px` });
				cell.toggleClass('is-pin-last', th === last);
			});
		}
	};
	const observer = new ResizeObserver(pin);
	observer.observe(table);
	return observer;
}
