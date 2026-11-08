import type ProjectManagerPlugin from '../main';

/**
 * ノートを新しいタブで開く。行番号があればその行を表示する。
 * 使うのは README と、警告一覧の直す画面の無い警告だけ（設計書 9.1）
 */
export async function openNote(plugin: ProjectManagerPlugin, path: string, line?: number): Promise<void> {
	const target = plugin.app.vault.getFileByPath(path);
	if (!target) return;
	await plugin.app.workspace.getLeaf('tab').openFile(target, line !== undefined ? { eState: { line } } : {});
}
