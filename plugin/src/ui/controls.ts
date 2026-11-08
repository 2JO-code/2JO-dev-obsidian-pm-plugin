/** ビューと入力画面で使う小さな部品 */

/**
 * 開閉の印（▶／▼）。開け閉めはこの印を押したときだけ（行のほかの場所では開閉しない。設計書 9.1）。
 * 子が無ければ印を出さない（幅だけ取る）
 */
export function toggleMark(parent: HTMLElement, open: boolean, hasChildren: boolean, onToggle: () => void): HTMLElement {
	const mark = parent.createSpan({ cls: 'pm-toggle', text: hasChildren ? (open ? '▼' : '▶') : '' });
	if (!hasChildren) return mark;
	mark.addClass('is-button');
	mark.setAttr('aria-label', open ? 'たたむ' : '開く');
	mark.addEventListener('click', (evt) => {
		evt.stopPropagation();
		onToggle();
	});
	return mark;
}

/** 行の中の開閉の印（▶／▼）を書き換える（行を作り直さずに開閉するとき。設計書 9.7） */
export function updateToggleMark(row: HTMLElement, open: boolean): void {
	const mark = row.querySelector<HTMLElement>('.pm-toggle');
	mark?.setText(open ? '▼' : '▶');
	mark?.setAttr('aria-label', open ? 'たたむ' : '開く');
}

/** ラベルつきのチェックボックス（絞り込みの欄と同じ見た目） */
export function checkbox(parent: HTMLElement, label: string, checked: boolean, onChange: (v: boolean) => void): void {
	const field = parent.createEl('label', { cls: 'pm-filter-field pm-filter-check' });
	const input = field.createEl('input', { type: 'checkbox' });
	input.checked = checked;
	input.addEventListener('change', () => onChange(input.checked));
	field.appendText(label);
}
