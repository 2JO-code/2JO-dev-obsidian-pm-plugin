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

/** ビューを開くタブ（左枠。設計書 9.1） */
export function leftLeaf(app: App): WorkspaceLeaf {
	const first = rootGroups(app)[0];
	return first ? tabIn(app, first) : app.workspace.getLeaf('tab');
}

/** 中身を差し替えてよいタブ（ノートか空のタブで、固定していない） */
function replaceable(leaf: WorkspaceLeaf): boolean {
	const type = leaf.view.getViewType();
	return (type === 'markdown' || type === 'empty') && leaf.getViewState().pinned !== true;
}

/**
 * ノートを開くタブ（右枠。設計書 9.1）。右枠で表示中のノートを差し替え、newTab なら右枠に新しいタブを作る。
 * 枠が1つなら右に分割し、左枠の幅を ratio% にする
 */
export function rightLeaf(app: App, ratio: number, newTab: boolean): WorkspaceLeaf {
	const groups = rootGroups(app);
	const last = groups[groups.length - 1];
	if (groups.length >= 2 && last) {
		const shown = shownLeaf(last);
		return !newTab && shown && replaceable(shown) ? shown : tabIn(app, last);
	}
	const shown = last && shownLeaf(last);
	if (!shown) return app.workspace.getLeaf('tab');
	const leaf = app.workspace.createLeafBySplit(shown, 'vertical');
	applyPaneRatio(app, ratio);
	return leaf;
}

/** 枠の幅を変える Obsidian の非公開の関数（設計書 9.1） */
interface Resizable {
	setDimension?: (dimension: number) => void;
}

/** 左右2つの枠があれば、左枠の幅を ratio% にする */
export function applyPaneRatio(app: App, ratio: number): void {
	const groups = rootGroups(app);
	const [left, right] = groups.map((group) => group[0]?.parent);
	if (groups.length !== 2 || !left || !right || left.parent !== right.parent) return;
	const l = left as unknown as Resizable;
	const r = right as unknown as Resizable;
	if (typeof l.setDimension !== 'function' || typeof r.setDimension !== 'function') return;
	l.setDimension(ratio);
	r.setDimension(100 - ratio);
	app.workspace.requestSaveLayout();
}
