import { isLoadMode, isLoadScale, LOAD_MODE_LABEL, LOAD_MODES, LOAD_SCALES, type LoadMode, type LoadScale } from '../calc/load';
import { compareNumeric } from '../calc/compare';
import type { CalcContext } from '../calc/context';
import type { WorkCalendar } from '../calc/workdays';
import { dashboard, MILESTONE_DAYS, type Dashboard } from '../calc/dashboard';
import { filterProjects } from '../calc/filter';
import { isLoadChartPeriod, isLoadChartSort, loadChart, LOAD_CHART_PERIODS, LOAD_CHART_SORTS, type LoadChartPeriod, type LoadChartSort } from '../calc/loadChart';
import { openCopyProjectModal } from '../commands/copyProject';
import { openNewNoteModal } from '../commands/createNote';
import { openMemberForm } from '../commands/editTask';
import { exportHtmlReport } from '../commands/htmlReport';
import { openWorklogModal } from '../commands/worklog';
import type ProjectManagerPlugin from '../main';
import type { Member } from '../model';
import { projectLabel } from '../settings';
import { actionButtons, formClick } from './actions';
import { PmView } from './baseView';
import { projectChoices } from './choices';
import { renderFilterBar, singleSelect } from './filterBar';
import { dateCell, holidayMark, kindMark, periodCells, progressBar } from './badges';
import { hoursText, membersOf, pct } from '../calc/format';
import { renderLoadChart } from './loadChart';
import { openView } from './openView';
import { warningLink } from './warningLink';
import { tableHeader } from '../ui/table';
import { field } from '../parse/values';
import { DASHBOARD_VIEW_TYPE, MEMBER_STATUS_VIEW_TYPE, PROJECT_STATUS_VIEW_TYPE } from './viewTypes';

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
	/** 負荷率のグラフの期間（ビューの状態として保存。初期は今週） */
	private loadPeriod: LoadChartPeriod = 'thisWeek';
	/** 負荷率のグラフの並び順（ビューの状態として保存。初期は名前順） */
	private loadSort: LoadChartSort = 'name';
	/** 負荷率のグラフの値（ビューの状態として保存。初期は配分） */
	private loadMode: LoadMode = 'allocated';
	/** 負荷率のグラフの横軸（ビューの状態として保存。初期は負荷率） */
	private loadScale: LoadScale = 'rate';

	getState(): Record<string, unknown> {
		return {
			...super.getState(),
			loadPeriod: this.loadPeriod,
			loadSort: this.loadSort,
			loadMode: this.loadMode,
			loadScale: this.loadScale,
		};
	}

	protected readState(state: unknown): void {
		const loadSort = field(state, 'loadSort');
		const loadPeriod = field(state, 'loadPeriod');
		this.loadSort = isLoadChartSort(loadSort) ? loadSort : 'name';
		this.loadPeriod = isLoadChartPeriod(loadPeriod) ? loadPeriod : 'thisWeek';
		const loadMode = field(state, 'loadMode');
		this.loadMode = isLoadMode(loadMode) ? loadMode : 'allocated';
		const loadScale = field(state, 'loadScale');
		this.loadScale = isLoadScale(loadScale) ? loadScale : 'rate';
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
			{ text: 'プロジェクトを複製', tooltip: '既存のプロジェクトをひな形にして作ります', onClick: () => openCopyProjectModal(this.plugin) },
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
		this.drawMembers(body, ctx, members);
		this.drawMilestones(body, data, mode, ctx.calendar);
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
		tableHeader(table, [
			'プロジェクト',
			'ステータス',
			// 期間は開始日と期限日の2列（periodCells）
			{ label: '期間', colspan: 2 },
			'見込み終了',
			{ label: '進捗率', numeric: true },
			{ label: '見積(h)', numeric: true },
			{ label: '予定(h)', numeric: true },
			{ label: '実績(h)', numeric: true },
			'警告',
		]);
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

	/** メンバーの負荷率の横棒グラフ（設計書 9.5）。値・数値・期間・並び順を選ぶ */
	private drawMembers(parent: HTMLElement, ctx: CalcContext, members: readonly Member[]): void {
		const chart = loadChart(ctx, members, this.loadPeriod, this.loadSort, this.loadMode, this.loadScale);
		const { period, counts } = chart;
		const section = parent.createDiv({ cls: 'pm-section' });
		const head = section.createDiv({ cls: 'pm-section-head' });
		const range = period.unit === 'month' ? period.key : `${period.start}〜${period.end}`;
		head.createEl('h4', { text: `メンバーの負荷率（${range}、${chart.rows.length} 人）` });
		singleSelect(head, '値', this.loadMode, LOAD_MODES.map((value) => ({ value, label: LOAD_MODE_LABEL[value] })), (m) => {
			this.loadMode = m;
			this.saveState();
			this.redraw();
		});
		singleSelect(head, '数値', this.loadScale, [...LOAD_SCALES], (scale) => {
			this.loadScale = scale;
			this.saveState();
			this.redraw();
		});
		singleSelect(head, '期間', this.loadPeriod, [...LOAD_CHART_PERIODS], (key) => {
			this.loadPeriod = key;
			this.saveState();
			this.redraw();
		});
		singleSelect(head, '並び順', this.loadSort, [...LOAD_CHART_SORTS], (sort) => {
			this.loadSort = sort;
			this.saveState();
			this.redraw();
		});
		if (chart.rows.length === 0) {
			section.createDiv({ cls: 'pm-view-empty', text: '在籍しているメンバーはいません' });
			return;
		}
		section.createDiv({ cls: 'pm-note', text: `負荷警告 ${counts.warning} 人 ／ 負荷注意 ${counts.caution} 人` });
		renderLoadChart(section, chart, {
			openMember: (row, el) => formClick(el, () => openMemberForm(this.plugin, row.member.path)),
			openRow: () => void openView(this.app, MEMBER_STATUS_VIEW_TYPE),
		});
		section.createDiv({ cls: 'pm-note', text: `${this.loadScale === 'hours' ? `棒は${LOAD_MODE_LABEL[this.loadMode]}の時間(h)。色は負荷率で付けます。` : ''}負荷率＝${LOAD_MODE_LABEL[this.loadMode]}の時間 ÷ 働ける時間（勤務日 × 1日の通常稼働時間。勤務日＝稼働日−個人休日）。配分は月の工数配分を勤務日で割った期間の分。棒にマウスを乗せると配分・予定・実績の時間を出します。メンバー名のクリックでメンバーの入力補助フォーム、ほかの場所のクリックでメンバー状況を開きます` });
	}

	private drawMilestones(parent: HTMLElement, data: Dashboard, mode: Parameters<typeof projectLabel>[1], calendar: WorkCalendar): void {
		const section = parent.createDiv({ cls: 'pm-section' });
		section.createEl('h4', { text: `${MILESTONE_DAYS / 7}週間以内のマイルストーン（${data.milestones.length} 件）` });
		if (data.milestones.length === 0) {
			section.createDiv({ cls: 'pm-view-empty', text: 'ありません' });
			return;
		}
		const table = section.createEl('table', { cls: 'pm-table' });
		tableHeader(table, ['日付', 'プロジェクト', '名前', '連動エピック', '注意']);
		const body = table.createEl('tbody');
		for (const m of data.milestones) {
			const tr = body.createEl('tr', { cls: 'is-clickable' });
			tr.addEventListener('click', () => void openView(this.app, PROJECT_STATUS_VIEW_TYPE, { project: m.project.id }));
			dateCell(tr, calendar, m.milestone.date);
			tr.createEl('td', { text: projectLabel(m.project, mode) });
			tr.createEl('td', { text: m.milestone.name });
			const epic = m.epic?.epic;
			tr.createEl('td', { text: epic && m.epic ? `${epic.title}（${epic.status}・${pct(m.epic.progress)}）` : (m.milestone.epic ?? '') });
			tr.createEl('td', { cls: 'pm-text-error', text: m.notes.join('・') });
		}
	}
}
