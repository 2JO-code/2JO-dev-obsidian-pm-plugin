import { type App, Setting, type TFile } from 'obsidian';
import { projectFormToUpdate, type ProjectForm } from '../forms/projectForm';
import type { Member, StatusDef } from '../model';
import { writeFrontmatter } from '../write/frontmatterFile';
import { FormModal } from './formModal';
import { dateSetting, errorBox, memberSetting, statusSetting } from './formParts';

export interface ProjectFormModalOptions {
	file: TFile;
	form: ProjectForm;
	members: readonly Member[];
	statuses: StatusDef[];
}

/** プロジェクトの入力補助フォーム（設計書 4.5） */
export class ProjectFormModal extends FormModal {
	private readonly form: ProjectForm;

	constructor(
		app: App,
		private readonly options: ProjectFormModalOptions,
	) {
		super(app);
		this.form = { ...options.form };
	}

	onOpen(): void {
		this.setTitle('プロジェクトを編集');
		this.render();
	}

	protected render(): void {
		const { contentEl, form, options } = this;
		contentEl.empty();
		contentEl.addClass('pm-task-form');
		errorBox(contentEl, this.errors);

		new Setting(contentEl).setName('簡易プロジェクト名').addText((t) => t.setValue(form.title).onChange((v) => (form.title = v)));
		new Setting(contentEl).setName('正式案件名').addText((t) => t.setValue(form.officialName).onChange((v) => (form.officialName = v)));
		new Setting(contentEl).setName('案件ID').addText((t) => t.setValue(form.caseId).onChange((v) => (form.caseId = v)));
		statusSetting(contentEl, options.statuses, form.status, (v) => (form.status = v));
		dateSetting(contentEl, '開始日', '任意', form.start, (v) => (form.start = v));
		dateSetting(contentEl, '期限日', '任意', form.due, (v) => (form.due = v));
		memberSetting(contentEl, '責任者', '任意。1人', options.members, form.manager, (v) => (form.manager = v));

		this.footer(
			() => void this.save(),
			new Setting(contentEl).setDesc('マイルストーン・工数配分は、プロジェクト状況のそれぞれの「編集」から変えます'),
		);
	}

	private async save(): Promise<void> {
		const { options } = this;
		await this.submit(
			() => projectFormToUpdate(this.form, options.statuses),
			(result) => writeFrontmatter(this.app, options.file, 'project', result.update),
		);
	}
}
