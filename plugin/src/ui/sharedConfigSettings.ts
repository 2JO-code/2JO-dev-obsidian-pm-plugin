import { type App, debounce, type ExtraButtonComponent, Notice, Setting } from 'obsidian';
import {
	calendarChangeImpact,
	type CalendarChange,
	type Impact,
	type StatusChange,
	statusChangeImpact,
} from '../config/impact';
import { addStatus, changeCategory, moveStatus, removeStatus, renameStatus } from '../config/status';
import { CATEGORY_COLORS, removeStatusColor, renameStatusColor, statusColor } from '../config/statusColor';
import type ProjectManagerPlugin from '../main';
import { STATUS_CATEGORIES, type Calendar, type Holiday, type StatusCategory, type StatusDef, type StatusSets } from '../model';
import { isIsoDate, oneOf } from '../parse/values';
import { cleanColor } from '../settings';
import { redrawViews } from '../views/baseView';
import { confirm } from './confirmModal';
import type { SettingGroups } from './settingGroups';
import { notifyError } from './notify';

/** 色を選んでいる間の保存を、最後の変更からこの時間（ミリ秒）待ってまとめる */
export const COLOR_SAVE_DELAY = 500;

const CATEGORY_LABELS: Record<StatusCategory, string> = {
	not_started: '未着手系',
	in_progress: '進行中系',
	done: '完了系',
	stopped: '停止系',
};

/** 並べ替えの影響（先頭が変わるか） */
const moved = (before: StatusDef[], after: StatusDef[]): StatusChange => ({
	kind: 'move',
	firstBefore: before[0]?.name ?? '',
	firstAfter: after[0]?.name ?? '',
});

/** 入力の確定時（フォーカスが外れた・Enter）に処理する（設計書 9章） */
export function onCommit(input: HTMLInputElement, handler: (value: string) => void): void {
	input.addEventListener('change', () => handler(input.value));
}

/** 設定画面のうち、共有設定ファイル（ステータス・会社カレンダー）を変える欄（設計書 5章） */
export class SharedConfigSettings {
	private readonly app: App;

	/** @param refresh 設定画面をスクロール位置を保って描き直す */
	constructor(
		private readonly plugin: ProjectManagerPlugin,
		private readonly groups: SettingGroups,
		private readonly refresh: () => void,
	) {
		this.app = plugin.app;
	}

	/** ステータスのグループ。中をタスク・エピック用とプロジェクト用に分ける */
	renderStatuses(parent: HTMLElement): void {
		const el = this.groups.add(
			parent,
			'shared.status',
			'ステータス',
			'上から順に表示されます。先頭が新規作成時の初期値です。名前を変えても旧名のノートはそのまま集計されます。色は各画面でステータスを囲む枠の色で、選んでいなければ分類の色です。',
		);
		this.renderStatusSet(this.groups.add(el, 'shared.status.task', 'タスク・エピック用'), 'task');
		this.renderStatusSet(this.groups.add(el, 'shared.status.project', 'プロジェクト用'), 'project');
	}

	private renderStatusSet(el: HTMLElement, set: keyof StatusSets): void {
		const defs = this.plugin.config.statuses[set];
		defs.forEach((def, i) => this.renderStatusRow(el, set, def, i, defs.length));

		let newName = '';
		let newCategory: StatusCategory = 'in_progress';
		new Setting(el)
			.setName('追加')
			.addText((text) => text.setPlaceholder('新しいステータス名').onChange((v) => (newName = v)))
			.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(CATEGORY_LABELS)) dropdown.addOption(value, label);
				dropdown.setValue(newCategory).onChange((v) => (newCategory = oneOf(v, STATUS_CATEGORIES) ?? newCategory));
			})
			.addButton((button) =>
				button
					.setButtonText('追加')
					.onClick(
						() =>
							void this.updateStatuses(set, (list) => addStatus(list, newName, newCategory), () => ({
								kind: 'add',
								name: newName,
							})),
					),
			);
	}

	private renderStatusRow(el: HTMLElement, set: keyof StatusSets, def: StatusDef, index: number, count: number): void {
		const setting = new Setting(el);
		if (index === 0) setting.setName('初期値');
		if (def.aliases.length > 0) setting.setDesc(`旧名：${def.aliases.join('、')}`);
		const colors = this.plugin.settings.statusColors;
		let reset: ExtraButtonComponent | undefined;
		setting
			.addText((text) => {
				text.setValue(def.name);
				onCommit(text.inputEl, (value) => {
					void this.updateStatuses(set, (list) => renameStatus(list, def.name, value), () => ({
						kind: 'rename',
						from: def.name,
						to: value.trim(),
						aliases: def.aliases,
					})).then((saved) => {
						if (saved) this.setStatusColors(set, renameStatusColor(colors[set], def.name, value.trim()));
					});
				});
			})
			// 色は全員共通の設定に、ステータス名ごとに持つ（設計書 6章）
			.addColorPicker((picker) =>
				picker
					.setValue(statusColor([def], colors[set], def.name) ?? CATEGORY_COLORS[def.category])
					.onChange((value) => {
						const color = cleanColor(value);
						if (!color) return;
						this.setStatusColors(set, { ...colors[set], [def.name]: color });
						reset?.setDisabled(false);
					}),
			)
			.addExtraButton((button) =>
				(reset = button)
					.setIcon('rotate-ccw')
					.setTooltip('分類の色に戻す')
					.setDisabled(colors[set][def.name] === undefined)
					.onClick(() => {
						this.setStatusColors(set, removeStatusColor(colors[set], def.name));
						this.refresh();
					}),
			)
			.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(CATEGORY_LABELS)) dropdown.addOption(value, label);
				dropdown.setValue(def.category).onChange((v) => {
					const to = oneOf(v, STATUS_CATEGORIES);
					if (!to) return;
					void this.updateStatuses(set, (list) => changeCategory(list, def.name, to), () => ({
						kind: 'category',
						name: def.name,
						aliases: def.aliases,
						from: def.category,
						to,
					}));
				});
			})
			.addExtraButton((button) =>
				button
					.setIcon('arrow-up')
					.setTooltip('上へ')
					.setDisabled(index === 0)
					.onClick(() => void this.updateStatuses(set, (list) => moveStatus(list, def.name, -1), moved)),
			)
			.addExtraButton((button) =>
				button
					.setIcon('arrow-down')
					.setTooltip('下へ')
					.setDisabled(index === count - 1)
					.onClick(() => void this.updateStatuses(set, (list) => moveStatus(list, def.name, 1), moved)),
			)
			.addExtraButton((button) =>
				button
					.setIcon('trash')
					.setTooltip('削除')
					.onClick(() => {
						void this.updateStatuses(set, (list) => removeStatus(list, def.name), () => ({
							kind: 'remove',
							name: def.name,
							aliases: def.aliases,
						})).then((saved) => {
							if (saved) this.setStatusColors(set, removeStatusColor(colors[set], def.name));
						});
					}),
			);
	}

	/** ステータスの色を変えて、ビューを描き直す。保存はまとめて1回にする（設計書 6章） */
	private setStatusColors(set: keyof StatusSets, colors: Record<string, string>): void {
		this.plugin.settings.statusColors[set] = colors;
		this.saveStatusColors();
	}

	private readonly saveStatusColors = debounce(
		() => {
			void this.plugin.saveSettings();
			redrawViews(this.app);
		},
		COLOR_SAVE_DELAY,
		true,
	);

	/** ステータスを変更して保存する。影響を確認・通知する（設計書 5.5）。保存したら true */
	private async updateStatuses(
		set: keyof StatusSets,
		change: (list: StatusDef[]) => StatusDef[],
		describe: (before: StatusDef[], after: StatusDef[]) => StatusChange,
	): Promise<boolean> {
		const { config } = this.plugin;
		let saved = false;
		try {
			const before = config.statuses[set];
			const after = change(before);
			const impact = statusChangeImpact(set, describe(before, after), this.plugin.usage);
			const danger = describe(before, after).kind === 'remove';
			if (await this.acceptImpact(impact, danger ? '削除する' : '変更する', danger)) {
				await config.saveStatuses({ ...config.statuses, [set]: after });
				this.notifyImpact(impact);
				saved = true;
			}
		} catch (e) {
			notifyError(e);
		}
		this.refresh();
		return saved;
	}

	/** 確認が必要なら確認画面を出す。保存してよければ true */
	private async acceptImpact(impact: Impact, confirmText: string, danger = false): Promise<boolean> {
		if (impact.level !== 'confirm') return true;
		return confirm(this.app, { title: impact.title, details: impact.details, confirmText, danger });
	}

	private notifyImpact(impact: Impact): void {
		if (impact.level !== 'notice') return;
		new Notice([impact.title, ...impact.details].join('\n'), 8000);
	}

	/** 会社カレンダーのグループ。休日の一覧はさらに中のグループにする */
	renderCalendar(parent: HTMLElement): void {
		const { config } = this.plugin;
		const el = this.groups.add(
			parent,
			'shared.calendar',
			'会社カレンダー',
			'全社共通の休日。個人の休み（個人休日）は各メンバーのノートに書きます。',
		);

		new Setting(el).setName('土日を休日にする').addToggle((toggle) =>
			toggle
				.setValue(config.calendar.weekendsOff)
				.onChange(
					(value) =>
						void this.updateCalendar((c) => ({ ...c, weekendsOff: value }), { kind: 'weekends', weekendsOff: value }),
				),
		);

		const holidays = this.groups.add(el, 'shared.calendar.holidays', `休日（${config.calendar.holidays.length}日）`);
		for (const holiday of config.calendar.holidays) {
			new Setting(holidays)
				.setName(holiday.date)
				.setDesc(holiday.name)
				.addExtraButton((button) =>
					button
						.setIcon('trash')
						.setTooltip('削除')
						.onClick(
							() =>
								void this.updateCalendar(
									(c) => ({ ...c, holidays: c.holidays.filter((h) => h.date !== holiday.date) }),
									{ kind: 'removeHoliday', date: holiday.date },
								),
						),
				);
		}

		const draft: Holiday = { date: '', name: '' };
		new Setting(holidays)
			.setName('休日を追加')
			.addText((text) => {
				text.inputEl.type = 'date';
				text.onChange((v) => (draft.date = v));
			})
			.addText((text) => text.setPlaceholder('名前（例：元日）').onChange((v) => (draft.name = v.trim())))
			.addButton((button) =>
				button.setButtonText('追加').onClick(() => {
					if (!isIsoDate(draft.date)) {
						new Notice('日付を選んでください');
						return;
					}
					void this.updateCalendar(
						(c) => ({ ...c, holidays: [...c.holidays.filter((h) => h.date !== draft.date), { ...draft }] }),
						{ kind: 'addHoliday', date: draft.date },
					);
				}),
			);
	}

	/** カレンダーを変更して保存する。影響を確認・通知する（設計書 5.5） */
	private async updateCalendar(change: (c: Calendar) => Calendar, description: CalendarChange): Promise<void> {
		const { config } = this.plugin;
		try {
			const impact = calendarChangeImpact(description, this.plugin.usage);
			if (await this.acceptImpact(impact, '変更する')) {
				await config.saveCalendar(change(config.calendar));
				this.notifyImpact(impact);
			}
		} catch (e) {
			notifyError(e);
		}
		this.refresh();
	}
}
