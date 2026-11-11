import type { App } from 'obsidian';
import type { CalcContext } from '../calc/context';
import type { RowLabels } from '../calc/taskList';
import { openChecklistEditor } from '../commands/editChecklist';
import { statusColor } from '../config/statusColor';
import type ProjectManagerPlugin from '../main';
import type { Member, NoteId, StatusSets, YearMonth } from '../model';
import { statusBadge } from './badges';
import type { TaskCellEnv, TaskColumn } from './taskColumns';

/**
 * ビューの部品（パネル。設計書 9.12）。
 * タブ（PmView）にもメンバーダッシュボードにも載せられるよう、置き場所に依らない作りにする
 */

/** シェルの欄（設計書 9.1） */
export interface Shell {
	/** 見出しの右：件数・今日など */
	summary: HTMLElement;
	/** 絞り込み（`renderFilterBar`） */
	filters: HTMLElement;
	/** 表示の設定：単位・グループ・開閉・表示の切り替えなど（左寄せ） */
	settings: HTMLElement;
	/** 操作のボタン：作成・入力・書き出し・ほかの画面へ（右寄せ） */
	actions: HTMLElement;
	/** 凡例・注意 */
	notes: HTMLElement;
	/** 中身 */
	body: HTMLElement;
}

/** シェルの見出し以外の欄を作る。common は表示の設定の後ろに置く共通の欄（罫線の切り替え） */
export function shellParts(controls: HTMLElement, header: HTMLElement, body: HTMLElement): Shell & { common: HTMLElement } {
	const summary = header.createDiv({ cls: 'pm-shell-summary' });
	const filters = controls.createDiv({ cls: 'pm-shell-filters' });
	const bar = controls.createDiv({ cls: 'pm-shell-bar' });
	const settings = bar.createDiv({ cls: 'pm-shell-settings' });
	const common = bar.createDiv({ cls: 'pm-shell-settings' });
	const actions = bar.createDiv({ cls: 'pm-shell-actions' });
	const notes = controls.createDiv({ cls: 'pm-shell-notes' });
	return { summary, filters, settings, common, actions, notes, body };
}

/** 部品を節として置くときのシェル（メンバーダッシュボードの中など）。見出しは h4 */
export function panelShell(parent: HTMLElement, title: string): Shell {
	const section = parent.createDiv({ cls: 'pm-section pm-panel' });
	const controls = section.createDiv({ cls: 'pm-panel-controls' });
	const header = controls.createDiv({ cls: 'pm-shell-header' });
	header.createEl('h4', { text: title });
	return shellParts(controls, header, section.createDiv({ cls: 'pm-panel-body' }));
}

/** 部品の置き場所が渡すもの */
export interface PanelHost {
	readonly app: App;
	readonly plugin: ProjectManagerPlugin;
	/** 表の罫線を出しているか（置き場所の「罫線を表示」） */
	gridLines(): boolean;
	/** 部品の状態が変わった。保存を頼んで描き直す */
	changed(): void;
	/** 部品の状態を保存するだけ（描き直さない。開閉・幅のドラッグなど） */
	save(): void;
	/** 描き直すだけ（保存しない。「さらに表示」など） */
	redraw(): void;
}

/** 外から固定する条件（メンバーダッシュボードの「このメンバー・この月」） */
export interface PanelScope {
	/** 担当者をこの人に固定する。絞り込みの「担当者」は出さない */
	member: Member;
	/** 見る月 */
	month: YearMonth;
	/** 出してよいタスク。無ければ制限なし */
	taskIds?: ReadonlySet<NoteId>;
	/** タスクの表に足す列（並べ替えはできない） */
	taskColumns?: readonly TaskColumn[];
	/** 凡例・注意に足す文 */
	note?: string;
}

/** 部品の土台。状態（絞り込み・表示の設定）は部品が持ち、保存は置き場所に任せる */
export abstract class Panel {
	constructor(protected readonly host: PanelHost) {}

	/** ダッシュボードの中で見出しに出す名前 */
	abstract readonly title: string;

	/** 保存する状態 */
	abstract getState(): Record<string, unknown>;

	/** 保存されていた状態を読む。不正な値は既定値にする */
	abstract setState(state: unknown): void;

	/** シェルの欄に描く */
	abstract draw(shell: Shell, ctx: CalcContext, scope?: PanelScope): void;

	protected get app(): App {
		return this.host.app;
	}

	protected get plugin(): ProjectManagerPlugin {
		return this.host.plugin;
	}
}

/** ステータスを色の枠で囲んで出す（設計書 9.1） */
export function pluginStatusBadge(plugin: ProjectManagerPlugin, parent: HTMLElement, set: keyof StatusSets, status: string): void {
	const { config, settings } = plugin;
	statusBadge(parent, status, statusColor(config.statuses[set], settings.statusColors[set], status));
}

/** ステータスのセル */
export function pluginStatusCell(plugin: ProjectManagerPlugin, tr: HTMLElement, set: keyof StatusSets, status: string): HTMLElement {
	const td = tr.createEl('td');
	pluginStatusBadge(plugin, td, set, status);
	return td;
}

/** タスクの行のセルを描くのに使うもの（`taskCells`）。epicWbs は WBS の列で使うエピックの番号 */
export function pluginTaskCellEnv(plugin: ProjectManagerPlugin, ctx: CalcContext, labels: RowLabels, epicWbs?: string): TaskCellEnv {
	return {
		calendar: ctx.calendar,
		labels,
		statusCell: (tr, status) => pluginStatusCell(plugin, tr, 'task', status),
		openChecklist: (task) => void openChecklistEditor(plugin, task.path),
		...(epicWbs !== undefined ? { epicWbs } : {}),
	};
}
