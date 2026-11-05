import { type App, FuzzySuggestModal } from 'obsidian';

/** 候補を名前で探して1つ選ぶ画面（タスク・メンバーの選択で共通） */
export class ChooseModal<T> extends FuzzySuggestModal<T> {
	constructor(
		app: App,
		private readonly items: T[],
		private readonly label: (item: T) => string,
		private readonly onChoose: (item: T) => void,
		placeholder: string,
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getItems(): T[] {
		return this.items;
	}

	getItemText(item: T): string {
		return this.label(item);
	}

	onChooseItem(item: T): void {
		this.onChoose(item);
	}
}
