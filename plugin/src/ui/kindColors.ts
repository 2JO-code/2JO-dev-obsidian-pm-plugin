import type ProjectManagerPlugin from '../main';
import type { KindColors } from '../settings';

/** 色を入れる CSS 変数（設計書 6章） */
const VARS: Record<keyof KindColors, string> = {
	project: '--pm-color-project',
	epic: '--pm-color-epic',
	task: '--pm-color-task',
};

/** 開いているウィンドウ（メインと別ウィンドウ）の文書 */
function documents(plugin: ProjectManagerPlugin): Set<Document> {
	const docs = new Set<Document>([document]);
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		docs.add(leaf.view.containerEl.doc);
	});
	return docs;
}

function setVars(doc: Document, colors: KindColors | undefined): void {
	const props: Record<string, string> = {};
	for (const [key, name] of Object.entries(VARS) as [keyof KindColors, string][]) props[name] = colors ? colors[key] : '';
	doc.body.setCssProps(props);
}

/** 種類ごとの色を画面に当てはめる。別ウィンドウを開いたときにも当てはめる */
export function registerKindColors(plugin: ProjectManagerPlugin): void {
	applyKindColors(plugin);
	plugin.registerEvent(plugin.app.workspace.on('window-open', (win) => setVars(win.doc, plugin.settings.colors)));
	plugin.register(() => {
		for (const doc of documents(plugin)) setVars(doc, undefined);
	});
}

/** 設定の色を、開いているすべてのウィンドウに当てはめる */
export function applyKindColors(plugin: ProjectManagerPlugin): void {
	for (const doc of documents(plugin)) setVars(doc, plugin.settings.colors);
}
