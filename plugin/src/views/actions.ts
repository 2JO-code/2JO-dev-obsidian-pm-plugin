import type { TaskProgress } from '../calc/progress';
import type { SubtaskCount } from '../model';
import { subtaskText } from '../calc/format';

/** シェルの操作の欄（右寄せ）に並べるボタン（要件4.2、設計書 9.1）。tooltip はマウスを乗せたときの説明 */
export function actionButtons(actions: HTMLElement, buttons: { text: string; onClick: () => void; tooltip?: string }[]): void {
	for (const { text, onClick, tooltip } of buttons) {
		const button = actions.createEl('button', { text });
		if (tooltip) button.setAttr('aria-label', tooltip);
		button.addEventListener('click', onClick);
	}
}

/** 要素のクリックで編集画面（フォーム・表の編集画面）を開く。親の要素のクリックには伝えない（設計書 9.1） */
export function formClick(el: HTMLElement, open: () => void): void {
	el.addEventListener('click', (evt) => {
		evt.stopPropagation();
		open();
	});
}

/** セルをリンクにする（行のクリックとは別に動く） */
export function cellLink(cell: HTMLElement, onClick: () => void): void {
	cell.addClass('pm-link');
	cell.addEventListener('click', (evt) => {
		evt.stopPropagation();
		onClick();
	});
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
