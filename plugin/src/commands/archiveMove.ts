import type { App } from 'obsidian';
import { folderOf, type ArchiveItem } from '../calc/archive';

export interface MoveOutcome {
	moved: number;
	/** 元のファイルが無い・移動先に同じ名前がある、で動かさなかった数 */
	skipped: number;
	/** 途中で止まったときの例外 */
	error?: unknown;
}

/** ファイルを1件ずつ動かす。失敗したらそこで止める（設計書 9.9） */
export async function moveNotes(app: App, items: readonly ArchiveItem[]): Promise<MoveOutcome> {
	let moved = 0;
	let skipped = 0;
	for (const item of items) {
		const file = app.vault.getFileByPath(item.from);
		if (!file || app.vault.getAbstractFileByPath(item.to)) {
			skipped++;
			continue;
		}
		try {
			const folder = folderOf(item.to);
			if (folder !== '' && !app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
			await app.fileManager.renameFile(file, item.to);
			moved++;
		} catch (error) {
			return { moved, skipped, error };
		}
	}
	return { moved, skipped };
}
