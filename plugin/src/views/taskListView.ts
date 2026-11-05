import type { ViewStateResult } from 'obsidian';
import { openNewNoteModal } from '../commands/createNote';
import { openChecklistEditor } from '../commands/editChecklist';
import { openTaskForm } from '../commands/editTask';
import { openWorklogModal } from '../commands/worklog';
import type { CalcContext } from '../calc/context';
import { filterTasks } from '../calc/filter';
import type { WorkCalendar } from '../calc/workdays';
import {
	DEFAULT_TASK_LIST,
	epicLabel,
	filterTaskRows,
	groupTaskRows,
	parseTaskListOptions,
	sortTaskRows,
	taskRows,
	type TaskGroupBy,
	type RowLabels,
	type TaskListOptions,
	type TaskRow,
	type TaskSortKey,
} from '../calc/taskList';
import type ProjectManagerPlugin from '../main';
import { projectLabel } from '../settings';
import { actionButtons, subtaskCell } from './actions';
import { kindMark, taskWarningCell } from './badges';
import { PmView } from './baseView';
import { hoursText } from './format';
import { memberChoices, projectChoices, statusChoices } from './choices';
import { renderFilterBar, singleSelect } from './filterBar';
import { taskFilterFields, withTaskFilter } from './taskFilters';
import { noteClick, openNote } from './openNote';
import { openView } from './openView';
import { dueCell, scheduleCells } from './scheduleCells';

export const TASK_LIST_VIEW_TYPE = 'pm-task-list';

/** 一度に表示する行数（要件4.8） */
const PAGE_SIZE = 100;

const COLUMNS: { key: TaskSortKey; label: string; numeric?: boolean }[] = [
	{ key: 'title', label: 'タイトル' },
	{ key: 'project', label: 'プロジェクト' },
	{ key: 'epic', label: 'エピック' },
	{ key: 'status', label: 'ステータス' },
	{ key: 'assignee', label: '担当者' },
	{ key: 'start', label: '開始（計算）' },
	{ key: 'end', label: '終了（計算）' },
	{ key: 'due', label: '期限日' },
	{ key: 'estimate', label: '見積(h)', numeric: true },
	{ key: 'planned', label: '予定(h)', numeric: true },
	{ key: 'actual', label: '実績(h)', numeric: true },
	{ key: 'progress', label: '進捗', numeric: true },
	{ key: 'warnings', label: '警告' },
];

const GROUP_CHOICES: { value: TaskGroupBy; label: string }[] = [
	{ value: 'none', label: 'なし' },
	{ value: 'project', label: 'プロジェクト' },
	{ value: 'epic', label: 'エピック' },
	{ value: 'status', label: 'ステータス' },
	{ value: 'assignee', label: '担当者' },
];

const CLICK_CHOICES: { value: 'note' | 'form'; label: string }[] = [
	{ value: 'note', label: 'ノートを開く' },
	{ value: 'form', label: '入力補助フォームで開く' },
];

/** タスク一覧のビューと、開くコマンドを登録する */
export function registerTaskListView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(TASK_LIST_VIEW_TYPE, (leaf) => new TaskListView(leaf, plugin));
	plugin.addCommand({
		id: 'open-task-list',
		name: 'タスク一覧を開く',
		callback: () => void openView(plugin.app, TASK_LIST_VIEW_TYPE),
	});
}

/** タスク一覧（要件4.8、設計書 9.2） */
export class TaskListView extends PmView {
	private options: TaskListOptions = { ...DEFAULT_TASK_LIST };
	/** 表示している行数。条件を変えたら最初に戻す */
	private limit = PAGE_SIZE;

	getViewType(): string {
		return TASK_LIST_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'タスク一覧';
	}

	getIcon(): string {
		return 'list-checks';
	}

	protected getDescription(): string {
		return 'タスクを表で一覧。絞り込み・並べ替え（列の見出しをクリック）・グループ分けができます';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), taskList: this.options };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.options = parseTaskListOptions(
			typeof state === 'object' && state !== null ? (state as { taskList?: unknown }).taskList : undefined,
		);
		this.limit = PAGE_SIZE;
		await super.setState(state, result);
	}

	private setOptions(patch: Partial<TaskListOptions>): void {
		this.options = { ...this.options, ...patch };
		this.limit = PAGE_SIZE;
		this.app.workspace.requestSaveLayout();
		this.redraw();
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-task-list');
		const mode = this.plugin.personal.projectDisplayName;
		const labels: RowLabels = { project: (p) => projectLabel(p, mode) };
		const statusOrder = ctx.statuses.task.map((s) => s.name);
		const { options } = this;
		const { summary, filters, settings, actions, body: scroll } = this.shell(el, { grid: true });

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
						this.options = withTaskFilter(this.options, next);
						this.setOptions({});
					}),
				onClear: () => {
					const { groupBy, sort, desc, clickOpensForm } = this.options;
					this.options = { ...DEFAULT_TASK_LIST, groupBy, sort, desc, clickOpensForm };
				},
			},
			(filter) => {
				this.limit = PAGE_SIZE;
				this.setFilter(filter);
			},
		);

		const tasks = filterTasks(ctx.index.tasks({ includeArchived: this.filter.includeArchived }), this.filter, ctx.projects, ctx.statuses);
		const rows = sortTaskRows(filterTaskRows(taskRows(ctx, tasks), options), options.sort, options.desc, labels, statusOrder);
		const groups = groupTaskRows(rows, options.groupBy, labels, statusOrder);

		summary.setText(`タスク ${rows.length} 件`);
		singleSelect(settings, 'グループ', options.groupBy, GROUP_CHOICES, (groupBy) => this.setOptions({ groupBy }));
		singleSelect(settings, '行のクリックで', options.clickOpensForm ? 'form' : 'note', CLICK_CHOICES, (v) =>
			this.setOptions({ clickOpensForm: v === 'form' }),
		);
		// 1つに絞り込んでいれば、作成画面でそれを選んでおく
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

		if (rows.length === 0) {
			scroll.createDiv({ cls: 'pm-view-empty', text: '条件に合うタスクはありません' });
			return;
		}

		const table = scroll.createEl('table', { cls: 'pm-table' });
		const head = table.createEl('thead').createEl('tr');
		for (const col of COLUMNS) {
			const th = head.createEl('th', { text: col.label, cls: 'is-sortable' });
			if (col.numeric) th.addClass('is-numeric');
			if (options.sort === col.key) {
				th.addClass('is-sorted');
				th.appendText(options.desc ? ' ▼' : ' ▲');
			}
			th.addEventListener('click', () =>
				this.setOptions(options.sort === col.key ? { desc: !options.desc } : { sort: col.key, desc: false }),
			);
		}

		const body = table.createEl('tbody');
		let shown = 0;
		let total = 0;
		for (const group of groups) {
			total += group.rows.length;
			if (shown >= this.limit) continue;
			if (options.groupBy !== 'none') {
				const tr = body.createEl('tr', { cls: 'pm-table-group' });
				tr.createEl('td', { text: `${group.label}（${group.rows.length} 件）`, attr: { colspan: COLUMNS.length } });
			}
			for (const row of group.rows) {
				if (shown >= this.limit) break;
				this.drawRow(body, row, labels, ctx.calendar);
				shown++;
			}
		}

		if (shown < total) {
			const more = scroll.createEl('button', { cls: 'pm-task-list-more', text: `さらに表示（残り ${total - shown} 行）` });
			more.addEventListener('click', () => {
				this.limit += PAGE_SIZE;
				this.redraw();
			});
		}
	}

	private drawRow(body: HTMLElement, row: TaskRow, labels: RowLabels, calendar: WorkCalendar): void {
		const { task } = row;
		const tr = body.createEl('tr', { cls: 'is-clickable' });
		noteClick(tr, (newTab) => this.openRow(row, newTab));

		kindMark(tr.createEl('td', { text: task.title }), 'task');
		tr.createEl('td', { text: row.project ? labels.project(row.project) : task.project });
		tr.createEl('td', { text: row.epic ? epicLabel(row.epic) : (task.epic ?? '') });

		this.statusCell(tr, 'task', row.status);

		tr.createEl('td', { text: row.assignees.map((m) => m.title).join('、') });
		scheduleCells(tr, calendar, row, row.category, row.assignees);

		dueCell(tr, calendar, row);

		const num = (value: number | undefined) => tr.createEl('td', { cls: 'is-numeric', text: hoursText(value) });
		num(task.estimate);
		num(row.hours.planned);
		const actual = num(row.hours.actual);
		if (row.warnings.some((w) => w.kind === 'overEstimate')) actual.addClass('pm-text-error');

		subtaskCell(tr, row.progress, task.subtasks, () => void openChecklistEditor(this.plugin, task.path));

		taskWarningCell(tr, row.warnings);
	}

	private openRow(row: TaskRow, newTab: boolean): void {
		if (this.options.clickOpensForm) openTaskForm(this.plugin, row.task.path);
		else void openNote(this.plugin, row.task.path, { newTab });
	}
}
