import { type App, ButtonComponent, DropdownComponent, Setting, TextComponent, type TFile } from 'obsidian';
import { compareJa } from '../calc/compare';
import { missingLabel } from '../forms/formValues';
import { allocationMatrixEdits, matrixKey, type AllocationMatrix, type AllocationRow } from '../forms/projectTables';
import type { Member, NoteId, YearMonth } from '../model';
import { TABLE_SPEC } from '../parse/bodyTables';
import type { RawTableRow } from '../parse/markdownTable';
import { isYearMonth, parseHours } from '../parse/values';
import { hoursText } from '../views/format';
import { applyTableEdits } from '../write/markdownTable';
import { FormModal } from './formModal';
import { errorBox, hoursInput } from './formParts';

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

/** 工数配分の編集画面。縦にメンバー・横に月のマス目に配分を入れる（設計書 4.7） */
export class AllocationMatrixModal extends FormModal {
	private readonly matrix: AllocationMatrix;
	private newMonth = '';

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
			text: 'マスに配分(h)を入れます（空にすると配分を消します）。マスの下の予定・実績は参考（このプロジェクトのタスクに付けた作業ログの合計。画面を開いた時点）で、予定が配分を超えると赤。変えたマスだけをノートに書き換えます',
		});

		const wrap = contentEl.createDiv({ cls: 'pm-allocation-matrix-wrap' });
		const table = wrap.createEl('table', { cls: 'pm-table pm-table-edit pm-allocation-matrix' });
		const head = table.createEl('thead').createEl('tr');
		head.createEl('th', { text: 'メンバー', cls: 'pm-allocation-matrix-member' });
		for (const month of matrix.months) head.createEl('th', { text: month });
		head.createEl('th');

		const body = table.createEl('tbody');
		for (const member of matrix.members) {
			const tr = body.createEl('tr');
			tr.createEl('td', { text: this.name(member), cls: 'pm-allocation-matrix-member' });
			for (const month of matrix.months) this.cell(tr.createEl('td'), member, month);
			new ButtonComponent(tr.createEl('td'))
				.setIcon('trash-2')
				.setTooltip('このメンバーの配分をすべて消す')
				.onClick(() => {
					matrix.members.splice(matrix.members.indexOf(member), 1);
					for (const month of matrix.months) matrix.cells.delete(matrixKey(member, month));
					this.render();
				});
		}
		if (matrix.members.length === 0 || matrix.months.length === 0) {
			body.createEl('tr').createEl('td', {
				cls: 'pm-view-empty',
				text: 'メンバーと月を追加してください',
				attr: { colspan: matrix.months.length + 2 },
			});
		}

		this.addControls(contentEl);
		this.drawOthers(contentEl);
		this.footer(() => void this.save());
	}

	/** 1マス。配分の入力欄と、参考の予定・実績 */
	private cell(td: HTMLElement, member: NoteId, month: YearMonth): void {
		const key = matrixKey(member, month);
		const ref = td.createDiv({ cls: 'pm-allocation-matrix-ref' });
		const { planned, actual } = this.options.hoursOf(month, member);
		const refresh = () => {
			ref.empty();
			ref.removeClass('pm-text-error');
			ref.removeAttribute('aria-label');
			if (planned === 0 && actual === 0) return;
			ref.setText(`予定${hoursText(planned)} / 実績${hoursText(actual)}`);
			const allocated = parseHours(this.matrix.cells.get(key) ?? '');
			if (allocated !== null && planned > allocated) {
				ref.addClass('pm-text-error');
				ref.setAttr('aria-label', `予定 ${hoursText(planned)}h が配分 ${hoursText(allocated)}h を超えています`);
			}
		};
		hoursInput(new TextComponent(td))
			.setValue(this.matrix.cells.get(key) ?? '')
			.onChange((v) => {
				this.matrix.cells.set(key, v);
				refresh();
			});
		// 入力欄を参考の上に置く
		td.appendChild(ref);
		refresh();
	}

	/** メンバー・月を足す欄 */
	private addControls(el: HTMLElement): void {
		const { matrix } = this;
		const candidates = this.options.members.filter((m) => m.active && !matrix.members.includes(m.id)).sort((a, b) => compareJa(a.title, b.title));
		let picked = '';
		new Setting(el)
			.setName('メンバーを追加')
			.addDropdown((d: DropdownComponent) => {
				d.addOption('', '選んでください');
				for (const m of candidates) d.addOption(m.id, m.title);
				d.onChange((v) => (picked = v));
			})
			.addButton((b) =>
				b.setButtonText('＋メンバー').onClick(() => {
					if (picked === '') return;
					matrix.members.push(picked);
					this.render();
				}),
			);
		new Setting(el)
			.setName('月を追加')
			.addText((t) => {
				t.inputEl.type = 'month';
				t.setValue(this.newMonth).onChange((v) => (this.newMonth = v));
			})
			.addButton((b) =>
				b.setButtonText('＋月').onClick(() => {
					const month = this.newMonth.trim();
					if (!isYearMonth(month) || matrix.months.includes(month)) return;
					matrix.months.push(month);
					matrix.months.sort();
					this.newMonth = '';
					this.render();
				}),
			);
	}

	/** マス目に置けない行（月かメンバーが読めない）。消すことだけできる */
	private drawOthers(el: HTMLElement): void {
		const { others } = this.matrix;
		if (others.length === 0) return;
		el.createDiv({ cls: 'pm-note', text: '月かメンバーが読めないためマス目に置けない行です。消してから、マスに入れ直してください' });
		const table = el.createEl('table', { cls: 'pm-table pm-table-edit' });
		const head = table.createEl('thead').createEl('tr');
		for (const label of ['月', 'メンバー', '配分(h)', '']) head.createEl('th', { text: label });
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
