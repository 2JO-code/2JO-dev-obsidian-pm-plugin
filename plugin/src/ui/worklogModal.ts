import { type App, Modal, Notice, Setting } from 'obsidian';
import { compareJa } from '../calc/compare';
import { localToday } from '../calc/dates';
import { validateWorklogInput, type WorklogInput } from '../forms/worklogForm';
import type { Member, NoteId, Project, Task, Worklog, WorklogEntry } from '../model';
import type { ProjectDisplayName } from '../settings';
import { errorBox, hoursInput, projectOptions } from './formParts';

export interface WorklogModalOptions {
	members: Member[];
	projects: Project[];
	tasks: Task[];
	worklogs: Worklog[];
	displayName: ProjectDisplayName;
	/** 最初に選ぶメンバー */
	defaultMember: NoteId;
	/** タスクの行から開いたときの、そのタスク（設計書 4.3） */
	task?: Task;
	/** 戻り値は既存の行を書き換えたか */
	onSave: (input: WorklogInput) => Promise<boolean>;
	onMemberChange: (member: NoteId) => void;
	/** 索引の更新を受け取る。戻り値で解除する */
	subscribe: (callback: () => void) => () => void;
	/** メンバー・月の作業ログの表の編集画面を開く */
	editMonth: (member: NoteId, month: string) => void;
}

const byTitle = (a: { title: string }, b: { title: string }) => compareJa(a.title, b.title);

/** 作業ログの入力フォーム（設計書 4.3, 9章） */
export class WorklogModal extends Modal {
	private input: WorklogInput;
	private project: NoteId = '';
	private errors: string[] = [];
	private summaryEl: HTMLElement | null = null;
	private unsubscribe: (() => void) | null = null;
	private saving = false;

	constructor(
		app: App,
		private readonly options: WorklogModalOptions,
	) {
		super(app);
		const member = options.members.some((m) => m.id === options.defaultMember && m.active) ? options.defaultMember : '';
		this.input = { member, date: localToday(), task: options.task?.id ?? '', planned: '', actual: '', memo: '' };
		if (options.task) {
			this.project = options.task.project;
			this.loadExisting();
		}
	}

	onOpen(): void {
		this.setTitle(this.options.task ? `作業ログを入力：${this.options.task.title}` : '作業ログを入力');
		this.render();
		// 入力欄は触らず「この日の記録」だけ描き直す
		this.unsubscribe = this.options.subscribe(() => this.renderDaySummary());
	}

	onClose(): void {
		this.unsubscribe?.();
		this.contentEl.empty();
	}

	/** そのメンバー・日付の記録 */
	private entriesOn(member: NoteId, date: string): WorklogEntry[] {
		const month = date.slice(0, 7);
		const log = this.options.worklogs.find((w) => w.member === member && w.month === month);
		return log?.entries.filter((e) => e.date === date) ?? [];
	}

	/** 同じ日付・同じタスクの記録があれば、その値をフォームに入れる */
	private loadExisting(): void {
		const { input } = this;
		const existing = this.entriesOn(input.member, input.date).find((e) => e.task === input.task);
		input.planned = existing && existing.planned > 0 ? String(existing.planned) : '';
		input.actual = existing && existing.actual > 0 ? String(existing.actual) : '';
		input.memo = existing?.memo ?? '';
	}

	private render(): void {
		const { contentEl, input, options } = this;
		contentEl.empty();

		errorBox(contentEl, this.errors);

		new Setting(contentEl).setName('メンバー').addDropdown((d) => {
			d.addOption('', '選んでください');
			for (const m of [...options.members].filter((m) => m.active).sort(byTitle)) d.addOption(m.id, m.title);
			d.setValue(input.member).onChange((v) => {
				input.member = v;
				options.onMemberChange(v);
				this.loadExisting();
				this.render();
			});
		});

		new Setting(contentEl).setName('日付').addText((t) => {
			t.inputEl.type = 'date';
			t.setValue(input.date);
			t.inputEl.addEventListener('change', () => {
				input.date = t.getValue();
				this.loadExisting();
				this.render();
			});
		});

		this.summaryEl = contentEl.createDiv({ cls: 'pm-worklog-day' });
		this.renderDaySummary();
		// 記録の削除やまとめての直しは表の編集画面で（設計書 4.7）
		if (input.member && input.date) {
			new Setting(contentEl)
				.setDesc('記録を消す・まとめて直すときは、月の記録を一覧で編集します')
				.addButton((b) =>
					b.setButtonText(`${input.date.slice(0, 7)} の記録を一覧で編集`).onClick(() => options.editMonth(input.member, input.date.slice(0, 7))),
				);
		}

		new Setting(contentEl).setName('プロジェクト').addDropdown((d) => {
			projectOptions(d, options.projects, options.displayName, this.project);
			d.onChange((v) => {
				this.project = v;
				input.task = '';
				this.loadExisting();
				this.render();
			});
		});

		const existing = this.existingEntry();
		new Setting(contentEl)
			.setName('タスク')
			.setDesc('自分が担当するタスクを★付きで先に表示します')
			.addDropdown((d) => {
				d.addOption('', this.project ? '選んでください' : '先にプロジェクトを選んでください');
				const tasks = options.tasks.filter((t) => t.project === this.project);
				const mine = tasks.filter((t) => t.assignees.includes(input.member)).sort(byTitle);
				const others = tasks.filter((t) => !t.assignees.includes(input.member)).sort(byTitle);
				for (const t of mine) d.addOption(t.id, `★ ${t.title}`);
				for (const t of others) d.addOption(t.id, t.title);
				d.setValue(input.task)
					.setDisabled(!this.project)
					.onChange((v) => {
						input.task = v;
						this.loadExisting();
						this.render();
					});
			});

		// 追加か書き換えかを示す
		if (input.member && input.task) {
			const notice = contentEl.createDiv({ cls: existing ? 'pm-worklog-mode is-update' : 'pm-worklog-mode is-new' });
			if (existing) {
				notice.createDiv({ cls: 'pm-worklog-mode-title', text: '✏ すでに記録があります' });
				notice.createDiv({
					text: `${input.date} のこのタスクの記録（予定 ${existing.planned}h／実績 ${existing.actual}h）を下の欄に読み込みました。保存すると、この記録を書き換えます。`,
				});
			} else {
				notice.createDiv({ cls: 'pm-worklog-mode-title', text: '＋ 新しい記録として追加します' });
			}
		}

		this.hoursSetting('予定(h)', input.planned, (v) => (input.planned = v));
		this.hoursSetting('実績(h)', input.actual, (v) => (input.actual = v));
		new Setting(contentEl).setName('メモ').addText((t) => t.setValue(input.memo).onChange((v) => (input.memo = v)));

		const verb = existing ? '書き換えて' : '保存して';
		new Setting(contentEl)
			.addButton((b) => b.setButtonText('閉じる').onClick(() => this.close()))
			.addButton((b) => b.setButtonText(`${verb}続けて入力`).onClick(() => void this.save(false)))
			.addButton((b) =>
				b
					.setButtonText(`${verb}閉じる`)
					.setCta()
					.onClick(() => void this.save(true)),
			);
	}

	/** 選んでいるメンバー・日付・タスクの既存の記録 */
	private existingEntry(): WorklogEntry | undefined {
		const { input } = this;
		if (!input.member || !input.task) return undefined;
		return this.entriesOn(input.member, input.date).find((e) => e.task === input.task);
	}

	/** その日の記録の一覧と合計 */
	private renderDaySummary(): void {
		const { input, options } = this;
		const box = this.summaryEl;
		if (!box) return;
		box.empty();
		if (!input.member) return;
		const entries = this.entriesOn(input.member, input.date);
		if (entries.length === 0) {
			box.createDiv({ cls: 'pm-worklog-day-empty', text: 'この日の記録はまだありません' });
			return;
		}
		const title = (id: NoteId) => options.tasks.find((t) => t.id === id)?.title ?? id;
		box.createDiv({ cls: 'pm-worklog-day-title', text: `${input.date} の記録` });
		const list = box.createEl('ul');
		for (const e of entries) {
			const item = list.createEl('li', { text: `${title(e.task)}：予定 ${e.planned}h／実績 ${e.actual}h` });
			if (e.task === input.task) {
				item.addClass('is-target');
				item.createSpan({ cls: 'pm-worklog-day-mark', text: '← 書き換え対象' });
			}
		}
		const sum = (key: 'planned' | 'actual') => entries.reduce((s, e) => s + e[key], 0);
		const daily = options.members.find((m) => m.id === input.member)?.dailyHours;
		box.createDiv({
			cls: 'pm-worklog-day-total',
			text: `この日の合計：予定 ${sum('planned')}h／実績 ${sum('actual')}h${daily !== undefined ? `（1日の通常稼働 ${daily}h）` : ''}`,
		});
	}

	private hoursSetting(name: string, value: string, onChange: (v: string) => void): void {
		new Setting(this.contentEl)
			.setName(name)
			.setDesc('0.25刻み（15分単位）')
			.addText((t) => hoursInput(t).setValue(value).onChange(onChange));
	}

	private async save(close: boolean): Promise<void> {
		// 保存中の2回目は受け付けない（設計書 4.6）
		if (this.saving) return;
		this.errors = validateWorklogInput(this.input);
		if (this.errors.length > 0) {
			this.render();
			return;
		}
		this.saving = true;
		try {
			const updated = await this.options.onSave({ ...this.input });
			new Notice(updated ? '作業ログを書き換えました' : '作業ログに追加しました');
		} catch (e) {
			new Notice(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`);
			return;
		} finally {
			this.saving = false;
		}
		if (close) {
			this.close();
			return;
		}
		// メンバー・日付・プロジェクトは残す。タスクの行から開いたときはタスクも残す（設計書 4.3）
		Object.assign(this.input, { task: this.options.task?.id ?? '', planned: '', actual: '', memo: '' });
		this.render();
	}
}
