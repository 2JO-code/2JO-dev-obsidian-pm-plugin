import { updateToggleMark } from '../ui/controls';

/** 子の行。row は表の行（`tr`）かガントの行 */
export interface ChildRow {
	row: HTMLElement;
}

/**
 * 開閉で足し引きする子の行（エピックの下のタスクの行）。
 * 全体を描き直さず、その親の子の行だけを入れ替える（設計書 9.7）
 */
export class ChildRows<R extends ChildRow = ChildRow> {
	private readonly rowsOf = new Map<string, R[]>();

	/**
	 * @param hooks.removed 行を消したあとに呼ぶ
	 * @param hooks.added 行を親の後ろに置いたあとに呼ぶ
	 */
	constructor(private readonly hooks: { removed?: (r: R) => void; added?: (r: R) => void } = {}) {}

	/** 描き直しの前に、覚えている行を忘れる */
	clear(): void {
		this.rowsOf.clear();
	}

	/** 最初の描画で作った行を覚えておく */
	set(key: string, rows: R[]): void {
		this.rowsOf.set(key, rows);
	}

	/**
	 * 親の行の ▶／▼ を変え、今の子の行を消す。開いていれば作り直して親の後ろに置く
	 * @param render 子の行を作る（末尾に作り、親の行の後ろへ動かす）
	 */
	replace(key: string, parentRow: HTMLElement, open: boolean, render: () => R[]): void {
		updateToggleMark(parentRow, open);
		for (const r of this.rowsOf.get(key) ?? []) {
			r.row.remove();
			this.hooks.removed?.(r);
		}
		const rows = open ? render() : [];
		parentRow.after(...rows.map((r) => r.row));
		for (const r of rows) this.hooks.added?.(r);
		this.rowsOf.set(key, rows);
	}
}
