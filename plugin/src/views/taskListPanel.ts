import type { CalcContext } from '../calc/context';
import { EMPTY_FILTER, filterTasks, parseFilter, type ViewFilter } from '../calc/filter';
import {
	DEFAULT_TASK_LIST,
	filterTaskRows,
	groupTaskRows,
	parseTaskListOptions,
	sortTaskRows,
	taskRows,
	type RowLabels,
	type TaskGroupBy,
	type TaskListOptions,
	type TaskSortKey,
} from '../calc/taskList';
import { openNewNoteModal } from '../commands/createNote';
import { openTaskForm } from '../commands/editTask';
import { openWorklogModal } from '../commands/worklog';
import { field } from '../parse/values';
import { projectLabel } from '../settings';
import { tableHeader } from '../ui/table';
import { actionButtons, formClick } from './actions';
import { memberChoices, projectChoices, statusChoices } from './choices';
import { renderFilterBar, singleSelect } from './filterBar';
import { Panel, pluginTaskCellEnv, type PanelScope, type Shell } from './panel';
import { TASK_COLUMNS, taskCells, titleColumn, type TaskColumn } from './taskColumns';
import { taskFilterFields, withTaskFilter } from './taskFilters';

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

/** タスク一覧の部品（要件4.8、設計書 9.2・9.12） */
export class TaskListPanel extends Panel {
	readonly title = 'タスク一覧';
	private filter: ViewFilter = { ...EMPTY_FILTER };
	private options: TaskListOptions = { ...DEFAULT_TASK_LIST };
	/** 表示している行数。条件を変えたら最初に戻す */
	private limit = PAGE_SIZE;

	getState(): Record<string, unknown> {
		return { filter: this.filter, taskList: this.options };
	}

	setState(state: unknown): void {
		this.filter = parseFilter(field(state, 'filter'));
		this.options = parseTaskListOptions(field(state, 'taskList'));
		this.limit = PAGE_SIZE;
	}

	private setOptions(patch: Partial<TaskListOptions>): void {
		this.options = { ...this.options, ...patch };
		this.limit = PAGE_SIZE;
		this.host.changed();
	}

	private setFilter(filter: ViewFilter): void {
		this.filter = filter;
		this.limit = PAGE_SIZE;
		this.host.changed();
	}

	draw(shell: Shell, ctx: CalcContext, scope?: PanelScope): void {
		const mode = this.plugin.personal.projectDisplayName;
		const labels: RowLabels = { project: (p) => projectLabel(p, mode) };
		const statusOrder = ctx.statuses.task.map((s) => s.name);
		const { options } = this;
		const { summary, filters, settings, actions, notes, body: scroll } = shell;

		renderFilterBar(
			filters,
			this.filter,
			{
				projects: projectChoices(ctx, mode),
				// 担当者を固定しているときは出さない
				...(scope ? {} : { members: memberChoices(ctx), membersLabel: '担当者' }),
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
			(filter) => this.setFilter(filter),
		);
		if (scope?.note) notes.createDiv({ cls: 'pm-note', text: scope.note });

		const filter: ViewFilter = scope ? { ...this.filter, members: [scope.member.id] } : this.filter;
		let tasks = filterTasks(ctx.index.tasks({ includeArchived: filter.includeArchived }), filter, ctx.projects, ctx.statuses);
		const allowed = scope?.taskIds;
		if (allowed) tasks = tasks.filter((t) => allowed.has(t.id));
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

		// 外から足す列は「実績」の後ろに置く（並べ替えはできない）
		const extra = scope?.taskColumns ?? [];
		const at = COLUMNS.findIndex((c) => c.key === 'actual') + 1;
		const columns: (TaskColumn & { key?: TaskSortKey })[] = [...COLUMNS.slice(0, at), ...extra, ...COLUMNS.slice(at)];

		const table = scroll.createEl('table', { cls: 'pm-table' });
		const heads = tableHeader(table, columns);
		for (const [i, col] of columns.entries()) {
			const th = heads[i];
			const key = col.key;
			if (!th || !key) continue;
			th.addClass('is-sortable');
			if (options.sort === key) {
				th.addClass('is-sorted');
				th.appendText(options.desc ? ' ▼' : ' ▲');
			}
			th.addEventListener('click', () => this.setOptions(options.sort === key ? { desc: !options.desc } : { sort: key, desc: false }));
		}

		const body = table.createEl('tbody');
		const env = pluginTaskCellEnv(this.plugin, ctx, labels);
		let shown = 0;
		let total = 0;
		for (const group of groups) {
			total += group.rows.length;
			if (shown >= this.limit) continue;
			if (options.groupBy !== 'none') {
				const tr = body.createEl('tr', { cls: 'pm-table-group' });
				tr.createEl('td', { text: `${group.label}（${group.rows.length} 件）`, attr: { colspan: columns.length } });
			}
			for (const row of group.rows) {
				if (shown >= this.limit) break;
				const tr = body.createEl('tr', { cls: 'is-clickable' });
				formClick(tr, () => openTaskForm(this.plugin, row.task.path));
				taskCells(tr, row, columns, env);
				shown++;
			}
		}

		if (shown < total) {
			const more = scroll.createEl('button', { cls: 'pm-task-list-more', text: `さらに表示（残り ${total - shown} 行）` });
			more.addEventListener('click', () => {
				this.limit += PAGE_SIZE;
				this.host.redraw();
			});
		}
	}
}
