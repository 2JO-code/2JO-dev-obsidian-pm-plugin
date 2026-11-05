import { Notice, type ViewStateResult } from 'obsidian';
import type { CalcContext } from '../calc/context';
import { barBox, DEFAULT_GANTT, dependencyFlags, fitRange, ganttScale, markX, parseGanttOptions, xOf, type GanttOptions, type GanttScale } from '../calc/gantt';
import { displayRange } from '../calc/memberStatus';
import type { RowLabels, TaskRow } from '../calc/taskList';
import { WARNING_LABELS } from '../calc/warnings';
import { isOpen, parseToggled, toggledForAll, wbsKey, wbsTreeFor, type WbsProject } from '../calc/wbs';
import type { PeriodUnit } from '../calc/workdays';
import { openNewNoteModal } from '../commands/createNote';
import { openEpicForm, openTaskForm } from '../commands/editTask';
import type ProjectManagerPlugin from '../main';
import type { NoteId } from '../model';
import { projectLabel } from '../settings';
import { rowButton, toggleMark } from './actions';
import { kindMark } from './badges';
import { warningCounts } from './format';
import { PmView } from './baseView';
import { memberChoices, projectChoices, statusChoices } from './choices';
import { checkbox, dateRange, renderFilterBar, singleSelect } from './filterBar';
import { dependencyLines, dueMark, ganttBar, ganttHeader, LINK_HINT, milestoneMark, type BarInfo } from './ganttParts';
import { noteLink } from './openNote';
import { openView } from './openView';
import { PROJECT_STATUS_VIEW_TYPE } from './projectStatusView';

export const GANTT_VIEW_TYPE = 'pm-gantt';

const UNIT_CHOICES: { value: PeriodUnit; label: string }[] = [
	{ value: 'day', label: '日' },
	{ value: 'week', label: '週' },
	{ value: 'month', label: '月' },
];

/** ガントチャートのビューと、開くコマンドを登録する */
export function registerGanttView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(GANTT_VIEW_TYPE, (leaf) => new GanttView(leaf, plugin));
	plugin.addCommand({
		id: 'open-gantt',
		name: 'ガントチャートを開く',
		callback: () => void openView(plugin.app, GANTT_VIEW_TYPE),
	});
}

/** ガントチャート（要件4.8c、設計書 9.8） */
export class GanttView extends PmView {
	private options: GanttOptions = { ...DEFAULT_GANTT };
	/** 初期の開閉と逆にした行のキー（`wbsKey`。WBS と同じ扱い） */
	private toggled = new Set<string>();

	getViewType(): string {
		return GANTT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'ガントチャート';
	}

	getIcon(): string {
		return 'calendar-range';
	}

	protected getDescription(): string {
		return 'タスクの日程の棒グラフ（計算上の開始日〜終了日）。棒を指すと依存関係の線';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), gantt: { ...this.options, toggled: [...this.toggled] } };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const gantt = typeof state === 'object' && state !== null ? (state as { gantt?: { toggled?: unknown } }).gantt : undefined;
		this.options = parseGanttOptions(gantt);
		this.toggled = parseToggled(gantt?.toggled);
		await super.setState(state, result);
	}

	private setOptions(options: GanttOptions): void {
		this.options = options;
		this.app.workspace.requestSaveLayout();
		this.redraw();
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

	private setAll(tree: WbsProject[], open: boolean): void {
		this.toggled = toggledForAll(tree, open);
		this.app.workspace.requestSaveLayout();
		this.redraw();
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-gantt-view');
		const mode = this.plugin.personal.projectDisplayName;
		const labels: RowLabels = { project: (p) => projectLabel(p, mode) };
		const { options, filter } = this;
		const range = displayRange(options, ctx.today);
		const { summary, filters, settings, notes, body } = this.shell(el, { grid: true });

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
				extra: (bar) =>
					dateRange(bar, '表示期間', range.start, range.end, (start, end) => {
						const { unit, showDependencies } = options;
						this.setOptions({ unit, showDependencies, ...(start ? { start } : {}), ...(end ? { end } : {}) });
					}),
				onClear: () => {
					this.options = { unit: options.unit, showDependencies: options.showDependencies };
				},
			},
			(next) => this.setFilter(next),
		);

		// WBS と同じ階層・絞り込み（設計書 9.7）
		const { tree } = wbsTreeFor(ctx, filter, labels);

		summary.setText(`プロジェクト ${tree.length} 件`);
		singleSelect(settings, '単位', options.unit, UNIT_CHOICES, (unit) => this.setOptions({ ...options, unit }));
		const fit = settings.createEl('button', { text: 'プロジェクトの期間に合わせる' });
		fit.addEventListener('click', () => {
			const r = fitRange(tree.map((p) => ({ ...p.status.project, ...(p.status.span ? { span: p.status.span } : {}) })));
			if (r) this.setOptions({ unit: options.unit, showDependencies: options.showDependencies, ...r });
			else new Notice('表示中のプロジェクトに日付がありません');
		});
		settings.createEl('button', { text: 'すべて開く' }).addEventListener('click', () => this.setAll(tree, true));
		settings.createEl('button', { text: 'すべて閉じる' }).addEventListener('click', () => this.setAll(tree, false));
		checkbox(settings, '依存の印を表示', options.showDependencies, (showDependencies) => this.setOptions({ ...options, showDependencies }));
		const legend = notes.createDiv({ cls: 'pm-legend' });
		legend.createSpan({ cls: 'pm-gantt-bar is-legend', text: '計画どおり' });
		legend.createSpan({ cls: 'pm-gantt-bar is-legend is-delayed', text: '遅れを反映' });
		legend.createSpan({ cls: 'pm-gantt-bar is-legend is-late', text: '期限日より後に終わる見込み' });
		legend.createSpan({ cls: 'pm-gantt-bar is-legend is-done', text: '完了・停止' });
		legend.createSpan({ text: '｜ ◆マイルストーン ｜' });
		if (options.showDependencies) {
			const dep = legend.createSpan({ cls: 'pm-gantt-bar is-legend has-predecessor has-successor', text: '依存あり' });
			dep.setAttr('aria-label', '左の丸＝先行タスクあり、右の丸＝後続タスクあり');
		}
		legend.createSpan({ text: '棒を指すと依存の線' });
		const linkNote = notes.createDiv({ cls: 'pm-note pm-gantt-link-note', text: LINK_HINT });

		if (tree.length === 0) {
			body.createDiv({ cls: 'pm-view-empty', text: '条件に合うプロジェクトはありません' });
			return;
		}

		const scale = ganttScale(range, options.unit);
		const wrap = body.createDiv({ cls: 'pm-gantt' });
		wrap.setCssProps({ '--pm-gantt-width': `${scale.width}px` });
		ganttHeader(wrap, scale, ctx);
		// 休日の縦の帯（単位が日のとき）。行より先に置き、棒の後ろに描く
		for (const p of scale.periods) {
			if (p.unit !== 'day' || ctx.calendar.isWorkday(p.start)) continue;
			const box = barBox(scale, p.start, p.end);
			if (box) wrap.createDiv({ cls: 'pm-gantt-holiday' }).setCssProps({ '--pm-x': `${box.left}px`, '--pm-w': `${box.width}px` });
		}
		// 期間の区切りの縦線。行より先に置き、棒の後ろに描く
		if (this.gridLines) {
			for (const p of scale.periods.slice(1)) wrap.createDiv({ cls: 'pm-gantt-gridline' }).setCssProps({ '--pm-x': `${xOf(scale, p.start)}px` });
		}

		const bars = new Map<NoteId, HTMLElement>();
		const allTasks = ctx.index.tasks({ includeArchived: true });
		const flags = options.showDependencies ? dependencyFlags(allTasks) : new Map<NoteId, { predecessor: boolean; successor: boolean }>();
		for (const p of tree) {
			const { project } = p.status;
			const projectKey = wbsKey.project(project.id);
			const projectOpen = this.isOpen(projectKey);
			const pr = this.row(wrap, 'pm-gantt-project', projectOpen, p.epics.length > 0, () => this.toggle(projectKey));
			const title = pr.label.createSpan({ cls: 'pm-gantt-title pm-action-link', text: labels.project(project) });
			kindMark(title, 'project');
			title.setAttr('aria-label', 'プロジェクト状況を開く');
			title.addEventListener('click', () => void openView(this.app, PROJECT_STATUS_VIEW_TYPE, { project: project.id }));
			rowButton(pr.label, '＋エピック', () => openNewNoteModal(this.plugin, 'epic', { project: project.id }));
			if (p.status.span) ganttBar(pr.track, scale, labels.project(project), { ...p.status.span, ...(project.due ? { due: project.due } : {}) }, true);
			if (project.due) dueMark(pr.track, scale, project.due);
			for (const m of p.status.milestones) milestoneMark(pr.track, scale, m);
			if (!projectOpen) continue;

			for (const e of p.epics) {
				const { epic } = e.row;
				const key = wbsKey.epic(project.id, epic?.id);
				const open = this.isOpen(key);
				const er = this.row(wrap, 'pm-gantt-epic', open, e.tasks.length > 0, () => this.toggle(key));
				const name = epic ? `${epic.wbs ? `${epic.wbs} ` : ''}${epic.title}` : '（エピックなし）';
				const et = er.label.createSpan({ cls: 'pm-gantt-title', text: name });
				if (epic) {
					kindMark(et, 'epic');
					et.addClass('pm-action-link');
					noteLink(this.plugin, et, epic.path);
					rowButton(er.label, 'フォーム', () => openEpicForm(this.plugin, epic.path));
				}
				rowButton(er.label, '＋タスク', () => openNewNoteModal(this.plugin, 'task', { project: project.id, ...(epic ? { epic: epic.id } : {}) }));
				if (e.row.span) {
					const info: BarInfo = { ...e.row.span, ...(epic?.due ? { due: epic.due } : {}), ...(e.row.category ? { category: e.row.category } : {}) };
					ganttBar(er.track, scale, name, info, true);
				}
				if (epic?.due) dueMark(er.track, scale, epic.due);
				if (open) for (const t of e.tasks) this.taskRow(wrap, scale, t, bars, flags.get(t.task.id));
			}
		}

		const today = markX(scale, ctx.today);
		if (today !== undefined) wrap.createDiv({ cls: 'pm-gantt-today', attr: { 'aria-label': `今日（${ctx.today}）` } }).setCssProps({ '--pm-x': `${today}px` });
		dependencyLines(wrap, allTasks, bars, linkNote);
	}

	/** 1行。左に表示名（▶／▼ を押すと開閉）、右に棒を置く欄 */
	private row(wrap: HTMLElement, cls: string, open: boolean, hasChildren: boolean, onToggle?: () => void): { label: HTMLElement; track: HTMLElement } {
		const row = wrap.createDiv({ cls: `pm-gantt-row ${cls}` });
		const label = row.createDiv({ cls: 'pm-gantt-label' });
		if (onToggle) toggleMark(label, open, hasChildren, onToggle);
		return { label, track: row.createDiv({ cls: 'pm-gantt-track' }) };
	}

	private taskRow(
		wrap: HTMLElement,
		scale: GanttScale,
		row: TaskRow,
		bars: Map<NoteId, HTMLElement>,
		dep: { predecessor: boolean; successor: boolean } | undefined,
	): void {
		const { task } = row;
		const r = this.row(wrap, 'pm-gantt-task', false, false);
		const title = r.label.createSpan({ cls: 'pm-gantt-title pm-action-link', text: task.title });
		kindMark(title, 'task');
		title.setAttr('aria-label', `ノートを開く（${row.status}${row.assignees.length > 0 ? `／${row.assignees.map((m) => m.title).join('、')}` : ''}）`);
		noteLink(this.plugin, title, task.path);
		// 依存のあるタスクは表示名の後ろにも印を出す（棒が表示期間の外でも分かるように）
		const depText = dep ? [dep.predecessor ? '先行タスクあり' : '', dep.successor ? '後続タスクあり' : ''].filter(Boolean).join('・') : '';
		if (depText) r.label.createSpan({ cls: 'pm-gantt-dep-mark', text: '⇆', attr: { 'aria-label': depText } });
		rowButton(r.label, 'フォーム', () => openTaskForm(this.plugin, task.path));
		if (task.due) dueMark(r.track, scale, task.due);
		const s = row.schedule;
		if (!s) {
			r.track.createSpan({ cls: 'pm-gantt-none', text: '日程を計算できません（日付が無い、先行タスクの日程が出せない、または依存関係が循環しています）' });
			return;
		}
		const info: BarInfo = {
			start: s.start,
			end: s.end,
			...(task.due ? { due: task.due } : {}),
			...(row.category ? { category: row.category } : {}),
			delayed: s.startDelayed || s.endDelayed,
		};
		const extra = warningCounts(row.warnings).map(([kind]) => WARNING_LABELS[kind]).join('・');
		const bar = ganttBar(r.track, scale, task.title, info, false, extra, depText);
		if (!bar) return;
		if (dep?.predecessor) bar.addClass('has-predecessor');
		if (dep?.successor) bar.addClass('has-successor');
		bars.set(task.id, bar);
		bar.dataset.task = task.id;
	}
}
