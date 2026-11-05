import type ProjectManagerPlugin from '../main';
import { checklistRows } from '../forms/checklist';
import { ChecklistModal } from '../ui/checklistModal';
import { isTaskFile } from './editTask';
import { tableSource } from './ready';

/** チェックリストの編集画面を開くコマンドと右クリックメニューを登録する */
export function registerEditChecklist(plugin: ProjectManagerPlugin): void {
	plugin.addCommand({
		id: 'edit-checklist',
		name: 'タスクのチェックリストを編集',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!isTaskFile(file)) return false;
			if (!checking) void openChecklistEditor(plugin, file.path);
			return true;
		},
	});

	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, file) => {
			if (!isTaskFile(file)) return;
			menu.addItem((item) =>
				item
					.setTitle('チェックリストを編集')
					.setIcon('list-todo')
					.onClick(() => void openChecklistEditor(plugin, file.path)),
			);
		}),
	);
}

/** タスクの本文のチェックリストの編集画面を開く（設計書 4.10） */
export async function openChecklistEditor(plugin: ProjectManagerPlugin, path: string): Promise<void> {
	const src = await tableSource(plugin, path);
	if (!src) return;
	const title = plugin.store.index.title(src.file.basename) || src.file.basename;
	new ChecklistModal(plugin.app, { file: src.file, title, ...checklistRows(src.content) }).open();
}
