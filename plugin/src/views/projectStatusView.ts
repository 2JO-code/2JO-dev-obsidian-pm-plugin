import type { ViewStateResult } from 'obsidian';
import { compareJa } from '../calc/compare';
import type { CalcContext } from '../calc/context';
import { openNewNoteModal } from '../commands/createNote';
import { openAllocationEditor, openMilestoneEditor } from '../commands/editProjectTables';
import { openEpicForm, openProjectForm, openTaskForm } from '../commands/editTask';
import { openWorklogModal } from '../commands/worklog';
import { findStatus } from '../config/status';
import { EMPTY_FILTER, type ViewFilter } from '../calc/filter';
import { cellKey, projectStatus, type ProjectStatus } from '../calc/projectStatus';
import type { RowLabels, TaskRow } from '../calc/taskList';
import { TreeToggle } from '../calc/treeToggle';
import { epicOrderOf, numberedOf, wbsKey, wbsTaskRows } from '../calc/wbs';
import type ProjectManagerPlugin from '../main';
import type { NoteId, Project } from '../model';
import { projectLabel, type ProjectSection } from '../settings';
import { actionButtons, formClick, rowButton } from './actions';
import { dateCell, kindMark, periodText, progressBar } from './badges';
import { PmView } from './baseView';
import { ChildRows } from './childRows';
import { scheduleCells } from './scheduleCells';
import { tableHeader } from '../ui/table';
import { blankColumn, TASK_COLUMNS, taskCells, titleColumn, wbsColumn, type TaskCellEnv, type TaskColumn } from './taskColumns';
import { projectChoices } from './choices';
import { singleSelect } from './filterBar';
import { checkbox, toggleMark } from '../ui/controls';
import { renderBurnup, renderProgress } from './burnupChart';
import { burnup, progressPlan } from '../calc/burnup';
import { hoursText, membersOf, noteTitle, pct } from '../calc/format';
import { openView } from './openView';
import { warningLink } from './warningLink';
import { WbsDrag, type WbsDragGroup } from './wbsDrag';
import { field } from '../parse/values';
import { ARCHIVE_VIEW_TYPE, PROJECT_STATUS_VIEW_TYPE, TASK_LIST_VIEW_TYPE } from './viewTypes';

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
	/** エピックの開閉（キーは `wbsKey`。初期は閉じる）。保存しない */
	private readonly tree = new TreeToggle();
	/** 開いているエピックのタスクの行 */
	private readonly taskRows = new ChildRows();
	/** 行のドラッグで番号を入れ替える（WBS と同じ） */
	private readonly drag = new WbsDrag(this.app, () => this.plugin.store);
	/** グラフを出すか（ビューの状態として保存。初期は両方出す） */
	private charts = { burnup: true, progress: true };

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
		return '1つのプロジェクトの概要・進捗グラフ・マイルストーン・エピックとタスク・工数配分。エピックの行の ▶／▼ を押すとタスクを開閉';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), ...(this.projectId ? { project: this.projectId } : {}), charts: this.charts };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const raw = field(state, 'project');
		const charts = field(state, 'charts');
		this.projectId = typeof raw === 'string' ? raw : undefined;
		this.charts = { burnup: field(charts, 'burnup') !== false, progress: field(charts, 'progress') !== false };
		await super.setState(state, result);
	}

	private setCharts(charts: { burnup: boolean; progress: boolean }): void {
		this.charts = charts;
		this.app.workspace.requestSaveLayout();
		this.redraw();
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
			this.tree.clear();
			this.app.workspace.requestSaveLayout();
			this.redraw();
		});
		const closed = findStatus(ctx.statuses.project, project.status)?.category === 'done';
		actionButtons(actions, [
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
			{ text: '新しいプロジェクト', onClick: () => openNewNoteModal(this.plugin, 'project') },
		]);

		const status = projectStatus(ctx, project);
		this.drawSummary(body, status, ctx);
		// 概要の下の節は、個人の設定の並び順で、表示ありのものだけ出す
		const sections: Record<ProjectSection, () => void> = {
			progress: () => this.drawBurnup(body, ctx, project),
			milestones: () => this.drawMilestones(body, status, ctx),
			epics: () => this.drawEpics(body, status, ctx),
			allocation: () => this.drawAllocation(body, status, ctx),
		};
		for (const s of this.plugin.personal.projectSections) if (s.visible) sections[s.id]();
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
			'見込みの期間',
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

	/** 工数の累積と進捗率のグラフ（設計書 9.5） */
	private drawBurnup(parent: HTMLElement, ctx: CalcContext, project: Project): void {
		const section = parent.createDiv({ cls: 'pm-section' });
		const head = section.createDiv({ cls: 'pm-section-head' });
		head.createEl('h4', { text: '進捗グラフ' });
		const { charts } = this;
		checkbox(head, '工数の累積', charts.burnup, (on) => this.setCharts({ ...charts, burnup: on }));
		checkbox(head, '進捗率', charts.progress, (on) => this.setCharts({ ...charts, progress: on }));
		if (!charts.burnup && !charts.progress) return;
		const result = burnup(ctx, project);
		if (!result) {
			section.createDiv({ cls: 'pm-view-empty', text: '作業ログも日付もないため、グラフを描けません' });
			return;
		}
		// 2つのグラフを横に並べる。幅が足りないときは縦に折り返す
		const pair = section.createDiv({ cls: 'pm-burnup-pair' });
		if (charts.burnup) {
			const cell = pair.createDiv({ cls: 'pm-burnup-cell' });
			cell.createEl('h5', { cls: 'pm-burnup-title', text: '工数の累積（予定・実績）' });
			renderBurnup(cell, result, ctx.today);
		}
		// 進捗率のグラフ。期間は工数の累積とそろえ、並べて見比べられるようにする
		if (charts.progress) {
			const cell = pair.createDiv({ cls: 'pm-burnup-cell' });
			cell.createEl('h5', { cls: 'pm-burnup-title', text: '進捗率（予定と今日の実績）' });
			renderProgress(cell, progressPlan(ctx, project, result), result, ctx.today);
		}
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
		tableHeader(table, ['日付', '名前', '連動エピック', 'エピックの状況', '期限日', '注意']);
		const body = table.createEl('tbody');
		for (const m of s.milestones) {
			const tr = body.createEl('tr', { cls: 'is-clickable' });
			formClick(tr, () => void openMilestoneEditor(this.plugin, s.project.id, s.project.path));
			dateCell(tr, ctx.calendar, m.milestone.date);
			tr.createEl('td', { text: m.milestone.name });
			const epic = m.epic?.epic;
			tr.createEl('td', { text: epic ? epic.title : (m.milestone.epic ?? '') });
			tr.createEl('td', { text: m.epic && epic ? `${epic.status}・${pct(m.epic.progress)}` : '' });
			dateCell(tr, ctx.calendar, epic?.due, membersOf(ctx, epic?.owner));
			tr.createEl('td', { cls: 'pm-text-error', text: m.notes.join('・') });
		}
	}

	private drawEpics(parent: HTMLElement, s: ProjectStatus, ctx: CalcContext): void {
		const section = parent.createDiv({ cls: 'pm-section' });
		const head = section.createDiv({ cls: 'pm-section-head' });
		head.createEl('h4', { text: 'エピックとタスク' });
		actionButtons(head, [
			{ text: '新しいエピック', onClick: () => openNewNoteModal(this.plugin, 'epic', { project: s.project.id }) },
			{ text: '新しいタスク', onClick: () => openNewNoteModal(this.plugin, 'task', { project: s.project.id }) },
		]);
		if (s.epics.length === 0) {
			section.createDiv({ cls: 'pm-view-empty', text: 'エピック・タスクはありません' });
			return;
		}
		section.createDiv({
			cls: 'pm-note',
			text: '▶／▼ を押すとタスクを開閉します。エピックのタイトルやタスクの行をクリックすると入力補助フォームを開きます。行をドラッグすると番号を入れ替えます',
		});
		const table = section.createEl('table', { cls: 'pm-table' });
		const columns = this.taskColumns();
		tableHeader(table, columns);
		const body = table.createEl('tbody');
		const mode = this.plugin.personal.projectDisplayName;
		const labels: RowLabels = { project: (p) => projectLabel(p, mode) };
		const statusOrder = ctx.statuses.task.map((d) => d.name);
		const project = s.project.id;
		// エピック・タスクの入れ替えは WBS と同じ（設計書 9.7）
		const epicGroup: WbsDragGroup = { kind: 'epic', key: wbsKey.project(project), order: epicOrderOf(s) };
		this.taskRows.clear();

		for (const r of s.epics) {
			const { epic } = r;
			const key = wbsKey.epic(project, epic?.id);
			const open = this.tree.isOpen(key);
			const tr = body.createEl('tr', { cls: 'pm-epic-row' });
			const renderTasks = () => {
				const rows = wbsTaskRows(ctx, r.tasks, labels, statusOrder);
				const taskGroup: WbsDragGroup = { kind: 'task', key, order: numberedOf(rows.map((t) => t.task)) };
				const env = this.taskCellEnv(ctx, labels, epic?.wbs);
				return rows.map((row) => ({ row: this.drawTaskRow(body, row, columns, env, taskGroup) }));
			};
			// 開閉は表全体を描き直さず、タスクの行だけを足す・消す（設計書 9.4）
			toggleMark(tr.createEl('td'), open, r.tasks.length > 0, () => this.taskRows.replace(key, tr, this.tree.flip(key), renderTasks));
			tr.createEl('td', { text: epic?.wbs ?? '' });
			const title = tr.createEl('td', { text: epic ? epic.title : '（エピックなし）' });
			if (epic) {
				kindMark(title, 'epic');
				title.addClass('pm-link');
				formClick(title, () => openEpicForm(this.plugin, epic.path));
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
			rowButton(tr.createEl('td'), '＋タスク', () => openNewNoteModal(this.plugin, 'task', { project, ...(epic ? { epic: epic.id } : {}) }));

			if (open) this.taskRows.set(key, renderTasks());
		}
	}

	/** エピックの下に出すタスクの行。クリックで入力補助フォームを開く。番号はエピックの WBS.連番 */
	private drawTaskRow(body: HTMLElement, row: TaskRow, columns: readonly TaskColumn[], env: TaskCellEnv, group: WbsDragGroup): HTMLElement {
		const { task } = row;
		const tr = body.createEl('tr', { cls: 'is-clickable pm-task-sub' });
		formClick(tr, () => openTaskForm(this.plugin, task.path));
		this.drag.attach(tr, group, task.id, task.title);
		taskCells(tr, row, columns, env);
		return tr;
	}

	/** エピックの表の列。エピックの行も同じ見出しの下に並べる。最後の列はタスクの「＋工数」 */
	private taskColumns(): TaskColumn[] {
		return [
			blankColumn(),
			wbsColumn(),
			titleColumn('pm-task-sub-title'),
			TASK_COLUMNS.status,
			TASK_COLUMNS.assignees,
			TASK_COLUMNS.progress,
			TASK_COLUMNS.estimate,
			TASK_COLUMNS.planned,
			TASK_COLUMNS.actual,
			TASK_COLUMNS.start,
			TASK_COLUMNS.end,
			TASK_COLUMNS.startDate,
			{ ...TASK_COLUMNS.due, label: '期限日' },
			TASK_COLUMNS.warnings,
			{
				label: '',
				cell: (tr, row) => {
					const td = tr.createEl('td');
					rowButton(td, '＋工数', () => openWorklogModal(this.plugin, row.task));
					return td;
				},
			},
		];
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
					formClick(hours, () => void openAllocationEditor(this.plugin, s.project.id, s.project.path, ctx.summary));
				}
			}
		}
		section.createDiv({
			cls: 'pm-note',
			text: '予定・実績はこのプロジェクトのタスクに付けた作業ログの合計。配分の「—」は配分表に無い月・メンバー。配分の数字をクリックすると工数配分の編集画面を開きます',
		});
	}
}
