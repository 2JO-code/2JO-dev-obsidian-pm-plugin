import type { ViewStateResult } from 'obsidian';
import type { CalcContext } from '../calc/context';
import type { WorkCalendar } from '../calc/workdays';
import type { Status } from '../calc/projectStatus';
import type { RowLabels, TaskRow } from '../calc/taskList';
import { epicOrderOf, isOpen, parseToggled, toggledForAll, wbsKey, wbsTreeFor, type WbsProject } from '../calc/wbs';
import { taskWbsLabel } from '../calc/wbsOrder';
import { openNewNoteModal } from '../commands/createNote';
import { openChecklistEditor } from '../commands/editChecklist';
import { openEpicForm, openTaskForm } from '../commands/editTask';
import type ProjectManagerPlugin from '../main';
import { findStatus } from '../config/status';
import type { IsoDate, NoteId, StatusCategory, StatusSets } from '../model';
import { projectLabel } from '../settings';
import { actionButtons, cellLink, rowButton, subtaskCell, toggleMark, updateToggleMark } from './actions';
import { dateCell, kindMark, progressBar, taskWarningCell } from './badges';
import { PmView } from './baseView';
import { memberChoices, projectChoices, statusChoices } from './choices';
import { renderFilterBar } from './filterBar';
import { hoursText, membersOf, noteTitle } from './format';
import { noteLink } from './openNote';
import { openView } from './openView';
import { PROJECT_STATUS_VIEW_TYPE } from './projectStatusView';
import { dueCell, scheduleCells } from './scheduleCells';
import { warningLink } from './warningLink';
import { WbsDrag, type WbsDragGroup } from './wbsDrag';

export const WBS_VIEW_TYPE = 'pm-wbs';

const COLUMNS = ['WBS', 'タイトル', 'ステータス', '担当者', '開始（計算）', '終了（計算）', '期限日', '進捗', '見積(h)', '警告', ''];
const NUMERIC = new Set([7, 8]);

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
	/** 初期の開閉と逆にした行のキー（`wbsKey`） */
	private toggled = new Set<string>();
	/** 開いているエピックのタスクの行（キーは `wbsKey`）。開閉のときに足し引きする */
	private readonly taskRowsOf = new Map<string, HTMLElement[]>();
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
		return 'プロジェクト → エピック → タスクの階層と計算上の日程。▶／▼ を押すと開閉。エピック・タスクの行をドラッグすると番号を入れ替え';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), wbs: { toggled: [...this.toggled] } };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const wbs = typeof state === 'object' && state !== null ? (state as { wbs?: { toggled?: unknown } }).wbs : undefined;
		this.toggled = parseToggled(wbs?.toggled);
		await super.setState(state, result);
	}

	private isOpen(key: string): boolean {
		return isOpen(this.toggled, key);
	}

	private toggle(key: string): void {
		if (this.toggled.has(key)) this.toggled.delete(key);
		else this.toggled.add(key);
		this.app.workspace.requestSaveLayout();
		this.redraw();
	}

	/**
	 * エピックの開閉。表全体は描き直さず、そのエピックのタスクの行だけを足す・消す（設計書 9.7）
	 * @param render タスクの行を作る（表の末尾に作り、エピックの行の後ろへ動かす）
	 */
	private toggleEpic(key: string, epicRow: HTMLElement, render: () => HTMLElement[]): void {
		if (this.toggled.has(key)) this.toggled.delete(key);
		else this.toggled.add(key);
		this.app.workspace.requestSaveLayout();
		const open = this.isOpen(key);
		updateToggleMark(epicRow, open);
		for (const row of this.taskRowsOf.get(key) ?? []) row.remove();
		const rows = open ? render() : [];
		epicRow.after(...rows);
		this.taskRowsOf.set(key, rows);
	}

	/** すべて開く（open=true）か、すべて閉じる */
	private setAll(tree: WbsProject[], open: boolean): void {
		this.toggled = toggledForAll(tree, open);
		this.app.workspace.requestSaveLayout();
		this.redraw();
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
		expand.addEventListener('click', () => this.setAll(tree, true));
		const collapse = settings.createEl('button', { text: 'すべて閉じる' });
		collapse.addEventListener('click', () => this.setAll(tree, false));
		actionButtons(actions, [{ text: '新しいプロジェクト', onClick: () => openNewNoteModal(this.plugin, 'project') }]);
		if (narrowed) {
			notes.createDiv({ cls: 'pm-note', text: '担当者・ステータスで絞り込み中。進捗・見積・期間はエピック・プロジェクト全体の値です' });
		}

		if (tree.length === 0) {
			body.createDiv({ cls: 'pm-view-empty', text: '条件に合うプロジェクトはありません' });
			return;
		}

		const table = body.createEl('table', { cls: 'pm-table pm-wbs-table' });
		const head = table.createEl('thead').createEl('tr');
		COLUMNS.forEach((label, i) => head.createEl('th', { text: label, cls: NUMERIC.has(i) ? 'is-numeric' : '' }));
		const tbody = table.createEl('tbody');
		this.taskRowsOf.clear();

		for (const p of tree) {
			const { project } = p.status;
			const projectKey = wbsKey.project(project.id);
			const projectOpen = this.isOpen(projectKey);
			const tr = this.groupRow(tbody, 'pm-wbs-project', projectOpen, p.epics.length > 0, () => this.toggle(projectKey));
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
				const open = this.isOpen(key);
				const taskGroup: WbsDragGroup = { kind: 'task', key, order: e.order };
				const renderTasks = () => e.tasks.map((t) => this.taskRow(tbody, t, ctx.calendar, epic?.wbs, taskGroup));
				const er = this.groupRow(tbody, 'pm-wbs-epic', open, e.tasks.length > 0, () => this.toggleEpic(key, er, renderTasks), epic?.wbs ?? '');
				const et = er.createEl('td', { cls: 'pm-wbs-indent-1', text: epic ? epic.title : '（エピックなし）' });
				if (epic) {
					kindMark(et, 'epic');
					et.addClass('pm-link');
					noteLink(this.plugin, et, epic.path);
					this.drag.attach(er, epicGroup, epic.id, epic.title);
				}
				this.statusCells(er, 'task', epic?.status ?? '', epic?.owner, e.row, epic?.due, e.row.category, {
					project: project.id,
					...(epic ? { epic: epic.id } : {}),
				}, ctx);
				const buttons = er.createEl('td');
				if (epic) {
					rowButton(buttons, 'フォーム', () => openEpicForm(this.plugin, epic.path));
				}
				rowButton(buttons, '＋タスク', () => openNewNoteModal(this.plugin, 'task', { project: project.id, ...(epic ? { epic: epic.id } : {}) }));
				if (open) this.taskRowsOf.set(key, renderTasks());
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
	private taskRow(tbody: HTMLElement, row: TaskRow, calendar: WorkCalendar, epicWbs: string | undefined, group: WbsDragGroup): HTMLElement {
		const { task } = row;
		const tr = tbody.createEl('tr', { cls: 'is-clickable pm-wbs-task' });
		noteLink(this.plugin, tr, task.path);
		this.drag.attach(tr, group, task.id, task.title);
		tr.createEl('td', { cls: 'pm-wbs-number', text: taskWbsLabel(epicWbs, task.wbs) });
		kindMark(tr.createEl('td', { cls: 'pm-wbs-indent-2', text: task.title }), 'task');
		this.statusCell(tr, 'task', row.status);
		tr.createEl('td', { text: row.assignees.map((m) => m.title).join('、') });
		scheduleCells(tr, calendar, row, row.category, row.assignees);
		dueCell(tr, calendar, row);
		subtaskCell(tr, row.progress, task.subtasks, () => void openChecklistEditor(this.plugin, task.path));
		tr.createEl('td', { cls: 'is-numeric', text: hoursText(task.estimate) });
		taskWarningCell(tr, row.warnings);
		rowButton(tr.createEl('td'), 'フォーム', () => openTaskForm(this.plugin, task.path));
		return tr;
	}
}
