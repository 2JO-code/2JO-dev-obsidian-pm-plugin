import type { ViewStateResult } from 'obsidian';
import { openNewNoteModal } from '../commands/createNote';
import { openTaskForm } from '../commands/editTask';
import { openWorklogModal } from '../commands/worklog';
import type { CalcContext } from '../calc/context';
import { filterTasks } from '../calc/filter';
import {
	DEFAULT_TASK_LIST,
	filterTaskRows,
	groupTaskRows,
	parseTaskListOptions,
	sortTaskRows,
	taskRows,
	type TaskGroupBy,
	type RowLabels,
	type TaskListOptions,
	type TaskSortKey,
} from '../calc/taskList';
import type ProjectManagerPlugin from '../main';
import { projectLabel } from '../settings';
import { actionButtons, formClick } from './actions';
import { PmView } from './baseView';
import { memberChoices, projectChoices, statusChoices } from './choices';
import { renderFilterBar, singleSelect } from './filterBar';
import { taskFilterFields, withTaskFilter } from './taskFilters';
import { openView } from './openView';
import { tableHeader } from '../ui/table';
import { TASK_COLUMNS, taskCells, titleColumn, type TaskColumn } from './taskColumns';
import { field } from '../parse/values';
import { TASK_LIST_VIEW_TYPE } from './viewTypes';

/** 一度に表示する行数（要件4.8） */
const PAGE_SIZE = 100;

/** 列と、見出しのクリックで並べ替えるときのキー */
const COLUMNS: (TaskColumn & { key: TaskSortKey })[] = [
	{ key: 'title', ...titleColumn() },
	{ key: 'project', ...TASK_COLUMNS.project },
	{ key: 'epic', ...TASK_COLUMNS.epic },
	{ key: 'status', ...TASK_COLUMNS.status },
	{ key: 'assignee', ...TASK_COLUMNS.assignees },
	{ key: 'start', ...TASK_COLUMNS.start },
	{ key: 'end', ...TASK_COLUMNS.end },
	{ key: 'due', ...TASK_COLUMNS.due },
	{ key: 'planDelay', ...TASK_COLUMNS.planDelay },
	{ key: 'estimate', ...TASK_COLUMNS.estimate },
	{ key: 'planned', ...TASK_COLUMNS.planned },
	{
		key: 'actual',
		...TASK_COLUMNS.actual,
		// 見積を超えた実績は赤
		cell: (tr, row, env) => {
			const td = TASK_COLUMNS.actual.cell(tr, row, env);
			if (row.warnings.some((w) => w.kind === 'overEstimate')) td.addClass('pm-text-error');
			return td;
		},
	},
	{ key: 'progress', ...TASK_COLUMNS.progress },
	{ key: 'warnings', ...TASK_COLUMNS.warnings },
];

const GROUP_CHOICES: { value: TaskGroupBy; label: string }[] = [
	{ value: 'none', label: 'なし' },
	{ value: 'project', label: 'プロジェクト' },
	{ value: 'epic', label: 'エピック' },
	{ value: 'status', label: 'ステータス' },
	{ value: 'assignee', label: '担当者' },
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
		return 'タスクを表で一覧。絞り込み・並べ替え（列の見出しをクリック）・グループ分けができます。行をクリックすると入力補助フォームを開きます';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), taskList: this.options };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.options = parseTaskListOptions(
			field(state, 'taskList'),
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
					const { groupBy, sort, desc } = this.options;
					this.options = { ...DEFAULT_TASK_LIST, groupBy, sort, desc };
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
		const heads = tableHeader(table, COLUMNS);
		for (const [i, col] of COLUMNS.entries()) {
			const th = heads[i];
			if (!th) continue;
			th.addClass('is-sortable');
			if (options.sort === col.key) {
				th.addClass('is-sorted');
				th.appendText(options.desc ? ' ▼' : ' ▲');
			}
			th.addEventListener('click', () =>
				this.setOptions(options.sort === col.key ? { desc: !options.desc } : { sort: col.key, desc: false }),
			);
		}

		const body = table.createEl('tbody');
		const env = this.taskCellEnv(ctx, labels);
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
				const tr = body.createEl('tr', { cls: 'is-clickable' });
				formClick(tr, () => openTaskForm(this.plugin, row.task.path));
				taskCells(tr, row, COLUMNS, env);
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
}
