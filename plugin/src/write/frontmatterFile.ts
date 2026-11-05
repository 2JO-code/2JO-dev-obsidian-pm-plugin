import type { App, TFile } from 'obsidian';
import type { NoteType } from '../model';
import { applyFrontmatter, type FrontmatterUpdate } from './frontmatter';

/** ノートの frontmatter を変更する。YAML が壊れていると例外になる（設計書 4.1） */
export async function writeFrontmatter(app: App, file: TFile, type: NoteType, update: FrontmatterUpdate): Promise<void> {
	await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
		applyFrontmatter(fm, type, update);
	});
}

/**
 * ノートを作り（フォルダが無ければ作る）、frontmatter を書く。
 * frontmatter の書き込みに失敗してもファイルはできているので、例外にせず frontmatterWritten: false を返す（設計書 4.4）
 */
export async function createNoteFile(
	app: App,
	path: string,
	body: string,
	type: NoteType,
	update: FrontmatterUpdate,
): Promise<{ file: TFile; frontmatterWritten: boolean }> {
	const folder = path.slice(0, path.lastIndexOf('/'));
	if (folder && !app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
	const file = await app.vault.create(path, body);
	try {
		await writeFrontmatter(app, file, type, update);
		return { file, frontmatterWritten: true };
	} catch (e) {
		console.error('[project-manager] 新しいノートのプロパティを書き込めませんでした', path, e);
		return { file, frontmatterWritten: false };
	}
}
