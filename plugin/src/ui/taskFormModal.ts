import { type App, Setting, type TFile } from 'obsidian';
import { compareJa } from '../calc/compare';
import { nextTaskWbsIn } from '../calc/wbsOrder';
import { missingLabel } from '../forms/formValues';
import { taskFormToUpdate, type TaskForm } from '../forms/taskForm';
import type { Epic, Member, NoteId, NoteType, Project, StatusDef, Task } from '../model';
import type { ProjectDisplayName } from '../settings';
import { writeFrontmatter } from '../write/frontmatterFile';
import { FormModal } from './formModal';
import { dateSetting, epicOptions, errorBox, hoursInput, projectOptions, statusSetting } from './formParts';

export interface TaskFormModalOptions {
	file: TFile;
	taskId: NoteId;
	form: TaskForm;
	projects: Project[];
	epics: Epic[];
	tasks: Task[];
	/** 番号を付けるときに見る全タスク（アーカイブ内も含む） */
	numbered: Task[];
	members: Member[];
	statuses: StatusDef[];
	displayName: ProjectDisplayName;
	/** チェックリストの件数（例：1/3）。無ければ空 */
	checklist: string;
	editChecklist: () => void;
}

const byTitle = (a: { title: string }, b: { title: string }) => compareJa(a.title, b.title);

/** タスクの入力補助フォーム（設計書 4.5） */
export class TaskFormModal extends FormModal {
	private readonly form: TaskForm;

	constructor(
		app: App,
		private readonly options: TaskFormModalOptions,
	) {
		super(app);
		this.form = { ...options.form, assignees: [...options.form.assignees], dependsOn: [...options.form.dependsOn] };
	}

	onOpen(): void {
		this.setTitle('タスクを編集');
		this.render();
	}

	/** 中身を描き直す（選択肢が変わるとき） */
	protected render(): void {
		const { contentEl, form, options } = this;
		contentEl.empty();
		contentEl.addClass('pm-task-form');

		errorBox(contentEl, this.errors);

		new Setting(contentEl).setName('タイトル').addText((t) => t.setValue(form.title).onChange((v) => (form.title = v)));

		new Setting(contentEl).setName('プロジェクト').addDropdown((d) => {
			projectOptions(d, options.projects, options.displayName, form.project);
			d.onChange((v) => {
				form.project = v;
				// 別プロジェクトのエピックは外す
				if (!options.epics.some((e) => e.id === form.epic && e.project === v)) form.epic = '';
				this.renumber();
				this.render();
			});
		});

		new Setting(contentEl).setName('エピック').setDesc('任意').addDropdown((d) => {
			epicOptions(d, options.epics, form.project, form.epic, form.project ? 'なし' : '先にプロジェクトを選んでください');
			d.setDisabled(!form.project).onChange((v) => {
				form.epic = v;
				this.renumber();
				this.render();
			});
		});

		this.numberSetting(
			'WBS番号',
			'エピック内の連番（1以上の整数）。ビューの行のドラッグでも入れ替えられます',
			form.wbs,
			(v) => (form.wbs = v),
			1,
		);

		statusSetting(contentEl, options.statuses, form.status, (v) => (form.status = v));

		this.renderMultiSelect(
			'担当者',
			'user',
			form.assignees,
			// 追加できるのは在籍者だけ
			[...options.members].sort(byTitle).map((m) => ({ id: m.id, label: m.title, selectable: m.active, note: m.active ? '' : '（在籍していません）' })),
		);

		new Setting(contentEl)
			.setName('見積工数(h)')
			.setDesc('タスク全体の見積。0.25刻み')
			.addText((t) => hoursInput(t).setValue(form.estimate).onChange((v) => (form.estimate = v)));

		this.renderMultiSelect(
			'先行タスク',
			'task',
			form.dependsOn,
			// 追加できるのは同じプロジェクトのタスクだけ
			[...options.tasks]
				.filter((t) => t.id !== options.taskId)
				.sort(byTitle)
				.map((t) => ({ id: t.id, label: t.title, selectable: t.project === form.project, note: '' })),
		);

		this.numberSetting('相対日数', '先行タスクの終了から何稼働日後に始めるか', form.lagDays, (v) => (form.lagDays = v));
		dateSetting(contentEl, '開始日', '先行タスクがないときに使う', form.start, (v) => (form.start = v));
		this.numberSetting('所要日数', '稼働日数', form.durationDays, (v) => (form.durationDays = v));
		dateSetting(contentEl, '期限日', '固定の期限。計算上の日程がこれを超えると警告します', form.due, (v) => (form.due = v));

		// チェックリストは本文にあるので別の画面で編集する（設計書 4.10）
		new Setting(contentEl)
			.setName('チェックリスト')
			.setDesc(options.checklist ? `完了 ${options.checklist}。別の画面で編集します（このフォームの入力はそのまま）` : '項目はありません。別の画面で編集します')
			.addButton((b) => b.setButtonText('チェックリストを編集').onClick(options.editChecklist));

		this.footer(() => void this.save());
	}

	/** 複数選択。selectable が false の候補は追加できないが、選択済みなら残す */
	private renderMultiSelect(
		name: string,
		type: NoteType,
		selected: string[],
		candidates: { id: NoteId; label: string; selectable: boolean; note: string }[],
	): void {
		const setting = new Setting(this.contentEl).setName(name);
		const chips = setting.descEl.createDiv({ cls: 'pm-chips' });
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
		setting.addDropdown((d) => {
			d.addOption('', '追加…');
			for (const c of candidates) if (c.selectable && !selected.includes(c.id)) d.addOption(c.id, c.label);
			d.onChange((v) => {
				if (v) selected.push(v);
				this.render();
			});
		});
	}

	private numberSetting(name: string, desc: string, value: string, onChange: (v: string) => void, min = 0): void {
		new Setting(this.contentEl)
			.setName(name)
			.setDesc(desc)
			.addText((t) => {
				t.inputEl.type = 'number';
				t.inputEl.step = '1';
				t.inputEl.min = String(min);
				t.setValue(value).onChange(onChange);
			});
	}

	/** 移った先のプロジェクト・エピックの続きの番号にする（設計書 11.17） */
	private renumber(): void {
		const { form, options } = this;
		form.wbs = nextTaskWbsIn(options.numbered, form.project, form.epic, options.taskId);
	}

	private async save(): Promise<void> {
		const { options } = this;
		await this.submit(
			() => taskFormToUpdate(this.form, options.statuses, options.taskId),
			(result) => writeFrontmatter(this.app, options.file, 'task', result.update),
		);
	}
}
