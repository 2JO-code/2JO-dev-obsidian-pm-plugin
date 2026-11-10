import type { ViewStateResult } from 'obsidian';
import type { CalcContext } from '../calc/context';
import type { Status } from '../calc/projectStatus';
import type { RowLabels, TaskRow } from '../calc/taskList';
import { TreeToggle } from '../calc/treeToggle';
import { epicOrderOf, wbsKey, wbsTreeFor } from '../calc/wbs';
import { openNewNoteModal } from '../commands/createNote';
import { openEpicForm, openTaskForm } from '../commands/editTask';
import type ProjectManagerPlugin from '../main';
import { findStatus } from '../config/status';
import type { IsoDate, NoteId, StatusCategory, StatusSets } from '../model';
import { projectLabel } from '../settings';
import { actionButtons, cellLink, formClick, rowButton } from './actions';
import { dateCell, kindMark, progressBar } from './badges';
import { PmView } from './baseView';
import { ChildRows } from './childRows';
import { memberChoices, projectChoices, statusChoices } from './choices';
import { renderFilterBar } from './filterBar';
import { hoursText, membersOf, noteTitle } from '../calc/format';
import { openView } from './openView';
import { scheduleCells } from './scheduleCells';
import { tableHeader } from '../ui/table';
import { blankColumn, TASK_COLUMNS, taskCells, titleColumn, wbsColumn, type TaskCellEnv, type TaskColumn } from './taskColumns';
import { warningLink } from './warningLink';
import { WbsDrag, type WbsDragGroup } from './wbsDrag';
import { field } from '../parse/values';
import { PROJECT_STATUS_VIEW_TYPE, WBS_VIEW_TYPE } from './viewTypes';
import { toggleMark } from '../ui/controls';

/** タスクの行の列。プロジェクト・エピックの行も同じ見出しの下に並べる */
const COLUMNS: TaskColumn[] = [
	wbsColumn('pm-wbs-number'),
	titleColumn('pm-wbs-indent-2'),
	TASK_COLUMNS.status,
	TASK_COLUMNS.assignees,
	TASK_COLUMNS.start,
	TASK_COLUMNS.end,
	TASK_COLUMNS.due,
	TASK_COLUMNS.progress,
	TASK_COLUMNS.estimate,
	TASK_COLUMNS.warnings,
	blankColumn(),
];

/** WBS のビューと、開くコマンドを登録する */
export function registerWbsView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(WBS_VIEW_TYPE, (leaf) => new WbsView(leaf, plugin));
	plugin.addCommand({
		id: 'open-wbs',
		name: 'WBSを開く',
		callback: () => void openView(plugin.app, WBS_VIEW_TYPE),
	});
}

/** WBS（プロジェクト → エピック → タスク。要件4.8b、設計書 9.7） */
export class WbsView extends PmView {
	/** 階層の開閉。変えたら状態の保存を頼む */
	private readonly tree = new TreeToggle(() => this.app.workspace.requestSaveLayout());
	/** 開いているエピックのタスクの行（キーは `wbsKey`） */
	private readonly taskRows = new ChildRows();
	/** 行のドラッグで番号を入れ替える */
	private readonly drag = new WbsDrag(this.app, () => this.plugin.store);

	getViewType(): string {
		return WBS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'WBS';
	}

	getIcon(): string {
		return 'list-tree';
	}

	protected getDescription(): string {
		return 'プロジェクト → エピック → タスクの階層と見込みの日程。▶／▼ を押すと開閉。エピック・タスクの行をドラッグすると番号を入れ替え';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), wbs: { toggled: this.tree.saved() } };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.tree.load(field(field(state, 'wbs'), 'toggled'));
		await super.setState(state, result);
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-wbs');
		const mode = this.plugin.personal.projectDisplayName;
		const labels: RowLabels = { project: (p) => projectLabel(p, mode) };
		const { summary, filters, settings, actions, notes, body } = this.shell(el, { grid: true });
		const { filter } = this;

		renderFilterBar(
			filters,
			filter,
			{
				projects: projectChoices(ctx, mode),
				members: memberChoices(ctx),
				membersLabel: '担当者',
				statuses: statusChoices(ctx),
				closed: true,
				archived: true,
			},
			(next) => this.setFilter(next),
		);

		const { tree, narrowed } = wbsTreeFor(ctx, filter, labels);

		summary.setText(`プロジェクト ${tree.length} 件`);
		const expand = settings.createEl('button', { text: 'すべて開く' });
		expand.addEventListener('click', () => {
			this.tree.setAll(tree, true);
			this.redraw();
		});
		const collapse = settings.createEl('button', { text: 'すべて閉じる' });
		collapse.addEventListener('click', () => {
			this.tree.setAll(tree, false);
			this.redraw();
		});
		actionButtons(actions, [{ text: '新しいプロジェクト', onClick: () => openNewNoteModal(this.plugin, 'project') }]);
		if (narrowed) {
			notes.createDiv({ cls: 'pm-note', text: '担当者・ステータスで絞り込み中。進捗・見積・期間はエピック・プロジェクト全体の値です' });
		}

		if (tree.length === 0) {
			body.createDiv({ cls: 'pm-view-empty', text: '条件に合うプロジェクトはありません' });
			return;
		}

		const table = body.createEl('table', { cls: 'pm-table pm-wbs-table' });
		tableHeader(table, COLUMNS);
		const tbody = table.createEl('tbody');
		this.taskRows.clear();

		for (const p of tree) {
			const { project } = p.status;
			const projectKey = wbsKey.project(project.id);
			const projectOpen = this.tree.isOpen(projectKey);
			const tr = this.groupRow(tbody, 'pm-wbs-project', projectOpen, p.epics.length > 0, () => {
				this.tree.flip(projectKey);
				this.redraw();
			});
			const title = tr.createEl('td', { text: labels.project(project) });
			kindMark(title, 'project');
			cellLink(title, () => void openView(this.app, PROJECT_STATUS_VIEW_TYPE, { project: project.id }));
			title.setAttr('aria-label', 'プロジェクト状況を開く');
			this.statusCells(tr, 'project', project.status, project.manager, p.status, project.due, findStatus(ctx.statuses.project, project.status)?.category, { project: project.id }, ctx);
			rowButton(tr.createEl('td'), '＋エピック', () => openNewNoteModal(this.plugin, 'epic', { project: project.id }));
			if (!projectOpen) continue;

			// エピックはプロジェクトの中で入れ替える（絞り込みで隠れたエピックも含めて振り直す）
			const epicGroup: WbsDragGroup = { kind: 'epic', key: projectKey, order: epicOrderOf(p.status) };

			for (const e of p.epics) {
				const { epic } = e.row;
				const key = wbsKey.epic(project.id, epic?.id);
				const open = this.tree.isOpen(key);
				const taskGroup: WbsDragGroup = { kind: 'task', key, order: e.order };
				const env = this.taskCellEnv(ctx, labels, epic?.wbs);
				const renderTasks = () => e.tasks.map((t) => ({ row: this.taskRow(tbody, t, env, taskGroup) }));
				// エピックの開閉は表全体を描き直さず、タスクの行だけを足す・消す（設計書 9.7）
				const er = this.groupRow(tbody, 'pm-wbs-epic', open, e.tasks.length > 0, () => this.taskRows.replace(key, er, this.tree.flip(key), renderTasks), epic?.wbs ?? '');
				const et = er.createEl('td', { cls: 'pm-wbs-indent-1', text: epic ? epic.title : '（エピックなし）' });
				if (epic) {
					kindMark(et, 'epic');
					et.addClass('pm-link');
					formClick(et, () => openEpicForm(this.plugin, epic.path));
					this.drag.attach(er, epicGroup, epic.id, epic.title);
				}
				this.statusCells(er, 'task', epic?.status ?? '', epic?.owner, e.row, epic?.due, e.row.category, {
					project: project.id,
					...(epic ? { epic: epic.id } : {}),
				}, ctx);
				rowButton(er.createEl('td'), '＋タスク', () => openNewNoteModal(this.plugin, 'task', { project: project.id, ...(epic ? { epic: epic.id } : {}) }));
				if (open) this.taskRows.set(key, renderTasks());
			}
		}
	}

	/** 開閉できる行。先頭のセルに ▶／▼（押すと開閉）と WBS 番号 */
	private groupRow(tbody: HTMLElement, cls: string, open: boolean, hasChildren: boolean, onToggle: () => void, wbs = ''): HTMLElement {
		const tr = tbody.createEl('tr', { cls });
		const first = tr.createEl('td', { cls: 'pm-wbs-number' });
		toggleMark(first, open, hasChildren, onToggle);
		first.appendText(wbs);
		return tr;
	}

	/** プロジェクト・エピックの行の、ステータス〜警告のセル。person は責任者・担当者 */
	private statusCells(
		tr: HTMLElement,
		set: keyof StatusSets,
		status: string,
		person: NoteId | undefined,
		s: Status,
		due: IsoDate | undefined,
		category: StatusCategory | undefined,
		target: { project: NoteId; epic?: NoteId },
		ctx: CalcContext,
	): void {
		const { calendar } = ctx;
		const people = membersOf(ctx, person);
		this.statusCell(tr, set, status);
		tr.createEl('td', { text: person ? noteTitle(ctx, person) : '' });
		scheduleCells(tr, calendar, { ...(s.span ? { schedule: s.span } : {}), task: { ...(due ? { due } : {}) } }, category, people);
		dateCell(tr, calendar, due, people);
		progressBar(tr.createEl('td', { cls: 'is-numeric' }), s.progress);
		tr.createEl('td', { cls: 'is-numeric', text: hoursText(s.workload.estimate) });
		warningLink(this.app, tr.createEl('td'), s.warnings, target, () => void openView(this.app, PROJECT_STATUS_VIEW_TYPE, { project: target.project }));
	}

	/** タスクの行。番号はエピックの WBS.連番（設計書 11.17） */
	private taskRow(tbody: HTMLElement, row: TaskRow, env: TaskCellEnv, group: WbsDragGroup): HTMLElement {
		const { task } = row;
		const tr = tbody.createEl('tr', { cls: 'is-clickable pm-wbs-task' });
		formClick(tr, () => openTaskForm(this.plugin, task.path));
		this.drag.attach(tr, group, task.id, task.title);
		taskCells(tr, row, COLUMNS, env);
		return tr;
	}
}
