import { isOpen, parseToggled, toggledForAll, type WbsProject } from './wbs';

/** 階層（プロジェクト → エピック）の開閉の状態（設計書 9.7）。キーは `wbsKey`。変えたら onChange を呼ぶ */
export class TreeToggle {
	/** 初期の開閉と逆にした行のキー */
	private toggled = new Set<string>();

	constructor(private readonly onChange: () => void = () => {}) {}

	/** 保存されていた状態を読む */
	load(raw: unknown): void {
		this.toggled = parseToggled(raw);
	}

	/** 保存する形（初期の開閉と逆にした行のキー） */
	saved(): string[] {
		return [...this.toggled];
	}

	isOpen(key: string): boolean {
		return isOpen(this.toggled, key);
	}

	/** 開閉を切り替える。戻り値は切り替えたあとに開いているか */
	flip(key: string): boolean {
		if (this.toggled.has(key)) this.toggled.delete(key);
		else this.toggled.add(key);
		this.onChange();
		return this.isOpen(key);
	}

	/** すべて開く（open=true）か、すべて閉じる */
	setAll(tree: readonly WbsProject[], open: boolean): void {
		this.toggled = toggledForAll(tree, open);
		this.onChange();
	}

	/** 初期の開閉に戻す */
	clear(): void {
		this.toggled.clear();
		this.onChange();
	}
}
