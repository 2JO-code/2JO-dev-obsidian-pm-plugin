import { type App, Setting, type TFile } from 'obsidian';
import { memberFormToUpdate, type MemberForm } from '../forms/memberForm';
import { writeFrontmatter } from '../write/frontmatterFile';
import { FormModal } from './formModal';
import { errorBox } from './formParts';

export interface MemberFormModalOptions {
	file: TFile;
	form: MemberForm;
}

/** メンバーの入力補助フォーム（設計書 4.5） */
export class MemberFormModal extends FormModal {
	private readonly form: MemberForm;

	constructor(
		app: App,
		private readonly options: MemberFormModalOptions,
	) {
		super(app);
		this.form = { ...options.form };
	}

	onOpen(): void {
		this.setTitle('メンバーを編集');
		this.render();
	}

	protected render(): void {
		const { contentEl, form } = this;
		contentEl.empty();
		contentEl.addClass('pm-task-form');
		errorBox(contentEl, this.errors);

		new Setting(contentEl).setName('氏名').addText((t) => t.setValue(form.title).onChange((v) => (form.title = v)));
		new Setting(contentEl)
			.setName('1日の通常稼働時間(h)')
			.setDesc('負荷率の基準。0.25刻み（例：8）')
			.addText((t) => t.setValue(form.dailyHours).onChange((v) => (form.dailyHours = v)));
		new Setting(contentEl)
			.setName('負荷許容率(%)')
			.setDesc('これを超えると負荷警告（例：120）')
			.addText((t) => t.setValue(form.loadLimitPct).onChange((v) => (form.loadLimitPct = v)));
		new Setting(contentEl)
			.setName('在籍')
			.setDesc('異動・退職したら外す。担当者の候補に出なくなります')
			.addToggle((t) => t.setValue(form.active).onChange((v) => (form.active = v)));

		this.footer(() => void this.save(), new Setting(contentEl).setDesc('個人休日は、メンバー状況の「個人休日を編集」から変えます'));
	}

	private async save(): Promise<void> {
		const { options } = this;
		await this.submit(
			() => memberFormToUpdate(this.form),
			(result) => writeFrontmatter(this.app, options.file, 'user', result.update),
		);
	}
}
