import { type App, Modal, Setting } from 'obsidian';

export interface ConfirmOptions {
	title: string;
	details: string[];
	confirmText: string;
	/** true ならボタンを警告色にする */
	danger?: boolean;
}

/** 確認画面を出す。実行なら true、キャンセル・閉じたら false */
export function confirm(app: App, options: ConfirmOptions): Promise<boolean> {
	return new Promise((resolve) => new ConfirmModal(app, options, resolve).open());
}

class ConfirmModal extends Modal {
	private answered = false;

	constructor(
		app: App,
		private readonly options: ConfirmOptions,
		private readonly resolve: (ok: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, options } = this;
		this.setTitle(options.title);
		const list = contentEl.createEl('ul', { cls: 'pm-impact-list' });
		for (const line of options.details) list.createEl('li', { text: line });

		new Setting(contentEl)
			.addButton((button) => button.setButtonText('キャンセル').onClick(() => this.answer(false)))
			.addButton((button) => {
				button.setButtonText(options.confirmText).onClick(() => this.answer(true));
				if (options.danger) button.setWarning();
				else button.setCta();
			});
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.answered) this.resolve(false);
	}

	private answer(ok: boolean): void {
		this.answered = true;
		this.resolve(ok);
		this.close();
	}
}
