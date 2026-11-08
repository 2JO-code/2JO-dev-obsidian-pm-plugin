import { type App, Modal, Setting } from 'obsidian';
import type { IdKind } from '../id';
import type { Epic, NoteId, Project } from '../model';
import type { NewNoteInput } from '../commands/newNote';
import type { ProjectDisplayName } from '../settings';
import { epicOptions, projectOptions } from './formParts';
import { notifyError } from './notify';

const TITLES: Record<IdKind, string> = {
	project: '新しいプロジェクト',
	epic: '新しいエピック',
	task: '新しいタスク',
	user: '新しいメンバー',
};

export interface NewNoteModalOptions {
	kind: IdKind;
	projects: readonly Project[];
	epics: readonly Epic[];
	displayName: ProjectDisplayName;
	/** 最初から選んでおくプロジェクト・エピック（ビューから作るとき） */
	initial?: { project?: NoteId; epic?: NoteId };
	/** 入力に誤りがあればエラーを投げる（画面は閉じない） */
	onSubmit: (input: NewNoteInput) => Promise<void>;
}

/** ノート作成の入力画面（設計書 4.4） */
export class NewNoteModal extends Modal {
	/** タイトル。メンバーのときは氏名 */
	private title = '';
	private familyName = '';
	private givenName = '';
	private caseId = '';
	private officialName = '';
	private wbs = '';
	private project: NoteId = '';
	private epic: NoteId = '';
	private epicSetting: Setting | null = null;
	private saving = false;

	constructor(
		app: App,
		private readonly options: NewNoteModalOptions,
	) {
		super(app);
		// 選択肢に無いもの（アーカイブ内など）は選ばない
		const project = options.initial?.project;
		const epic = options.initial?.epic;
		this.project = project && options.projects.some((p) => p.id === project) ? project : '';
		this.epic = epic && options.epics.some((e) => e.id === epic && e.project === this.project) ? epic : '';
	}

	onOpen(): void {
		const { contentEl, options } = this;
		this.setTitle(TITLES[options.kind]);

		// メンバーは氏名のあとに姓・名を入れる（設計書 4.5）
		new Setting(contentEl).setName(options.kind === 'user' ? '氏名' : options.kind === 'project' ? '簡易プロジェクト名' : 'タイトル').addText((text) => {
			text.onChange((v) => (this.title = v));
			window.setTimeout(() => text.inputEl.focus(), 0);
		});
		if (options.kind === 'user') {
			new Setting(contentEl)
				.setName('姓')
				.setDesc('ガントチャートの担当者に出します')
				.addText((text) => text.onChange((v) => (this.familyName = v)));
			new Setting(contentEl).setName('名').addText((text) => text.onChange((v) => (this.givenName = v)));
		}

		if (options.kind === 'project') {
			new Setting(contentEl).setName('案件ID').addText((text) => text.onChange((v) => (this.caseId = v)));
			new Setting(contentEl).setName('正式案件名').addText((text) => text.onChange((v) => (this.officialName = v)));
		}

		if (options.kind === 'epic' || options.kind === 'task') {
			new Setting(contentEl).setName('プロジェクト').addDropdown((dropdown) => {
				projectOptions(dropdown, options.projects, options.displayName, this.project);
				dropdown.onChange((v) => {
					this.project = v;
					this.epic = '';
					this.renderEpicChoices();
				});
			});
		}

		if (options.kind === 'epic') {
			new Setting(contentEl)
				.setName('WBS番号')
				.setDesc('任意。例：1.2')
				.addText((text) => text.onChange((v) => (this.wbs = v)));
		}

		if (options.kind === 'task') {
			this.epicSetting = new Setting(contentEl).setName('エピック').setDesc('任意');
			this.renderEpicChoices();
		}

		new Setting(contentEl).addButton((button) =>
			button
				.setButtonText('作成')
				.setCta()
				.onClick(() => void this.submit()),
		);
		contentEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.isComposing && e.target instanceof HTMLInputElement) void this.submit();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** 選んだプロジェクトのエピックを WBS 番号順に出す */
	private renderEpicChoices(): void {
		const setting = this.epicSetting;
		if (!setting) return;
		setting.controlEl.empty();
		setting.addDropdown((dropdown) => {
			epicOptions(dropdown, this.options.epics, this.project, this.epic, this.project ? 'なし' : '先にプロジェクトを選んでください');
			dropdown.setDisabled(!this.project).onChange((v) => (this.epic = v));
		});
	}

	private async submit(): Promise<void> {
		// 作成中の2回目（Enter の連打など）は受け付けない（設計書 4.6）
		if (this.saving) return;
		const { kind } = this.options;
		const input: NewNoteInput =
			kind === 'project'
				? { kind, title: this.title, caseId: this.caseId, officialName: this.officialName }
				: kind === 'epic'
					? { kind, title: this.title, project: this.project, wbs: this.wbs }
					: kind === 'task'
						? { kind, title: this.title, project: this.project, ...(this.epic ? { epic: this.epic } : {}) }
						: { kind, title: this.title, familyName: this.familyName, givenName: this.givenName };
		this.saving = true;
		try {
			await this.options.onSubmit(input);
			this.close();
		} catch (e) {
			notifyError(e);
		} finally {
			this.saving = false;
		}
	}
}
