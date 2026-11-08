import type { App, WorkspaceLeaf } from 'obsidian';
import { groupsInOrder } from './paneGroups';

/** 中央の枠ごとのタブ。左（上）から順 */
function rootGroups(app: App): WorkspaceLeaf[][] {
	const leaves: WorkspaceLeaf[] = [];
	app.workspace.iterateRootLeaves((leaf) => {
		leaves.push(leaf);
	});
	return groupsInOrder(leaves, (leaf) => leaf.parent);
}

/** 枠の中で表示中のタブ */
function shownLeaf(group: WorkspaceLeaf[]): WorkspaceLeaf | undefined {
	return group.find((leaf) => leaf.view.containerEl.isShown()) ?? group[0];
}

/** 枠の中の空のタブ。無ければ新しいタブを作る */
function tabIn(app: App, group: WorkspaceLeaf[]): WorkspaceLeaf {
	const empty = group.find((leaf) => leaf.view.getViewType() === 'empty');
	if (empty) return empty;
	const shown = shownLeaf(group);
	if (shown) app.workspace.setActiveLeaf(shown, { focus: false });
	return app.workspace.getLeaf('tab');
}

/** ビューを開くタブ（中央の最初の枠。設計書 9.1） */
export function firstPaneLeaf(app: App): WorkspaceLeaf {
	const first = rootGroups(app)[0];
	return first ? tabIn(app, first) : app.workspace.getLeaf('tab');
}
