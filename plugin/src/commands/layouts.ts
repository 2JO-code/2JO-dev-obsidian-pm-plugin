import { Notice } from 'obsidian';
import { localToday } from '../calc/dates';
import type ProjectManagerPlugin from '../main';
import { layoutLabel, parseSavedLayouts, putLayout, removeLayout, type SavedLayout } from '../savedLayouts';
import { ChooseModal } from '../ui/chooseModal';
import { confirm } from '../ui/confirmModal';
import { askLayoutName } from '../ui/layoutNameModal';
import { notifyError } from '../ui/notify';

/** 保存先（この PC だけ） */
const STORAGE_KEY = 'project-manager:layouts';

/** レイアウトの保存・切り替え・削除のコマンドを登録する */
export function registerLayouts(plugin: ProjectManagerPlugin): void {
	plugin.addCommand({ id: 'save-layout', name: 'レイアウトを保存', callback: () => void saveLayout(plugin) });
	plugin.addCommand({ id: 'switch-layout', name: 'レイアウトを切り替え', callback: () => switchLayout(plugin) });
	plugin.addCommand({ id: 'delete-layout', name: 'レイアウトを削除', callback: () => deleteLayout(plugin) });
}

function loadLayouts(plugin: ProjectManagerPlugin): SavedLayout[] {
	return parseSavedLayouts(plugin.app.loadLocalStorage(STORAGE_KEY));
}

function storeLayouts(plugin: ProjectManagerPlugin, layouts: SavedLayout[]): void {
	plugin.app.saveLocalStorage(STORAGE_KEY, layouts.length > 0 ? layouts : null);
}

/** 今のタブの並びに名前を付けて、このPCに保存する */
export async function saveLayout(plugin: ProjectManagerPlugin): Promise<void> {
	const answer = await askLayoutName(plugin.app, loadLayouts(plugin));
	if (!answer) return;
	if (answer.exists) {
		const ok = await confirm(plugin.app, {
			title: 'レイアウトを上書き',
			details: [`「${answer.name}」を今のタブの並びで上書きします`],
			confirmText: '上書き',
		});
		if (!ok) return;
	}
	const entry: SavedLayout = { name: answer.name, savedAt: localToday(), layout: plugin.app.workspace.getLayout() };
	// 名前を入れている間に別の画面で変えたかもしれないので読み直してから足す
	storeLayouts(plugin, putLayout(loadLayouts(plugin), entry));
	new Notice(`レイアウト「${answer.name}」を保存しました`);
}

/** 保存したレイアウトを選び、タブの並びを切り替える */
export function switchLayout(plugin: ProjectManagerPlugin): void {
	chooseLayout(plugin, '切り替えるレイアウトを選ぶ', (layout) => void applyLayout(plugin, layout));
}

/** 保存したレイアウトを選んで消す */
export function deleteLayout(plugin: ProjectManagerPlugin): void {
	chooseLayout(plugin, '削除するレイアウトを選ぶ', (layout) => void removeChosen(plugin, layout));
}

function chooseLayout(plugin: ProjectManagerPlugin, placeholder: string, onChoose: (layout: SavedLayout) => void): void {
	const layouts = loadLayouts(plugin);
	if (layouts.length === 0) {
		new Notice('保存したレイアウトがありません。先に「レイアウトを保存」で保存してください');
		return;
	}
	new ChooseModal(plugin.app, layouts, layoutLabel, onChoose, placeholder).open();
}

async function applyLayout(plugin: ProjectManagerPlugin, layout: SavedLayout): Promise<void> {
	try {
		await plugin.app.workspace.changeLayout(layout.layout);
		new Notice(`レイアウト「${layout.name}」に切り替えました`);
	} catch (e) {
		notifyError(e, 'レイアウトを切り替えられませんでした');
	}
}

async function removeChosen(plugin: ProjectManagerPlugin, layout: SavedLayout): Promise<void> {
	const ok = await confirm(plugin.app, {
		title: 'レイアウトを削除',
		details: [`「${layout.name}」をこのPCから消します。元に戻せません`, '開いているタブはそのままです'],
		confirmText: '削除',
		danger: true,
	});
	if (!ok) return;
	storeLayouts(plugin, removeLayout(loadLayouts(plugin), layout.name));
	new Notice(`レイアウト「${layout.name}」を削除しました`);
}
