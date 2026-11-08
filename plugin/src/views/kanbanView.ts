import { Notice, type ViewStateResult } from 'obsidian';
import type { CalcContext } from '../calc/context';
import type { WorkCalendar } from '../calc/workdays';
import { filterTasks } from '../calc/filter';
import { kanbanColumns, parseDraggedCard, statusMove, UNKNOWN_COLUMN, type DraggedCard, type KanbanColumn } from '../calc/kanban';
import {
	EMPTY_TASK_FILTER,
	filterTaskRows,
	parseTaskListOptions,
	sortTaskRows,
	taskRows,
	type RowLabels,
	type TaskFilterOptions,
	type TaskRow,
} from '../calc/taskList';
import { openNewNoteModal } from '../commands/createNote';
import { openTaskForm } from '../commands/editTask';
import { openWorklogModal } from '../commands/worklog';
import type ProjectManagerPlugin from '../main';
import { projectLabel } from '../settings';
import { writeFrontmatter } from '../write/frontmatterFile';
import { actionButtons, formClick } from './actions';
import { holidayMark, kindMark, warningBadges } from './badges';
import { PmView } from './baseView';
import { memberChoices, projectChoices, statusChoices } from './choices';
import { rangeSlider, renderFilterBar } from './filterBar';
import { openView } from './openView';
import { taskFilterFields, withTaskFilter } from './taskFilters';
import { field, stringArray } from '../parse/values';
import { KANBAN_VIEW_TYPE } from './viewTypes';
import { notifyError } from '../ui/notify';

/** 1列に一度に出すカードの数 */
const CARD_PAGE = 50;

/** ドラッグ中のカードを渡す種類（ほかのドラッグと区別する） */
const DRAG_TYPE = 'application/x-pm-task';

interface KanbanOptions extends TaskFilterOptions {
	/** 初期のたたみ方と逆にした列（ステータス名） */
	toggled: string[];
	/** 列の幅(px)。すべての列で同じ（設計書 9.6） */
	columnWidth: number;
}

/** 列の幅の範囲と初期値(px) */
const COLUMN_WIDTH = { min: 160, max: 520, step: 20, initial: 260 };

const columnWidthOf = (v: unknown): number =>
	typeof v === 'number' && Number.isFinite(v) ? Math.min(COLUMN_WIDTH.max, Math.max(COLUMN_WIDTH.min, Math.round(v))) : COLUMN_WIDTH.initial;

/** カンバンのビューと、開くコマンドを登録する */
export function registerKanbanView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(KANBAN_VIEW_TYPE, (leaf) => new KanbanView(leaf, plugin));
	plugin.addCommand({
		id: 'open-kanban',
		name: 'カンバンを開く',
		callback: () => void openView(plugin.app, KANBAN_VIEW_TYPE),
	});
}

/** カンバン（要件4.8b・4.8c、設計書 9.6）。カードを列へ動かすとステータスを書き換える */
export class KanbanView extends PmView {
	private options: KanbanOptions = { ...EMPTY_TASK_FILTER, toggled: [], columnWidth: COLUMN_WIDTH.initial };
	/** 列ごとに出しているカードの数。保存しない */
	private limits = new Map<string, number>();

	getViewType(): string {
		return KANBAN_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'カンバン';
	}

	getIcon(): string {
		return 'columns-3';
	}

	protected getDescription(): string {
		return 'ステータスごとの列。カードを別の列へドラッグするとステータスが変わります';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), kanban: this.options };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const raw = field(state, 'kanban');
		const { epics, dueFrom, dueTo, warningsOnly } = parseTaskListOptions(raw);
		const toggled = field(raw, 'toggled');
		this.options = {
			epics,
			warningsOnly,
			...(dueFrom ? { dueFrom } : {}),
			...(dueTo ? { dueTo } : {}),
			toggled: stringArray(toggled),
			columnWidth: columnWidthOf(field(raw, 'columnWidth')),
		};
		this.limits.clear();
		await super.setState(state, result);
	}

	private setOptions(options: KanbanOptions): void {
		this.options = options;
		this.app.workspace.requestSaveLayout();
		this.redraw();
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-kanban-view');
		const mode = this.plugin.personal.projectDisplayName;
		const labels: RowLabels = { project: (p) => projectLabel(p, mode) };
		const { options } = this;
		const { summary, filters, settings, actions, body } = this.shell(el);

		renderFilterBar(
			filters,
			this.filter,
			{
				projects: projectChoices(ctx, mode),
				members: memberChoices(ctx),
				membersLabel: '担当者',
				statuses: statusChoices(ctx),
				closed: true,
				archived: true,
				extra: (bar) =>
					taskFilterFields(bar, ctx, this.filter.projects, mode, options, (next) => {
						this.limits.clear();
						this.setOptions(withTaskFilter(this.options, next));
					}),
				onClear: () => {
					this.options = { ...EMPTY_TASK_FILTER, toggled: this.options.toggled, columnWidth: this.options.columnWidth };
					this.limits.clear();
				},
			},
			(filter) => {
				this.limits.clear();
				this.setFilter(filter);
			},
		);

		const tasks = filterTasks(ctx.index.tasks({ includeArchived: this.filter.includeArchived }), this.filter, ctx.projects, ctx.statuses);
		const statusOrder = ctx.statuses.task.map((s) => s.name);
		// 列の中は期限日の早い順（期限日の無いものは最後）
		const shown = sortTaskRows(filterTaskRows(taskRows(ctx, tasks), options), 'due', false, labels, statusOrder);

		summary.setText(`タスク ${shown.length} 件`);
		const one = (ids: string[]) => (ids.length === 1 ? ids[0] : undefined);
		const project = one(this.filter.projects);
		const epic = one(options.epics);
		actionButtons(actions, [
			{
				text: '新しいタスク',
				onClick: () => openNewNoteModal(this.plugin, 'task', { ...(project ? { project } : {}), ...(epic ? { epic } : {}) }),
			},
			{ text: '作業ログを入力', onClick: () => openWorklogModal(this.plugin) },
		]);

		const board = body.createDiv({ cls: 'pm-kanban' });
		const applyWidth = (w: number) => board.setCssProps({ '--pm-kanban-col': `${w}px` });
		applyWidth(options.columnWidth);
		// 列の幅：動かしている間は見た目だけ変え、離したときに保存する（描き直さない）
		const field = rangeSlider(settings, '列の幅', options.columnWidth, { ...COLUMN_WIDTH, unit: 'px' }, applyWidth, (w) => {
			this.options = { ...this.options, columnWidth: columnWidthOf(w) };
			this.app.workspace.requestSaveLayout();
		});
		const reset = field.createEl('button', { cls: 'pm-row-button', text: '元に戻す' });
		reset.addEventListener('click', (e) => {
			e.preventDefault();
			this.setOptions({ ...this.options, columnWidth: COLUMN_WIDTH.initial });
		});
		// 今の画面の幅に、すべての列がちょうど収まる幅にする（範囲の外なら端の値）
		const fit = settings.createEl('button', { text: '画面の幅に合わせる' });
		fit.setAttr('aria-label', `列が多くて収まらないときは ${COLUMN_WIDTH.min}px にします`);
		fit.addEventListener('click', () => {
			const count = board.childElementCount;
			if (count === 0) return;
			const gap = parseFloat(getComputedStyle(board).columnGap) || 0;
			const width = (board.clientWidth - gap * (count - 1)) / count;
			this.setOptions({ ...this.options, columnWidth: columnWidthOf(Math.floor(width)) });
		});
		for (const column of kanbanColumns(shown, ctx.statuses.task)) this.drawColumn(board, column, labels, ctx.calendar);
	}

	private drawColumn(board: HTMLElement, column: KanbanColumn, labels: RowLabels, calendar: WorkCalendar): void {
		const toggled = this.options.toggled.includes(column.name);
		const collapsed = column.collapsedByDefault !== toggled;
		const col = board.createDiv({ cls: 'pm-kanban-column' });
		if (collapsed) col.addClass('is-collapsed');
		this.dropTarget(col, column.name);

		const head = col.createDiv({ cls: 'pm-kanban-head is-clickable' });
		head.createSpan({ cls: 'pm-toggle', text: collapsed ? '▶' : '▼' });
		head.createSpan({ cls: 'pm-kanban-name', text: column.name === UNKNOWN_COLUMN ? '設定に無いステータス' : column.name });
		head.createSpan({ cls: 'pm-mark is-plain pm-kanban-count', text: String(column.rows.length) });
		head.setAttr('aria-label', collapsed ? 'クリックで開く' : 'クリックでたたむ');
		head.addEventListener('click', () => {
			const next = toggled ? this.options.toggled.filter((n) => n !== column.name) : [...this.options.toggled, column.name];
			this.setOptions({ ...this.options, toggled: next });
		});
		if (collapsed) return;

		// カードの欄。背景はカードのあるところまで（列そのものは見出しを残すため、いちばん長い列と同じ高さ）
		const cards = col.createDiv({ cls: 'pm-kanban-cards' });
		const limit = this.limits.get(column.name) ?? CARD_PAGE;
		for (const row of column.rows.slice(0, limit)) this.drawCard(cards, row, labels, calendar);
		if (column.rows.length > limit) {
			const more = cards.createEl('button', { cls: 'pm-kanban-more', text: `さらに表示（残り ${column.rows.length - limit} 件）` });
			more.addEventListener('click', () => {
				this.limits.set(column.name, limit + CARD_PAGE);
				this.redraw();
			});
		}
	}

	/** 列にカードを落とせるようにする。たたんだ列にも落とせる（設計書 9.6） */
	private dropTarget(col: HTMLElement, name: string): void {
		const accepts = (e: DragEvent) => e.dataTransfer?.types.includes(DRAG_TYPE) ?? false;
		col.addEventListener('dragover', (e) => {
			if (!accepts(e)) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = name === UNKNOWN_COLUMN ? 'none' : 'move';
			col.addClass('is-drop-target');
		});
		col.addEventListener('dragleave', (e) => {
			// 列の中の要素へ移っただけのときは外さない
			if (!(e.relatedTarget instanceof Node && col.contains(e.relatedTarget))) col.removeClass('is-drop-target');
		});
		col.addEventListener('drop', (e) => {
			col.removeClass('is-drop-target');
			const card = parseDraggedCard(e.dataTransfer?.getData(DRAG_TYPE) ?? '');
			if (!card) return;
			e.preventDefault();
			void this.moveCard(card, name);
		});
	}

	/** カードを動かした先のステータスを書き込む。描き直しは索引の更新で行われる */
	private async moveCard(card: DraggedCard, to: string): Promise<void> {
		const { path, from } = card;
		const move = statusMove(from, to, this.plugin.config.statuses.task);
		if (!move) return;
		if ('error' in move) {
			new Notice(move.error);
			return;
		}
		const file = this.app.vault.getFileByPath(path);
		if (!file) {
			new Notice('タスクのノートが見つかりません');
			return;
		}
		try {
			await writeFrontmatter(this.app, file, 'task', { status: move.status });
			new Notice(`「${card.title}」を「${from || '設定に無いステータス'}」→「${move.status}」にしました`);
		} catch (e) {
			notifyError(e, 'ステータスを書き込めませんでした。ノートのプロパティ（YAML）が壊れていないか確かめてください');
		}
	}

	private drawCard(col: HTMLElement, row: TaskRow, labels: RowLabels, calendar: WorkCalendar): void {
		const { task } = row;
		const card = col.createDiv({ cls: 'pm-kanban-card is-clickable' });
		formClick(card, () => openTaskForm(this.plugin, task.path));
		card.draggable = true;
		card.addEventListener('dragstart', (e) => {
			const dragged: DraggedCard = { path: task.path, title: task.title, from: row.status };
			e.dataTransfer?.setData(DRAG_TYPE, JSON.stringify(dragged));
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
			card.addClass('is-dragging');
		});
		card.addEventListener('dragend', () => card.removeClass('is-dragging'));
		const title = card.createDiv({ cls: 'pm-kanban-title' });
		kindMark(title.createSpan({ text: task.title }), 'task');
		card.createDiv({ cls: 'pm-kanban-meta', text: row.project ? labels.project(row.project) : task.project });
		const assignees = row.assignees.map((m) => m.title).join('、');
		if (assignees) card.createDiv({ cls: 'pm-kanban-meta', text: `担当：${assignees}` });
		if (task.due) {
			const due = card.createDiv({ cls: 'pm-kanban-meta', text: `期限：${task.due}` });
			holidayMark(due, calendar, task.due, row.assignees);
			const overdue = row.warnings.find((w) => w.kind === 'overdue');
			if (overdue) {
				due.addClass('pm-text-error');
				due.setAttr('aria-label', overdue.message);
			}
		}
		if (row.warnings.length > 0) {
			const warnings = card.createDiv({ cls: 'pm-kanban-meta' });
			warningBadges(warnings, row.warnings, false);
			warnings.setAttr('aria-label', row.warnings.map((w) => w.message).join('\n'));
		}
	}
}
