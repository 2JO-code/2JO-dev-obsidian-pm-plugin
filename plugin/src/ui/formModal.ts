import { Modal, Notice, Setting } from 'obsidian';

/** 入力を確かめた結果。errors があれば保存しない */
export interface FormCheck {
	errors: string[];
	warnings: string[];
}

/** 保存して閉じる入力画面の共通部分（入力補助フォーム・本文の表の編集画面。設計書 4.5, 4.6） */
export abstract class FormModal extends Modal {
	protected errors: string[] = [];
	private saving = false;

	onClose(): void {
		this.contentEl.empty();
	}

	/** 中身を描き直す */
	protected abstract render(): void;

	/** 「キャンセル」「保存」のボタン。setting を渡せば、その行に並べる */
	protected footer(onSave: () => void, setting: Setting = new Setting(this.contentEl)): void {
		setting
			.addButton((b) => b.setButtonText('キャンセル').onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText('保存')
					.setCta()
					.onClick(onSave),
			);
	}

	/** 誤りがあれば表示し、無ければ書き込んで閉じる。知らせることがあれば通知する */
	protected async submit<T extends FormCheck>(check: () => T, write: (result: T) => Promise<void>): Promise<void> {
		// 保存中の2回目は受け付けない（設計書 4.6）
		if (this.saving) return;
		const result = check();
		if (result.errors.length > 0) {
			this.errors = result.errors;
			this.render();
			return;
		}
		this.saving = true;
		try {
			await write(result);
		} catch (e) {
			new Notice(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`);
			return;
		} finally {
			this.saving = false;
		}
		if (result.warnings.length > 0) new Notice(['保存しました', ...result.warnings].join('\n'), 8000);
		this.close();
	}
}
