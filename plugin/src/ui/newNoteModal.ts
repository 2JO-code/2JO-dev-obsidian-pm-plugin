import { type App, Modal, Setting } from 'obsidian';
import type { IdKind } from '../id';
import type { NoteId, Project } from '../model';
import type { NewNoteInput } from '../commands/newNote';
import type { ProjectDisplayName } from '../settings';
import { projectOptions } from './formParts';
import { notifyError } from './notify';
import { SaveGuard } from './saveGuard';

/** この画面で作る種類。タスクはタスクのフォームで作る（設計書 4.4） */
type NewNoteKind = Exclude<IdKind, 'task'>;

const TITLES: Record<NewNoteKind, string> = {
	project: '新しいプロジェクト',
	epic: '新しいエピック',
	user: '新しいメンバー',
};

export interface NewNoteModalOptions {
	kind: NewNoteKind;
	projects: readonly Project[];
	displayName: ProjectDisplayName;
	/** 最初から選んでおくプロジェクト（ビューから作るとき） */
	initialProject?: NoteId;
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
	private readonly guard = new SaveGuard();

	constructor(
		app: App,
		private readonly options: NewNoteModalOptions,
	) {
		super(app);
		// 選択肢に無いもの（アーカイブ内など）は選ばない
		const project = options.initialProject;
		this.project = project && options.projects.some((p) => p.id === project) ? project : '';
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

		if (options.kind === 'epic') {
			new Setting(contentEl).setName('プロジェクト').addDropdown((dropdown) => {
				projectOptions(dropdown, options.projects, options.displayName, this.project);
				dropdown.onChange((v) => (this.project = v));
			});
			new Setting(contentEl)
				.setName('WBS番号')
				.setDesc('任意。例：1.2')
				.addText((text) => text.onChange((v) => (this.wbs = v)));
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

	private async submit(): Promise<void> {
		if (this.guard.busy) return;
		const { kind } = this.options;
		const input: NewNoteInput =
			kind === 'project'
				? { kind, title: this.title, caseId: this.caseId, officialName: this.officialName }
				: kind === 'epic'
					? { kind, title: this.title, project: this.project, wbs: this.wbs }
					: { kind, title: this.title, familyName: this.familyName, givenName: this.givenName };
		try {
			await this.guard.run(() => this.options.onSubmit(input));
			this.close();
		} catch (e) {
			notifyError(e);
		}
	}
}
