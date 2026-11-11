import type { CalcContext } from '../calc/context';
import { hoursText, membersOf, rateText } from '../calc/format';
import { loadHoursText } from '../calc/load';
import { assignedProjects, memberMonthTasks, monthLoad } from '../calc/memberDashboard';
import type { TaskRow } from '../calc/taskList';
import { openMemberForm } from '../commands/editTask';
import { MEMBER_PANEL_LABELS, type MemberPanelKind } from '../memberDashboardLayout';
import { projectLabel } from '../settings';
import { tableHeader } from '../ui/table';
import { formClick } from './actions';
import { kindMark, periodCells } from './badges';
import { openView } from './openView';
import { Panel, pluginStatusCell, type PanelHost, type PanelScope, type Shell } from './panel';
import { TaskListPanel } from './taskListPanel';
import { WorklogPanel } from './worklogPanel';
import { GanttPanel } from './ganttPanel';
import { KanbanPanel } from './kanbanPanel';
import { WbsPanel } from './wbsPanel';
import { PROJECT_STATUS_VIEW_TYPE } from './viewTypes';

/** メンバーダッシュボードに置く部品（設計書 9.12）。どれも「このメンバー・この月」（scope）が要る */

const needScope = (shell: Shell) => shell.body.createDiv({ cls: 'pm-view-empty', text: 'メンバーと月を選んでください' });

/** 月の負荷（配分・予定・実績の時間と負荷率） */
class LoadPanel extends Panel {
	readonly title = MEMBER_PANEL_LABELS.load;

	getState(): Record<string, unknown> {
		return {};
	}

	setState(): void {}

	draw(shell: Shell, ctx: CalcContext, scope?: PanelScope): void {
		if (!scope) return void needScope(shell);
		const { member, month } = scope;
		const load = monthLoad(ctx, member, month);
		const name = shell.summary.createSpan({ text: member.title, cls: 'pm-link' });
		name.setAttr('aria-label', 'メンバーの入力補助フォームを開く');
		formClick(name, () => openMemberForm(this.plugin, member.path));
		const line = shell.body.createDiv({ cls: 'pm-member-dashboard-load' });
		const item = (label: string, hours: number, rate: number | null, level: string) =>
			line.createSpan({ cls: `pm-load-cell pm-load-${level}`, text: `${label} ${hoursText(hours)}h（${rateText(rate)}）` });
		item('配分', load.allocated, load.allocatedRate, load.allocatedLevel);
		item('予定', load.work.planned, load.plannedRate, load.plannedLevel);
		item('実績', load.work.actual, load.actualRate, load.actualLevel);
		line.createSpan({ text: `基準 ${hoursText(load.base)}h` });
		line.setAttr('aria-label', loadHoursText(load));
	}
}

/** その月にアサインされている案件（工数配分のある案件） */
class AssignedProjectsPanel extends Panel {
	readonly title = MEMBER_PANEL_LABELS.projects;

	getState(): Record<string, unknown> {
		return {};
	}

	setState(): void {}

	draw(shell: Shell, ctx: CalcContext, scope?: PanelScope): void {
		if (!scope) return void needScope(shell);
		const mode = this.plugin.personal.projectDisplayName;
		const rows = assignedProjects(ctx, scope.member, scope.month);
		shell.summary.setText(`${rows.length} 件`);
		if (rows.length === 0) {
			shell.body.createDiv({ cls: 'pm-view-empty', text: 'この月の工数配分はありません' });
			return;
		}
		const table = shell.body.createEl('table', { cls: 'pm-table' });
		tableHeader(table, [
			'プロジェクト',
			'案件ID',
			'ステータス',
			{ label: '期間', colspan: 2 },
			'責任者',
			{ label: '配分(h)', numeric: true },
			{ label: '予定(h)', numeric: true },
			{ label: '実績(h)', numeric: true },
		]);
		const body = table.createEl('tbody');
		for (const row of rows) {
			const { project } = row;
			const tr = body.createEl('tr', { cls: 'is-clickable' });
			tr.addEventListener('click', () => void openView(this.app, PROJECT_STATUS_VIEW_TYPE, { project: project.id }));
			kindMark(tr.createEl('td', { text: projectLabel(project, mode) }), 'project');
			tr.createEl('td', { text: project.caseId });
			pluginStatusCell(this.plugin, tr, 'project', project.status);
			const manager = membersOf(ctx, project.manager);
			periodCells(tr, ctx.calendar, project.start, project.due, manager);
			tr.createEl('td', { text: manager.map((m) => m.title).join('、') });
			tr.createEl('td', { cls: 'is-numeric', text: hoursText(row.allocated) });
			const planned = tr.createEl('td', { cls: 'is-numeric', text: hoursText(row.hours.planned) });
			if (row.hours.planned > row.allocated) {
				planned.addClass('pm-text-error');
				planned.setAttr('aria-label', '予定が配分を超えています');
			}
			tr.createEl('td', { cls: 'is-numeric', text: hoursText(row.hours.actual) });
		}
	}
}

/** タスク一覧を「このメンバーの、この月にかかる担当タスク」に固定して出す */
class MemberTaskListPanel extends Panel {
	readonly title = MEMBER_PANEL_LABELS.taskList;
	private readonly inner: TaskListPanel;

	constructor(host: PanelHost) {
		super(host);
		this.inner = new TaskListPanel(host);
	}

	getState(): Record<string, unknown> {
		return this.inner.getState();
	}

	setState(state: unknown): void {
		this.inner.setState(state);
	}

	draw(shell: Shell, ctx: CalcContext, scope?: PanelScope): void {
		if (!scope) return void needScope(shell);
		const { member, month } = scope;
		const { tasks, undatedTasks } = memberMonthTasks(ctx, member, month);
		const monthHours = new Map(tasks.map((r) => [r.task.id, r.monthHours]));
		const hoursCell = (key: 'planned' | 'actual') => (tr: HTMLElement, row: TaskRow) =>
			tr.createEl('td', { cls: 'is-numeric', text: hoursText(monthHours.get(row.task.id)?.[key] ?? 0) });
		this.inner.draw(shell, ctx, {
			...scope,
			taskIds: new Set(monthHours.keys()),
			taskColumns: [
				{ label: '月の予定(h)', numeric: true, cell: hoursCell('planned') },
				{ label: '月の実績(h)', numeric: true, cell: hoursCell('actual') },
			],
			note:
				`${member.title}の担当で、見込みの日程が${month}にかかるか、この月に作業ログがあるタスク（完了も含む）。月の予定・実績はこの人のこの月の分` +
				(undatedTasks > 0 ? `。ほかに日程の無い担当タスクが ${undatedTasks} 件あります` : ''),
		});
	}
}

/** ガント・カンバンなどを「このメンバーの、この月にかかる担当タスク」に固定して出す */
class MonthTasksPanel extends Panel {
	constructor(
		host: PanelHost,
		readonly title: string,
		private readonly inner: Panel,
	) {
		super(host);
	}

	getState(): Record<string, unknown> {
		return this.inner.getState();
	}

	setState(state: unknown): void {
		this.inner.setState(state);
	}

	draw(shell: Shell, ctx: CalcContext, scope?: PanelScope): void {
		if (!scope) return void needScope(shell);
		const { tasks } = memberMonthTasks(ctx, scope.member, scope.month);
		this.inner.draw(shell, ctx, {
			...scope,
			taskIds: new Set(tasks.map((r) => r.task.id)),
			note: `${scope.member.title}の担当で、見込みの日程が${scope.month}にかかるか、この月に作業ログがあるタスク（完了も含む）`,
		});
	}
}

/** 初めて置いたときの部品の状態。ガントは1か月を見るので単位を「日」にする */
export function initialMemberPanelState(kind: MemberPanelKind): Record<string, unknown> {
	return kind === 'gantt' ? { gantt: { unit: 'day' } } : {};
}

/** 種類から部品を作る */
export function createMemberPanel(kind: MemberPanelKind, host: PanelHost): Panel {
	switch (kind) {
		case 'load':
			return new LoadPanel(host);
		case 'projects':
			return new AssignedProjectsPanel(host);
		case 'taskList':
			return new MemberTaskListPanel(host);
		case 'worklog':
			return new WorklogPanel(host);
		case 'gantt':
			return new MonthTasksPanel(host, MEMBER_PANEL_LABELS.gantt, new GanttPanel(host));
		case 'kanban':
			return new MonthTasksPanel(host, MEMBER_PANEL_LABELS.kanban, new KanbanPanel(host));
		case 'wbs':
			return new MonthTasksPanel(host, MEMBER_PANEL_LABELS.wbs, new WbsPanel(host));
	}
}
