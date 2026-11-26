import { type App, DropdownComponent, Setting, TextComponent } from 'obsidian';
import { sprintFormToUpdate, type SprintForm } from '../forms/sprintForm';
import type { NoteId, Project, Sprint } from '../model';
import type { ProjectDisplayName } from '../settings';
import type { FrontmatterUpdate } from '../write/frontmatter';
import { FormModal, type FormNote } from './formModal';
import { dateInput, errorBox, formField, formSection, projectOptions } from './formParts';

/** 今あるスプリントを編集するとき */
export interface SprintFormEdit {
	mode: 'edit';
	note: FormNote;
	sprintId: NoteId;
	/** スプリントを確かめてから消す。消したら true */
	deleteSprint: () => Promise<boolean>;
}

/** 新しいスプリントを作るとき。「作成」で初めてノートを作る */
export interface SprintFormCreate {
	mode: 'create';
	create: (update: FrontmatterUpdate) => Promise<void>;
	/** プロジェクトを選んだときの、名前と期間の初期値 */
	suggest: (project: NoteId) => SprintForm;
}

export interface SprintFormModalOptions {
	target: SprintFormEdit | SprintFormCreate;
	form: SprintForm;
	projects: readonly Project[];
	/** すべてのスプリント（期間の重なりを確かめる） */
	sprints: readonly Sprint[];
	displayName: ProjectDisplayName;
	/** タスクが入っていて、プロジェクトを変えられないときの元のプロジェクト */
	fixedProject?: NoteId;
}

/** スプリントの入力補助フォーム（設計書 4.5） */
export class SprintFormModal extends FormModal {
	private readonly form: SprintForm;
	private focused = false;

	constructor(
		app: App,
		private readonly options: SprintFormModalOptions,
	) {
		super(app);
		this.form = { ...options.form };
	}

	onOpen(): void {
		this.setTitle(this.options.target.mode === 'edit' ? 'スプリントを編集' : '新しいスプリント');
		this.render();
	}

	protected render(): void {
		const { contentEl, form, options } = this;
		contentEl.empty();
		contentEl.addClass('pm-task-form');
		errorBox(contentEl, this.errors);

		const fixed = options.fixedProject !== undefined;
		const grid = formSection(contentEl, '', 2);
		const project = new DropdownComponent(formField(grid, 'プロジェクト', fixed ? { hint: 'タスクが入っているため変えられません' } : {}));
		projectOptions(project, options.projects, options.displayName, form.project);
		project.setDisabled(fixed).onChange((v) => {
			const { target } = options;
			// 作るときは、名前と期間をそのプロジェクトの続きにする（手で変えた欄はそのまま）
			if (target.mode === 'create') {
				const before = target.suggest(form.project);
				const next = target.suggest(v);
				if (form.title === before.title) form.title = next.title;
				if (form.start === before.start) form.start = next.start;
				if (form.end === before.end) form.end = next.end;
			}
			form.project = v;
			this.render();
		});
		const title = new TextComponent(formField(grid, 'スプリント名')).setValue(form.title).onChange((v) => (form.title = v));
		if (options.target.mode === 'create' && !this.focused) {
			this.focused = true;
			window.setTimeout(() => title.inputEl.select(), 0);
		}
		dateInput(formField(grid, '開始日'), form.start, (v) => (form.start = v));
		dateInput(formField(grid, '終了日', { hint: '最終日を含みます' }), form.end, (v) => (form.end = v));
		new TextComponent(formField(grid, 'ゴール（任意）', { full: true, hint: 'このスプリントで目指すこと' }))
			.setValue(form.goal)
			.onChange((v) => (form.goal = v));

		const { target } = options;
		if (target.mode === 'create') {
			this.footer(() => void this.create(target), undefined, '作成');
			return;
		}
		const buttons = new Setting(contentEl);
		buttons.addButton((b) =>
			b
				.setButtonText('スプリントを削除')
				.setWarning()
				.onClick(() => void this.remove(target)),
		);
		this.footer(() => void this.save(target), buttons);
	}

	/** 同じプロジェクトのほかのスプリント */
	private others(): Sprint[] {
		const { target, sprints } = this.options;
		const self = target.mode === 'edit' ? target.sprintId : '';
		return sprints.filter((s) => s.id !== self);
	}

	private async create(target: SprintFormCreate): Promise<void> {
		await this.submit(
			() => sprintFormToUpdate(this.form, this.others()),
			(result) => target.create(result.update),
		);
	}

	private async save(target: SprintFormEdit): Promise<void> {
		await this.submitNote(
			target.note,
			() => sprintFormToUpdate(this.form, this.others(), this.options.fixedProject),
			(result) => result.update,
		);
	}

	private async remove(target: SprintFormEdit): Promise<void> {
		if (await target.deleteSprint()) this.close();
	}
}
