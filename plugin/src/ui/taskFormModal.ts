import { missingLabel } from '../calc/format';
import { type App, ButtonComponent, DropdownComponent, TextAreaComponent, TextComponent } from 'obsidian';
import { compareJa } from '../calc/compare';
import type { WorkCalendar } from '../calc/workdays';
import { nextTaskWbsIn } from '../calc/wbsOrder';
import type { ChecklistRow } from '../forms/checklist';
import { taskFormToUpdate, type TaskForm } from '../forms/taskForm';
import { DESCRIPTION_KEY } from '../forms/noteChanges';
import { descriptionErrors, normalizeDescription } from '../forms/taskDescription';
import { previewTaskSchedule, type SchedulePreview } from '../forms/taskSchedulePreview';
import type { Epic, IsoDate, Member, NoteId, NoteType, Project, StatusDef, Task } from '../model';
import type { ProjectDisplayName } from '../settings';
import { FormModal, type FormNote } from './formModal';
import { dateInput, epicOptions, errorBox, formColumns, formField, formSection, hoursInput, memberOptions, numberInput, projectOptions, statusOptions } from './formParts';

export interface TaskFormModalOptions {
	note: FormNote;
	taskId: NoteId;
	form: TaskForm;
	projects: readonly Project[];
	epics: readonly Epic[];
	tasks: readonly Task[];
	/** アーカイブ内も含む全タスク（番号付けと日程の計算に使う） */
	allTasks: readonly Task[];
	members: readonly Member[];
	statuses: StatusDef[];
	displayName: ProjectDisplayName;
	calendar: WorkCalendar;
	today: IsoDate;
	/** 開いたときの本文のチェックリスト（表示だけ。設計書 4.12） */
	checklist: ChecklistRow[];
	/** チェックリストの編集画面を開く。保存したら新しい項目を渡す */
	editChecklist: (onSaved: (rows: ChecklistRow[]) => void) => void;
	/** 開いたときの本文の説明（設計書 4.11） */
	description: string;
}

const byTitle = (a: { title: string }, b: { title: string }) => compareJa(a.title, b.title);

/** タスクの入力補助フォーム（設計書 4.5, 4.12） */
export class TaskFormModal extends FormModal {
	private readonly form: TaskForm;
	private description: string;
	private previewEl: HTMLElement | null = null;
	private planEl: HTMLElement | null = null;
	private checklist: ChecklistRow[];
	/** 開いたときに2人目以降だった担当者。保存すると外れる */
	private readonly droppedAssignees: NoteId[];

	constructor(
		app: App,
		private readonly options: TaskFormModalOptions,
	) {
		super(app);
		// 担当者は1人まで。2人以上入っていれば1人目を残す（設計書 4.5）
		const [first, ...rest] = [...new Set(options.form.assignees)];
		this.form = { ...options.form, assignees: first ? [first] : [], dependsOn: [...options.form.dependsOn] };
		this.droppedAssignees = rest;
		this.description = options.description;
		this.checklist = options.checklist;
	}

	onOpen(): void {
		this.setTitle('タスクを編集');
		this.modalEl.addClass('pm-form-modal');
		this.render();
	}

	/** 中身を描き直す（選択肢が変わるとき） */
	protected render(): void {
		const { contentEl, form, options } = this;
		contentEl.empty();
		contentEl.addClass('pm-task-form');

		errorBox(contentEl, this.errors);

		// まとまりを左右の列に分け、縦に収める（設計書 4.12）
		const [left, right] = formColumns(contentEl);

		const belong = formSection(left, '所属', 3);
		const project = new DropdownComponent(formField(belong, 'プロジェクト'));
		projectOptions(project, options.projects, options.displayName, form.project);
		project.onChange((v) => {
			form.project = v;
			// 別プロジェクトのエピックは外す
			if (!options.epics.some((e) => e.id === form.epic && e.project === v)) form.epic = '';
			this.renumber();
			this.render();
		});
		const epic = new DropdownComponent(formField(belong, 'エピック（任意）'));
		epicOptions(epic, options.epics, form.project, form.epic, form.project ? 'なし' : '先にプロジェクトを選んでください');
		epic.setDisabled(!form.project).onChange((v) => {
			form.epic = v;
			this.renumber();
			this.render();
		});
		numberInput(formField(belong, 'WBS番号', { hint: 'エピック内の連番' }), form.wbs, (v) => (form.wbs = v), 1);

		const title = formSection(left, '', 1);
		new TextComponent(formField(title, 'タイトル')).setValue(form.title).onChange((v) => (form.title = v));

		const state = formSection(left, '担当と状態', 2);
		const dropped = this.droppedAssignees.length > 0 ? { hint: `保存すると ${this.memberNames(this.droppedAssignees)} は外れます（1人まで）` } : {};
		memberOptions(new DropdownComponent(formField(state, '担当者（任意）', dropped)), options.members, form.assignees[0] ?? '', (v) => {
			form.assignees = v ? [v] : [];
		});
		this.statusDropdown(formField(state, 'ステータス'));

		this.renderSchedule(right);

		const notes = formSection(left, '説明・チェックリスト', 1);
		// 説明は本文のチェックリストより上の部分（設計書 4.11）
		new TextAreaComponent(formField(notes, '説明（任意）'))
			.setPlaceholder('作業の内容や注意など')
			.setValue(this.description)
			.onChange((v) => (this.description = v))
			.inputEl.addClass('pm-description-input');
		// チェックリストは本文にあるので別の画面で編集する（設計書 4.10）
		this.renderChecklist(notes);

		const effort = formSection(right, '工数', 2);
		hoursInput(new TextComponent(formField(effort, '見積工数(h)', { hint: 'タスク全体の見積。0.25刻み' })))
			.setValue(form.estimate)
			.onChange((v) => (form.estimate = v));

		this.footer(() => void this.save());
	}

	/** チェックリストの項目を表示だけする。変えるのは別の画面（設計書 4.10, 4.12） */
	private renderChecklist(grid: HTMLElement): void {
		const rows = this.checklist;
		const done = rows.filter((r) => r.done).length;
		const control = formField(grid, rows.length > 0 ? `チェックリスト（完了 ${done}/${rows.length}）` : 'チェックリスト');
		const list = control.createDiv({ cls: 'pm-form-checklist' });
		if (rows.length === 0) list.createDiv({ cls: 'pm-form-hint', text: '項目はありません' });
		for (const row of rows) {
			const item = list.createDiv({ cls: 'pm-form-checklist-item' });
			item.toggleClass('is-done', row.done);
			const check = item.createEl('input', { type: 'checkbox', cls: 'task-list-item-checkbox' });
			check.checked = row.done;
			check.disabled = true;
			item.createSpan({ text: row.text });
		}
		const footer = control.createDiv({ cls: 'pm-form-inline' });
		footer.createSpan({ cls: 'pm-form-hint', text: '別の画面で編集します（このフォームの入力はそのまま）' });
		new ButtonComponent(footer).setButtonText('チェックリストを編集').onClick(() =>
			this.options.editChecklist((saved) => {
				this.checklist = saved;
				this.render();
			}),
		);
	}

	/** 日程のまとまり。使わない方の欄は消さずに薄く出す（設計書 4.12） */
	private renderSchedule(el: HTMLElement): void {
		const { form, options } = this;
		const grid = formSection(el, '日程', 2);
		this.multiSelect(
			formField(grid, '先行タスク', { full: true }),
			'task',
			form.dependsOn,
			// 追加できるのは同じプロジェクトのタスクだけ
			[...options.tasks]
				.filter((t) => t.id !== options.taskId)
				.sort(byTitle)
				.map((t) => ({ id: t.id, label: t.title, selectable: t.project === form.project, note: '' })),
		);
		const onChange = (set: (v: string) => void) => (v: string) => {
			set(v);
			this.updatePreview();
		};
		dateInput(
			formField(grid, '開始日', { hint: '空なら期限日の1日だけ' }),
			form.start,
			onChange((v) => (form.start = v)),
		);
		dateInput(formField(grid, '期限日', { hint: '固定の期限。見込み終了日になる' }), form.due, onChange((v) => (form.due = v)));
		// 当初は最初の計画。見込みの日程と比べて遅れを出す（設計書 11.18）
		dateInput(formField(grid, '当初開始日', { hint: '最初の計画。遅れを測る基準' }), form.planStart, onChange((v) => (form.planStart = v)));
		dateInput(formField(grid, '当初終了日', { hint: '見込み終了日と比べます' }), form.planEnd, onChange((v) => (form.planEnd = v)));
		const preview = formField(grid, '見込みの日程（保存しません）', { full: true });
		this.previewEl = preview.createDiv({ cls: 'pm-schedule-preview' });
		this.planEl = preview.createDiv({ cls: 'pm-schedule-preview is-plan' });
		this.updatePreview();
	}

	/** 見込みの日程を入力中の値で出し直す */
	private updatePreview(): void {
		const { form, options, previewEl, planEl } = this;
		if (!previewEl) return;
		const self = options.allTasks.find((t) => t.id === options.taskId);
		const preview: SchedulePreview = self
			? previewTaskSchedule(form, self, options.statuses, options.calendar, options.today)
			: { kind: 'none', text: '計算できません' };
		previewEl.setText(preview.text);
		previewEl.toggleClass('is-late', preview.kind === 'late');
		previewEl.toggleClass('is-none', preview.kind === 'none');
		if (!planEl) return;
		// 当初との差は、当初終了日と見込みの日程があるときだけ出す
		planEl.toggle(!!preview.plan);
		planEl.setText(preview.plan?.text ?? '');
		planEl.toggleClass('is-behind', (preview.plan?.delay ?? 0) > 0);
	}

	/** ステータスのプルダウン（設計書 5.4） */
	private statusDropdown(el: HTMLElement): void {
		const { form, options } = this;
		statusOptions(new DropdownComponent(el), options.statuses, form.status).onChange((v) => {
			form.status = v;
			this.updatePreview();
		});
	}

	/** 複数選択。selectable が false の候補は追加できないが、選択済みなら残す */
	private multiSelect(
		el: HTMLElement,
		type: NoteType,
		selected: string[],
		candidates: { id: NoteId; label: string; selectable: boolean; note: string }[],
	): void {
		const chips = el.createDiv({ cls: 'pm-chips' });
		if (selected.length === 0) chips.createSpan({ cls: 'pm-chip-empty', text: 'なし' });
		for (const id of selected) {
			const c = candidates.find((x) => x.id === id);
			const chip = chips.createSpan({ cls: 'pm-mark is-plain pm-chip', text: c ? `${c.label}${c.note}` : missingLabel(id, type) });
			const remove = chip.createSpan({ cls: 'pm-chip-remove', text: '×' });
			remove.setAttr('aria-label', '外す');
			remove.addEventListener('click', () => {
				selected.splice(selected.indexOf(id), 1);
				this.render();
			});
		}
		const d = new DropdownComponent(el);
		d.addOption('', '追加…');
		for (const c of candidates) if (c.selectable && !selected.includes(c.id)) d.addOption(c.id, c.label);
		d.onChange((v) => {
			if (v) selected.push(v);
			this.render();
		});
	}

	/** メンバーの名前を「、」でつなぐ。見つからない ID は missingLabel */
	private memberNames(ids: readonly NoteId[]): string {
		return ids.map((id) => this.options.members.find((m) => m.id === id)?.title ?? missingLabel(id, 'user')).join('、');
	}

	/** 移った先のプロジェクト・エピックの続きの番号にする（設計書 11.17） */
	private renumber(): void {
		const { form, options } = this;
		form.wbs = nextTaskWbsIn(options.allTasks, form.project, form.epic, options.taskId);
	}

	private async save(): Promise<void> {
		const { options } = this;
		await this.submitNote(
			options.note,
			() => {
				const result = taskFormToUpdate(this.form, options.statuses, options.taskId);
				const dropped = this.droppedAssignees.length > 0 ? [`担当者は1人までのため、${this.memberNames(this.droppedAssignees)} を外しました`] : [];
				return { ...result, errors: [...result.errors, ...descriptionErrors(this.description)], warnings: [...result.warnings, ...dropped] };
			},
			(result) => ({ ...result.update, [DESCRIPTION_KEY]: normalizeDescription(this.description) }),
		);
	}
}
