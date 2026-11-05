import { Notice, type TFile } from 'obsidian';
import type { TableRows } from '../forms/tableRows';
import type ProjectManagerPlugin from '../main';

/** 索引ができているか。読み込み中ならお知らせを出して false */
export function storeReady(plugin: ProjectManagerPlugin): boolean {
	if (plugin.store.ready) return true;
	new Notice('データを読み込み中です。少し待ってからもう一度実行してください');
	return false;
}

/** 本文を編集する画面を開けるか確かめ、ファイルと本文を返す。開けなければ undefined */
export async function tableSource(plugin: ProjectManagerPlugin, path: string): Promise<{ file: TFile; content: string } | undefined> {
	if (!storeReady(plugin)) return undefined;
	const file = plugin.app.vault.getFileByPath(path);
	if (!file) return undefined;
	return { file, content: await plugin.app.vault.read(file) };
}

/** 表が編集できる形か。列が足りなければお知らせを出す */
export function usable<T>(table: TableRows<T>): boolean {
	if (!table.error) return true;
	new Notice(table.error, 8000);
	return false;
}
