import { type App, ButtonComponent, Setting, type TFile } from 'obsidian';
import type { TableEditResult } from '../forms/tableRows';
import type { RawTableRow } from '../parse/markdownTable';
import { applyTableEdits, type TableSpec } from '../write/markdownTable';
import { FormModal } from './formModal';
import { errorBox } from './formParts';

/** 表の列。セルに入力欄を作り、値は行のオブジェクトに入れる */
export interface TableEditColumn<T> {
	label: string;
	render: (td: HTMLElement, row: T) => void;
}

export interface TableEditModalOptions<T> {
	title: string;
	file: TFile;
	spec: TableSpec;
	/** 新しい行を入れる位置を決める列（spec.columns のキー） */
	sortKey: string;
	rows: T[];
	snapshot: RawTableRow[] | null;
	columns: TableEditColumn<T>[];
	blank: () => T;
	toEdits: (rows: readonly T[], initial: readonly T[]) => TableEditResult;
	note: string;
}

/** 本文の表（マイルストーン・工数配分・個人休日・作業ログ）の編集画面。変えた行だけを書き換える（設計書 4.7） */
export class TableEditModal<T extends object> extends FormModal {
	private readonly rows: T[];
	private readonly initial: readonly T[];

	constructor(
		app: App,
		private readonly options: TableEditModalOptions<T>,
	) {
		super(app);
		this.initial = options.rows.map((r) => ({ ...r }));
		this.rows = options.rows.map((r) => ({ ...r }));
	}

	onOpen(): void {
		this.setTitle(this.options.title);
		this.modalEl.addClass('pm-table-edit-modal');
		this.render();
	}

	protected render(): void {
		const { contentEl, options } = this;
		contentEl.empty();
		errorBox(contentEl, this.errors);
		contentEl.createDiv({ cls: 'pm-note', text: options.note });

		const table = contentEl.createEl('table', { cls: 'pm-table pm-table-edit' });
		const head = table.createEl('thead').createEl('tr');
		for (const c of options.columns) head.createEl('th', { text: c.label });
		head.createEl('th');
		const body = table.createEl('tbody');
		this.rows.forEach((row, i) => {
			const tr = body.createEl('tr');
			for (const c of options.columns) c.render(tr.createEl('td'), row);
			new ButtonComponent(tr.createEl('td'))
				.setIcon('trash-2')
				.setTooltip('この行を消す')
				.onClick(() => {
					this.rows.splice(i, 1);
					this.render();
				});
		});
		if (this.rows.length === 0) body.createEl('tr').createEl('td', { cls: 'pm-view-empty', text: '行がありません', attr: { colspan: options.columns.length + 1 } });

		this.footer(
			() => void this.save(),
			new Setting(contentEl).addButton((b) =>
				b.setButtonText('＋行を追加').onClick(() => {
					this.rows.push(options.blank());
					this.render();
				}),
			),
		);
	}

	private async save(): Promise<void> {
		const { options } = this;
		await this.submit(
			() => options.toEdits(this.rows, this.initial),
			async (result) => {
				await this.app.vault.process(options.file, (content) => applyTableEdits(content, options.spec, options.sortKey, options.snapshot, result.edits));
			},
		);
	}
}
