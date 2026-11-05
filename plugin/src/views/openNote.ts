import type { TFile } from 'obsidian';
import type ProjectManagerPlugin from '../main';
import { rightLeaf } from './paneLeaf';

/**
 * ノートを個人の設定の場所（右枠／新しいタブ／別ウィンドウ）で開く。行番号があればその行を表示する。
 * newTab なら新しいタブに開く（右枠なら右枠の中。設計書 9.1）
 */
export async function openNote(
	plugin: ProjectManagerPlugin,
	file: TFile | string,
	options: { line?: number; newTab?: boolean } = {},
): Promise<void> {
	const target = typeof file === 'string' ? plugin.app.vault.getFileByPath(file) : file;
	if (!target) return;
	const { line, newTab = false } = options;
	const where = plugin.personal.openNoteIn;
	const { workspace } = plugin.app;
	const leaf =
		where === 'right' ? rightLeaf(plugin.app, plugin.personal.paneRatio, newTab) : workspace.getLeaf(newTab ? 'tab' : where);
	await leaf.openFile(target, line !== undefined ? { eState: { line } } : {});
}

/** 要素をクリックするとノートを開くようにする（クリックの種類は `noteClick`） */
export function noteLink(plugin: ProjectManagerPlugin, el: HTMLElement, file: TFile | string, line?: number): void {
	noteClick(el, (newTab) => void openNote(plugin, file, { line, newTab }));
}

/**
 * 要素をノートを開くリンクにする。左クリックは切り替え、中クリックと Ctrl＋クリックは新しいタブ（設計書 9.1）。
 * 親の要素のクリックには伝えない
 */
export function noteClick(el: HTMLElement, open: (newTab: boolean) => void): void {
	el.addEventListener('click', (evt) => {
		evt.stopPropagation();
		open(evt.ctrlKey || evt.metaKey);
	});
	el.addEventListener('auxclick', (evt) => {
		if (evt.button !== 1) return;
		evt.preventDefault();
		evt.stopPropagation();
		open(true);
	});
	// 中ボタンを押したときの自動スクロールを出さない
	el.addEventListener('mousedown', (evt) => {
		if (evt.button === 1) evt.preventDefault();
	});
}
