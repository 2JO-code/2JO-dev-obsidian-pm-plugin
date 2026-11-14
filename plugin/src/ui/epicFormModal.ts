import { type App, DropdownComponent, TextAreaComponent, TextComponent } from 'obsidian';
import { epicFormToUpdate, type EpicForm } from '../forms/epicForm';
import type { Member, NoteId, Project, StatusDef } from '../model';
import type { WorkCalendar } from '../calc/workdays';
import type { ProjectDisplayName } from '../settings';
import { FormModal, type FormNote } from './formModal';
import { dateInput, errorBox, formColumns, formField, formSection, memberOptions, projectOptions, statusOptions } from './formParts';

export interface EpicFormModalOptions {
	note: FormNote;
	form: EpicForm;
	projects: readonly Project[];
	members: readonly Member[];
	statuses: StatusDef[];
	displayName: ProjectDisplayName;
	/** 期限日が休日かを確かめる */
	calendar: WorkCalendar;
	/** タスクかマイルストーンの連動があり、プロジェクトを変えられないときの元のプロジェクト */
	fixedProject?: NoteId;
}

/** エピックの入力補助フォーム（設計書 4.5, 4.12） */
export class EpicFormModal extends FormModal {
	private readonly form: EpicForm;

	constructor(
		app: App,
		private readonly options: EpicFormModalOptions,
	) {
		super(app);
		this.form = { ...options.form };
	}

	onOpen(): void {
		this.setTitle('エピックを編集');
		this.modalEl.addClass('pm-form-modal');
		this.render();
	}

	protected render(): void {
		const { contentEl, form, options } = this;
		contentEl.empty();
		contentEl.addClass('pm-task-form');
		errorBox(contentEl, this.errors);

		// まとまりを左右の列に分け、縦に収める（設計書 4.12）
		const [left, right] = formColumns(contentEl);

		const fixed = options.fixedProject !== undefined;
		const belong = formSection(left, '所属', 2);
		const project = new DropdownComponent(
			formField(belong, 'プロジェクト', fixed ? { hint: 'タスクかマイルストーンの連動があるため変えられません' } : {}),
		);
		projectOptions(project, options.projects, options.displayName, form.project);
		project.setDisabled(fixed).onChange((v) => (form.project = v));
		new TextComponent(formField(belong, 'WBS番号（任意）', { hint: '例：1.2' })).setValue(form.wbs).onChange((v) => (form.wbs = v));

		const title = formSection(left, '', 1);
		new TextComponent(formField(title, 'タイトル')).setValue(form.title).onChange((v) => (form.title = v));

		const state = formSection(left, '担当と状態', 2);
		memberOptions(new DropdownComponent(formField(state, '担当者（任意）', { hint: '1人' })), options.members, form.owner, (v) => (form.owner = v));
		statusOptions(new DropdownComponent(formField(state, 'ステータス')), options.statuses, form.status).onChange((v) => (form.status = v));

		const schedule = formSection(right, '日程', 2);
		dateInput(formField(schedule, '開始日（任意）', { hint: '表示用。見込みの日程はタスクから求めます' }), form.start, (v) => (form.start = v));
		dateInput(formField(schedule, '期限日（任意）', { hint: 'マイルストーンと連動できます' }), form.due, (v) => (form.due = v), options.calendar);

		const io = formSection(right, 'インプット・アウトプット', 2);
		this.listInput(formField(io, 'インプット（任意）', { hint: '1行に1つ' }), form.inputs, (v) => (form.inputs = v));
		this.listInput(formField(io, 'アウトプット（任意）', { hint: '1行に1つ' }), form.outputs, (v) => (form.outputs = v));

		this.footer(() => void this.save());
	}

	/** 1行に1つの複数行の欄 */
	private listInput(el: HTMLElement, value: string, onChange: (v: string) => void): void {
		new TextAreaComponent(el).setValue(value).onChange(onChange).inputEl.addClass('pm-description-input');
	}

	private async save(): Promise<void> {
		const { options } = this;
		await this.submitNote(
			options.note,
			() => epicFormToUpdate(this.form, options.statuses, options.fixedProject),
			(result) => result.update,
		);
	}
}
