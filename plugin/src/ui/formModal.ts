import { Modal, Notice, Setting, type TFile } from 'obsidian';
import { DESCRIPTION_KEY, editedItems, ITEM_LABELS, NoteChangedError, needsConfirm, noteChanges, type NoteItems } from '../forms/noteChanges';
import type { NoteType } from '../model';
import { readNoteItems, writeNoteItems } from '../write/noteFile';
import { askNoteChanged } from './noteChangedModal';
import { notifyError } from './notify';
import { SaveGuard } from './saveGuard';

/** 書く直前の確かめで食い違ったときに、確かめ直す回数の上限 */
const MAX_TRIES = 3;

/** 入力を確かめた結果。errors があれば保存しない */
export interface FormCheck {
	errors: string[];
	warnings: string[];
}

/** 入力補助フォームが書くノート（設計書 4.15） */
export interface FormNote {
	file: TFile;
	type: Exclude<NoteType, 'worklog'>;
	/** 開いたときのノートの写し */
	opened: NoteItems;
	/** 差分の表に出す値の文字（リンクはタイトルに） */
	format: (value: unknown) => string;
	/** 今のノートの値でフォームを開き直す */
	reopen: () => void;
}

/** 保存して閉じる入力画面の共通部分（入力補助フォーム・本文の表の編集画面。設計書 4.5, 4.6） */
export abstract class FormModal extends Modal {
	protected errors: string[] = [];
	private readonly guard = new SaveGuard();

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
		if (this.guard.busy) return;
		const result = this.checked(check);
		if (!result) return;
		try {
			await this.guard.run(() => write(result));
		} catch (e) {
			notifyError(e, '保存できませんでした');
			return;
		}
		this.done(result.warnings);
	}

	/**
	 * 入力補助フォームの保存。開いたあとにノートが変わっていれば注意ダイアログを出し、
	 * フォームで変えた項目だけを書く（設計書 4.15）
	 * @param items 確かめた結果から、フォームの値の写しを作る
	 */
	protected async submitNote<T extends FormCheck>(note: FormNote, check: () => T, items: (result: T) => NoteItems): Promise<void> {
		if (this.guard.busy) return;
		const result = this.checked(check);
		if (!result) return;
		let saved: boolean;
		try {
			saved = await this.guard.run(() => this.writeNote(note, items(result)));
		} catch (e) {
			notifyError(e, '保存できませんでした');
			return;
		}
		if (saved) this.done(result.warnings);
	}

	/** 入力を確かめる。誤りがあれば表示して undefined */
	private checked<T extends FormCheck>(check: () => T): T | undefined {
		const result = check();
		if (result.errors.length === 0) return result;
		this.errors = result.errors;
		this.render();
		return undefined;
	}

	/** ノートの今の値と比べてから書く。注意ダイアログで戻る・開き直すを選んだら false */
	private async writeNote(note: FormNote, form: NoteItems): Promise<boolean> {
		// 書く直前にさらに変わっていたら、もう一度確かめる（何度も続けば止める）
		for (let tries = 0; ; tries++) {
			if (tries >= MAX_TRIES) throw new Error('ノートが続けて更新されています。少し待ってから保存し直してください');
			const current = await readNoteItems(this.app, note.file, DESCRIPTION_KEY in note.opened);
			if (!current) throw new Error('ノートのプロパティ（YAML）が読めません。警告一覧を確認してください');
			const rows = noteChanges(note.opened, current, form, ITEM_LABELS[note.type]);
			let checked = note.opened;
			let edited = editedItems(note.opened, form);
			if (needsConfirm(rows)) {
				const choice = await askNoteChanged(this.app, rows, note.format);
				if (choice === 'back') return false;
				if (choice === 'reopen') {
					this.close();
					note.reopen();
					return false;
				}
				checked = current;
				// すべて保存なら、今のノートと違う項目をすべてフォームの値にする
				if (choice === 'all') edited = editedItems(current, form);
			}
			try {
				await writeNoteItems(this.app, note.file, note.type, checked, edited, form);
				return true;
			} catch (e) {
				if (!(e instanceof NoteChangedError)) throw e;
			}
		}
	}

	/** 保存のあと。知らせることがあれば通知して閉じる */
	private done(warnings: readonly string[]): void {
		if (warnings.length > 0) new Notice(['保存しました', ...warnings].join('\n'), 8000);
		this.close();
	}
}
