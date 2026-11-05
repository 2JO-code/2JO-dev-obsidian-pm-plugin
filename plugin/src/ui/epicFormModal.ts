import { type App, Setting, type TFile } from 'obsidian';
import { epicFormToUpdate, type EpicForm } from '../forms/epicForm';
import type { Member, NoteId, Project, StatusDef } from '../model';
import type { ProjectDisplayName } from '../settings';
import { writeFrontmatter } from '../write/frontmatterFile';
import { FormModal } from './formModal';
import { dateSetting, errorBox, memberSetting, projectOptions, statusSetting } from './formParts';

export interface EpicFormModalOptions {
	file: TFile;
	form: EpicForm;
	projects: Project[];
	members: Member[];
	statuses: StatusDef[];
	displayName: ProjectDisplayName;
	/** タスクかマイルストーンの連動があり、プロジェクトを変えられないときの元のプロジェクト */
	fixedProject?: NoteId;
}

/** エピックの入力補助フォーム（設計書 4.5） */
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
		this.render();
	}

	protected render(): void {
		const { contentEl, form, options } = this;
		contentEl.empty();
		contentEl.addClass('pm-task-form');
		errorBox(contentEl, this.errors);

		new Setting(contentEl).setName('タイトル').addText((t) => t.setValue(form.title).onChange((v) => (form.title = v)));
		new Setting(contentEl)
			.setName('プロジェクト')
			.setDesc(options.fixedProject !== undefined ? 'タスクかマイルストーンの連動があるため変えられません' : '')
			.addDropdown((d) => {
				projectOptions(d, options.projects, options.displayName, form.project);
				d.setDisabled(options.fixedProject !== undefined).onChange((v) => (form.project = v));
			});
		statusSetting(contentEl, options.statuses, form.status, (v) => (form.status = v));
		memberSetting(contentEl, '担当者', '任意。1人', options.members, form.owner, (v) => (form.owner = v));

		new Setting(contentEl)
			.setName('WBS番号')
			.setDesc('任意。例：1.2')
			.addText((t) => t.setValue(form.wbs).onChange((v) => (form.wbs = v)));
		dateSetting(contentEl, '開始日', '任意。表示用（計算上の日程はタスクから求めます）', form.start, (v) => (form.start = v));
		dateSetting(contentEl, '完了予定日', '任意。マイルストーンと連動できます', form.due, (v) => (form.due = v));
		new Setting(contentEl)
			.setName('インプット')
			.setDesc('任意。1行に1つ')
			.addTextArea((t) => t.setValue(form.inputs).onChange((v) => (form.inputs = v)));
		new Setting(contentEl)
			.setName('アウトプット')
			.setDesc('任意。1行に1つ')
			.addTextArea((t) => t.setValue(form.outputs).onChange((v) => (form.outputs = v)));

		this.footer(() => void this.save());
	}

	private async save(): Promise<void> {
		const { options } = this;
		await this.submit(
			() => epicFormToUpdate(this.form, options.statuses, options.fixedProject),
			(result) => writeFrontmatter(this.app, options.file, 'epic', result.update),
		);
	}
}
