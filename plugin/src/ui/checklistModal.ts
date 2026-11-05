import { type App, ButtonComponent, Setting, TextComponent, type TFile } from 'obsidian';
import { applyChecklistEdits, checklistEdits, type ChecklistRow } from '../forms/checklist';
import { FormModal } from './formModal';
import { errorBox } from './formParts';

export interface ChecklistModalOptions {
	file: TFile;
	title: string;
	rows: ChecklistRow[];
	snapshot: string[];
}

/** タスクの本文のチェックリストの編集画面。変えた行だけを書き換える（設計書 4.10） */
export class ChecklistModal extends FormModal {
	private readonly rows: ChecklistRow[];
	private readonly initial: readonly ChecklistRow[];
	/** 描き直したあとに入力欄へ移る行 */
	private focusRow: number | undefined;

	constructor(
		app: App,
		private readonly options: ChecklistModalOptions,
	) {
		super(app);
		this.initial = options.rows.map((r) => ({ ...r }));
		this.rows = options.rows.map((r) => ({ ...r }));
	}

	onOpen(): void {
		this.setTitle(`チェックリストを編集：${this.options.title}`);
		this.modalEl.addClass('pm-table-edit-modal');
		this.render();
	}

	protected render(): void {
		const { contentEl } = this;
		contentEl.empty();
		errorBox(contentEl, this.errors);
		contentEl.createDiv({ cls: 'pm-note', text: 'チェックした割合がタスクの進捗になります。Enter で次の項目を足せます。変えた行だけをノートに書き換えます' });

		const table = contentEl.createEl('table', { cls: 'pm-table pm-table-edit pm-checklist-edit' });
		const head = table.createEl('thead').createEl('tr');
		head.createEl('th', { text: '項目（チェックで完了）' });
		head.createEl('th');
		const body = table.createEl('tbody');
		this.rows.forEach((row, i) => {
			const tr = body.createEl('tr');
			// ノートのチェックリストと同じ見た目のチェックボックスを入力欄の左に置く（設計書 4.10）
			const item = tr.createEl('td').createDiv({ cls: 'pm-checklist-item' });
			const check = item.createEl('input', { type: 'checkbox', cls: 'task-list-item-checkbox' });
			check.checked = row.done;
			const text = new TextComponent(item).setValue(row.text).onChange((v) => (row.text = v));
			text.setPlaceholder('作業の内容');
			const mark = () => {
				item.toggleClass('is-done', check.checked);
				check.setAttr('aria-label', check.checked ? '完了（押すと未完了）' : '未完了（押すと完了）');
			};
			mark();
			check.addEventListener('change', () => {
				row.done = check.checked;
				mark();
			});
			text.inputEl.addEventListener('keydown', (e) => {
				if (e.key !== 'Enter' || e.isComposing) return;
				e.preventDefault();
				this.addRow(i + 1);
			});
			if (this.focusRow === i) window.setTimeout(() => text.inputEl.focus());
			new ButtonComponent(tr.createEl('td'))
				.setIcon('trash-2')
				.setTooltip('この項目を消す')
				.onClick(() => {
					this.rows.splice(i, 1);
					this.render();
				});
		});
		this.focusRow = undefined;
		if (this.rows.length === 0) body.createEl('tr').createEl('td', { cls: 'pm-view-empty', text: '項目がありません', attr: { colspan: 2 } });

		this.footer(
			() => void this.save(),
			new Setting(contentEl).addButton((b) => b.setButtonText('＋項目を追加').onClick(() => this.addRow(this.rows.length))),
		);
	}

	/** 新しい項目を足す。今ある項目の間には入れられないので、新しい項目のあいだでだけ位置を選べる（設計書 4.10） */
	private addRow(at: number): void {
		const firstNew = this.rows.findIndex((r) => r.line === undefined);
		const index = Math.max(at, firstNew === -1 ? this.rows.length : firstNew);
		this.rows.splice(index, 0, { done: false, text: '' });
		this.focusRow = index;
		this.render();
	}

	private async save(): Promise<void> {
		const { options } = this;
		await this.submit(
			() => checklistEdits(this.rows, this.initial),
			async (result) => {
				await this.app.vault.process(options.file, (content) => applyChecklistEdits(content, options.snapshot, result.edits));
			},
		);
	}
}
