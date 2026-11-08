import { type App, ButtonComponent, DropdownComponent, TextComponent, type TFile } from 'obsidian';
import { hoursText, missingLabel } from '../calc/format';
import {
	addMatrixMember,
	addMatrixMonth,
	allocationMatrixEdits,
	matrixKey,
	memberCandidates,
	overAllocated,
	removedAllocationText,
	removeMatrixMember,
	type AllocationMatrix,
} from '../forms/allocationMatrix';
import { gridMove, isGridKey, type GridPos } from '../forms/gridMove';
import type { AllocationRow } from '../forms/projectTables';
import type { Member, NoteId, YearMonth } from '../model';
import { TABLE_SPEC } from '../parse/bodyTables';
import type { RawTableRow } from '../parse/markdownTable';
import { tableHeader } from './table';
import { applyTableEdits } from '../write/markdownTable';
import { confirm } from './confirmModal';
import { FormModal } from './formModal';
import { errorBox } from './formParts';

/** 月・メンバーの、このプロジェクトのタスクの作業ログの予定・実績の合計 */
export type AllocationHours = (month: YearMonth, member: NoteId) => { planned: number; actual: number };

export interface AllocationMatrixOptions {
	file: TFile;
	rows: AllocationRow[];
	snapshot: RawTableRow[] | null;
	matrix: AllocationMatrix;
	members: readonly Member[];
	hoursOf: AllocationHours;
	title: (id: string) => string;
}

/** 1か月の列の数（配分・予定・実績） */
const COLS_PER_MONTH = 3;

/** 工数配分の編集画面。縦にメンバー・横に月の表計算のようなマス目に配分を入れる（設計書 4.7） */
export class AllocationMatrixModal extends FormModal {
	private readonly matrix: AllocationMatrix;
	/** 描き直したあとに入るマス（足したメンバー・月の最初のマス） */
	private focusKey: string | null = null;
	/** 配分の入力欄。行＝メンバー、列＝月 */
	private grid: HTMLInputElement[][] = [];

	constructor(
		app: App,
		private readonly options: AllocationMatrixOptions,
	) {
		super(app);
		this.matrix = options.matrix;
	}

	onOpen(): void {
		this.setTitle('工数配分を編集');
		this.modalEl.addClass('pm-table-edit-modal', 'pm-allocation-matrix-modal');
		this.render();
	}

	private name(id: NoteId): string {
		return this.options.title(id) || missingLabel(id, 'user');
	}

	protected render(): void {
		const { contentEl, matrix } = this;
		contentEl.empty();
		errorBox(contentEl, this.errors);
		contentEl.createDiv({
			cls: 'pm-note',
			text: '配分(h)のマスに入れます（空にすると配分を消します）。矢印キー・Enter でマスを移動します。予定・実績は参考（このプロジェクトのタスクに付けた作業ログの合計。画面を開いた時点）で、予定が配分を超えると赤。変えたマスだけをノートに書き換えます',
		});

		const table = contentEl.createDiv({ cls: 'pm-allocation-matrix-wrap' }).createEl('table', { cls: 'pm-table pm-table-edit pm-allocation-matrix' });
		this.head(table);
		const body = table.createEl('tbody');
		this.grid = matrix.members.map((member, row) => this.memberRow(body, member, row));
		this.addMemberRow(body);
		if (matrix.members.length === 0 || matrix.months.length === 0) {
			body.createEl('tr').createEl('td', {
				cls: 'pm-view-empty',
				text: '表の左下でメンバーを、右上で月を追加してください',
				attr: { colspan: matrix.months.length * COLS_PER_MONTH + 2 },
			});
		}

		this.drawOthers(contentEl);
		this.footer(() => void this.save());
	}

	/** 2段の見出し。月ごとに配分・予定・実績の3列（プロジェクト状況の配分表と同じ。設計書 9.4） */
	private head(table: HTMLElement): void {
		const thead = table.createEl('thead');
		const top = thead.createEl('tr');
		top.createEl('th', { text: 'メンバー', cls: 'pm-allocation-matrix-member', attr: { rowspan: 2 } });
		for (const month of this.matrix.months) top.createEl('th', { text: month, cls: 'pm-month-start', attr: { colspan: COLS_PER_MONTH } });
		this.addMonthCell(top.createEl('th', { cls: 'pm-allocation-matrix-add', attr: { rowspan: 2 } }));
		const sub = thead.createEl('tr');
		for (let i = 0; i < this.matrix.months.length; i++) {
			sub.createEl('th', { text: '配分', cls: 'is-numeric pm-month-start' });
			sub.createEl('th', { text: '予定', cls: 'is-numeric' });
			sub.createEl('th', { text: '実績', cls: 'is-numeric' });
		}
	}

	/** メンバー1人の行。配分の入力欄を返す */
	private memberRow(body: HTMLElement, member: NoteId, row: number): HTMLInputElement[] {
		const tr = body.createEl('tr');
		tr.createEl('td', { text: this.name(member), cls: 'pm-allocation-matrix-member' });
		const inputs = this.matrix.months.map((month, col) => this.cell(tr, member, month, { row, col }));
		new ButtonComponent(tr.createEl('td', { cls: 'pm-allocation-matrix-trash' }))
			.setIcon('trash-2')
			.setTooltip('このメンバーの配分をすべて消す')
			.onClick(() => void this.removeMember(member));
		return inputs;
	}

	/** 1か月分の3マス。配分の入力欄と、参考の予定・実績。入力欄を返す */
	private cell(tr: HTMLElement, member: NoteId, month: YearMonth, pos: GridPos): HTMLInputElement {
		const key = matrixKey(member, month);
		const td = tr.createEl('td', { cls: 'pm-month-start pm-allocation-matrix-input' });
		const refresh = this.refCells(tr, key, this.options.hoursOf(month, member));
		const input = new TextComponent(td).setValue(this.matrix.cells.get(key) ?? '').onChange((v) => {
			this.matrix.cells.set(key, v);
			refresh();
		}).inputEl;
		// 文字の欄にする（設計書 4.7）
		input.inputMode = 'decimal';
		input.setAttr('aria-label', `${this.name(member)} ${month} の配分(h)`);
		input.addEventListener('focus', () => input.select());
		input.addEventListener('keydown', (e) => this.onKey(e, input, pos));
		refresh();
		if (this.focusKey === key) {
			this.focusKey = null;
			window.setTimeout(() => input.focus(), 0);
		}
		return input;
	}

	/** 参考の予定・実績の2マス。予定が配分を超えたら赤にする関数を返す（入力のたびに呼ぶ） */
	private refCells(tr: HTMLElement, key: string, hours: { planned: number; actual: number }): () => void {
		const { planned, actual } = hours;
		const blank = planned === 0 && actual === 0;
		const plannedTd = tr.createEl('td', { cls: 'is-numeric pm-allocation-matrix-ref', text: blank ? '' : hoursText(planned) });
		tr.createEl('td', { cls: 'is-numeric pm-allocation-matrix-ref', text: blank ? '' : hoursText(actual) });
		return () => {
			const allocated = overAllocated(this.matrix.cells.get(key) ?? '', planned);
			plannedTd.toggleClass('pm-text-error', allocated !== null);
			if (allocated !== null) plannedTd.setAttr('aria-label', `予定 ${hoursText(planned)}h が配分 ${hoursText(allocated)}h を超えています`);
			else plannedTd.removeAttribute('aria-label');
		};
	}

	/** 矢印キー・Enter でマスを移動する。左右は文字の端にカーソルがあるときだけ */
	private onKey(e: KeyboardEvent, input: HTMLInputElement, pos: GridPos): void {
		if (e.isComposing || e.ctrlKey || e.altKey || e.metaKey || !isGridKey(e.key)) return;
		if (e.key === 'ArrowLeft' && input.selectionStart !== 0) return;
		if (e.key === 'ArrowRight' && input.selectionEnd !== input.value.length) return;
		e.preventDefault();
		e.stopPropagation();
		const next = gridMove(pos, e.key, e.shiftKey, { rows: this.grid.length, cols: this.matrix.months.length });
		this.grid[next.row]?.[next.col]?.focus();
	}

	/** 足したあと、key のマスに入れるよう描き直す。足せなかったら（undefined）何もしない */
	private afterAdd(key: string | null | undefined): void {
		if (key === undefined) return;
		this.focusKey = key;
		this.render();
	}

	/** 確認してから、メンバーの行と配分をすべて消す（設計書 4.7） */
	private async removeMember(member: NoteId): Promise<void> {
		const ok = await confirm(this.app, {
			title: `${this.name(member)} の行を消しますか？`,
			details: [removedAllocationText(this.matrix, member), '「保存」を押すまでノートは変わりません（「キャンセル」で元に戻せます）'],
			confirmText: '消す',
			danger: true,
		});
		if (!ok) return;
		removeMatrixMember(this.matrix, member);
		this.render();
	}

	/** 表のいちばん下の、メンバーを足す行。選んだらすぐ足す */
	private addMemberRow(body: HTMLElement): void {
		const candidates = memberCandidates(this.options.members, this.matrix);
		if (candidates.length === 0) return;
		const tr = body.createEl('tr', { cls: 'pm-allocation-matrix-add-row' });
		const d = new DropdownComponent(tr.createEl('td', { cls: 'pm-allocation-matrix-member pm-allocation-matrix-add' }));
		d.addOption('', '＋メンバー');
		for (const m of candidates) d.addOption(m.id, m.title);
		d.selectEl.setAttr('aria-label', 'メンバーを追加');
		d.onChange((id) => this.afterAdd(addMatrixMember(this.matrix, id)));
		tr.createEl('td', { attr: { colspan: this.matrix.months.length * COLS_PER_MONTH + 1 } });
	}

	/** 見出しの右端の、月を足す欄。月を選んだらすぐ足す */
	private addMonthCell(th: HTMLElement): void {
		const t = new TextComponent(th);
		t.inputEl.type = 'month';
		t.inputEl.setAttr('aria-label', '月を追加');
		t.setPlaceholder('＋月');
		t.onChange((v) => this.afterAdd(addMatrixMonth(this.matrix, v)));
	}

	/** マス目に置けない行（月かメンバーが読めない）。消すことだけできる */
	private drawOthers(el: HTMLElement): void {
		const { others } = this.matrix;
		if (others.length === 0) return;
		el.createDiv({ cls: 'pm-note', text: '月かメンバーが読めないためマス目に置けない行です。消してから、マスに入れ直してください' });
		const table = el.createEl('table', { cls: 'pm-table pm-table-edit' });
		tableHeader(table, ['月', 'メンバー', '配分(h)', '']);
		const body = table.createEl('tbody');
		for (const row of others) {
			const tr = body.createEl('tr');
			tr.createEl('td', { text: row.month });
			tr.createEl('td', { text: row.member });
			tr.createEl('td', { text: row.hours, cls: 'is-numeric' });
			new ButtonComponent(tr.createEl('td'))
				.setIcon('trash-2')
				.setTooltip('この行を消す')
				.onClick(() => {
					others.splice(others.indexOf(row), 1);
					this.render();
				});
		}
	}

	private async save(): Promise<void> {
		const { options } = this;
		await this.submit(
			() => allocationMatrixEdits(this.matrix, options.rows, options.title),
			async (result) => {
				await this.app.vault.process(options.file, (content) => applyTableEdits(content, TABLE_SPEC.allocations, 'month', options.snapshot, result.edits));
			},
		);
	}
}
