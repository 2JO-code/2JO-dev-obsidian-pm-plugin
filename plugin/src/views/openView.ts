import type { App } from 'obsidian';
import { firstPaneLeaf } from './paneLeaf';
import { OPENED_BY_PLUGIN } from './viewMemory';

/**
 * ビューを開く。開いていればそのタブを表示し、無ければ中央の最初の枠に開く。
 * state を渡すと、そのビューの状態（絞り込みなど）のうち渡した項目だけを書き換える。
 * 渡した状態は、このPCに覚えた状態より優先する（設計書 9.1）
 */
export async function openView(app: App, type: string, state?: Record<string, unknown>): Promise<void> {
	const { workspace } = app;
	const existing = workspace.getLeavesOfType(type)[0];
	const leaf = existing ?? firstPaneLeaf(app);
	if (!existing || state) {
		const current = existing?.view.getState() ?? {};
		await leaf.setViewState({ type, active: true, ...(state ? { state: { ...current, ...state, [OPENED_BY_PLUGIN]: true } } : {}) });
	}
	await workspace.revealLeaf(leaf);
}
