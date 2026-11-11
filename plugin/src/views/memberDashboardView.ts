import type { ViewStateResult } from 'obsidian';
import type { CalcContext } from '../calc/context';
import { addMonths, monthOfDate } from '../calc/dates';
import { hoursText, membersOf, rateText } from '../calc/format';
import { loadHoursText } from '../calc/load';
import {
	memberDashboard,
	parseMemberDashboardOptions,
	pickMember,
	type MemberDashboard,
	type MemberDashboardOptions,
} from '../calc/memberDashboard';
import type { RowLabels } from '../calc/taskList';
import { openMemberForm, openTaskForm } from '../commands/editTask';
import { openWorklogModal } from '../commands/worklog';
import type ProjectManagerPlugin from '../main';
import type { Member } from '../model';
import { projectLabel, type ProjectDisplayName } from '../settings';
import { tableHeader } from '../ui/table';
import { field } from '../parse/values';
import { actionButtons, formClick } from './actions';
import { kindMark, periodCells } from './badges';
import { PmView } from './baseView';
import { memberChoices } from './choices';
import { singleSelect } from './filterBar';
import { openView } from './openView';
import { TASK_COLUMNS, taskCells, titleColumn, type TaskColumn } from './taskColumns';
import { MEMBER_DASHBOARD_VIEW_TYPE, MEMBER_STATUS_VIEW_TYPE, PROJECT_STATUS_VIEW_TYPE } from './viewTypes';
import type { AssignedTaskRow } from '../calc/memberDashboard';

/** 担当タスクの表の列。予定・実績はこのメンバーのその月の分 */
const TASK_TABLE: TaskColumn[] = [
	titleColumn(),
	TASK_COLUMNS.project,
	TASK_COLUMNS.epic,
	TASK_COLUMNS.status,
	TASK_COLUMNS.start,
	TASK_COLUMNS.end,
	TASK_COLUMNS.due,
	TASK_COLUMNS.estimate,
	{
		label: '月の予定(h)',
		numeric: true,
		cell: (tr, row) => tr.createEl('td', { cls: 'is-numeric', text: hoursText((row as AssignedTaskRow).monthHours.planned) }),
	},
	{
		label: '月の実績(h)',
		numeric: true,
		cell: (tr, row) => tr.createEl('td', { cls: 'is-numeric', text: hoursText((row as AssignedTaskRow).monthHours.actual) }),
	},
	TASK_COLUMNS.progress,
	TASK_COLUMNS.warnings,
];

/** メンバーダッシュボードのビューと、開くコマンドを登録する */
export function registerMemberDashboardView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(MEMBER_DASHBOARD_VIEW_TYPE, (leaf) => new MemberDashboardView(leaf, plugin));
	plugin.addCommand({
		id: 'open-member-dashboard',
		name: 'メンバーダッシュボードを開く',
		callback: () => void openView(plugin.app, MEMBER_DASHBOARD_VIEW_TYPE),
	});
}

/** メンバーダッシュボード（要件4.14、設計書 9.11） */
export class MemberDashboardView extends PmView {
	private options: MemberDashboardOptions = {};

	getViewType(): string {
		return MEMBER_DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'メンバーダッシュボード';
	}

	getIcon(): string {
		return 'user-round';
	}

	protected getDescription(): string {
		return '1人のメンバーの、月ごとのアサイン案件（工数配分）と担当タスク';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), memberDashboard: this.options };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.options = parseMemberDashboardOptions(field(state, 'memberDashboard'));
		await super.setState(state, result);
	}

	private setOptions(options: MemberDashboardOptions): void {
		this.options = options;
		this.app.workspace.requestSaveLayout();
		this.redraw();
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-member-dashboard');
		const mode = this.plugin.personal.projectDisplayName;
		const { summary, settings, actions, body } = this.shell(el, { grid: true });
		const member = pickMember(ctx.index.members(), this.options.member);
		const thisMonth = monthOfDate(ctx.today);
		const month = this.options.month ?? thisMonth;

		actionButtons(actions, [
			{ text: '作業ログを入力', onClick: () => openWorklogModal(this.plugin) },
			{ text: 'メンバー状況', onClick: () => void openView(this.app, MEMBER_STATUS_VIEW_TYPE) },
		]);
		if (!member) {
			body.createDiv({ cls: 'pm-view-empty', text: 'メンバーがいません。「新しいメンバー」で作ってください' });
			return;
		}

		// 在籍者の選択肢。在籍していない人を選んでいれば、その人も足す
		const choices = memberChoices(ctx);
		if (!choices.some((c) => c.value === member.id)) choices.unshift({ value: member.id, label: `${member.title}（在籍なし）` });
		singleSelect(settings, 'メンバー', member.id, choices, (id) => this.setOptions({ ...this.options, member: id }));
		this.monthNav(settings, month, thisMonth);

		const data = memberDashboard(ctx, member, month);
		summary.setText(`${member.title}／${month}`);
		this.drawLoad(body, member, data);
		this.drawProjects(body, ctx, data, mode);
		this.drawTasks(body, ctx, data, mode);
	}

	/** 月の前・次・選択・今月への移動 */
	private monthNav(settings: HTMLElement, month: string, thisMonth: string): void {
		const nav = settings.createDiv({ cls: 'pm-filter-field' });
		nav.createSpan({ cls: 'pm-filter-label', text: '月' });
		const move = (m: string) => this.setOptions({ ...this.options, month: m });
		const prev = nav.createEl('button', { text: '◀' });
		prev.setAttr('aria-label', '前の月');
		prev.addEventListener('click', () => move(addMonths(month, -1)));
		const input = nav.createEl('input', { type: 'month', value: month });
		input.setAttr('aria-label', '月を選ぶ');
		input.addEventListener('change', () => {
			if (/^\d{4}-\d{2}$/.test(input.value)) move(input.value);
		});
		const next = nav.createEl('button', { text: '▶' });
		next.setAttr('aria-label', '次の月');
		next.addEventListener('click', () => move(addMonths(month, 1)));
		nav.createEl('button', { text: '今月' }).addEventListener('click', () => move(thisMonth));
	}

	/** 月の負荷（配分・予定・実績の時間と負荷率） */
	private drawLoad(parent: HTMLElement, member: Member, data: MemberDashboard): void {
		const { load } = data;
		const section = parent.createDiv({ cls: 'pm-section' });
		const head = section.createDiv({ cls: 'pm-section-head' });
		const name = head.createEl('h4', { text: member.title, cls: 'pm-link' });
		name.setAttr('aria-label', 'メンバーの入力補助フォームを開く');
		formClick(name, () => openMemberForm(this.plugin, member.path));
		const line = section.createDiv({ cls: 'pm-member-dashboard-load' });
		const item = (label: string, hours: number, rate: number | null, level: string) => {
			const span = line.createSpan({ cls: `pm-load-cell pm-load-${level}` });
			span.setText(`${label} ${hoursText(hours)}h（${rateText(rate)}）`);
		};
		item('配分', load.allocated, load.allocatedRate, load.allocatedLevel);
		item('予定', load.work.planned, load.plannedRate, load.plannedLevel);
		item('実績', load.work.actual, load.actualRate, load.actualLevel);
		line.createSpan({ text: `基準 ${hoursText(load.base)}h` });
		line.setAttr('aria-label', loadHoursText(load));
	}

	/** その月にアサインされている案件（工数配分のある案件） */
	private drawProjects(parent: HTMLElement, ctx: CalcContext, data: MemberDashboard, mode: ProjectDisplayName): void {
		const section = parent.createDiv({ cls: 'pm-section' });
		section.createEl('h4', { text: `アサインされている案件（${data.projects.length} 件）` });
		if (data.projects.length === 0) {
			section.createDiv({ cls: 'pm-view-empty', text: 'この月の工数配分はありません' });
			return;
		}
		const table = section.createEl('table', { cls: 'pm-table' });
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
		for (const row of data.projects) {
			const { project } = row;
			const tr = body.createEl('tr', { cls: 'is-clickable' });
			tr.addEventListener('click', () => void openView(this.app, PROJECT_STATUS_VIEW_TYPE, { project: project.id }));
			kindMark(tr.createEl('td', { text: projectLabel(project, mode) }), 'project');
			tr.createEl('td', { text: project.caseId });
			this.statusCell(tr, 'project', project.status);
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

	/** その月にかかる担当タスク */
	private drawTasks(parent: HTMLElement, ctx: CalcContext, data: MemberDashboard, mode: ProjectDisplayName): void {
		const section = parent.createDiv({ cls: 'pm-section' });
		section.createEl('h4', { text: `担当タスク（${data.tasks.length} 件）` });
		section.createDiv({
			cls: 'pm-note',
			text:
				'見込みの日程がこの月にかかるか、この月に作業ログがあるタスク（完了も含む）。月の予定・実績はこのメンバーのこの月の分' +
				(data.undatedTasks > 0 ? `。ほかに日程の無い担当タスクが ${data.undatedTasks} 件あります（タスク一覧で確認）` : ''),
		});
		if (data.tasks.length === 0) {
			section.createDiv({ cls: 'pm-view-empty', text: 'この月にかかる担当タスクはありません' });
			return;
		}
		const labels: RowLabels = { project: (p) => projectLabel(p, mode) };
		const table = section.createEl('table', { cls: 'pm-table' });
		tableHeader(table, TASK_TABLE);
		const body = table.createEl('tbody');
		const env = this.taskCellEnv(ctx, labels);
		for (const row of data.tasks) {
			const tr = body.createEl('tr', { cls: 'is-clickable' });
			formClick(tr, () => openTaskForm(this.plugin, row.task.path));
			taskCells(tr, row, TASK_TABLE, env);
		}
	}
}
