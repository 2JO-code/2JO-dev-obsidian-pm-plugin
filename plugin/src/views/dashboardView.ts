import type { ViewStateResult } from 'obsidian';
import { burnup, progressPlan } from '../calc/burnup';
import { compareNumeric } from '../calc/compare';
import type { CalcContext } from '../calc/context';
import type { WorkCalendar } from '../calc/workdays';
import { dashboard, MILESTONE_DAYS, type Dashboard } from '../calc/dashboard';
import { filterProjects } from '../calc/filter';
import { isLoadChartPeriod, isLoadChartSort, loadChart, LOAD_CHART_PERIODS, LOAD_CHART_SORTS, type LoadChartPeriod, type LoadChartSort } from '../calc/loadChart';
import { openNewNoteModal } from '../commands/createNote';
import { exportHtmlReport } from '../commands/htmlReport';
import { openWorklogModal } from '../commands/worklog';
import type ProjectManagerPlugin from '../main';
import type { Member } from '../model';
import { projectLabel } from '../settings';
import { actionButtons } from './actions';
import { PmView } from './baseView';
import { projectChoices } from './choices';
import { renderBurnup, renderProgress } from './burnupChart';
import { checkbox, renderFilterBar, singleSelect } from './filterBar';
import { dateCell, holidayMark, kindMark, periodCells, progressBar } from './badges';
import { hoursText, membersOf, pct } from './format';
import { renderLoadChart } from './loadChart';
import { MEMBER_STATUS_VIEW_TYPE } from './memberStatusView';
import { noteLink } from './openNote';
import { openView } from './openView';
import { PROJECT_STATUS_VIEW_TYPE } from './projectStatusView';
import { warningLink } from './warningLink';

export const DASHBOARD_VIEW_TYPE = 'pm-dashboard';

/** ダッシュボードのビューと、開くコマンドを登録する */
export function registerDashboardView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, plugin));
	plugin.addCommand({
		id: 'open-dashboard',
		name: 'ダッシュボードを開く',
		callback: () => void openView(plugin.app, DASHBOARD_VIEW_TYPE),
	});
}

/** ダッシュボード（全プロジェクト状況。要件4.8b、設計書 9.5） */
export class DashboardView extends PmView {
	/** 工数の累積のグラフで選んだプロジェクト。無ければ表の先頭 */
	private burnupProject: string | undefined;
	/** グラフを出すか（ビューの状態として保存。初期は両方出す。設計書 9.5） */
	private charts = { burnup: true, progress: true };
	/** 負荷率のグラフの期間（ビューの状態として保存。初期は今週） */
	private loadPeriod: LoadChartPeriod = 'thisWeek';
	/** 負荷率のグラフの並び順（ビューの状態として保存。初期は名前順） */
	private loadSort: LoadChartSort = 'name';

	getState(): Record<string, unknown> {
		return {
			...super.getState(),
			...(this.burnupProject ? { burnupProject: this.burnupProject } : {}),
			charts: this.charts,
			loadPeriod: this.loadPeriod,
			loadSort: this.loadSort,
		};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const raw =
			typeof state === 'object' && state !== null
				? (state as { burnupProject?: unknown; charts?: { burnup?: unknown; progress?: unknown }; loadPeriod?: unknown; loadSort?: unknown })
				: {};
		this.loadSort = isLoadChartSort(raw.loadSort) ? raw.loadSort : 'name';
		this.burnupProject = typeof raw.burnupProject === 'string' ? raw.burnupProject : undefined;
		this.charts = { burnup: raw.charts?.burnup !== false, progress: raw.charts?.progress !== false };
		this.loadPeriod = isLoadChartPeriod(raw.loadPeriod) ? raw.loadPeriod : 'thisWeek';
		await super.setState(state, result);
	}

	private setCharts(charts: { burnup: boolean; progress: boolean }): void {
		this.charts = charts;
		this.app.workspace.requestSaveLayout();
		this.redraw();
	}

	getViewType(): string {
		return DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'ダッシュボード';
	}

	getIcon(): string {
		return 'layout-dashboard';
	}

	protected getDescription(): string {
		return '全プロジェクトの進み具合・工数・警告と、忙しいメンバー、近いマイルストーン';
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-dashboard');
		const mode = this.plugin.personal.projectDisplayName;
		const { summary, filters, actions, body } = this.shell(el, { grid: true });

		renderFilterBar(
			filters,
			this.filter,
			{ projects: projectChoices(ctx, mode), closed: true, archived: true },
			(filter) => this.setFilter(filter),
		);
		summary.setText(`今日 ${ctx.today}`);
		actionButtons(actions, [
			{ text: '作業ログを入力', onClick: () => openWorklogModal(this.plugin) },
			{ text: '新しいプロジェクト', onClick: () => openNewNoteModal(this.plugin, 'project') },
			{
				text: 'HTMLレポートを書き出す',
				tooltip: '絞り込みに関係なく、クローズしていない全プロジェクトを書き出します',
				onClick: () => void exportHtmlReport(this.plugin),
			},
		]);

		const projects = filterProjects(ctx.index.projects({ includeArchived: this.filter.includeArchived }), this.filter, ctx.statuses)
			.sort((a, b) => compareNumeric(projectLabel(a, mode), projectLabel(b, mode)));
		const members = ctx.index.members().filter((m) => m.active);
		const data = dashboard(ctx, projects, members);

		this.drawProjects(body, data, mode, ctx);
		this.drawBurnup(body, ctx, data, mode);
		this.drawMembers(body, ctx, members);
		this.drawMilestones(body, data, mode, ctx.calendar);
	}

	/** 工数の累積のグラフ（設計書 9.5）。表示中のプロジェクトから1つ選ぶ */
	private drawBurnup(parent: HTMLElement, ctx: CalcContext, data: Dashboard, mode: Parameters<typeof projectLabel>[1]): void {
		const section = parent.createDiv({ cls: 'pm-section' });
		const head = section.createDiv({ cls: 'pm-section-head' });
		head.createEl('h4', { text: '工数の累積と進捗率' });
		const { charts } = this;
		checkbox(head, '工数の累積', charts.burnup, (on) => this.setCharts({ ...charts, burnup: on }));
		checkbox(head, '進捗率', charts.progress, (on) => this.setCharts({ ...charts, progress: on }));
		if (!charts.burnup && !charts.progress) return;
		const choices = data.projects.map((s) => ({ value: s.project.id, label: projectLabel(s.project, mode) }));
		const selected = data.projects.find((s) => s.project.id === this.burnupProject) ?? data.projects[0];
		if (!selected) {
			section.createDiv({ cls: 'pm-view-empty', text: '条件に合うプロジェクトはありません' });
			return;
		}
		singleSelect(head, 'プロジェクト', selected.project.id, choices, (id) => {
			this.burnupProject = id;
			this.app.workspace.requestSaveLayout();
			this.redraw();
		});
		const result = burnup(ctx, selected.project);
		if (!result) {
			section.createDiv({ cls: 'pm-view-empty', text: '作業ログも日付もないため、グラフを描けません' });
			return;
		}
		if (charts.burnup) {
			section.createEl('h5', { cls: 'pm-burnup-title', text: '工数の累積（予定・実績）' });
			renderBurnup(section, result, ctx.today);
		}
		// 進捗率のグラフ。期間は工数の累積とそろえ、上下で見比べられるようにする
		if (charts.progress) {
			section.createEl('h5', { cls: 'pm-burnup-title', text: '進捗率（予定と今日の実績）' });
			renderProgress(section, progressPlan(ctx, selected.project, result), result, ctx.today);
		}
	}

	private drawProjects(parent: HTMLElement, data: Dashboard, mode: Parameters<typeof projectLabel>[1], ctx: CalcContext): void {
		const { calendar } = ctx;
		const section = parent.createDiv({ cls: 'pm-section' });
		section.createEl('h4', { text: `プロジェクト（${data.projects.length} 件）` });
		if (data.projects.length === 0) {
			section.createDiv({ cls: 'pm-view-empty', text: '条件に合うプロジェクトはありません' });
			return;
		}
		const table = section.createEl('table', { cls: 'pm-table' });
		const head = table.createEl('thead').createEl('tr');
		for (const [label, numeric] of [
			['プロジェクト', false],
			['ステータス', false],
			['期間', false],
			['終了（計算）', false],
			['進捗率', true],
			['見積(h)', true],
			['予定(h)', true],
			['実績(h)', true],
			['警告', false],
		] as const) {
			// 期間は開始日と期限日の2列（periodCells）
			head.createEl('th', { text: label, cls: numeric ? 'is-numeric' : '', attr: label === '期間' ? { colspan: 2 } : {} });
		}
		const body = table.createEl('tbody');
		for (const s of data.projects) {
			const { project } = s;
			const tr = body.createEl('tr', { cls: 'is-clickable' });
			tr.addEventListener('click', () => void openView(this.app, PROJECT_STATUS_VIEW_TYPE, { project: project.id }));
			kindMark(tr.createEl('td', { text: projectLabel(project, mode) }), 'project');
			this.statusCell(tr, 'project', project.status);
			const manager = membersOf(ctx, project.manager);
			periodCells(tr, calendar, project.start, project.due, manager);
			const end = tr.createEl('td', { text: s.span?.end ?? '—' });
			holidayMark(end, calendar, s.span?.end, manager);
			if (s.span && project.due && s.span.end > project.due) {
				end.addClass('pm-text-error');
				end.setAttr('aria-label', `期限日（${project.due}）より後に終わる見込みです`);
			}
			progressBar(tr.createEl('td', { cls: 'is-numeric' }), s.progress);
			tr.createEl('td', { cls: 'is-numeric', text: hoursText(s.workload.estimate) });
			tr.createEl('td', { cls: 'is-numeric', text: hoursText(s.workload.planned) });
			tr.createEl('td', { cls: 'is-numeric', text: hoursText(s.workload.actual) });
			warningLink(this.app, tr.createEl('td'), s.warnings, { project: project.id }, () => void openView(this.app, PROJECT_STATUS_VIEW_TYPE, { project: project.id }));
		}
	}

	/** メンバーの予定負荷率の横棒グラフ（設計書 9.5）。期間と並び順を選ぶ */
	private drawMembers(parent: HTMLElement, ctx: CalcContext, members: readonly Member[]): void {
		const chart = loadChart(ctx, members, this.loadPeriod, this.loadSort);
		const { period, counts } = chart;
		const section = parent.createDiv({ cls: 'pm-section' });
		const head = section.createDiv({ cls: 'pm-section-head' });
		const range = period.unit === 'month' ? period.key : `${period.start}〜${period.end}`;
		head.createEl('h4', { text: `メンバーの負荷率（${range}、${chart.rows.length} 人）` });
		singleSelect(head, '期間', this.loadPeriod, [...LOAD_CHART_PERIODS], (key) => {
			this.loadPeriod = key;
			this.app.workspace.requestSaveLayout();
			this.redraw();
		});
		singleSelect(head, '並び順', this.loadSort, [...LOAD_CHART_SORTS], (sort) => {
			this.loadSort = sort;
			this.app.workspace.requestSaveLayout();
			this.redraw();
		});
		if (chart.rows.length === 0) {
			section.createDiv({ cls: 'pm-view-empty', text: '在籍しているメンバーはいません' });
			return;
		}
		section.createDiv({ cls: 'pm-note', text: `負荷警告 ${counts.warning} 人 ／ 負荷注意 ${counts.caution} 人` });
		renderLoadChart(section, chart, {
			openMember: (row, el) => noteLink(this.plugin, el, row.member.path),
			openRow: () => void openView(this.app, MEMBER_STATUS_VIEW_TYPE),
		});
		section.createDiv({ cls: 'pm-note', text: '予定負荷率＝予定の時間 ÷ 働ける時間（稼働日 × 1日の通常稼働時間）。棒にマウスを乗せると時間を出します。メンバー名のクリックでメンバーのノート、ほかの場所のクリックでメンバー状況を開きます' });
	}

	private drawMilestones(parent: HTMLElement, data: Dashboard, mode: Parameters<typeof projectLabel>[1], calendar: WorkCalendar): void {
		const section = parent.createDiv({ cls: 'pm-section' });
		section.createEl('h4', { text: `${MILESTONE_DAYS / 7}週間以内のマイルストーン（${data.milestones.length} 件）` });
		if (data.milestones.length === 0) {
			section.createDiv({ cls: 'pm-view-empty', text: 'ありません' });
			return;
		}
		const table = section.createEl('table', { cls: 'pm-table' });
		const head = table.createEl('thead').createEl('tr');
		for (const label of ['日付', 'プロジェクト', '名前', '連動エピック', '注意']) head.createEl('th', { text: label });
		const body = table.createEl('tbody');
		for (const m of data.milestones) {
			const tr = body.createEl('tr', { cls: 'is-clickable' });
			tr.addEventListener('click', () => void openView(this.app, PROJECT_STATUS_VIEW_TYPE, { project: m.project.id }));
			dateCell(tr, calendar, m.milestone.date);
			tr.createEl('td', { text: projectLabel(m.project, mode) });
			tr.createEl('td', { text: m.milestone.name });
			const epic = m.epic?.epic;
			tr.createEl('td', { text: epic && m.epic ? `${epic.title}（${epic.status}・${pct(m.epic.progress)}）` : (m.milestone.epic ?? '') });
			const notes: string[] = [];
			if (m.milestone.epic && !m.epic) notes.push('連動エピックが見つかりません');
			if (m.late) notes.push('完了予定日がマイルストーンより後');
			tr.createEl('td', { cls: 'pm-text-error', text: notes.join('・') });
		}
	}
}
