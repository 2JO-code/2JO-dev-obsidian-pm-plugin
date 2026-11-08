import type { App } from 'obsidian';
import { firstPaneLeaf } from './paneLeaf';

/**
 * ビューを開く。開いていればそのタブを表示し、無ければ中央の最初の枠に開く。
 * state を渡すと、そのビューの状態（絞り込みなど）のうち渡した項目だけを書き換える
 */
export async function openView(app: App, type: string, state?: Record<string, unknown>): Promise<void> {
	const { workspace } = app;
	const existing = workspace.getLeavesOfType(type)[0];
	const leaf = existing ?? firstPaneLeaf(app);
	if (!existing || state) {
		const current = existing?.view.getState() ?? {};
		await leaf.setViewState({ type, active: true, ...(state ? { state: { ...current, ...state } } : {}) });
	}
	await workspace.revealLeaf(leaf);
}
