import { Notice } from 'obsidian';
import type { CalcContext } from '../calc/context';
import { barBox, DEFAULT_GANTT, dependencyFlags, fitRange, GANTT_LABEL_WIDTH, ganttLabelWidthOf, ganttScale, parseGanttOptions, xOf, type GanttOptions, type GanttScale } from '../calc/gantt';
import { parseGanttWorklogMode, sumDayHours, taskDayHours, type GanttWorklogMode, type TaskDayHours } from '../calc/ganttWorklog';
import { displayRange } from '../calc/memberStatus';
import { EMPTY_FILTER, parseFilter, type ViewFilter } from '../calc/filter';
import { firstDayOf, lastDayOf } from '../calc/dates';
import { taskPlanPeriod } from '../calc/planDelay';
import type { RowLabels, TaskRow } from '../calc/taskList';
import { WARNING_LABELS } from '../calc/warnings';
import { TreeToggle } from '../calc/treeToggle';
import { epicOrderOf, wbsKey, wbsTreeFor } from '../calc/wbs';
import { taskWbsLabel } from '../calc/wbsOrder';
import type { PeriodUnit } from '../calc/workdays';
import { openNewNoteModal } from '../commands/createNote';
import { openEpicForm, openTaskForm } from '../commands/editTask';
import type { NoteId } from '../model';
import { projectLabel } from '../settings';
import { formClick, rowButton } from './actions';
import { kindMark } from './badges';
import { ChildRows } from './childRows';
import { membersOf, NO_EPIC_LABEL, warningCounts } from '../calc/format';
import { memberChoices, projectChoices, statusChoices } from './choices';
import { dateRange, renderFilterBar, singleSelect } from './filterBar';
import {
	assigneeCell,
	dependencyLines,
	dueMark,
	ganttBar,
	ganttHeader,
	gridLine,
	holidayBand,
	LINK_HINT,
	milestoneMark,
	planBand,
	startMark,
	todayLine,
	wbsColumnWidth,
	worklogCells,
	type BarInfo,
} from './ganttParts';
import { openView } from './openView';
import { WbsDrag, type WbsDragGroup } from './wbsDrag';
import { field } from '../parse/values';
import { Panel, type PanelScope, type Shell } from './panel';
import { PROJECT_STATUS_VIEW_TYPE } from './viewTypes';
import { toggleMark, checkbox } from '../ui/controls';

const UNIT_CHOICES: { value: PeriodUnit; label: string }[] = [
	{ value: 'day', label: '日' },
	{ value: 'week', label: '週' },
	{ value: 'month', label: '月' },
];

const WORKLOG_CHOICES: { value: GanttWorklogMode; label: string }[] = [
	{ value: 'none', label: '出さない' },
	{ value: 'actual', label: '実績' },
	{ value: 'planned', label: '予定' },
	{ value: 'both', label: '予定と実績' },
];

/** ガントチャートの部品（要件4.8c、設計書 9.8・9.12） */
export class GanttPanel extends Panel {
	readonly title = 'ガントチャート';
	private filter: ViewFilter = { ...EMPTY_FILTER };
	private options: GanttOptions = { ...DEFAULT_GANTT };
	/** 表示名の欄の幅(px)。見出しの境のドラッグで変え、「条件をクリア」では戻さない */
	private labelWidth = GANTT_LABEL_WIDTH.initial;
	/** 担当者の列を出すか（初期は出す）。「条件をクリア」では戻さない */
	private showAssignees = true;
	/** 日のマスに出す作業ログの値（初期は出さない）。「条件をクリア」では戻さない */
	private worklogMode: GanttWorklogMode = 'none';
	/** 表示中の作業ログ（タスクごと・日ごと）。出さないときは undefined */
	private hours: TaskDayHours | undefined;
	/** 階層の開閉（WBS と同じ扱い）。変えたら状態の保存を頼む */
	private readonly tree = new TreeToggle(() => this.host.save());
	/** 表示しているタスクの棒（依存の線を引くため） */
	private bars = new Map<NoteId, HTMLElement>();
	/** 後から足した棒に依存の線の仕掛けを付ける（`dependencyLines` の戻り値） */
	private watchBar: ((id: NoteId, bar: HTMLElement) => void) | undefined;
	/** 開いているエピックのタスクの行（キーは `wbsKey`）。消した行の棒は忘れ、足した行の棒には線の仕掛けを付ける */
	private readonly taskRows = new ChildRows<{ row: HTMLElement; id: NoteId }>({
		removed: ({ id }) => this.bars.delete(id),
		added: ({ id }) => {
			const bar = this.bars.get(id);
			if (bar) this.watchBar?.(id, bar);
		},
	});
	/** 行のドラッグで番号を入れ替える（WBS と同じ） */
	private readonly drag = new WbsDrag(this.app, () => this.plugin.store);

	getState(): Record<string, unknown> {
		return { filter: this.filter, gantt: { ...this.options, toggled: this.tree.saved(), labelWidth: this.labelWidth, showAssignees: this.showAssignees, worklog: this.worklogMode } };
	}

	setState(state: unknown): void {
		this.filter = parseFilter(field(state, 'filter'));
		const gantt = field(state, 'gantt');
		this.options = parseGanttOptions(gantt);
		this.tree.load(field(gantt, 'toggled'));
		this.labelWidth = ganttLabelWidthOf(field(gantt, 'labelWidth'));
		this.showAssignees = field(gantt, 'showAssignees') !== false;
		this.worklogMode = parseGanttWorklogMode(field(gantt, 'worklog'));
	}

	private setFilter(filter: ViewFilter): void {
		this.filter = filter;
		this.host.changed();
	}

	private setOptions(options: GanttOptions): void {
		this.options = options;
		this.host.changed();
	}

	draw(shell: Shell, ctx: CalcContext, scope?: PanelScope): void {
		const mode = this.plugin.personal.projectDisplayName;
		const labels: RowLabels = { project: (p) => projectLabel(p, mode) };
		const { options } = this;
		// 外から固定するときは、その人の担当タスク・その月（設計書 9.12）
		const filter: ViewFilter = scope ? { ...this.filter, members: [scope.member.id] } : this.filter;
		const range = scope ? { start: firstDayOf(scope.month), end: lastDayOf(scope.month) } : displayRange(options, ctx.today);
		const { summary, filters, settings, notes, body } = shell;

		renderFilterBar(
			filters,
			this.filter,
			{
				projects: projectChoices(ctx, mode),
				...(scope ? {} : { members: memberChoices(ctx), membersLabel: '担当者' }),
				statuses: statusChoices(ctx),
				closed: true,
				archived: true,
				// 表示期間は、外から月を決めるときは出さない
				...(scope
					? {}
					: {
							extra: (bar: HTMLElement) =>
								dateRange(bar, '表示期間', range.start, range.end, (start, end) => {
									const { unit, showDependencies } = options;
									this.setOptions({ unit, showDependencies, ...(start ? { start } : {}), ...(end ? { end } : {}) });
								}),
						}),
				onClear: () => {
					this.options = { unit: options.unit, showDependencies: options.showDependencies };
				},
			},
			(next) => this.setFilter(next),
		);

		// WBS と同じ階層・絞り込み（設計書 9.7）
		const { tree } = wbsTreeFor(ctx, filter, labels, scope?.taskIds);

		summary.setText(`プロジェクト ${tree.length} 件`);
		singleSelect(settings, '単位', options.unit, UNIT_CHOICES, (unit) => this.setOptions({ ...options, unit }));
		if (!scope) {
			const fit = settings.createEl('button', { text: 'プロジェクトの期間に合わせる' });
			fit.addEventListener('click', () => {
				const r = fitRange(tree.map((p) => ({ ...p.status.project, ...(p.status.span ? { span: p.status.span } : {}) })));
				if (r) this.setOptions({ unit: options.unit, showDependencies: options.showDependencies, ...r });
				else new Notice('表示中のプロジェクトに日付がありません');
			});
		}
		settings.createEl('button', { text: 'すべて開く' }).addEventListener('click', () => {
			this.tree.setAll(tree, true);
			this.host.redraw();
		});
		settings.createEl('button', { text: 'すべて閉じる' }).addEventListener('click', () => {
			this.tree.setAll(tree, false);
			this.host.redraw();
		});
		checkbox(settings, '依存の印を表示', options.showDependencies, (showDependencies) => this.setOptions({ ...options, showDependencies }));
		checkbox(settings, '担当者を表示', this.showAssignees, (show) => {
			this.showAssignees = show;
			this.host.changed();
		});
		singleSelect(settings, '作業ログ', this.worklogMode, WORKLOG_CHOICES, (m) => {
			this.worklogMode = m;
			this.host.changed();
		});
		if (scope?.note) notes.createDiv({ cls: 'pm-note', text: scope.note });
		const legend = notes.createDiv({ cls: 'pm-legend' });
		legend.createSpan({ cls: 'pm-gantt-bar is-legend', text: '計画どおり' });
		legend.createSpan({ cls: 'pm-gantt-bar is-legend is-delayed', text: '遅れを反映' });
		legend.createSpan({ cls: 'pm-gantt-bar is-legend is-late', text: '期限日より後に終わる見込み' });
		legend.createSpan({ cls: 'pm-gantt-bar is-legend is-done', text: '完了・停止' });
		legend.createSpan({ cls: 'pm-gantt-plan is-legend', text: '当初期間' });
		legend.createSpan({ cls: 'pm-gantt-start is-legend', text: '開始日' });
		legend.createSpan({ cls: 'pm-gantt-due is-legend', text: '期限日' });
		legend.createSpan({ text: '｜ ◆マイルストーン ｜' });
		if (options.showDependencies) {
			const dep = legend.createSpan({ cls: 'pm-gantt-bar is-legend has-predecessor has-successor', text: '依存あり' });
			dep.setAttr('aria-label', '左の丸＝先行タスクあり、右の丸＝後続タスクあり');
		}
		legend.createSpan({ text: '棒を指すと依存の線' });
		// 作業ログの数字は1日の幅が広い単位「日」のときだけ出す（設計書 9.8）
		const worklogMode = options.unit === 'day' ? this.worklogMode : 'none';
		if (this.worklogMode !== 'none' && worklogMode === 'none') {
			legend.createSpan({ cls: 'pm-gantt-log-note', text: '｜ 作業ログの時間は、単位が「日」のときだけ出します' });
		}
		if (worklogMode !== 'none') {
			legend.createSpan({ text: `｜ 数字＝その日の${worklogMode === 'both' ? '予定（上）と実績（下）' : WORKLOG_CHOICES.find((c) => c.value === worklogMode)?.label ?? ''}(h)` });
			if (worklogMode !== 'planned') legend.createSpan({ cls: 'pm-gantt-log-note is-out', text: '赤い数字＝棒の期間の外の実績' });
		}
		const linkNote = notes.createDiv({ cls: 'pm-note pm-gantt-link-note', text: LINK_HINT });

		if (tree.length === 0) {
			body.createDiv({ cls: 'pm-view-empty', text: '条件に合うプロジェクトはありません' });
			return;
		}

		const scale = ganttScale(range, options.unit);
		this.hours = worklogMode === 'none' ? undefined : taskDayHours(ctx.index.worklogs(), scale.start, scale.end);
		// 担当者を隠すときは列の幅を 0 にして消す（設計書 9.8）
		const wrap = body.createDiv({ cls: this.showAssignees ? 'pm-gantt' : 'pm-gantt is-hide-person' });
		if (worklogMode !== 'none') wrap.addClass('has-worklog');
		if (worklogMode === 'both') wrap.addClass('is-worklog-both');
		const wbsWidth = Math.max(0, ...tree.flatMap((p) => p.epics.flatMap((e) => e.tasks.map((t) => taskWbsLabel(e.row.epic?.wbs, t.task.wbs).length))));
		wrap.setCssProps({
			'--pm-gantt-wbs': wbsColumnWidth(wbsWidth),
			'--pm-gantt-width': `${scale.width}px`,
			'--pm-gantt-label': `${this.labelWidth}px`,
		});
		this.labelResizer(wrap, ganttHeader(wrap, scale, ctx));
		// 休日の縦の帯（単位が日のとき）。行より先に置き、棒の後ろに描く
		for (const p of scale.periods) {
			if (p.unit !== 'day' || ctx.calendar.isWorkday(p.start)) continue;
			const box = barBox(scale, p.start, p.end);
			if (box) holidayBand(wrap, box.left, box.width);
		}
		// 期間の区切りの縦線。行より先に置き、棒の後ろに描く
		if (this.host.gridLines()) {
			for (const p of scale.periods.slice(1)) gridLine(wrap, xOf(scale, p.start));
		}

		const bars = new Map<NoteId, HTMLElement>();
		this.bars = bars;
		this.watchBar = undefined;
		this.taskRows.clear();
		const allTasks = ctx.index.tasks({ includeArchived: true });
		const flags = options.showDependencies ? dependencyFlags(allTasks) : new Map<NoteId, { predecessor: boolean; successor: boolean }>();
		for (const p of tree) {
			const { project } = p.status;
			const projectKey = wbsKey.project(project.id);
			const projectOpen = this.tree.isOpen(projectKey);
			const pr = this.row(wrap, 'pm-gantt-project', projectOpen, p.epics.length > 0, () => {
				this.tree.flip(projectKey);
				this.host.redraw();
			});
			const title = pr.label.createSpan({ cls: 'pm-gantt-title pm-action-link', text: labels.project(project) });
			kindMark(title, 'project');
			title.setAttr('aria-label', 'プロジェクト状況を開く');
			title.addEventListener('click', () => void openView(this.app, PROJECT_STATUS_VIEW_TYPE, { project: project.id }));
			rowButton(pr.label, '＋エピック', () => openNewNoteModal(this.plugin, 'epic', { project: project.id }));
			if (p.status.span) ganttBar(pr.track, scale, labels.project(project), { ...p.status.span, ...(project.due ? { due: project.due } : {}) }, true);
			if (project.start) startMark(pr.track, scale, project.start);
			if (project.due) dueMark(pr.track, scale, project.due);
			for (const m of p.status.milestones) milestoneMark(pr.track, scale, m);
			if (this.hours) worklogCells(pr.track, scale, sumDayHours(this.hours, p.epics.flatMap((e) => e.tasks.map((t) => t.task.id))), this.worklogMode);
			if (!projectOpen) continue;

			// エピックはプロジェクトの中で入れ替える（WBS と同じ。設計書 9.7）
			const epicGroup: WbsDragGroup = { kind: 'epic', key: projectKey, order: epicOrderOf(p.status) };
			for (const e of p.epics) {
				const { epic } = e.row;
				const key = wbsKey.epic(project.id, epic?.id);
				const open = this.tree.isOpen(key);
				const taskGroup: WbsDragGroup = { kind: 'task', key, order: e.order };
				const renderTasks = () =>
					e.tasks.map((t) => ({ row: this.taskRow(wrap, scale, t, bars, flags.get(t.task.id), epic?.wbs, taskGroup), id: t.task.id }));
				// エピックの開閉は全体を描き直さず、タスクの行だけを足す・消す（設計書 9.7・9.8）
				const er = this.row(wrap, 'pm-gantt-epic', open, e.tasks.length > 0, () => this.taskRows.replace(key, er.row, this.tree.flip(key), renderTasks));
				const name = epic ? `${epic.wbs ? `${epic.wbs} ` : ''}${epic.title}` : NO_EPIC_LABEL;
				const et = er.label.createSpan({ cls: 'pm-gantt-title', text: name });
				if (epic) {
					kindMark(et, 'epic');
					et.addClass('pm-action-link');
					formClick(et, () => openEpicForm(this.plugin, epic.path));
					this.drag.attach(er.row, epicGroup, epic.id, epic.title, er.label);
					assigneeCell(er.person, membersOf(ctx, epic.owner));
				}
				rowButton(er.label, '＋タスク', () => openNewNoteModal(this.plugin, 'task', { project: project.id, ...(epic ? { epic: epic.id } : {}) }));
				if (e.row.span) {
					const info: BarInfo = { ...e.row.span, ...(epic?.due ? { due: epic.due } : {}), ...(e.row.category ? { category: e.row.category } : {}) };
					ganttBar(er.track, scale, name, info, true);
				}
				if (epic?.start) startMark(er.track, scale, epic.start);
				if (epic?.due) dueMark(er.track, scale, epic.due);
				if (this.hours) worklogCells(er.track, scale, sumDayHours(this.hours, e.tasks.map((t) => t.task.id)), this.worklogMode);
				if (open) this.taskRows.set(key, renderTasks());
			}
		}

		todayLine(wrap, scale, ctx.today);
		this.watchBar = dependencyLines(wrap, allTasks, bars, linkNote);
	}

	/**
	 * 見出しの「タイトル」の右端のつまみ。ドラッグで表示名の欄の幅を変え、ダブルクリックで初期値に戻す
	 * 動かしている間は CSS 変数だけ変え、離したときに保存する（描き直さない。設計書 9.8）
	 */
	private labelResizer(wrap: HTMLElement, headLabel: HTMLElement): void {
		const handle = headLabel.createDiv({ cls: 'pm-gantt-resizer', attr: { 'aria-label': 'ドラッグで幅を変える（ダブルクリックで元に戻す）' } });
		const apply = (width: number) => wrap.setCssProps({ '--pm-gantt-label': `${width}px` });
		const save = (width: number) => {
			this.labelWidth = width;
			apply(width);
			this.host.save();
		};
		handle.addEventListener('pointerdown', (e) => {
			if (e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			const startX = e.clientX;
			const startWidth = this.labelWidth;
			let width = startWidth;
			handle.setPointerCapture(e.pointerId);
			handle.addClass('is-active');
			const move = (ev: PointerEvent) => {
				width = ganttLabelWidthOf(startWidth + ev.clientX - startX);
				apply(width);
			};
			const end = () => {
				handle.removeEventListener('pointermove', move);
				handle.removeEventListener('pointerup', end);
				handle.removeEventListener('pointercancel', end);
				handle.removeClass('is-active');
				save(width);
			};
			handle.addEventListener('pointermove', move);
			handle.addEventListener('pointerup', end);
			handle.addEventListener('pointercancel', end);
		});
		handle.addEventListener('dblclick', (e) => {
			e.stopPropagation();
			save(GANTT_LABEL_WIDTH.initial);
		});
	}

	/** 1行。左に表示名（▶／▼ を押すと開閉）、担当者、右に棒を置く欄 */
	private row(
		wrap: HTMLElement,
		cls: string,
		open: boolean,
		hasChildren: boolean,
		onToggle?: () => void,
	): { row: HTMLElement; label: HTMLElement; person: HTMLElement; track: HTMLElement } {
		const row = wrap.createDiv({ cls: `pm-gantt-row ${cls}` });
		const label = row.createDiv({ cls: 'pm-gantt-label' });
		if (onToggle) toggleMark(label, open, hasChildren, onToggle);
		const person = row.createDiv({ cls: 'pm-gantt-person' });
		return { row, label, person, track: row.createDiv({ cls: 'pm-gantt-track' }) };
	}

	private taskRow(
		wrap: HTMLElement,
		scale: GanttScale,
		row: TaskRow,
		bars: Map<NoteId, HTMLElement>,
		dep: { predecessor: boolean; successor: boolean } | undefined,
		epicWbs: string | undefined,
		group: WbsDragGroup,
	): HTMLElement {
		const { task } = row;
		const r = this.row(wrap, 'pm-gantt-task', false, false);
		this.drag.attach(r.row, group, task.id, task.title, r.label);
		// 番号は幅をそろえた欄に入れ、けたが違っても名前の頭をそろえる（設計書 9.8）
		const title = r.label.createSpan({ cls: 'pm-gantt-title pm-action-link' });
		title.createSpan({ cls: 'pm-gantt-wbs', text: taskWbsLabel(epicWbs, task.wbs) });
		title.appendText(task.title);
		kindMark(title, 'task');
		title.setAttr('aria-label', `入力補助フォームを開く（${row.status}${row.assignees.length > 0 ? `／${row.assignees.map((m) => m.title).join('、')}` : ''}）`);
		formClick(title, () => openTaskForm(this.plugin, task.path));
		assigneeCell(r.person, row.assignees);
		// 依存のあるタスクは表示名の後ろにも印を出す（棒が表示期間の外でも分かるように）
		const depText = dep ? [dep.predecessor ? '先行タスクあり' : '', dep.successor ? '後続タスクあり' : ''].filter(Boolean).join('・') : '';
		if (depText) r.label.createSpan({ cls: 'pm-gantt-dep-mark', text: '⇆', attr: { 'aria-label': depText } });
		// 当初期間は見込みの日程が無くても出す（棒より先に置き、後ろに描く）
		const plan = taskPlanPeriod(task);
		if (plan) planBand(r.track, scale, plan.start, plan.end);
		if (task.start) startMark(r.track, scale, task.start);
		if (task.due) dueMark(r.track, scale, task.due);
		const s = row.schedule;
		const days = this.hours?.get(task.id);
		if (days) worklogCells(r.track, scale, days, this.worklogMode, s);
		if (!s) {
			r.track.createSpan({ cls: 'pm-gantt-none', text: '日程を計算できません（開始日も期限日もありません）' });
			return r.row;
		}
		const info: BarInfo = {
			start: s.start,
			end: s.end,
			...(task.due ? { due: task.due } : {}),
			...(row.category ? { category: row.category } : {}),
			delayed: s.startDelayed || s.endDelayed,
			...(plan ? { plan: { ...plan, ...(row.planDelay !== undefined ? { delay: row.planDelay } : {}) } } : {}),
		};
		const extra = warningCounts(row.warnings).map(([kind]) => WARNING_LABELS[kind]).join('・');
		const bar = ganttBar(r.track, scale, task.title, info, false, extra, depText);
		if (!bar) return r.row;
		if (dep?.predecessor) bar.addClass('has-predecessor');
		if (dep?.successor) bar.addClass('has-successor');
		bars.set(task.id, bar);
		bar.dataset.task = task.id;
		return r.row;
	}
}
