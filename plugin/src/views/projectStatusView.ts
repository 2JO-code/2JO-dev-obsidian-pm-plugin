import type { ViewStateResult } from 'obsidian';
import { compareJa } from '../calc/compare';
import type { CalcContext } from '../calc/context';
import type { WorkCalendar } from '../calc/workdays';
import { openNewNoteModal } from '../commands/createNote';
import { openAllocationEditor, openMilestoneEditor } from '../commands/editProjectTables';
import { openChecklistEditor } from '../commands/editChecklist';
import { openEpicForm, openProjectForm, openTaskForm } from '../commands/editTask';
import { openWorklogModal } from '../commands/worklog';
import { findStatus } from '../config/status';
import { EMPTY_FILTER, type ViewFilter } from '../calc/filter';
import { cellKey, projectStatus, type ProjectStatus } from '../calc/projectStatus';
import type { RowLabels, TaskRow } from '../calc/taskList';
import { epicOrderOf, numberedOf, wbsKey, wbsTaskRows } from '../calc/wbs';
import { taskWbsLabel } from '../calc/wbsOrder';
import type ProjectManagerPlugin from '../main';
import type { NoteId } from '../model';
import { projectLabel } from '../settings';
import { actionButtons, rowButton, subtaskCell, toggleMark, updateToggleMark } from './actions';
import { ARCHIVE_VIEW_TYPE } from './archiveView';
import { dateCell, kindMark, periodText, progressBar, taskWarningCell } from './badges';
import { PmView } from './baseView';
import { dueCell, scheduleCells } from './scheduleCells';
import { projectChoices } from './choices';
import { singleSelect } from './filterBar';
import { hoursText, membersOf, noteTitle, pct } from './format';
import { noteLink, openNote } from './openNote';
import { openView } from './openView';
import { TASK_LIST_VIEW_TYPE } from './taskListView';
import { warningLink } from './warningLink';
import { WbsDrag, type WbsDragGroup } from './wbsDrag';

export const PROJECT_STATUS_VIEW_TYPE = 'pm-project-status';

/** プロジェクト状況のビューと、開くコマンドを登録する */
export function registerProjectStatusView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(PROJECT_STATUS_VIEW_TYPE, (leaf) => new ProjectStatusView(leaf, plugin));
	plugin.addCommand({
		id: 'open-project-status',
		name: 'プロジェクト状況を開く',
		callback: () => void openView(plugin.app, PROJECT_STATUS_VIEW_TYPE),
	});
}

/** プロジェクト状況（要件4.8、設計書 9.4） */
export class ProjectStatusView extends PmView {
	/** 表示するプロジェクト。無ければ選択肢の先頭 */
	private projectId: NoteId | undefined;
	/** タスクを開いているエピック（「エピックなし」は空文字）。保存しない */
	private expanded = new Set<string>();
	/** 行のドラッグで番号を入れ替える（WBS と同じ） */
	private readonly drag = new WbsDrag(this.app, () => this.plugin.store);

	getViewType(): string {
		return PROJECT_STATUS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'プロジェクト状況';
	}

	getIcon(): string {
		return 'gauge';
	}

	protected getDescription(): string {
		return '1つのプロジェクトの概要・マイルストーン・エピック・工数配分。エピックの行の ▶／▼ を押すとタスクを開閉';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), ...(this.projectId ? { project: this.projectId } : {}) };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const raw = typeof state === 'object' && state !== null ? (state as { project?: unknown }).project : undefined;
		this.projectId = typeof raw === 'string' ? raw : undefined;
		await super.setState(state, result);
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-project-status');
		const mode = this.plugin.personal.projectDisplayName;
		const { filters, actions, body } = this.shell(el, { grid: true });

		const choices = projectChoices(ctx, mode);
		const selected = choices.find((c) => c.value === this.projectId) ?? choices[0];
		const project = selected ? ctx.projects.get(selected.value) : undefined;
		if (!selected || !project) {
			body.createDiv({ cls: 'pm-view-empty', text: 'プロジェクトがありません' });
			actionButtons(actions, [{ text: '新しいプロジェクト', onClick: () => openNewNoteModal(this.plugin, 'project') }]);
			return;
		}

		// 表示するプロジェクトの選択は、絞り込みの欄に置く
		singleSelect(filters, 'プロジェクト', selected.value, choices, (id) => {
			this.projectId = id;
			this.expanded.clear();
			this.app.workspace.requestSaveLayout();
			this.redraw();
		});
		const closed = findStatus(ctx.statuses.project, project.status)?.category === 'done';
		actionButtons(actions, [
			{ text: 'ノートを開く', onClick: () => void openNote(this.plugin, project.path) },
			{ text: 'フォームで編集', onClick: () => openProjectForm(this.plugin, project.path) },
			{
				text: 'タスク一覧で見る',
				onClick: () => {
					const filter: ViewFilter = { ...EMPTY_FILTER, projects: [project.id], includeClosed: true };
					void openView(this.app, TASK_LIST_VIEW_TYPE, { filter });
				},
			},
			...(closed ? [{ text: 'アーカイブ対象を見る', onClick: () => void openView(this.app, ARCHIVE_VIEW_TYPE, { project: project.id }) }] : []),
		]);
		actionButtons(actions, [
			{ text: '新しいエピック', onClick: () => openNewNoteModal(this.plugin, 'epic', { project: project.id }) },
			{ text: '新しいタスク', onClick: () => openNewNoteModal(this.plugin, 'task', { project: project.id }) },
			{ text: '新しいプロジェクト', onClick: () => openNewNoteModal(this.plugin, 'project') },
		]);

		const status = projectStatus(ctx, project);
		this.drawSummary(body, status, ctx);
		this.drawMilestones(body, status, ctx);
		this.drawEpics(body, status, ctx);
		this.drawAllocation(body, status, ctx);
	}

	private drawSummary(parent: HTMLElement, s: ProjectStatus, ctx: CalcContext): void {
		const { project } = s;
		const section = parent.createDiv({ cls: 'pm-section' });
		kindMark(section.createEl('h3', { text: projectLabel(project, this.plugin.personal.projectDisplayName) }), 'project');
		const grid = section.createDiv({ cls: 'pm-summary' });
		const item = (label: string, value: string, cls?: string) => {
			grid.createDiv({ cls: 'pm-summary-label', text: label });
			return grid.createDiv({ cls: `pm-summary-value ${cls ?? ''}`, text: value });
		};
		item('簡易プロジェクト名', project.title);
		item('正式名称', project.officialName || '—');
		item('案件ID', project.caseId || '—');
		this.statusBadge(item('ステータス', project.status ? '' : '—'), 'project', project.status);
		periodText(item('期間', ''), ctx.calendar, project.start, project.due, membersOf(ctx, project.manager));
		const late = !!s.span && !!project.due && s.span.end > project.due;
		item(
			'計算上の期間',
			s.span ? `${s.span.start} 〜 ${s.span.end}${late ? '（期限日より後に終わる見込み）' : ''}` : '—',
			late ? 'pm-text-error' : undefined,
		);
		const progress = item('進捗率', s.progress.ratio === null ? '対象のタスクなし' : '');
		if (s.progress.ratio !== null) progressBar(progress, s.progress);
		const { estimate, planned, actual } = s.workload;
		item('工数', `見積 ${hoursText(estimate)}h ／ 予定 ${hoursText(planned)}h ／ 実績 ${hoursText(actual)}h`);
		const warnings = item('警告', s.warnings.length === 0 ? 'なし' : `${s.warnings.length} 件 `);
		warningLink(this.app, warnings, s.warnings, { project: project.id }, () => this.showAllocation());
	}

	/** 工数配分の表まで画面を動かす（配分超過の警告から） */
	private showAllocation(): void {
		this.contentEl.querySelector('.pm-allocation-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	private drawMilestones(parent: HTMLElement, s: ProjectStatus, ctx: CalcContext): void {
		const section = parent.createDiv({ cls: 'pm-section' });
		const head = section.createDiv({ cls: 'pm-section-head' });
		head.createEl('h4', { text: 'マイルストーン' });
		actionButtons(head, [{ text: '編集', tooltip: 'マイルストーンの表を編集', onClick: () => void openMilestoneEditor(this.plugin, s.project.id, s.project.path) }]);
		if (s.milestones.length === 0) {
			section.createDiv({ cls: 'pm-view-empty', text: 'マイルストーンはありません（「編集」から追加します）' });
			return;
		}
		const table = section.createEl('table', { cls: 'pm-table' });
		header(table, ['日付', '名前', '連動エピック', 'エピックの状況', '完了予定日', '注意']);
		const body = table.createEl('tbody');
		for (const m of s.milestones) {
			const tr = body.createEl('tr', { cls: 'is-clickable' });
			noteLink(this.plugin, tr, s.project.path, m.milestone.line);
			dateCell(tr, ctx.calendar, m.milestone.date);
			tr.createEl('td', { text: m.milestone.name });
			const epic = m.epic?.epic;
			tr.createEl('td', { text: epic ? epic.title : (m.milestone.epic ?? '') });
			tr.createEl('td', { text: m.epic && epic ? `${epic.status}・${pct(m.epic.progress)}` : '' });
			dateCell(tr, ctx.calendar, epic?.due, membersOf(ctx, epic?.owner));
			const notes: string[] = [];
			if (m.milestone.epic && !m.epic) notes.push('連動エピックが見つかりません');
			if (m.late) notes.push('完了予定日がマイルストーンより後');
			if (m.missed) notes.push('日付を過ぎたが未完了');
			tr.createEl('td', { cls: 'pm-text-error', text: notes.join('・') });
		}
	}

	private drawEpics(parent: HTMLElement, s: ProjectStatus, ctx: CalcContext): void {
		const section = parent.createDiv({ cls: 'pm-section' });
		section.createEl('h4', { text: 'エピック' });
		if (s.epics.length === 0) {
			section.createDiv({ cls: 'pm-view-empty', text: 'エピック・タスクはありません' });
			return;
		}
		section.createDiv({
			cls: 'pm-note',
			text: '▶／▼ を押すとタスクを開閉します。タイトルをクリックするとノートを開きます。行をドラッグすると番号を入れ替えます',
		});
		const table = section.createEl('table', { cls: 'pm-table' });
		header(
			table,
			['', 'WBS', 'タイトル', 'ステータス', '担当者', '進捗', '見積(h)', '予定(h)', '実績(h)', '開始（計算）', '終了（計算）', '開始日', '完了予定日／期限日', '警告', ''],
			[5, 6, 7, 8],
		);
		const body = table.createEl('tbody');
		const mode = this.plugin.personal.projectDisplayName;
		const labels: RowLabels = { project: (p) => projectLabel(p, mode) };
		const statusOrder = ctx.statuses.task.map((d) => d.name);
		const project = s.project.id;
		// エピック・タスクの入れ替えは WBS と同じ（設計書 9.7）
		const epicGroup: WbsDragGroup = { kind: 'epic', key: wbsKey.project(project), order: epicOrderOf(s) };

		for (const r of s.epics) {
			const { epic } = r;
			const key = epic?.id ?? '';
			const open = this.expanded.has(key);
			const tr = body.createEl('tr', { cls: 'pm-epic-row' });
			// 開閉は表全体を描き直さず、タスクの行だけを足す・消す（設計書 9.4）
			let taskRows: HTMLElement[] = [];
			const renderTasks = () => {
				const rows = wbsTaskRows(ctx, r.tasks, labels, statusOrder);
				const taskGroup: WbsDragGroup = { kind: 'task', key: wbsKey.epic(project, epic?.id), order: numberedOf(rows.map((t) => t.task)) };
				return rows.map((row) => this.drawTaskRow(body, row, ctx.calendar, epic?.wbs, taskGroup));
			};
			toggleMark(tr.createEl('td'), open, r.tasks.length > 0, () => {
				const opening = !this.expanded.has(key);
				if (opening) this.expanded.add(key);
				else this.expanded.delete(key);
				updateToggleMark(tr, opening);
				for (const row of taskRows) row.remove();
				taskRows = opening ? renderTasks() : [];
				tr.after(...taskRows);
			});
			tr.createEl('td', { text: epic?.wbs ?? '' });
			const title = tr.createEl('td', { text: epic ? epic.title : '（エピックなし）' });
			if (epic) {
				kindMark(title, 'epic');
				title.addClass('pm-link');
				noteLink(this.plugin, title, epic.path);
				this.drag.attach(tr, epicGroup, epic.id, epic.title);
			}
			this.statusCell(tr, 'task', epic?.status ?? '');
			// 担当者の列はエピックの担当者（タスクの件数は進捗の欄にある。設計書 9.4）
			tr.createEl('td', { text: epic?.owner ? noteTitle(ctx, epic.owner) : '' });
			progressBar(tr.createEl('td', { cls: 'is-numeric' }), r.progress);
			tr.createEl('td', { cls: 'is-numeric', text: hoursText(r.workload.estimate) });
			tr.createEl('td', { cls: 'is-numeric', text: hoursText(r.workload.planned) });
			tr.createEl('td', { cls: 'is-numeric', text: hoursText(r.workload.actual) });
			const owner = membersOf(ctx, epic?.owner);
			scheduleCells(tr, ctx.calendar, { ...(r.span ? { schedule: r.span } : {}), task: { ...(epic?.due ? { due: epic.due } : {}) } }, r.category, owner);
			dateCell(tr, ctx.calendar, epic?.start, owner);
			dateCell(tr, ctx.calendar, epic?.due, owner);
			warningLink(this.app, tr.createEl('td'), r.warnings, { project, ...(epic ? { epic: epic.id } : {}) });
			const buttons = tr.createEl('td');
			if (epic) {
				rowButton(buttons, 'フォーム', () => openEpicForm(this.plugin, epic.path));
			}
			rowButton(buttons, '＋タスク', () => openNewNoteModal(this.plugin, 'task', { project, ...(epic ? { epic: epic.id } : {}) }));

			if (open) taskRows = renderTasks();
		}
	}

	/** エピックの下に出すタスクの行。クリックでノートを開く。番号はエピックの WBS.連番 */
	private drawTaskRow(body: HTMLElement, row: TaskRow, calendar: WorkCalendar, epicWbs: string | undefined, group: WbsDragGroup): HTMLElement {
		const { task } = row;
		const tr = body.createEl('tr', { cls: 'is-clickable pm-task-sub' });
		noteLink(this.plugin, tr, task.path);
		this.drag.attach(tr, group, task.id, task.title);
		tr.createEl('td');
		tr.createEl('td', { text: taskWbsLabel(epicWbs, task.wbs) });
		kindMark(tr.createEl('td', { cls: 'pm-task-sub-title', text: task.title }), 'task');
		this.statusCell(tr, 'task', row.status);
		tr.createEl('td', { text: row.assignees.map((m) => m.title).join('、') });
		subtaskCell(tr, row.progress, task.subtasks, () => void openChecklistEditor(this.plugin, task.path));
		tr.createEl('td', { cls: 'is-numeric', text: hoursText(task.estimate) });
		tr.createEl('td', { cls: 'is-numeric', text: hoursText(row.hours.planned) });
		tr.createEl('td', { cls: 'is-numeric', text: hoursText(row.hours.actual) });
		scheduleCells(tr, calendar, row, row.category, row.assignees);
		dateCell(tr, calendar, task.start, row.assignees);
		dueCell(tr, calendar, row);
		taskWarningCell(tr, row.warnings);
		const buttons = tr.createEl('td');
		rowButton(buttons, 'フォーム', () => openTaskForm(this.plugin, task.path));
		rowButton(buttons, '＋工数', () => openWorklogModal(this.plugin, task));
		return tr;
	}


	private drawAllocation(parent: HTMLElement, s: ProjectStatus, ctx: CalcContext): void {
		const section = parent.createDiv({ cls: 'pm-section pm-allocation-section' });
		const head = section.createDiv({ cls: 'pm-section-head' });
		head.createEl('h4', { text: '工数配分' });
		actionButtons(head, [{ text: '編集', tooltip: '工数配分の表を編集', onClick: () =>
					void openAllocationEditor(this.plugin, s.project.id, s.project.path, ctx.summary),
			},
		]);
		const { months, members, cells } = s.allocation;
		if (months.length === 0) {
			section.createDiv({ cls: 'pm-view-empty', text: '配分も作業ログもありません（「編集」から配分を追加します）' });
			return;
		}
		const names = new Map(ctx.index.members().map((m) => [m.id, m.title]));
		const name = (id: NoteId) => names.get(id) ?? id;

		const table = section.createEl('table', { cls: 'pm-table pm-allocation-table' });
		const thead = table.createEl('thead');
		const top = thead.createEl('tr');
		top.createEl('th', { text: 'メンバー', attr: { rowspan: 2 } });
		for (const month of months) top.createEl('th', { text: month, cls: 'pm-month-start', attr: { colspan: 3 } });
		const sub = thead.createEl('tr');
		for (let i = 0; i < months.length; i++) {
			sub.createEl('th', { text: '配分', cls: 'is-numeric pm-month-start' });
			sub.createEl('th', { text: '予定', cls: 'is-numeric' });
			sub.createEl('th', { text: '実績', cls: 'is-numeric' });
		}

		const body = table.createEl('tbody');
		for (const member of [...members].sort((a, b) => compareJa(name(a), name(b)))) {
			const tr = body.createEl('tr');
			tr.createEl('td', { text: name(member) });
			for (const month of months) {
				const cell = cells.get(cellKey(member, month));
				const td = (text: string, cls = '') => tr.createEl('td', { cls: `is-numeric ${cls}`, text });
				const hours = td(cell?.hours === undefined ? (cell ? '—' : '') : hoursText(cell.hours), 'pm-month-start');
				const planned = td(cell ? hoursText(cell.planned) : '');
				td(cell ? hoursText(cell.actual) : '');
				if (cell?.over) {
					planned.addClass('pm-text-error');
					planned.setAttr('aria-label', `予定 ${hoursText(cell.planned)}h が配分 ${hoursText(cell.hours ?? 0)}h を超えています`);
				}
				if (cell?.line !== undefined) {
					hours.addClass('pm-action-link');
					noteLink(this.plugin, hours, s.project.path, cell.line);
				}
			}
		}
		section.createDiv({
			cls: 'pm-note',
			text: '予定・実績はこのプロジェクトのタスクに付けた作業ログの合計。配分の「—」は配分表に無い月・メンバー。配分の数字をクリックすると表の行を開きます',
		});
	}
}

/** 表の見出し。numeric に入れた列は右寄せ */
function header(table: HTMLElement, labels: string[], numeric: number[] = []): void {
	const tr = table.createEl('thead').createEl('tr');
	labels.forEach((label, i) => tr.createEl('th', { text: label, cls: numeric.includes(i) ? 'is-numeric' : '' }));
}
