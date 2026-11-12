import { type App, Setting } from 'obsidian';
import { memberFormToUpdate, type MemberForm } from '../forms/memberForm';
import { FormModal, type FormNote } from './formModal';
import { errorBox } from './formParts';

export interface MemberFormModalOptions {
	note: FormNote;
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

		// 氏名・姓・名はそれぞれ入力する（設計書 4.5）
		new Setting(contentEl).setName('氏名').addText((t) => t.setValue(form.title).onChange((v) => (form.title = v)));
		new Setting(contentEl)
			.setName('姓')
			.setDesc('ガントチャートの担当者に出します')
			.addText((t) => t.setValue(form.familyName).onChange((v) => (form.familyName = v)));
		new Setting(contentEl).setName('名').addText((t) => t.setValue(form.givenName).onChange((v) => (form.givenName = v)));
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
		await this.submitNote(
			options.note,
			() => memberFormToUpdate(this.form),
			(result) => result.update,
		);
	}
}
