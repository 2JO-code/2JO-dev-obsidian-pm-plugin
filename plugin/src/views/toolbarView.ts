import { ItemView, setIcon, type App } from 'obsidian';
import type ProjectManagerPlugin from '../main';
import { mainMenuEntries, type MenuEntry, type MenuGroup } from '../ui/mainMenu';
import { TOOLBAR_VIEW_TYPE } from './viewTypes';

/** 一覧に出す組と見出し。作成・入力は上のボタンに出す */
const LIST_GROUPS: { group: MenuGroup; heading: string }[] = [
	{ group: 'views', heading: 'ビュー' },
	{ group: 'output', heading: '書き出し・アーカイブ' },
	{ group: 'layout', heading: 'レイアウト' },
	{ group: 'other', heading: 'その他' },
];

/** ツールバーのビューと、開くコマンドを登録する（設計書 9.15） */
export function registerToolbarView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(TOOLBAR_VIEW_TYPE, (leaf) => new ToolbarView(leaf, plugin));
	plugin.addCommand({ id: 'open-toolbar', name: 'ツールバーを開く', callback: () => void openToolbar(plugin) });
}

/** ツールバーを左のサイドバーに開く。開いていればそのタブを表示する */
export async function openToolbar(plugin: ProjectManagerPlugin): Promise<void> {
	const { workspace } = plugin.app;
	const leaf = workspace.getLeavesOfType(TOOLBAR_VIEW_TYPE)[0] ?? workspace.getLeftLeaf(false);
	if (!leaf) return;
	if (leaf.view.getViewType() !== TOOLBAR_VIEW_TYPE) await leaf.setViewState({ type: TOOLBAR_VIEW_TYPE, active: true });
	await workspace.revealLeaf(leaf);
}

/** 中央で最後に使ったビューの種類 */
function currentMainViewType(app: App): string | undefined {
	return app.workspace.getMostRecentLeaf(app.workspace.rootSplit)?.view.getViewType();
}

/** 作成・入力のボタンと、ビューを切り替える一覧を出すサイドバーのビュー */
export class ToolbarView extends ItemView {
	private items: { viewType: string; el: HTMLElement }[] = [];

	constructor(leaf: ConstructorParameters<typeof ItemView>[0], private readonly plugin: ProjectManagerPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return TOOLBAR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'プロジェクト管理';
	}

	getIcon(): string {
		return 'briefcase';
	}

	async onOpen(): Promise<void> {
		this.render();
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.markCurrent()));
		this.registerEvent(this.app.workspace.on('layout-change', () => this.markCurrent()));
	}

	private render(): void {
		const entries = mainMenuEntries(this.plugin);
		const root = this.contentEl;
		root.empty();
		root.addClass('pm-toolbar');
		this.items = [];

		const buttons = root.createDiv({ cls: 'nav-header' }).createDiv({ cls: 'nav-buttons-container' });
		for (const entry of [...entries.create, ...entries.input]) this.addButton(buttons, entry);

		for (const { group, heading } of LIST_GROUPS) {
			root.createDiv({ cls: 'pm-toolbar-heading', text: heading });
			const list = root.createDiv({ cls: 'pm-toolbar-list' });
			for (const entry of entries[group]) this.addItem(list, entry);
		}
		this.markCurrent();
	}

	/** 上の段のアイコンだけのボタン */
	private addButton(parent: HTMLElement, entry: MenuEntry): void {
		const button = parent.createDiv({ cls: 'clickable-icon nav-action-button', attr: { 'aria-label': entry.title } });
		setIcon(button, entry.icon);
		this.registerDomEvent(button, 'click', entry.action);
	}

	/** 一覧の1行（アイコンと名前） */
	private addItem(parent: HTMLElement, entry: MenuEntry): void {
		const self = parent.createDiv({ cls: 'tree-item' }).createDiv({ cls: 'tree-item-self is-clickable pm-toolbar-item' });
		setIcon(self.createDiv({ cls: 'tree-item-icon' }), entry.icon);
		self.createDiv({ cls: 'tree-item-inner', text: entry.title });
		this.registerDomEvent(self, 'click', entry.action);
		if (entry.viewType) this.items.push({ viewType: entry.viewType, el: self });
	}

	/** 中央で今見ているビューの行に印を付ける */
	private markCurrent(): void {
		const current = currentMainViewType(this.app);
		for (const item of this.items) item.el.toggleClass('is-active', item.viewType === current);
	}
}
