import { type App, ItemView, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import { ContextCache, type CalcContext } from '../calc/context';
import { localToday } from '../calc/dates';
import { EMPTY_FILTER, parseFilter, type ViewFilter } from '../calc/filter';
import type { RowLabels } from '../calc/taskList';
import { openChecklistEditor } from '../commands/editChecklist';
import { statusColor } from '../config/statusColor';
import type ProjectManagerPlugin from '../main';
import type { StatusSets } from '../model';
import { statusBadge } from './badges';
import type { TaskCellEnv } from './taskColumns';
import { field } from '../parse/values';
import { checkbox } from '../ui/controls';

/** 開いているビューで共有する計算用のデータ（設計書 11章） */
const contextCache = new ContextCache();

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
	/** スクロールする本体 */
	body: HTMLElement;
}

/**
 * このプラグインのビューの土台（設計書 9.1）。
 * 索引・共有設定が変わったら描き直し、絞り込みはビューの状態として保存する。
 */
export abstract class PmView extends ItemView {
	protected filter: ViewFilter = { ...EMPTY_FILTER };
	/** 表の罫線を出すか（ビューごとに切り替え、状態として保存する。設計書 9.1） */
	protected gridLines = true;
	/** 一度でも描いたか */
	private drawn = false;
	/** 見えていない間に描き直しを後回しにしたか */
	private pending = false;

	constructor(
		leaf: WorkspaceLeaf,
		protected readonly plugin: ProjectManagerPlugin,
	) {
		super(leaf);
	}

	/** 中身を描く。ctx は描くたびに作り直した計算用のデータ */
	protected abstract draw(el: HTMLElement, ctx: CalcContext): void;

	async onOpen(): Promise<void> {
		this.registerEvent(this.plugin.store.onUpdated(() => this.redraw()));
		this.register(this.plugin.config.onChange(() => this.redraw()));
		// 見えていない間に後回しにした描き直しを、見えたときに行う（設計書 9.1）
		const drawIfPending = () => {
			if (this.pending && this.contentEl.isShown()) this.redraw();
		};
		this.registerEvent(this.app.workspace.on('active-leaf-change', drawIfPending));
		this.registerEvent(this.app.workspace.on('layout-change', drawIfPending));
		this.redraw();
	}

	onResize(): void {
		if (this.pending && this.contentEl.isShown()) this.redraw();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), filter: this.filter, gridLines: this.gridLines };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.filter = parseFilter(field(state, 'filter'));
		this.gridLines = field(state, 'gridLines') !== false;
		await super.setState(state, result);
		this.redraw();
	}

	/** 絞り込みを変えて描き直す。状態の保存も Obsidian に知らせる */
	protected setFilter(filter: ViewFilter): void {
		this.filter = filter;
		this.app.workspace.requestSaveLayout();
		this.redraw();
	}

	/** ステータスを色の枠で囲んで出す（設計書 9.1） */
	protected statusBadge(parent: HTMLElement, set: keyof StatusSets, status: string): void {
		const { config, settings } = this.plugin;
		statusBadge(parent, status, statusColor(config.statuses[set], settings.statusColors[set], status));
	}

	/** ステータスのセル */
	protected statusCell(tr: HTMLElement, set: keyof StatusSets, status: string): HTMLElement {
		const td = tr.createEl('td');
		this.statusBadge(td, set, status);
		return td;
	}

	/** タスクの行のセルを描くのに使うもの（`taskCells`）。epicWbs は WBS の列で使うエピックの番号 */
	protected taskCellEnv(ctx: CalcContext, labels: RowLabels, epicWbs?: string): TaskCellEnv {
		return {
			calendar: ctx.calendar,
			labels,
			statusCell: (tr, status) => this.statusCell(tr, 'task', status),
			openChecklist: (task) => void openChecklistEditor(this.plugin, task.path),
			...(epicWbs !== undefined ? { epicWbs } : {}),
		};
	}

	/** 画面の上に出す一行の説明（シェルの見出しの横） */
	protected getDescription(): string {
		return '';
	}

	/**
	 * どのビューも同じ並びにする枠（シェル。設計書 9.1）。上に固定する欄は、上から
	 * 見出し（タイトル・説明・件数など）、絞り込み、表示の設定（左）と操作のボタン（右）、凡例・注意。その下がスクロールする本体。
	 * 中身の無い欄は出さない
	 * @param options.grid 表の罫線の切り替え（「罫線を表示」）を表示の設定の最後に置く
	 */
	protected shell(el: HTMLElement, options: { grid?: boolean } = {}): Shell {
		el.addClass('pm-view-fill');
		el.toggleClass('pm-grid-lines', !!options.grid && this.gridLines);
		const controls = el.createDiv({ cls: 'pm-view-controls' });
		const header = controls.createDiv({ cls: 'pm-shell-header' });
		header.createSpan({ cls: 'pm-shell-title', text: this.getDisplayText() });
		const description = this.getDescription();
		if (description) header.createSpan({ cls: 'pm-shell-description', text: description });
		const summary = header.createDiv({ cls: 'pm-shell-summary' });
		const filters = controls.createDiv({ cls: 'pm-shell-filters' });
		const bar = controls.createDiv({ cls: 'pm-shell-bar' });
		const settings = bar.createDiv({ cls: 'pm-shell-settings' });
		// 「罫線を表示」は、ビューが足す表示の設定より後ろの専用の欄に置く
		const common = bar.createDiv({ cls: 'pm-shell-settings' });
		const actions = bar.createDiv({ cls: 'pm-shell-actions' });
		const notes = controls.createDiv({ cls: 'pm-shell-notes' });
		if (options.grid) {
			checkbox(common, '罫線を表示', this.gridLines, (on) => {
				this.gridLines = on;
				this.app.workspace.requestSaveLayout();
				this.redraw();
			});
		}
		return { summary, filters, settings, actions, notes, body: el.createDiv({ cls: 'pm-view-body' }) };
	}

	/** スクロール位置を保って描き直す。見えていなければ見えたときまで後回し。例外は画面に表示する（設計書 9章） */
	redraw(): void {
		const el = this.contentEl;
		// 一度も描いていないときは、見えていなくても描く（タブの見出しなどのため）
		if (this.drawn && !el.isShown()) {
			this.pending = true;
			return;
		}
		this.pending = false;
		this.drawn = true;
		const scroll = el.scrollTop;
		const oldBody = el.querySelector<HTMLElement>('.pm-view-body');
		const bodyScroll = { top: oldBody?.scrollTop ?? 0, left: oldBody?.scrollLeft ?? 0 };
		try {
			el.empty();
			el.removeClasses(['pm-view-fill', 'pm-grid-lines']);
			if (!this.plugin.store.ready) {
				el.createDiv({ cls: 'pm-view-loading', text: '読み込み中…' });
				return;
			}
			const { store, config } = this.plugin;
			this.draw(el, contextCache.get(store.index, config.statuses, config.calendar, localToday()));
		} catch (e) {
			console.error(`[project-manager] ${this.getDisplayText()}の表示に失敗しました`, e);
			el.empty();
			el.removeClasses(['pm-view-fill', 'pm-grid-lines']);
			el.createEl('p', { text: `${this.getDisplayText()}の表示中に誤りが起きました。` });
			el.createEl('pre', { text: e instanceof Error ? (e.stack ?? e.message) : String(e) });
		}
		el.scrollTop = scroll;
		const body = el.querySelector<HTMLElement>('.pm-view-body');
		if (body) {
			body.scrollTop = bodyScroll.top;
			body.scrollLeft = bodyScroll.left;
		}
	}
}

/** 開いているこのプラグインのビューをすべて描き直す（設定の色を変えたときなど） */
export function redrawViews(app: App): void {
	app.workspace.iterateAllLeaves((leaf) => {
		if (leaf.view instanceof PmView) leaf.view.redraw();
	});
}
