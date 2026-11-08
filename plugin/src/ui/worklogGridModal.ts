import { type App, ButtonComponent, DropdownComponent, Modal, Notice, TextComponent } from 'obsidian';
import { compareJa } from '../calc/compare';
import { dayOfWeek, localToday, monthDayText, WEEKDAYS } from '../calc/dates';
import { cellHoursText, hoursText, missingLabel } from '../calc/format';
import { inRange, rangeLabel, type TaskRanges } from '../calc/taskRange';
import type { WorkCalendar } from '../calc/workdays';
import { gridMove, isGridKey, type GridPos } from '../forms/gridMove';
import {
	assignedTaskIds,
	cellEdited,
	changesByMonth,
	cellHours,
	filterGridTasks,
	gridChanges,
	gridTaskIds,
	savedInIndex,
	validateGridChanges,
	worklogSavedNotice,
	type GridChange,
	type GridFilter,
} from '../forms/worklogGrid';
import {
	gridHoursOf,
	gridKey,
	gridKeyDates,
	gridLines,
	gridTaskInfo,
	MODE_LABEL,
	normalizeHours,
	sumEstimates,
	sumHours,
	tasksWithHours,
	visibleGridLines,
	monthDates,
	monthsOf,
	periodDates,
	periodStartOf,
	shiftPeriod,
	UNIT_LABEL,
	type GridHours,
	type GridLine,
	type GridMode,
	type GridUnit,
} from '../calc/worklogCells';
import type { Epic, IsoDate, Member, NoteId, Project, Task, Worklog, YearMonth } from '../model';
import type { ProjectDisplayName } from '../settings';
import { confirm } from './confirmModal';
import { ChooseModal } from './chooseModal';
import { epicOptions, errorBox, projectOptions } from './formParts';
import { notifyError } from './notify';
import { toggleMark, checkbox } from './controls';

/** 1か月分の保存の結果（知らせること） */
export interface WorklogSaveResult {
	merged: number;
	droppedMemos: number;
}

export interface WorklogGridOptions {
	members: readonly Member[];
	/** 足せるタスク（アーカイブ外） */
	tasks: readonly Task[];
	/** アーカイブ内も含めてタスクを探す */
	taskOf: (id: NoteId) => Task | undefined;
	/** 担当なら最初から並べる未完了のタスクか */
	isOpen: (task: Task) => boolean;
	/** 最初の「完了・停止した担当タスクも表示」（前回の表示） */
	defaultShowFinished: boolean;
	onShowFinishedChange: (show: boolean) => void;
	projectName: (id: NoteId) => string;
	/** アーカイブ内も含めてエピックを探す */
	epicOf: (id: NoteId) => Epic | undefined;
	/** 絞り込みのプロジェクト・エピック（アーカイブ外） */
	projects: readonly Project[];
	epics: readonly Epic[];
	displayName: ProjectDisplayName;
	/** 保存後も最新を見られるよう毎回取り出す */
	worklogs: () => readonly Worklog[];
	calendar: WorkCalendar;
	/** 最初に選ぶメンバー */
	defaultMember: NoteId;
	/** 絞り込みに出すステータス名（設定の順） */
	statuses: readonly string[];
	/** ステータスの値を現在の名前にそろえる（旧名を新しい名前に） */
	statusName: (value: string) => string;
	/** タスクの予定期間と計算上の日程。索引が変わると変わるので毎回取り出す（設計書 4.3） */
	rangesOf: (task: NoteId) => TaskRanges;
	/** タスクの行から開いたときの、そのタスク（設計書 4.3） */
	task?: Task;
	onMemberChange: (member: NoteId) => void;
	/** 最初の表示の単位（前回の表示） */
	defaultUnit: GridUnit;
	/** 最初に出す期間に含まれる日。無ければ今日 */
	defaultDate?: IsoDate;
	/** 最初に入力する値。無ければ実績 */
	defaultMode?: GridMode;
	/** 最初に入るマスの日（作業ログのビューで押した日）。無ければ今日 */
	focusDate?: IsoDate;
	onUnitChange: (unit: GridUnit) => void;
	/** 索引の更新を受け取る。戻り値で解除する */
	subscribe: (callback: () => void) => () => void;
	/** メンバー・月の作業ログに、変えたマスを書き込む */
	save: (member: NoteId, month: YearMonth, changes: GridChange[]) => Promise<WorklogSaveResult>;
	/** メンバー・月の作業ログの表の編集画面を開く */
	editMonth: (member: NoteId, month: YearMonth) => void;
}

const OTHER: Record<GridMode, GridMode> = { planned: 'actual', actual: 'planned' };

/** 作業ログの入力画面。縦にタスク・横に1週間の日付のマス目に、予定か実績を入れる（設計書 4.3） */
export class WorklogGridModal extends Modal {
	private member: NoteId;
	/** 表示している期間の単位と最初の日 */
	private unit: GridUnit;
	private start: IsoDate;
	private mode: GridMode = 'actual';
	/** 絞り込み。空は絞らない */
	private project: NoteId = '';
	private epic: NoteId = '';
	private status = '';
	/** 完了・停止した担当タスクも並べるか */
	private showFinished: boolean;
	/** 入力したマス。メンバーごとに、週・メンバーを替えても残す */
	private readonly edits = new Map<NoteId, Map<string, GridHours>>();
	/** 保存したが索引にまだ載っていないマス。載ったら消す */
	private readonly saved = new Map<NoteId, Map<string, GridHours>>();
	/** 画面で足したタスク */
	private readonly extra = new Set<NoteId>();
	/** たたんだプロジェクト・エピックの行のキー（初めはすべて開く） */
	private readonly collapsed = new Set<string>();
	private errors: string[] = [];
	private saving = false;
	private discard = false;
	private unsubscribe: (() => void) | null = null;
	/** 固定した列の位置を、表の幅が変わるたびに合わせ直す */
	private pinObserver: ResizeObserver | null = null;
	/** 描き直したあとに入るタスクの行 */
	private focusTask: NoteId | null = null;
	/** 最初に入るマスの日。1回使ったら消す */
	private focusDate: IsoDate | null = null;

	// 描いた表の部品。値だけを描き直すときに使う
	/** 見えているタスクの行（キーでの移動の行） */
	private tasks: NoteId[] = [];
	/** 絞り込み後のすべてのタスク（たたんだ行も含む。日の合計に使う） */
	private allTasks: NoteId[] = [];
	/** プロジェクト・エピックの行の小計のマス */
	private groups: { tasks: NoteId[]; days: HTMLElement[]; months: HTMLElement[] }[] = [];
	private lines: GridLine[] = [];
	private grid: HTMLInputElement[][] = [];
	private refs: HTMLElement[][] = [];
	/** 行ごと・月ごとの合計のマス */
	private rowTotals: HTMLElement[][] = [];
	private dayTotals: HTMLElement[] = [];
	private monthTotals: HTMLElement[] = [];
	private dirtyEl: HTMLElement | null = null;
	/** 表示している月の、選んだメンバーの記録の値（描くたび・索引が変わるたびに作り直す） */
	private base = new Map<string, GridHours>();

	constructor(
		app: App,
		private readonly options: WorklogGridOptions,
	) {
		super(app);
		this.member = options.members.some((m) => m.id === options.defaultMember && m.active) ? options.defaultMember : '';
		this.unit = options.defaultUnit;
		this.showFinished = options.defaultShowFinished;
		this.start = periodStartOf(options.defaultDate ?? localToday(), this.unit);
		this.focusDate = options.focusDate ?? null;
		this.mode = options.defaultMode ?? 'actual';
		if (options.task) {
			this.extra.add(options.task.id);
			this.focusTask = options.task.id;
		}
	}

	onOpen(): void {
		this.setTitle(this.options.task ? `作業ログを入力：${this.options.task.title}` : '作業ログを入力');
		this.modalEl.addClass('pm-table-edit-modal', 'pm-worklog-grid-modal');
		const target = this.focusTask;
		this.render();
		// 開いたタスクの行に入ったときは、最初の行へ移さない
		if (target === null || this.focusTask !== null) this.focusFirst();
		// 入力中のマスは触らず、値だけを描き直す
		this.unsubscribe = this.options.subscribe(() => this.refreshValues());
	}

	/** 保存していない入力があれば、確かめてから閉じる */
	close(): void {
		const count = this.dirtyCount();
		if (this.discard || count === 0) {
			super.close();
			return;
		}
		void confirm(this.app, {
			title: '保存していない入力があります',
			details: [`${count} マスの入力を保存せずに閉じますか？`],
			confirmText: '保存せずに閉じる',
			danger: true,
		}).then((ok) => {
			if (!ok) return;
			this.discard = true;
			this.close();
		});
	}

	onClose(): void {
		this.unsubscribe?.();
		this.pinObserver?.disconnect();
		this.contentEl.empty();
	}

	private get dates(): IsoDate[] {
		return periodDates(this.start, this.unit);
	}

	/** 表示している日付の月（月をまたぐ週は2つ） */
	private get months(): YearMonth[] {
		return monthsOf(this.dates);
	}

	private mapOf(store: Map<NoteId, Map<string, GridHours>>, member: NoteId): Map<string, GridHours> {
		let map = store.get(member);
		if (!map) {
			map = new Map();
			store.set(member, map);
		}
		return map;
	}

	/** 記録の値。保存して索引にまだ載っていない値を上に重ねる */
	private baseOf(member: NoteId, dates: readonly IsoDate[]): Map<string, GridHours> {
		const base = gridHoursOf(this.options.worklogs(), member, dates);
		for (const [key, h] of this.saved.get(member) ?? []) base.set(key, h);
		return base;
	}

	/** 保存していないマスの変更（全メンバー・全週） */
	private allChanges(): { member: NoteId; changes: GridChange[] }[] {
		return [...this.edits].map(([member, edits]) => {
			return { member, changes: gridChanges(edits, this.baseOf(member, gridKeyDates(edits.keys()))) };
		});
	}

	private dirtyCount(): number {
		return this.allChanges().reduce((n, c) => n + c.changes.length, 0);
	}

	private memberOf(id: NoteId): Member | undefined {
		return this.options.members.find((m) => m.id === id);
	}

	private taskTitle(id: NoteId): string {
		return this.options.taskOf(id)?.title ?? missingLabel(id, 'task');
	}

	private taskLabel(t: Task): string {
		const project = this.options.projectName(t.project);
		return project ? `${t.title}（${project}）` : t.title;
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		errorBox(contentEl, this.errors);
		this.bar(contentEl);
		const daily = this.memberOf(this.member)?.dailyHours;
		contentEl.createDiv({
			cls: 'pm-note',
			text: `「${MODE_LABEL[this.mode]}」の時間(h)を入れます（0.25刻み。空にすると消します）。矢印キー・Enter でマスを移動します。マスの右下の小さな数字は${MODE_LABEL[OTHER[this.mode]]}です。${daily !== undefined ? `1日の通常稼働は ${daily}h。` : ''}期間やメンバーを替えても入力は残り、「保存」でまとめて書き込みます`,
		});
		const legend = contentEl.createDiv({ cls: 'pm-note pm-worklog-grid-legend' });
		legend.createSpan({ text: 'タスクの作業範囲（ガントと同じ）：' });
		legend.createSpan({ cls: 'pm-worklog-grid-swatch is-plan', text: '予定期間' });
		legend.createSpan({ cls: 'pm-worklog-grid-swatch is-schedule', text: '計算上の日程' });
		legend.createSpan({ cls: 'pm-worklog-grid-swatch is-start', text: '開始日' });
		legend.createSpan({ cls: 'pm-worklog-grid-swatch is-due', text: '期限日' });
		legend.createSpan({ cls: 'pm-worklog-grid-swatch is-edited', text: '保存前の変更' });
		if (this.member) this.table(contentEl);
		else contentEl.createDiv({ cls: 'pm-view-empty', text: 'メンバーを選んでください' });
		this.monthLinks(contentEl);
		this.footer(contentEl);
	}

	/** メンバー・週・予定と実績の切り替え */
	private bar(el: HTMLElement): void {
		const bar = el.createDiv({ cls: 'pm-worklog-grid-bar' });
		const d = new DropdownComponent(bar);
		d.addOption('', 'メンバーを選ぶ');
		for (const m of this.options.members.filter((m) => m.active).sort((a, b) => compareJa(a.title, b.title))) d.addOption(m.id, m.title);
		d.selectEl.setAttr('aria-label', 'メンバー');
		d.setValue(this.member).onChange((v) => {
			this.member = v;
			this.options.onMemberChange(v);
			this.render();
		});

		const week = bar.createDiv({ cls: 'pm-worklog-grid-week' });
		const label = UNIT_LABEL[this.unit];
		const move = (start: IsoDate) => {
			this.start = start;
			this.render();
		};
		const unit = new DropdownComponent(week);
		for (const u of ['week', 'month'] as const) unit.addOption(u, UNIT_LABEL[u].name);
		unit.selectEl.setAttr('aria-label', '表示の期間');
		unit.setValue(this.unit).onChange((v) => {
			this.unit = v === 'month' ? 'month' : 'week';
			this.options.onUnitChange(this.unit);
			// 今の期間の最初の日を含む期間にする
			move(periodStartOf(this.start, this.unit));
		});
		new ButtonComponent(week).setIcon('chevron-left').setTooltip(label.prev).onClick(() => move(shiftPeriod(this.start, this.unit, -1)));
		const date = new TextComponent(week).setValue(this.start);
		date.inputEl.type = 'date';
		date.inputEl.setAttr('aria-label', `日付を選んでその${this.unit === 'week' ? '週' : '月'}へ`);
		date.inputEl.addEventListener('change', () => {
			if (date.getValue()) move(periodStartOf(date.getValue(), this.unit));
		});
		new ButtonComponent(week).setIcon('chevron-right').setTooltip(label.next).onClick(() => move(shiftPeriod(this.start, this.unit, 1)));
		new ButtonComponent(week).setButtonText(label.now).onClick(() => move(periodStartOf(localToday(), this.unit)));

		const modes = bar.createDiv({ cls: 'pm-worklog-grid-mode' });
		for (const mode of ['planned', 'actual'] as const) {
			const b = new ButtonComponent(modes).setButtonText(MODE_LABEL[mode]).onClick(() => {
				this.mode = mode;
				this.render();
				this.focusFirst();
			});
			if (mode === this.mode) b.setCta();
		}

		const filter = bar.createDiv({ cls: 'pm-worklog-grid-filter' });
		const p = new DropdownComponent(filter);
		projectOptions(p, this.options.projects, this.options.displayName, this.project, 'すべてのプロジェクト');
		p.selectEl.setAttr('aria-label', 'プロジェクトで絞る');
		p.onChange((v) => {
			this.project = v;
			this.epic = '';
			this.render();
		});
		if (this.project) {
			const e = new DropdownComponent(filter);
			epicOptions(e, this.options.epics, this.project, this.epic, 'すべてのエピック');
			e.selectEl.setAttr('aria-label', 'エピックで絞る');
			e.onChange((v) => {
				this.epic = v;
				this.render();
			});
		}
		const s = new DropdownComponent(filter);
		s.addOption('', 'すべてのステータス');
		for (const name of this.options.statuses) s.addOption(name, name);
		s.selectEl.setAttr('aria-label', 'ステータスで絞る');
		s.setValue(this.status).onChange((v) => {
			this.status = v;
			this.render();
		});
		checkbox(filter, '完了・停止した担当タスクも表示', this.showFinished, (show) => {
			this.showFinished = show;
			this.options.onShowFinishedChange(show);
			this.render();
		});
	}

	private get filtered(): boolean {
		return this.project !== '' || this.epic !== '' || this.status !== '';
	}

	/** 絞り込みの条件 */
	private get gridFilter(): GridFilter {
		return { project: this.project, epic: this.epic, status: this.status };
	}

	/** 絞り込みに使うタスクの値。ステータスは現在の名前にそろえる */
	private readonly filterInfo = (id: NoteId): Pick<Task, 'project' | 'epic' | 'status'> | undefined => {
		const t = this.options.taskOf(id);
		return t ? { project: t.project, ...(t.epic ? { epic: t.epic } : {}), status: this.options.statusName(t.status) } : undefined;
	};

	private table(el: HTMLElement): void {
		const { member } = this;
		// 月の合計に表示していない日の記録も使うので、月全体を読む
		this.base = this.baseOf(member, this.months.flatMap(monthDates));
		const { base } = this;
		const edits = this.mapOf(this.edits, member);
		const assigned = assignedTaskIds(
			this.options.tasks,
			member,
			(id) => {
				const t = this.options.taskOf(id);
				return !!t && this.options.isOpen(t);
			},
			this.showFinished,
		);
		const ids = gridTaskIds([assigned, tasksWithHours(base), tasksWithHours(edits), [...this.extra]], (id) => id);
		this.allTasks = filterGridTasks(ids, this.filterInfo, this.gridFilter);
		this.lines = gridLines(this.allTasks, (id) => gridTaskInfo(this.options.taskOf(id), this.options.epicOf, this.options.projectName));
		// 足したタスクがたたんだ行の中なら開く
		const focus = this.lines.find((l) => l.kind === 'task' && l.key === this.focusTask);
		for (const key of focus?.parents ?? []) this.collapsed.delete(key);
		const visible = visibleGridLines(this.lines, this.collapsed);
		this.tasks = visible.filter((l) => l.kind === 'task').map((l) => l.key);

		const table = el.createDiv({ cls: 'pm-worklog-grid-wrap' }).createEl('table', { cls: `pm-table pm-table-edit pm-worklog-grid is-${this.unit}` });
		this.head(table);
		const body = table.createEl('tbody');
		this.grid = [];
		this.refs = [];
		this.rowTotals = [];
		this.groups = [];
		let row = 0;
		for (const line of visible) {
			if (line.kind === 'task') this.taskRow(body, line, row++);
			else this.groupRow(body, line);
		}
		this.addTaskRow(body);
		this.totalRow(body);
		this.pinColumns(table);
		// 合計は footer で描く（保存していないマスの数の欄ができてから）
	}

	/** 日付の見出し。今日と休日（会社・個人・土日）が分かるようにする */
	private head(table: HTMLElement): void {
		const tr = table.createEl('thead').createEl('tr');
		const th = tr.createEl('th', { cls: 'pm-worklog-grid-task' });
		th.createSpan({ text: 'タスク' });
		const groups = this.lines.filter((l) => l.kind !== 'task').map((l) => l.key);
		new ButtonComponent(th)
			.setIcon('chevrons-up-down')
			.setTooltip('すべて開く')
			.setClass('pm-worklog-grid-fold')
			.onClick(() => this.setFolded([], false));
		new ButtonComponent(th)
			.setIcon('chevrons-down-up')
			.setTooltip('すべてたたむ')
			.setClass('pm-worklog-grid-fold')
			.onClick(() => this.setFolded(groups, true));
		tr.createEl('th', { text: '見積(h)', cls: 'pm-worklog-grid-estimate pm-worklog-grid-pin', attr: { 'aria-label': 'タスクの見積工数（参考）' } });
		for (const month of this.months) tr.createEl('th', { text: `${Number(month.slice(5))}月の${MODE_LABEL[this.mode]}`, cls: 'pm-worklog-grid-total pm-worklog-grid-pin' });
		const today = localToday();
		const member = this.options.members.filter((m) => m.id === this.member);
		for (const date of this.dates) {
			const th = tr.createEl('th');
			th.createDiv({ text: monthDayText(date) });
			th.createDiv({ text: WEEKDAYS[dayOfWeek(date)] ?? '', cls: 'pm-worklog-grid-weekday' });
			const marks = this.options.calendar.holidayMarks(date, member);
			if (marks.length > 0) {
				th.addClass('is-holiday');
				th.setAttr('aria-label', marks.map((m) => m.label).join('、'));
			}
			if (date === today) th.addClass('is-today');
		}
	}

	/** 行の名前の欄。階層の深さだけ字下げし、番号を名前の前に置く */
	private nameCell(tr: HTMLElement, line: GridLine): HTMLElement {
		const td = tr.createEl('td', { cls: 'pm-worklog-grid-task' });
		td.setCssProps({ '--pm-depth': String(line.depth) });
		return td;
	}

	/** たたむ・開くを切り替えて描き直す。keys が空で開くときは、すべて開く */
	private setFolded(keys: readonly string[], folded: boolean): void {
		if (keys.length === 0 && !folded) this.collapsed.clear();
		for (const key of keys) {
			if (folded) this.collapsed.add(key);
			else this.collapsed.delete(key);
		}
		this.render();
	}

	/** プロジェクト・エピックの行。▶／▼ で開閉し、配下のタスクの小計を出す（ガントと同じ並び。設計書 9.8） */
	private groupRow(body: HTMLElement, line: GridLine): void {
		const tr = body.createEl('tr', { cls: `pm-worklog-grid-group is-${line.kind}` });
		const name = this.nameCell(tr, line);
		const open = !this.collapsed.has(line.key);
		toggleMark(name, open, true, () => this.setFolded([line.key], open));
		if (line.wbs) name.createSpan({ cls: 'pm-worklog-grid-wbs', text: line.wbs });
		name.appendText(line.label);
		this.estimateCell(tr, line.tasks);
		const months = this.totalCells(tr);
		const days = this.dates.map(() => tr.createEl('td', { cls: 'is-numeric' }));
		this.groups.push({ tasks: line.tasks, days, months });
	}

	private taskRow(body: HTMLElement, line: GridLine, row: number): void {
		const task = line.key;
		const tr = body.createEl('tr');
		const name = this.nameCell(tr, line);
		toggleMark(name, false, false, () => {});
		if (line.wbs) name.createSpan({ cls: 'pm-worklog-grid-wbs', text: line.wbs });
		name.appendText(this.options.taskOf(task) ? line.label : this.taskTitle(task));
		this.estimateCell(tr, [task]);
		this.rowTotals[row] = this.totalCells(tr);
		this.grid[row] = [];
		this.refs[row] = [];
		this.dates.forEach((date, col) => this.cell(tr, task, date, { row, col }));
		if (this.focusTask === task) {
			this.focusTask = null;
			window.setTimeout(() => this.focusRow(row), 0);
		}
	}

	/**
	 * タスク名の右の見積・月の合計の列を、横に流しても左に固定する。
	 * 左からの位置は、左にある見出しのマスの幅の合計（列の幅が中身で変わるため）。
	 * offsetLeft は固定したマスでは表ではなく画面の枠からの位置になるので使わない
	 */
	private pinColumns(table: HTMLTableElement): void {
		const pin = () => {
			const head = table.tHead?.rows[0];
			if (!head) return;
			const cells = Array.from(head.cells);
			const pinned = cells.filter((c) => c.hasClass('pm-worklog-grid-pin'));
			const last = pinned[pinned.length - 1];
			// 開くときの拡大・縮小の動きの途中でも、元の大きさで測る
			const rect = table.getBoundingClientRect().width;
			const scale = rect > 0 ? table.offsetWidth / rect : 1;
			const lefts: number[] = [];
			cells.reduce((left, th) => {
				lefts.push(left);
				return left + th.getBoundingClientRect().width * scale;
			}, 0);
			for (const row of Array.from(table.rows)) {
				if (row.cells.length !== cells.length) continue;
				cells.forEach((th, i) => {
					const cell = row.cells[i];
					if (!cell || !th.hasClass('pm-worklog-grid-pin')) return;
					cell.setCssProps({ '--pm-pin-left': `${lefts[i] ?? 0}px` });
					cell.toggleClass('is-pin-last', th === last);
				});
			}
		};
		this.pinObserver?.disconnect();
		this.pinObserver = new ResizeObserver(pin);
		this.pinObserver.observe(table);
	}

	/** 月ごとの合計のマス（月をまたぐ週は2つ） */
	private totalCells(tr: HTMLElement): HTMLElement[] {
		return this.months.map(() => tr.createEl('td', { cls: 'is-numeric pm-worklog-grid-total pm-worklog-grid-pin' }));
	}

	/** 見積(h)の欄（参考）。グループの行と合計の行は配下のタスクの合計 */
	private estimateCell(tr: HTMLElement, tasks: readonly NoteId[]): void {
		const sum = sumEstimates(tasks, (id) => this.options.taskOf(id)?.estimate);
		tr.createEl('td', { cls: 'is-numeric pm-worklog-grid-estimate pm-worklog-grid-pin', text: sum === null ? '' : hoursText(sum) });
	}

	private cell(tr: HTMLElement, task: NoteId, date: IsoDate, pos: GridPos): void {
		const key = gridKey(date, task);
		const td = tr.createEl('td', { cls: 'pm-worklog-grid-input' });
		const input = new TextComponent(td).onChange((v) => {
			const edits = this.mapOf(this.edits, this.member);
			const now = cellHours(key, edits, this.base);
			edits.set(key, { ...now, [this.mode]: v });
			this.markEdited(td, key, date, task);
			this.refreshTotals();
		}).inputEl;
		// 文字の欄にする（設計書 4.7）
		input.inputMode = 'decimal';
		input.addEventListener('focus', () => input.select());
		input.addEventListener('keydown', (e) => this.onKey(e, input, pos));
		const ref = td.createSpan({ cls: 'pm-worklog-grid-ref' });
		ref.setAttr('aria-hidden', 'true');
		(this.grid[pos.row] ??= [])[pos.col] = input;
		(this.refs[pos.row] ??= [])[pos.col] = ref;
		this.drawCell(pos);
	}

	/** マスの値と、もう片方の小さな数字を描く */
	private drawCell(pos: GridPos): void {
		const input = this.grid[pos.row]?.[pos.col];
		const ref = this.refs[pos.row]?.[pos.col];
		const task = this.tasks[pos.row];
		const date = this.dates[pos.col];
		if (!input || !ref || task === undefined || date === undefined) return;
		const h = cellHours(gridKey(date, task), this.mapOf(this.edits, this.member), this.base);
		input.value = h[this.mode];
		// タスクの作業範囲の中の日に色を付ける
		const ranges = this.options.rangesOf(task);
		const td = input.parentElement;
		td?.toggleClass('is-plan', inRange(ranges.plan, date));
		td?.toggleClass('is-schedule', inRange(ranges.schedule, date));
		const { start, due } = this.options.taskOf(task) ?? {};
		td?.toggleClass('is-start', date === start);
		td?.toggleClass('is-due', date === due);
		if (td) this.markEdited(td, gridKey(date, task), date, task);
		const other = normalizeHours(h[OTHER[this.mode]]);
		ref.setText(other === '' ? '' : `${MODE_LABEL[OTHER[this.mode]].slice(0, 1)}${other}`);
	}

	/** 保存前に変えたマスに印を付け、読み上げの文字を作り直す */
	private markEdited(td: HTMLElement, key: string, date: IsoDate, task: NoteId): void {
		const edited = cellEdited(key, this.mode, this.mapOf(this.edits, this.member), this.base);
		td.toggleClass('is-edited', edited);
		const { start, due } = this.options.taskOf(task) ?? {};
		const range = [rangeLabel(this.options.rangesOf(task), date, due, start), edited ? '保存前の変更' : ''].filter(Boolean).join('、');
		td.querySelector('input')?.setAttr('aria-label', `${date} ${this.taskTitle(task)} の${MODE_LABEL[this.mode]}(h)${range ? `（${range}）` : ''}`);
	}

	/** 表のいちばん下の、タスクを足す行 */
	private addTaskRow(body: HTMLElement): void {
		const shown = new Set(this.tasks);
		const candidates = filterGridTasks(
			this.options.tasks.filter((t) => !shown.has(t.id)).map((t) => t.id),
			this.filterInfo,
			this.gridFilter,
		).flatMap((id) => this.options.taskOf(id) ?? []);
		const tr = body.createEl('tr', { cls: 'pm-worklog-grid-add-row' });
		const td = tr.createEl('td', { cls: 'pm-worklog-grid-task' });
		tr.createEl('td', { attr: { colspan: this.dates.length + this.months.length + 1 } });
		if (candidates.length === 0) return;
		const mine = (t: Task) => t.assignees.includes(this.member);
		const sorted = [...candidates].sort((a, b) => Number(mine(b)) - Number(mine(a)) || compareJa(this.taskLabel(a), this.taskLabel(b)));
		new ButtonComponent(td)
			.setButtonText('＋タスクを追加')
			.setClass('pm-worklog-grid-add')
			.onClick(() =>
				new ChooseModal(
					this.app,
					sorted,
					(t) => `${mine(t) ? '★ ' : ''}${this.taskLabel(t)}`,
					(t) => {
						this.extra.add(t.id);
						this.focusTask = t.id;
						this.render();
					},
					'タスク名かプロジェクト名で探す（★は担当）',
				).open(),
			);
	}

	private totalRow(body: HTMLElement): void {
		const tr = body.createEl('tr', { cls: 'pm-worklog-grid-sum' });
		tr.createEl('td', { text: this.filtered ? '日の合計（絞り込み中の行）' : '日の合計', cls: 'pm-worklog-grid-task' });
		this.estimateCell(tr, this.allTasks);
		this.monthTotals = this.totalCells(tr);
		this.dayTotals = this.dates.map(() => tr.createEl('td', { cls: 'is-numeric' }));
	}

	/** 行・日の合計と、保存していないマスの数を描き直す */
	private refreshTotals(): void {
		const edits = this.mapOf(this.edits, this.member);
		// 月の合計は、表示していない日の記録も含める
		const months = this.months.map(monthDates);
		const value = (task: NoteId, date: IsoDate) => cellHours(gridKey(date, task), edits, this.base)[this.mode];
		const sum = (tasks: readonly NoteId[], dates: readonly IsoDate[]) => cellHoursText(sumHours(tasks.flatMap((t) => dates.map((d) => value(t, d)))));
		const monthCells = (cells: readonly HTMLElement[] | undefined, tasks: readonly NoteId[]) =>
			months.forEach((dates, i) => cells?.[i]?.setText(sum(tasks, dates)));
		this.tasks.forEach((task, row) => monthCells(this.rowTotals[row], [task]));
		for (const g of this.groups) {
			this.dates.forEach((date, col) => g.days[col]?.setText(sum(g.tasks, [date])));
			monthCells(g.months, g.tasks);
		}
		this.dates.forEach((date, col) => this.dayTotals[col]?.setText(sum(this.allTasks, [date])));
		monthCells(this.monthTotals, this.allTasks);
		const count = this.dirtyCount();
		this.dirtyEl?.setText(count > 0 ? `保存していない入力：${count} マス` : '');
	}

	/** 索引が変わったら、保存済みの重ねた値を片付け、入力中でないマスの値を描き直す */
	private refreshValues(): void {
		for (const [member, saved] of this.saved) {
			const index = gridHoursOf(this.options.worklogs(), member, gridKeyDates(saved.keys()));
			for (const key of savedInIndex(saved, index)) saved.delete(key);
		}
		if (this.member) this.base = this.baseOf(this.member, this.months.flatMap(monthDates));
		const active = activeDocument.activeElement;
		this.grid.forEach((inputs, row) =>
			inputs.forEach((input, col) => {
				if (input !== active) this.drawCell({ row, col });
			}),
		);
		this.refreshTotals();
	}

	/** 週の中の月の作業ログを一覧で編集する（メモ・削除）。設計書 4.7 */
	private monthLinks(el: HTMLElement): void {
		if (!this.member) return;
		const { months } = this;
		const box = el.createDiv({ cls: 'pm-worklog-grid-links' });
		box.createSpan({ text: 'メモを書く・記録を一覧で直すとき：' });
		for (const month of months) {
			new ButtonComponent(box).setButtonText(`${month} の記録を一覧で編集`).onClick(() => this.options.editMonth(this.member, month));
		}
	}

	private footer(el: HTMLElement): void {
		const footer = el.createDiv({ cls: 'pm-worklog-grid-footer' });
		this.dirtyEl = footer.createSpan({ cls: 'pm-worklog-grid-dirty' });
		const buttons = footer.createDiv({ cls: 'modal-button-container' });
		new ButtonComponent(buttons).setButtonText('閉じる').onClick(() => this.close());
		new ButtonComponent(buttons).setButtonText('保存').onClick(() => void this.save(false));
		new ButtonComponent(buttons)
			.setButtonText('保存して閉じる')
			.setCta()
			.onClick(() => void this.save(true));
		this.refreshTotals();
	}

	private focusFirst(): void {
		window.setTimeout(() => this.focusRow(0), 0);
	}

	/** 行の、押した日か今日のマス（どちらも期間に無ければ最初の日）に入る */
	private focusRow(row: number): void {
		const picked = this.focusDate === null ? -1 : this.dates.indexOf(this.focusDate);
		this.focusDate = null;
		const col = picked >= 0 ? picked : Math.max(this.dates.indexOf(localToday()), 0);
		this.grid[row]?.[col]?.focus();
	}

	/** 矢印キー・Enter でマスを移動する。左右は文字の端にカーソルがあるときだけ（設計書 4.7） */
	private onKey(e: KeyboardEvent, input: HTMLInputElement, pos: GridPos): void {
		if (e.isComposing || e.ctrlKey || e.altKey || e.metaKey || !isGridKey(e.key)) return;
		if (e.key === 'ArrowLeft' && input.selectionStart !== 0) return;
		if (e.key === 'ArrowRight' && input.selectionEnd !== input.value.length) return;
		e.preventDefault();
		e.stopPropagation();
		const next = gridMove(pos, e.key, e.shiftKey, { rows: this.grid.length, cols: this.dates.length });
		this.grid[next.row]?.[next.col]?.focus();
	}

	/** 変えたマスを、メンバー・月ごとの作業ログに書き込む */
	private async save(close: boolean): Promise<void> {
		// 保存中の2回目は受け付けない（設計書 4.6）
		if (this.saving) return;
		const all = this.allChanges().filter((c) => c.changes.length > 0);
		const name = (id: NoteId) => this.memberOf(id)?.title ?? id;
		this.errors = all.flatMap(({ member, changes }) =>
			validateGridChanges(changes, (c) => `${name(member)} ${monthDayText(c.date)}「${this.taskTitle(c.task)}」`),
		);
		if (this.errors.length > 0) {
			this.render();
			return;
		}
		if (all.length === 0) {
			if (close) this.close();
			else new Notice('変えたマスはありません');
			return;
		}
		this.saving = true;
		let count = 0;
		let merged = 0;
		let droppedMemos = 0;
		try {
			for (const { member, changes } of all) {
				for (const { month, changes: part } of changesByMonth(changes)) {
					const result = await this.options.save(member, month, part);
					merged += result.merged;
					droppedMemos += result.droppedMemos;
					count += part.length;
					// 書けた分は入力から外し、索引に載るまで重ねて出す
					const edits = this.mapOf(this.edits, member);
					const saved = this.mapOf(this.saved, member);
					for (const c of part) {
						const key = gridKey(c.date, c.task);
						edits.delete(key);
						saved.set(key, { planned: c.planned, actual: c.actual });
					}
				}
			}
		} catch (e) {
			notifyError(e, '保存できませんでした');
			this.render();
			return;
		} finally {
			this.saving = false;
		}
		const notes = worklogSavedNotice(count, merged, droppedMemos);
		new Notice(notes.join('\n'), notes.length > 1 ? 8000 : undefined);
		this.errors = [];
		if (close) this.close();
		else this.render();
	}
}
