import type { TaskProgress } from '../calc/progress';
import type { SubtaskCount } from '../model';
import { subtaskText } from './format';

/** シェルの操作の欄（右寄せ）に並べるボタン（要件4.2、設計書 9.1）。tooltip はマウスを乗せたときの説明 */
export function actionButtons(actions: HTMLElement, buttons: { text: string; onClick: () => void; tooltip?: string }[]): void {
	for (const { text, onClick, tooltip } of buttons) {
		const button = actions.createEl('button', { text });
		if (tooltip) button.setAttr('aria-label', tooltip);
		button.addEventListener('click', onClick);
	}
}

/** セルをリンクにする（行のクリックとは別に動く） */
export function cellLink(cell: HTMLElement, onClick: () => void): void {
	cell.addClass('pm-link');
	cell.addEventListener('click', (evt) => {
		evt.stopPropagation();
		onClick();
	});
}

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

/** タスクの進捗のセル。押すとチェックリストの編集画面を開く（行のクリックとは別に動く。設計書 9.1） */
export function subtaskCell(tr: HTMLElement, progress: TaskProgress, subtasks: SubtaskCount, onClick: () => void): HTMLElement {
	const td = tr.createEl('td', { cls: 'is-numeric' });
	const link = td.createSpan({ cls: 'pm-action-link', text: subtaskText(progress, subtasks) });
	link.setAttr('aria-label', 'チェックリストを編集');
	link.addEventListener('click', (evt) => {
		evt.stopPropagation();
		onClick();
	});
	return td;
}

/** 行のクリックとは別に動く、表の中の小さなボタン */
export function rowButton(cell: HTMLElement, text: string, onClick: () => void): void {
	const button = cell.createEl('button', { cls: 'pm-row-button', text });
	button.addEventListener('click', (evt) => {
		evt.stopPropagation();
		onClick();
	});
}
