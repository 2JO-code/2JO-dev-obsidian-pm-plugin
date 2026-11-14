import {
	gridHoursOf,
	gridKey,
	gridTaskInfo,
	MODE_LABEL,
	periodDates,
	periodStartOf,
	shiftPeriod,
	UNIT_LABEL,
	visibleGridLines,
	type GridHours,
	type GridMode,
	type GridUnit,
} from '../calc/worklogCells';
import type { CalcContext } from '../calc/context';
import { currentStatusName, EMPTY_FILTER, parseFilter, type ViewFilter } from '../calc/filter';
import { firstDayOf } from '../calc/dates';
import { hoursText, membersOf, missingLabel } from '../calc/format';
import { ganttScale, xOf, type GanttScale } from '../calc/gantt';
import { taskPlanDelay, taskPlanPeriod } from '../calc/planDelay';
import {
	DEFAULT_WORKLOG_VIEW,
	parseWorklogViewOptions,
	worklogAssignedTasks,
	worklogColumns,
	worklogViewLines,
	worklogViewMembers,
	worklogViewPairs,
	worklogViewTable,
	type WorklogViewLine,
	type WorklogViewMode,
	type WorklogViewOptions,
} from '../calc/worklogView';
import { openWorklogModal } from '../commands/worklog';
import { findStatus, isFinished } from '../config/status';
import type { IsoDate, NoteId, Task } from '../model';
import { field } from '../parse/values';
import { projectLabel } from '../settings';
import { actionButtons, formClick } from './actions';
import { kindMark } from './badges';
import { memberChoices, projectChoices, statusChoices } from './choices';
import { renderFilterBar, singleSelect } from './filterBar';
import { assigneeCell, dueMark, ganttBar, ganttHeader, gridLine, holidayBand, place, planBand, startMark, todayLine, wbsColumnWidth } from './ganttParts';
import { Panel, type PanelScope, type Shell } from './panel';
import { toggleMark, checkbox } from '../ui/controls';

const UNIT_CHOICES: { value: GridUnit; label: string }[] = (['week', 'month'] as const).map((value) => ({ value, label: UNIT_LABEL[value].name }));
const MODE_CHOICES: { value: WorklogViewMode; label: string }[] = [
	{ value: 'both', label: '予定と実績' },
	{ value: 'actual', label: '実績のみ' },
	{ value: 'planned', label: '予定のみ' },
];
const ROW_CLASS: Record<WorklogViewLine['kind'], string> = {
	project: 'pm-gantt-project',
	epic: 'pm-gantt-epic',
	task: 'pm-gantt-task',
	member: 'pm-worklog-member',
};

/** 作業ログ（見るだけ）の部品。ガントと同じ並び・見出しで、日ごとの予定・実績を出す（設計書 9.10・9.12） */
export class WorklogPanel extends Panel {
	readonly title = '作業ログ';
	private filter: ViewFilter = { ...EMPTY_FILTER };
	private options: WorklogViewOptions = { ...DEFAULT_WORKLOG_VIEW };
	/** 表示している期間の最初の日。保存せず、開くたびに今日の期間にする */
	private start: IsoDate | null = null;

	getState(): Record<string, unknown> {
		return { filter: this.filter, worklog: this.options };
	}

	setState(state: unknown): void {
		this.filter = parseFilter(field(state, 'filter'));
		this.options = parseWorklogViewOptions(field(state, 'worklog'));
	}

	private setFilter(filter: ViewFilter): void {
		this.filter = filter;
		this.host.changed();
	}

	private setOptions(patch: Partial<WorklogViewOptions>): void {
		this.options = { ...this.options, ...patch };
		this.host.changed();
	}

	private moveTo(start: IsoDate): void {
		this.start = start;
		this.host.redraw();
	}

	draw(shell: Shell, ctx: CalcContext, scope?: PanelScope): void {
		const mode = this.plugin.personal.projectDisplayName;
		const { options } = this;
		// 外から固定するときは、その人・その月（設計書 9.12）
		const filter: ViewFilter = scope ? { ...this.filter, members: [scope.member.id] } : this.filter;
		const unit: GridUnit = scope ? 'month' : options.unit;
		const start = scope ? firstDayOf(scope.month) : periodStartOf(this.start ?? ctx.today, unit);
		const dates = periodDates(start, unit);
		const { summary, filters, settings, actions, notes, body } = shell;

		renderFilterBar(
			filters,
			this.filter,
			{
				projects: projectChoices(ctx, mode),
				...(scope ? {} : { members: memberChoices(ctx) }),
				statuses: statusChoices(ctx),
				archived: true,
			},
			(next) => this.setFilter(next),
		);

		if (!scope) this.periodSettings(settings, start, ctx.today);
		singleSelect(settings, '表示する値', options.mode, MODE_CHOICES, (m) => this.setOptions({ mode: m }));
		checkbox(settings, '記録の無い担当タスクも表示', options.showAssigned, (showAssigned) => this.setOptions({ showAssigned }));
		if (options.showAssigned) {
			checkbox(settings, '完了・停止したタスクも含める', options.showFinished, (showFinished) => this.setOptions({ showFinished }));
		}

		const logs = ctx.index.worklogs();
		const hoursOf = new Map<NoteId, Map<string, GridHours>>();
		const hours = (member: NoteId) => {
			let map = hoursOf.get(member);
			if (!map) {
				map = gridHoursOf(logs, member, dates);
				hoursOf.set(member, map);
			}
			return map;
		};
		const members = worklogViewMembers(ctx.index.members(), filter.members, (m) => hours(m).size > 0);
		const assignedOf = options.showAssigned
			? worklogAssignedTasks(ctx.index.tasks({ includeArchived: filter.includeArchived }), options.showFinished, (t) =>
					isFinished(findStatus(ctx.statuses.task, t.status)?.category),
				)
			: new Map<NoteId, NoteId[]>();
		const taskOf = (id: NoteId): Task | undefined => {
			const note = ctx.index.get(id);
			return note?.type === 'task' ? note : undefined;
		};
		const pairs = worklogViewPairs(members, hours, assignedOf, filter, (id) => {
			const t = taskOf(id);
			return t ? { project: t.project, status: currentStatusName(t.status, ctx.statuses.task) } : undefined;
		});
		const lines = worklogViewLines(
			pairs,
			(id) =>
				gridTaskInfo(
					taskOf(id),
					(e) => ctx.epics.get(e),
					(pid) => {
						const project = ctx.projects.get(pid);
						return project ? projectLabel(project, mode) : '';
					},
				),
			(id) => ctx.members.get(id)?.title ?? missingLabel(id, 'user'),
		);
		const parentKeys = new Set(lines.map((l) => l.parents[l.parents.length - 1]));
		const collapsed = new Set(options.collapsed);
		settings.createEl('button', { text: 'すべて開く' }).addEventListener('click', () => this.setOptions({ collapsed: [] }));
		settings.createEl('button', { text: 'すべて閉じる' }).addEventListener('click', () =>
			this.setOptions({ collapsed: lines.filter((l) => parentKeys.has(l.key)).map((l) => l.key) }),
		);
		actionButtons(actions, [{ text: '作業ログを入力', onClick: () => openWorklogModal(this.plugin, undefined, this.formAt()) }]);

		const columns = worklogColumns(options.mode);
		const visible = visibleGridLines(lines, collapsed);
		const { cells, dayTotals, rowTotals, grandTotal, grandHours, estimates, grandEstimate, cellWidth, totalWidth, estimateWidth } = worklogViewTable({
			lines,
			visible,
			dates,
			columns,
			value: (task, member, date, m) => hours(member).get(gridKey(date, task))?.[m] ?? '',
			estimateOf: (id) => taskOf(id)?.estimate,
		});
		const memberCount = new Set([...pairs.values()].flat()).size;
		const totalText = columns.map((m, i) => `${MODE_LABEL[m]} ${hoursText(grandHours[i] ?? 0)}h`).join('・');
		summary.setText(`タスク ${pairs.size} 件・メンバー ${memberCount} 人・${totalText}`);
		notes.createDiv({
			cls: 'pm-note',
			text: `${columns.map((m) => `「${MODE_LABEL[m]}」`).join('と')}の時間(h)。見積(h)は参考。プロジェクト・エピックの行と日の合計は、配下の合計です`,
		});
		notes.createDiv({
			cls: 'pm-note',
			text: 'タスクの行の後ろの薄い枠は当初期間、棒は見込みの日程、青の縦線は開始日、赤の縦線は期限日です（ガントと同じ）。棒を指すと日付を出します',
		});

		if (lines.length === 0) {
			body.createDiv({ cls: 'pm-view-empty', text: 'この期間の作業ログはありません' });
			return;
		}

		const dayWidth = cellWidth * columns.length;
		// 横軸はガントの単位「日」と同じ見出し・休日の帯・縦線・今日の線（設計書 9.8）
		const first = dates[0] ?? start;
		const last = dates[dates.length - 1] ?? start;
		const scale = { ...ganttScale({ start: first, end: last }, 'day'), pxPerDay: dayWidth, width: dates.length * dayWidth };
		const wbsWidth = Math.max(0, ...lines.map((l) => (l.kind === 'task' ? l.wbs.length : 0)));
		const wrap = body.createDiv({ cls: `pm-gantt pm-worklog-gantt${columns.length > 1 ? ' is-both' : ''}` });
		wrap.setCssProps({
			'--pm-gantt-width': `${scale.width}px`,
			'--pm-worklog-total': `${totalWidth * columns.length}px`,
			'--pm-worklog-estimate': `${estimateWidth}px`,
			'--pm-gantt-wbs': wbsColumnWidth(wbsWidth),
		});
		const head = ganttHeader(wrap, scale, ctx).parentElement;
		// 見積・合計の欄は担当者の右（横軸の前）に置く
		const headEstimate = createDiv({ cls: 'pm-worklog-estimate', text: '見積(h)', attr: { 'aria-label': 'タスクの見積工数（参考）' } });
		const headTotal = createDiv({ cls: 'pm-worklog-total' });
		head?.querySelector('.pm-gantt-person')?.after(headEstimate, headTotal);
		headTotal.createDiv({ text: '合計' });
		if (columns.length > 1) this.totalParts(headTotal.createDiv(), columns.map((m) => MODE_LABEL[m]));
		// 両方のときは、日の下に「予」「実」の段を足す
		const headTrack = head?.querySelector<HTMLElement>('.pm-gantt-track');
		for (const date of dates) {
			const x = xOf(scale, date);
			const holiday = !ctx.calendar.isWorkday(date);
			if (holiday) holidayBand(wrap, x, dayWidth);
			if (this.host.gridLines() && date !== first) gridLine(wrap, x);
			if (columns.length < 2 || !headTrack) continue;
			columns.forEach((m, i) => {
				const sub = headTrack.createDiv({ cls: 'pm-gantt-cell is-sub', text: MODE_LABEL[m].slice(0, 1), attr: { 'aria-label': MODE_LABEL[m] } });
				place(sub, x + i * cellWidth, cellWidth);
				if (holiday) sub.addClass('is-holiday');
			});
		}

		for (const line of visible) {
			const task = line.kind === 'task' || line.kind === 'member' ? taskOf(line.tasks[0] ?? '') : undefined;
			const row = wrap.createDiv({ cls: `pm-gantt-row ${ROW_CLASS[line.kind]}${line.member ? ' is-own' : ''}` });
			const label = row.createDiv({ cls: 'pm-gantt-label' });
			const person = row.createDiv({ cls: 'pm-gantt-person' });
			if (line.kind !== 'member') {
				const open = !collapsed.has(line.key);
				toggleMark(label, open, parentKeys.has(line.key), () =>
					this.setOptions({ collapsed: open ? [...options.collapsed, line.key] : options.collapsed.filter((k) => k !== line.key) }),
				);
			}
			if (line.kind === 'project' || line.kind === 'epic') {
				const title = label.createSpan({ cls: 'pm-gantt-title', text: line.wbs ? `${line.wbs} ${line.label}` : line.label });
				if (!line.noEpic) kindMark(title, line.kind);
			} else if (line.kind === 'task') {
				// 番号は幅をそろえた欄に入れる（ガントと同じ。設計書 9.8）
				const title = label.createSpan({ cls: 'pm-gantt-title pm-action-link' });
				title.createSpan({ cls: 'pm-gantt-wbs', text: line.wbs });
				title.appendText(task ? line.label : missingLabel(line.tasks[0] ?? '', 'task'));
				kindMark(title, 'task');
				// 記録した人が1人ならその人の行（担当者の欄はその人）、2人以上なら合計の行
				const member = line.member ? ctx.members.get(line.member) : undefined;
				title.setAttr('aria-label', line.member ? `${member?.title ?? ''}の作業ログを入力` : '作業ログを入力');
				formClick(title, () => openWorklogModal(this.plugin, task, { ...this.formAt(), ...(line.member ? { member: line.member } : {}), date: start }));
				if (!line.member) assigneeCell(person, membersOf(ctx, ...(task?.assignees ?? [])));
				else if (member) assigneeCell(person, [member]);
				else person.setText(missingLabel(line.member, 'user'));
			} else {
				const member = ctx.members.get(line.member);
				row.addClass('is-clickable');
				row.setAttr('aria-label', `${line.label}の作業ログを入力`);
				formClick(row, () => openWorklogModal(this.plugin, task, { ...this.formAt(), member: line.member, date: start }));
				if (member) assigneeCell(person, [member]);
				else person.setText(line.label);
			}
			row.createDiv({ cls: 'pm-worklog-estimate', text: estimates.get(line.key) ?? '' });
			this.totalParts(row.createDiv({ cls: 'pm-worklog-total' }), rowTotals.get(line.key) ?? []);
			const track = row.createDiv({ cls: 'pm-gantt-track' });
			if (task) {
				this.rangeMarks(track, scale, task, ctx);
				// 日の工数の欄を押すと、その日のマスに入った入力フォームを開く
				this.dayLinks(track, dates, dayWidth, (date) =>
					openWorklogModal(this.plugin, task, { ...this.formAt(), ...(line.member ? { member: line.member } : {}), date, focusDate: date }),
				);
			}
			this.dayCells(track, cells.get(line.key) ?? [], dates, columns, scale, cellWidth);
		}

		const sumRow = wrap.createDiv({ cls: 'pm-gantt-row pm-worklog-sum' });
		sumRow.createDiv({ cls: 'pm-gantt-label', text: filter.projects.length > 0 || filter.members.length > 0 || filter.statuses.length > 0 ? '日の合計（絞り込み中）' : '日の合計' });
		sumRow.createDiv({ cls: 'pm-gantt-person' });
		sumRow.createDiv({ cls: 'pm-worklog-estimate', text: grandEstimate });
		this.totalParts(sumRow.createDiv({ cls: 'pm-worklog-total' }), grandTotal);
		this.dayCells(sumRow.createDiv({ cls: 'pm-gantt-track' }), dayTotals, dates, columns, scale, cellWidth);

		todayLine(wrap, scale, ctx.today);
	}

	/** タスクの作業範囲。ガントと同じ当初期間の帯・見込みの日程の棒・開始日と期限日の線を、数字の後ろに描く */
	private rangeMarks(track: HTMLElement, scale: GanttScale, task: Task, ctx: CalcContext): void {
		const plan = taskPlanPeriod(task);
		if (plan) planBand(track, scale, plan.start, plan.end);
		if (task.start) startMark(track, scale, task.start);
		if (task.due) dueMark(track, scale, task.due);
		const s = ctx.schedule.schedules.get(task.id);
		if (!s) return;
		const category = findStatus(ctx.statuses.task, task.status)?.category;
		const delay = taskPlanDelay(task, s, ctx.calendar);
		ganttBar(track, scale, task.title, {
			start: s.start,
			end: s.end,
			...(task.due ? { due: task.due } : {}),
			...(category ? { category } : {}),
			delayed: s.startDelayed || s.endDelayed,
			...(plan ? { plan: { ...plan, ...(delay !== undefined ? { delay } : {}) } } : {}),
		}, false);
	}

	/** 入力フォームを開くときの共通の指定。予定だけ・実績だけの表示なら、フォームもその値で開く */
	private formAt(): { mode?: GridMode } {
		const { mode } = this.options;
		return mode === 'both' ? {} : { mode };
	}

	/** 日の欄を押したら、押した位置の日で onClick を呼ぶ（棒を指す動きは残す） */
	private dayLinks(track: HTMLElement, dates: readonly IsoDate[], dayWidth: number, onClick: (date: IsoDate) => void): void {
		track.addClass('is-day-link');
		track.addEventListener('click', (evt) => {
			evt.stopPropagation();
			const date = dates[Math.floor((evt.clientX - track.getBoundingClientRect().left) / dayWidth)];
			if (date !== undefined) onClick(date);
		});
	}

	/** 合計の欄の中身。列ごとに並べる */
	private totalParts(el: HTMLElement, texts: readonly string[]): void {
		el.addClass('pm-worklog-parts');
		for (const t of texts) el.createSpan({ cls: 'pm-worklog-part', text: t });
	}

	/** 日のマス。日の中に列（予定・実績）を左から並べる */
	private dayCells(
		track: HTMLElement,
		texts: readonly (readonly string[])[],
		dates: readonly IsoDate[],
		columns: readonly GridMode[],
		scale: Parameters<typeof xOf>[0],
		cellWidth: number,
	): void {
		texts.forEach((row, i) => {
			const date = dates[i];
			if (date === undefined) return;
			row.forEach((t, c) => {
				const m = columns[c];
				if (!t || !m) return;
				const cell = track.createDiv({ cls: `pm-worklog-cell is-${m}`, text: t });
				place(cell, xOf(scale, date) + c * cellWidth, cellWidth);
			});
		});
	}

	/** 期間の単位と、前・次・日付・今日への移動 */
	private periodSettings(settings: HTMLElement, start: IsoDate, today: IsoDate): void {
		const { unit } = this.options;
		singleSelect(settings, '期間', unit, UNIT_CHOICES, (u) => {
			this.start = periodStartOf(start, u);
			this.setOptions({ unit: u });
		});
		const nav = settings.createDiv({ cls: 'pm-filter-field' });
		const label = UNIT_LABEL[unit];
		const prev = nav.createEl('button', { text: '◀' });
		prev.setAttr('aria-label', label.prev);
		prev.addEventListener('click', () => this.moveTo(shiftPeriod(start, unit, -1)));
		const date = nav.createEl('input', { type: 'date', value: start });
		date.setAttr('aria-label', `日付を選んでその${unit === 'week' ? '週' : '月'}へ`);
		date.addEventListener('change', () => {
			if (date.value) this.moveTo(periodStartOf(date.value, unit));
		});
		const next = nav.createEl('button', { text: '▶' });
		next.setAttr('aria-label', label.next);
		next.addEventListener('click', () => this.moveTo(shiftPeriod(start, unit, 1)));
		nav.createEl('button', { text: label.now }).addEventListener('click', () => this.moveTo(periodStartOf(today, unit)));
	}
}
