import { type App, Modal, Setting } from 'obsidian';
import type { CopyDates, ProjectCopyInput } from '../commands/projectCopy';
import type { NoteId, Project } from '../model';
import type { ProjectDisplayName } from '../settings';
import { projectOptions } from './formParts';
import { notifyError } from './notify';

export interface CopyProjectModalOptions {
	/** 元にできるプロジェクト（アーカイブ内も含む） */
	projects: readonly Project[];
	displayName: ProjectDisplayName;
	/** 最初から選んでおくプロジェクト */
	initial?: NoteId;
	/** 元のプロジェクトのエピック・タスクの件数 */
	countOf: (project: NoteId) => { epics: number; tasks: number };
	/** 入力に誤りがあればエラーを投げる（画面は閉じない） */
	onSubmit: (source: NoteId, input: ProjectCopyInput) => Promise<void>;
}

/** 既存のプロジェクトを複製して新しいプロジェクトを作る画面（設計書 4.4） */
export class CopyProjectModal extends Modal {
	private source: NoteId;
	private title = '';
	private caseId = '';
	private officialName = '';
	private dateMode: CopyDates['mode'] = 'shift';
	private start = '';
	private countEl: HTMLElement | null = null;
	private startSetting: Setting | null = null;
	private saving = false;

	constructor(
		app: App,
		private readonly options: CopyProjectModalOptions,
	) {
		super(app);
		const initial = options.initial;
		this.source = initial && options.projects.some((p) => p.id === initial) ? initial : '';
	}

	onOpen(): void {
		const { contentEl, options } = this;
		this.setTitle('プロジェクトを複製して作成');
		contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: 'エピック・タスクの構成と番号、見積工数、先行タスク、説明とチェックリストを写します。担当者・工数配分・作業ログは写さず、ステータスは最初のものにします',
		});

		const sourceSetting = new Setting(contentEl).setName('元のプロジェクト').addDropdown((d) => {
			projectOptions(d, options.projects, options.displayName, this.source);
			d.onChange((v) => {
				this.source = v;
				this.renderCount();
			});
		});
		this.countEl = sourceSetting.descEl;
		this.renderCount();

		new Setting(contentEl).setName('簡易プロジェクト名').addText((t) => {
			t.onChange((v) => (this.title = v));
			window.setTimeout(() => t.inputEl.focus(), 0);
		});
		new Setting(contentEl).setName('案件ID').addText((t) => t.onChange((v) => (this.caseId = v)));
		new Setting(contentEl).setName('正式案件名').addText((t) => t.onChange((v) => (this.officialName = v)));

		new Setting(contentEl)
			.setName('日付')
			.setDesc('ずらすときは、元の開始日からの稼働日数を新しい開始日から数えます。マイルストーンも写します')
			.addDropdown((d) =>
				d
					.addOption('shift', '開始日に合わせてずらす')
					.addOption('clear', '空にする')
					.setValue(this.dateMode)
					.onChange((v) => {
						this.dateMode = v === 'clear' ? 'clear' : 'shift';
						this.startSetting?.settingEl.toggle(this.dateMode === 'shift');
					}),
			);
		this.startSetting = new Setting(contentEl).setName('新しい開始日').addText((t) => {
			t.inputEl.type = 'date';
			t.onChange((v) => (this.start = v));
		});

		new Setting(contentEl).addButton((b) =>
			b
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

	/** 作る件数を元のプロジェクトの説明に出す */
	private renderCount(): void {
		if (!this.countEl) return;
		if (!this.source) {
			this.countEl.setText('');
			return;
		}
		const { epics, tasks } = this.options.countOf(this.source);
		this.countEl.setText(`エピック ${epics}件・タスク ${tasks}件を作ります`);
	}

	private async submit(): Promise<void> {
		// 作成中の2回目（Enter の連打など）は受け付けない（設計書 4.6）
		if (this.saving) return;
		if (!this.source) {
			notifyError(new Error('元のプロジェクトを選んでください'));
			return;
		}
		const dates: CopyDates = this.dateMode === 'shift' ? { mode: 'shift', start: this.start } : { mode: 'clear' };
		this.saving = true;
		try {
			await this.options.onSubmit(this.source, { title: this.title, caseId: this.caseId, officialName: this.officialName, dates });
			this.close();
		} catch (e) {
			notifyError(e);
		} finally {
			this.saving = false;
		}
	}
}
