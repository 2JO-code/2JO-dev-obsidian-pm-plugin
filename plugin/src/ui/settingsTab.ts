import { type App, debounce, Notice, PluginSettingTab, Setting } from 'obsidian';
import type ProjectManagerPlugin from '../main';
import { applyKindColors } from './kindColors';
import { SettingGroups } from './settingGroups';
import { COLOR_SAVE_DELAY, onCommit, SharedConfigSettings } from './sharedConfigSettings';
import {
	cleanColor,
	cleanFolderPath,
	DEFAULT_PERSONAL,
	DEFAULT_SETTINGS,
	type FolderSettings,
	type KindColors,
	moveSection,
	oneOf,
	PROJECT_DISPLAY_NAMES,
	type ProjectDisplayName,
	type ProjectSection,
	type ProjectSectionSetting,
} from '../settings';
import { redrawViews } from '../views/baseView';

const SECTION_LABELS: Record<ProjectSection, string> = {
	progress: '進捗グラフ',
	milestones: 'マイルストーン',
	epics: 'エピックとタスク',
	allocation: '工数配分',
};

const KIND_LABELS: Record<keyof KindColors, string> = { project: 'プロジェクト', epic: 'エピック', task: 'タスク' };

const FOLDER_LABELS: Record<keyof FolderSettings, string> = {
	projects: 'プロジェクト',
	epics: 'エピック',
	tasks: 'タスク',
	members: 'メンバー',
	logs: '作業ログ',
	archive: 'アーカイブ',
	config: '共有設定（statuses.json, calendar.json）',
};

const DISPLAY_NAME_LABELS: Record<ProjectDisplayName, string> = {
	title: '簡易プロジェクト名',
	case_id: '案件ID',
	official_name: '正式案件名',
};

export class ProjectManagerSettingTab extends PluginSettingTab {
	private readonly groups: SettingGroups;
	private readonly shared: SharedConfigSettings;

	constructor(
		app: App,
		private readonly plugin: ProjectManagerPlugin,
	) {
		super(app, plugin);
		this.groups = new SettingGroups(app);
		this.shared = new SharedConfigSettings(plugin, this.groups, () => this.refresh());
	}

	/** 保存先でグループに分け、その中を内容で分ける（設計書 9章） */
	display(): void {
		const { containerEl } = this;
		const { groups } = this;
		containerEl.empty();
		this.renderProblems(containerEl);

		const personal = groups.add(containerEl, 'personal', 'このパソコンだけの設定', 'このパソコンにだけ保存します。ほかの人には影響しません。');
		this.renderDisplay(groups.add(personal, 'personal.display', '表示'));
		this.renderProjectSections(
			groups.add(personal, 'personal.projectSections', 'プロジェクト状況の節', '概要の下に出す節の並び順と、表示するかどうか。概要は常に一番上です。'),
		);
		this.renderReport(groups.add(personal, 'personal.report', 'HTMLレポート'));

		const shared = groups.add(
			containerEl,
			'shared',
			'全員共通の設定',
			'全員の画面と集計に影響します。ステータスと会社カレンダーは Vault の共有設定ファイルに、色とフォルダはプラグインの設定ファイルに保存します。',
		);
		this.shared.renderStatuses(shared);
		this.shared.renderCalendar(shared);
		this.renderColors(groups.add(shared, 'shared.colors', '種類ごとの色', 'ガントの棒と、各画面のタイトルの前の印の色。'));
		this.renderFolders(groups.add(shared, 'shared.folders', 'フォルダ', 'Vaultのルートからのパス。全員で同じにしてください。'));
	}

	/** 種類ごとの色（全員共通。設計書 6章） */
	private renderColors(el: HTMLElement): void {
		const { colors } = this.plugin.settings;
		// 色を選んでいる間は何度も変わるので、保存はまとめて1回にする（設計書 6章）
		const save = debounce(() => void this.plugin.saveSettings(), COLOR_SAVE_DELAY, true);
		for (const key of Object.keys(KIND_LABELS) as (keyof KindColors)[]) {
			new Setting(el)
				.setName(KIND_LABELS[key])
				.addColorPicker((picker) =>
					picker.setValue(colors[key]).onChange((value) => {
						colors[key] = cleanColor(value) ?? colors[key];
						applyKindColors(this.plugin);
						save();
					}),
				)
				.addExtraButton((button) =>
					button
						.setIcon('rotate-ccw')
						.setTooltip('初期の色に戻す')
						.onClick(() => {
							colors[key] = DEFAULT_SETTINGS.colors[key];
							applyKindColors(this.plugin);
							save();
							this.refresh();
						}),
				);
		}
	}

	/** スクロール位置を保ったまま描き直す（設計書 9章） */
	private refresh(): void {
		const targets = [this.containerEl, this.containerEl.parentElement].filter((el): el is HTMLElement => el !== null);
		const positions = targets.map((el) => el.scrollTop);
		this.display();
		targets.forEach((el, i) => (el.scrollTop = positions[i] ?? 0));
	}

	private renderProblems(el: HTMLElement): void {
		const { problems } = this.plugin.config;
		if (problems.length === 0) return;
		const box = el.createDiv({ cls: 'pm-settings-warning' });
		box.createEl('p', {
			text: '共有設定ファイルに読み取れない部分があります。読み取れない部分は初期値で表示しています。ここで保存するとファイルが上書きされるので、先にコンフリクトなどを解消してください。',
		});
		const list = box.createEl('ul');
		for (const p of problems) list.createEl('li', { text: `${p.path}: ${p.message}` });
	}

	/** 個人の設定：表示（この PC だけに保存。設計書 6章） */
	private renderDisplay(el: HTMLElement): void {
		const { personal } = this.plugin;
		new Setting(el)
			.setName('プロジェクトの表示名')
			.setDesc('ビューでプロジェクトを表示するときに使う項目')
			.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(DISPLAY_NAME_LABELS)) dropdown.addOption(value, label);
				dropdown.setValue(personal.projectDisplayName).onChange((value) => {
					personal.projectDisplayName = oneOf(value, PROJECT_DISPLAY_NAMES) ?? personal.projectDisplayName;
					this.plugin.savePersonal();
				});
			});
	}

	/** 個人の設定：プロジェクト状況の節の並び順と表示（この PC だけに保存） */
	private renderProjectSections(el: HTMLElement): void {
		const { personal } = this.plugin;
		const save = (sections: ProjectSectionSetting[]) => {
			personal.projectSections = sections;
			this.plugin.savePersonal();
			redrawViews(this.app);
			this.refresh();
		};
		const list = personal.projectSections;
		list.forEach((section, i) => {
			new Setting(el)
				.setName(SECTION_LABELS[section.id])
				.addExtraButton((button) => {
					button.setIcon('arrow-up').setTooltip('上へ').onClick(() => save(moveSection(list, i, -1)));
					if (i === 0) button.setDisabled(true);
				})
				.addExtraButton((button) => {
					button.setIcon('arrow-down').setTooltip('下へ').onClick(() => save(moveSection(list, i, 1)));
					if (i === list.length - 1) button.setDisabled(true);
				})
				.addToggle((toggle) =>
					toggle
						.setTooltip('表示する')
						.setValue(section.visible)
						.onChange((visible) => save(list.map((s, j) => (j === i ? { ...s, visible } : s)))),
				);
		});
		new Setting(el).addButton((button) =>
			button.setButtonText('初期の並びに戻す').onClick(() => save(DEFAULT_PERSONAL.projectSections.map((s) => ({ ...s })))),
		);
	}

	/** 個人の設定：HTMLレポート（この PC だけに保存。設計書 6章） */
	private renderReport(el: HTMLElement): void {
		const { personal } = this.plugin;
		new Setting(el)
			.setName('出力先')
			.setDesc(
				'レポートを書き出すフォルダ（例：\\\\server\\share\\pm-report）。上司など閲覧する人が開ける共有フォルダにします。保管庫（このノートの入ったフォルダ）の中には置かないでください（コミットのたびに差分が出てぶつかるため）',
			)
			.addText((text) => {
				text.setPlaceholder('\\\\server\\share\\pm-report').setValue(personal.reportFolder);
				text.inputEl.addClass('pm-setting-wide');
				// 1文字ごとに保存しない（設計書 9章）
				text.inputEl.addEventListener('change', () => {
					personal.reportFolder = text.getValue().trim();
					this.plugin.savePersonal();
				});
			});
	}

	private renderFolders(el: HTMLElement): void {
		for (const key of Object.keys(FOLDER_LABELS) as (keyof FolderSettings)[]) {
			new Setting(el).setName(FOLDER_LABELS[key]).addText((text) => {
				text.setPlaceholder(DEFAULT_SETTINGS.folders[key]).setValue(this.plugin.settings.folders[key]);
				onCommit(text.inputEl, (value) => {
					const path = cleanFolderPath(value);
					if (!path) {
						new Notice('フォルダのパスが正しくありません');
						text.setValue(this.plugin.settings.folders[key]);
						return;
					}
					text.setValue(path);
					void this.updateFolders({ ...this.plugin.settings.folders, [key]: path });
				});
			});
		}
	}

	/** フォルダを保存し、共有設定・索引への影響を反映する */
	private async updateFolders(folders: FolderSettings): Promise<void> {
		const { plugin } = this;
		const before = plugin.settings.folders;
		plugin.settings.folders = folders;
		await plugin.saveSettings();
		if (folders.config !== before.config) {
			plugin.config.setDir(folders.config);
			await plugin.config.load();
		}
		// アーカイブの判定が変わるため作り直す
		if (folders.archive !== before.archive) await plugin.store.rebuild();
	}
}
