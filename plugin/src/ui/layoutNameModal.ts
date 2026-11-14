import { type App, Modal, Setting } from 'obsidian';
import { checkLayoutName, type SavedLayout } from '../savedLayouts';
import { errorBox } from './formParts';

/** レイアウトの名前を入れる画面。保存なら名前と、上書きになるかを返す。閉じたら null */
export function askLayoutName(app: App, layouts: readonly SavedLayout[]): Promise<{ name: string; exists: boolean } | null> {
	return new Promise((resolve) => new LayoutNameModal(app, layouts, resolve).open());
}

class LayoutNameModal extends Modal {
	private value = '';
	private errors: string[] = [];
	private answered = false;

	constructor(
		app: App,
		private readonly layouts: readonly SavedLayout[],
		private readonly resolve: (answer: { name: string; exists: boolean } | null) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('レイアウトを保存');
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.answered) this.resolve(null);
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		errorBox(contentEl, this.errors);
		const names = this.layouts.map((l) => l.name);
		const desc = names.length > 0 ? `保存済み：${names.join('、')}（同じ名前にすると上書きします）` : '今開いているタブの並びを、このPCに保存します';
		new Setting(contentEl)
			.setName('名前')
			.setDesc(desc)
			.addText((t) => {
				t.setValue(this.value).onChange((v) => (this.value = v));
				t.inputEl.addEventListener('keydown', (evt) => {
					if (evt.key !== 'Enter' || evt.isComposing) return;
					evt.preventDefault();
					this.submit();
				});
				window.setTimeout(() => t.inputEl.focus(), 0);
			});
		new Setting(contentEl)
			.addButton((b) => b.setButtonText('キャンセル').onClick(() => this.close()))
			.addButton((b) => b.setButtonText('保存').setCta().onClick(() => this.submit()));
	}

	private submit(): void {
		const result = checkLayoutName(this.value, this.layouts);
		if (result.errors.length > 0) {
			this.errors = result.errors;
			this.render();
			return;
		}
		this.answered = true;
		this.resolve({ name: result.name, exists: result.exists });
		this.close();
	}
}
