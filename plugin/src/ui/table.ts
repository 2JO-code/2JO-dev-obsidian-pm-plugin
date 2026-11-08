/** 表の見出しの1列 */
export interface HeaderCell {
	label: string;
	/** 右寄せ（数値の列） */
	numeric?: boolean;
	/** 何列ぶんか */
	colspan?: number;
	/** セルに付けるクラス */
	cls?: string;
}

/** 表の見出しの行を作る（設計書 9.1）。戻り値は見出しのセル（並べ替えの印などを付けるとき） */
export function tableHeader(table: HTMLElement, columns: readonly (HeaderCell | string)[]): HTMLElement[] {
	const tr = table.createEl('thead').createEl('tr');
	return columns.map((c) => {
		const { label, numeric, colspan, cls } = typeof c === 'string' ? { label: c } : c;
		const th = tr.createEl('th', { text: label });
		if (cls) th.addClass(cls);
		if (numeric) th.addClass('is-numeric');
		if (colspan !== undefined) th.setAttr('colspan', colspan);
		return th;
	});
}
