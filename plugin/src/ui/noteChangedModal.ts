import { type App, Modal, Setting } from 'obsidian';
import { isOverwritten, sameItemValue, savedValue, type NoteChange, type OverwriteMode } from '../forms/noteChanges';

/** 注意ダイアログで選んだこと。保存のしかたか、開き直す・フォームに戻る */
export type NoteChangedChoice = OverwriteMode | 'reopen' | 'back';

/** 開いたあとのノートの更新を知らせ、どうするか選んでもらう。閉じたら 'back'（設計書 4.15） */
export function askNoteChanged(app: App, rows: readonly NoteChange[], format: (value: unknown) => string): Promise<NoteChangedChoice> {
	return new Promise((resolve) => new NoteChangedModal(app, rows, format, resolve).open());
}

class NoteChangedModal extends Modal {
	private answered = false;

	constructor(
		app: App,
		private readonly rows: readonly NoteChange[],
		private readonly format: (value: unknown) => string,
		private readonly resolve: (choice: NoteChangedChoice) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, rows, format } = this;
		this.setTitle('フォームを開いた時からノートに更新があります');
		this.modalEl.addClass('pm-note-changed-modal');
		contentEl.createEl('p', {
			cls: 'pm-note',
			text: 'ほかの人か別の画面で、このノートが変えられました。保存したあとの値を確かめてから選んでください。',
		});

		const wrap = contentEl.createDiv({ cls: 'pm-note-changed pm-grid-lines' });
		const table = wrap.createEl('table', { cls: 'pm-table' });
		const head = table.createEl('thead').createEl('tr');
		for (const h of ['項目', '開いたとき', '今のノート', '保存後：変えた項目だけ上書き', '保存後：フォームの内容ですべて保存']) {
			head.createEl('th', { text: h });
		}
		const body = table.createEl('tbody');
		for (const row of rows) {
			const tr = body.createEl('tr');
			const name = tr.createEl('td');
			name.createSpan({ text: row.label });
			if (isOverwritten(row)) name.createSpan({ cls: 'pm-mark is-tinted pm-note-changed-mark', text: '両方で変更' });
			this.cell(tr, format(row.opened), false);
			this.cell(tr, format(row.current), row.changedInNote);
			// 保存で今のノートから変わる値に印を付ける
			for (const mode of ['edited', 'all'] as const) {
				const saved = savedValue(row, mode);
				this.cell(tr, format(saved), !sameItemValue(saved, row.current));
			}
		}

		contentEl.createEl('ul', { cls: 'pm-impact-list' }, (ul) => {
			ul.createEl('li', { text: '変えた項目だけ上書き：フォームで変えた項目だけを書きます。ほかの項目は今のノートの値を残します' });
			ul.createEl('li', { text: 'フォームの内容ですべて保存：フォームに出ている値をすべて書きます。ノートで変わった項目も戻ります' });
			ul.createEl('li', { text: '開き直す：フォームでの入力を捨て、今のノートの値でフォームを開き直します' });
			ul.createEl('li', { text: '色の付いた値は、今のノートから変わる値です' });
		});

		new Setting(contentEl)
			.addButton((b) => b.setButtonText('フォームに戻る').onClick(() => this.answer('back')))
			.addButton((b) => b.setButtonText('開き直す').onClick(() => this.answer('reopen')))
			.addButton((b) => b.setButtonText('フォームの内容ですべて保存').onClick(() => this.answer('all')))
			.addButton((b) =>
				b
					.setButtonText('変えた項目だけ上書き')
					.setCta()
					.onClick(() => this.answer('edited')),
			);
	}

	/** 値のセル。changed なら印（太字と薄い背景） */
	private cell(tr: HTMLElement, text: string, changed: boolean): void {
		tr.createEl('td', { cls: changed ? 'pm-note-changed-value is-changed' : 'pm-note-changed-value', text });
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.answered) this.resolve('back');
	}

	private answer(choice: NoteChangedChoice): void {
		this.answered = true;
		this.resolve(choice);
		this.close();
	}
}
