import { Notice } from 'obsidian';
import type { CalcContext } from '../calc/context';
import { filterTasks } from '../calc/filter';
import { hoursText } from '../calc/format';
import { LINK_SHAPE_LABELS, LINK_SHAPES, type LinkShape } from '../calc/linkPath';
import { COLUMN_WIDTH, columnWidthOf, parseDraggedCard, toggleColumn, type DraggedCard } from '../calc/kanban';
import {
	BACKLOG,
	linkCounts,
	SPRINT_PHASE_LABELS,
	sprintBoardLinks,
	sprintBoardRows,
	sprintColumns,
	sprintMove,
	sprintPeriodText,
	type SprintBoardRow,
	type SprintCardNotes,
	type SprintColumn,
} from '../calc/sprintBoard';
import { EMPTY_TASK_FILTER, epicLabel, filterTaskRows, parseTaskListOptions, sortTaskRows, taskRows, type RowLabels, type TaskFilterOptions, type TaskRow } from '../calc/taskList';
import { openNewNoteModal } from '../commands/createNote';
import { openSprintForm, openTaskForm } from '../commands/editTask';
import type { NoteId } from '../model';
import { field, oneOf, stringArray } from '../parse/values';
import { projectLabel } from '../settings';
import { notifyError } from '../ui/notify';
import { toLink } from '../write/frontmatter';
import { writeFrontmatter } from '../write/frontmatterFile';
import { actionButtons, formClick } from './actions';
import { kindMark } from './badges';
import { CARD_PAGE, cardDue, cardWarnings, columnHead, columnWidthControl, draggableCard } from './cardBoard';
import { memberChoices, projectChoices, statusChoices } from './choices';
import { renderFilterBar, singleSelect } from './filterBar';
import { FilteredPanel, pluginStatusBadge, type Shell } from './panel';
import { drawLinks, focusLinks } from './sprintLinks';
import { taskFilterFields, withTaskFilter } from './taskFilters';

/** ドラッグ中のカードを渡す種類（カンバンのカードと区別する） */
const DRAG_TYPE = 'application/x-pm-sprint-task';

interface SprintOptions extends TaskFilterOptions {
	/** 初期のたたみ方と逆にした列（スプリントの ID。未割り当ては空） */
	toggled: string[];
	columnWidth: number;
	/** 依存の線の折れ目の形 */
	linkShape: LinkShape;
}

/** スプリントの部品（要件 4.17、設計書 9.16）。カードを列へ動かすとタスクの `sprint` を書き換える */
export class SprintPanel extends FilteredPanel {
	readonly title = 'スプリント';
	private options: SprintOptions = { ...EMPTY_TASK_FILTER, toggled: [], columnWidth: COLUMN_WIDTH.initial, linkShape: 'curve' };
	/** 列ごとに出しているカードの数。保存しない */
	private limits = new Map<string, number>();
	/** 依存の線を引き直すための見張り。描き直すたびに外す */
	private observer: ResizeObserver | null = null;

	getState(): Record<string, unknown> {
		return { filter: this.filter, sprint: this.options };
	}

	setState(state: unknown): void {
		this.readFilter(state);
		const raw = field(state, 'sprint');
		const { epics, dueFrom, dueTo, warningsOnly } = parseTaskListOptions(raw);
		this.options = {
			epics,
			warningsOnly,
			...(dueFrom ? { dueFrom } : {}),
			...(dueTo ? { dueTo } : {}),
			toggled: stringArray(field(raw, 'toggled')),
			columnWidth: columnWidthOf(field(raw, 'columnWidth')),
			linkShape: oneOf(field(raw, 'linkShape'), LINK_SHAPES) ?? 'curve',
		};
		this.limits.clear();
	}

	private setOptions(options: SprintOptions): void {
		this.options = options;
		this.host.changed();
	}

	draw(shell: Shell, ctx: CalcContext): void {
		this.observer?.disconnect();
		this.observer = null;
		const mode = this.plugin.personal.projectDisplayName;
		const labels: RowLabels = { project: (p) => projectLabel(p, mode) };
		const { options } = this;
		const { summary, filters, settings, actions, notes, body } = shell;

		// プロジェクトは1つだけ選ぶ。選んでいなければ表示名の順で最初のもの
		const choices = projectChoices(ctx, mode);
		const project = choices.find((c) => c.value === this.filter.projects[0])?.value ?? choices[0]?.value;
		const filter = { ...this.filter, projects: project ? [project] : [] };

		renderFilterBar(
			filters,
			this.filter,
			{
				members: memberChoices(ctx),
				membersLabel: '担当者',
				statuses: statusChoices(ctx),
				archived: true,
				extra: (bar) => {
					this.projectSelect(bar, choices, project);
					taskFilterFields(bar, ctx, filter.projects, mode, options, (next) => {
						this.limits.clear();
						this.setOptions(withTaskFilter(this.options, next));
					});
				},
				onClear: () => {
					this.options = { ...EMPTY_TASK_FILTER, toggled: this.options.toggled, columnWidth: this.options.columnWidth, linkShape: this.options.linkShape };
					this.limits.clear();
				},
			},
			(next) => {
				this.limits.clear();
				// 「条件をクリア」でもプロジェクトは残す
				this.setFilter({ ...next, projects: filter.projects });
			},
		);

		actionButtons(actions, [
			{ text: '新しいスプリント', onClick: () => openNewNoteModal(this.plugin, 'sprint', project ? { project } : {}) },
			{ text: '新しいタスク', onClick: () => openNewNoteModal(this.plugin, 'task', project ? { project } : {}) },
		]);
		if (!project) {
			summary.setText('');
			body.createDiv({ cls: 'pm-note', text: 'プロジェクトがありません。先にプロジェクトを作成してください' });
			return;
		}

		const all = { includeArchived: true };
		const sprints = ctx.index.sprints(all).filter((s) => s.project === project);
		const tasks = filterTasks(ctx.index.tasks({ includeArchived: filter.includeArchived }), { ...filter, includeClosed: true }, ctx.projects, ctx.statuses);
		const statusOrder = ctx.statuses.task.map((s) => s.name);
		// 列の中は期限日の早い順（期限日の無いものは最後）
		const shown = sortTaskRows(filterTaskRows(taskRows(ctx, tasks), options), 'due', false, labels, statusOrder);
		const taskById = new Map(ctx.index.tasks(all).map((t) => [t.id, t]));
		const { links, notes: cardNotes } = sprintBoardLinks(
			shown.map((r) => r.task),
			(id) => taskById.get(id),
			sprints,
			ctx.statuses.task,
		);

		summary.setText(`スプリント ${sprints.length} 件・タスク ${shown.length} 件`);
		notes.createDiv({
			cls: 'pm-note',
			text: '線は先行タスク → 後続タスク。赤い線は、先行タスクが後のスプリントか未割り当てにある（順番違い）',
		});

		const board = body.createDiv({ cls: 'pm-sprint-board' });
		columnWidthControl(settings, board, options.columnWidth, {
			onInput: () => redrawLinks(),
			onSave: (columnWidth) => {
				this.options = { ...this.options, columnWidth };
				this.host.save();
			},
			onReset: () => this.setOptions({ ...this.options, columnWidth: COLUMN_WIDTH.initial }),
		});

		singleSelect(
			settings,
			'線の形',
			options.linkShape,
			LINK_SHAPES.map((value) => ({ value, label: LINK_SHAPE_LABELS[value] })),
			(linkShape) => this.setOptions({ ...this.options, linkShape }),
		);

		const cards = new Map<NoteId, HTMLElement>();
		const columns = sprintColumns(shown, sprints, ctx.today);
		const rows = sprintBoardRows(columns);
		this.drawBoard(board, columns, rows, ctx, cards, cardNotes, linkCounts(links));
		const redrawLinks = drawLinks(board, links, cards, options.linkShape);
		this.observer = new ResizeObserver(() => redrawLinks());
		this.observer.observe(board);
	}

	/** プロジェクトを1つ選ぶ欄 */
	private projectSelect(bar: HTMLElement, choices: { value: string; label: string }[], project: NoteId | undefined): void {
		const box = bar.createDiv({ cls: 'pm-filter-field' });
		box.createSpan({ cls: 'pm-filter-label', text: 'プロジェクト' });
		const select = box.createEl('select', { cls: 'dropdown' });
		for (const c of choices) select.createEl('option', { value: c.value, text: c.label });
		if (project) select.value = project;
		select.addEventListener('change', () => {
			this.limits.clear();
			// エピックの絞り込みはプロジェクトごとなので外す
			this.options = { ...this.options, epics: [] };
			this.setFilter({ ...this.filter, projects: [select.value] });
		});
	}

	/** 列が今たたまれているか */
	private isCollapsed(column: SprintColumn): boolean {
		return column.collapsedByDefault !== this.options.toggled.includes(column.id);
	}

	/**
	 * ボードを描く（設計書 9.16）。上に列の見出しの行、その下に依存のまとまりの行。
	 * 行は全部の列をまたぎ、マスの上の余白を線の通り道にする
	 */
	private drawBoard(
		board: HTMLElement,
		columns: readonly SprintColumn[],
		rows: readonly SprintBoardRow[],
		ctx: CalcContext,
		cards: Map<NoteId, HTMLElement>,
		cardNotes: ReadonlyMap<NoteId, SprintCardNotes>,
		linked: ReadonlyMap<NoteId, { pred: number; succ: number }>,
	): void {
		const cell = (row: HTMLElement, i: number, column: SprintColumn, cls: string) => {
			const el = row.createDiv({ cls: `pm-sprint-cell ${cls}` });
			el.dataset.col = String(i);
			el.setCssProps({ '--pm-sprint-lanes': String(this.isCollapsed(column) ? 1 : column.laneCount) });
			if (this.isCollapsed(column)) el.addClass('is-collapsed');
			if (column.phase === 'active') el.addClass('is-active');
			this.dropTarget(board, el, i, column.id);
			return el;
		};

		const headRow = board.createDiv({ cls: 'pm-sprint-row is-head' });
		columns.forEach((column, i) => this.drawHead(cell(headRow, i, column, 'is-head'), column));

		// 列ごとに出せる残りのカードの数（「さらに表示」）
		const left = columns.map((c) => this.limits.get(c.id) ?? CARD_PAGE);
		rows.forEach((row, rowIndex) => {
			const rowEl = board.createDiv({ cls: 'pm-sprint-row' });
			if (!row.linked) rowEl.addClass('is-alone');
			if (rowIndex === rows.length - 1) rowEl.addClass('is-last');
			columns.forEach((column, i) => {
				const el = cell(rowEl, i, column, '');
				if (this.isCollapsed(column)) return;
				const lanes = el.createDiv({ cls: 'pm-sprint-lanes' });
				// 段の位置を行どうしでそろえるため、空の段も置く
				for (let n = 0; n < column.laneCount; n++) {
					const laneEl = lanes.createDiv({ cls: 'pm-sprint-lane' });
					for (const r of row.cells[i]?.[n] ?? []) {
						if ((left[i] ?? 0) <= 0) break;
						left[i] = (left[i] ?? 0) - 1;
						cards.set(r.task.id, this.drawCard(laneEl, r, column.id, ctx, cardNotes.get(r.task.id), linked.get(r.task.id)));
					}
				}
			});
		});

		const hidden = columns.map((c, i) => c.rows.length - ((this.limits.get(c.id) ?? CARD_PAGE) - Math.max(0, left[i] ?? 0)));
		if (columns.some((c, i) => (hidden[i] ?? 0) > 0 && !this.isCollapsed(c))) {
			const moreRow = board.createDiv({ cls: 'pm-sprint-row is-more' });
			columns.forEach((column, i) => {
				const el = cell(moreRow, i, column, '');
				const n = hidden[i] ?? 0;
				if (n <= 0 || this.isCollapsed(column)) return;
				const more = el.createEl('button', { cls: 'pm-kanban-more', text: `さらに表示（残り ${n} 件）` });
				more.addEventListener('click', () => {
					this.limits.set(column.id, (this.limits.get(column.id) ?? CARD_PAGE) + CARD_PAGE);
					this.host.redraw();
				});
			});
		}
	}

	/** 列の見出し：名前・状態・件数、開いていれば期間・ゴール・集計 */
	private drawHead(el: HTMLElement, column: SprintColumn): void {
		const { sprint } = column;
		const collapsed = this.isCollapsed(column);
		columnHead(el, {
			name: sprint ? sprint.title : '未割り当て',
			count: column.rows.length,
			collapsed,
			onToggle: () => this.setOptions({ ...this.options, toggled: toggleColumn(this.options.toggled, column.id) }),
			...(column.phase ? { mark: { cls: `pm-sprint-phase is-${column.phase}`, text: SPRINT_PHASE_LABELS[column.phase] } } : {}),
		});
		if (collapsed) return;

		const info = el.createDiv({ cls: 'pm-sprint-info' });
		if (sprint) {
			const period = info.createDiv({ cls: 'pm-sprint-period' });
			period.createSpan({ text: sprintPeriodText(sprint) });
			const edit = period.createSpan({ cls: 'pm-action-link', text: '編集' });
			edit.setAttr('aria-label', 'スプリントを編集');
			formClick(edit, () => openSprintForm(this.plugin, sprint.path));
			if (sprint.goal) info.createDiv({ cls: 'pm-sprint-goal', text: `ゴール：${sprint.goal}` });
		} else {
			info.createDiv({ text: 'スプリントに入れていないタスク' });
		}
		info.createDiv({ text: `見積 ${hoursText(column.estimate)}h・完了 ${column.done}/${column.counted}` });
	}

	/** 列（見出しとすべての行のマス）にカードを落とせるようにする。たたんだ列にも落とせる */
	private dropTarget(board: HTMLElement, el: HTMLElement, index: number, sprint: NoteId): void {
		const accepts = (e: DragEvent) => e.dataTransfer?.types.includes(DRAG_TYPE) ?? false;
		const mark = (col: number | undefined) => {
			for (const c of Array.from(board.querySelectorAll<HTMLElement>('.pm-sprint-cell'))) c.toggleClass('is-drop-target', c.dataset.col === String(col));
		};
		el.addEventListener('dragover', (e) => {
			if (!accepts(e)) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			if (!el.hasClass('is-drop-target')) mark(index);
		});
		el.addEventListener('dragleave', (e) => {
			if (!(e.relatedTarget instanceof Node && board.contains(e.relatedTarget))) mark(undefined);
		});
		el.addEventListener('drop', (e) => {
			mark(undefined);
			const card = parseDraggedCard(e.dataTransfer?.getData(DRAG_TYPE) ?? '');
			if (!card) return;
			e.preventDefault();
			void this.moveCard(card, sprint);
		});
	}

	/** カードを動かした先のスプリントを書き込む。日付は変えない（要件 4.17）。描き直しは索引の更新で行われる */
	private async moveCard(card: DraggedCard, to: NoteId): Promise<void> {
		const move = sprintMove(card.from, to);
		if (!move) return;
		const file = this.app.vault.getFileByPath(card.path);
		if (!file) {
			new Notice('タスクのノートが見つかりません');
			return;
		}
		const { index } = this.plugin.store;
		const name = (id: NoteId) => (id === BACKLOG ? '未割り当て' : index.title(id) || id);
		try {
			await writeFrontmatter(this.app, file, 'task', { sprint: move.sprint === null ? null : toLink(move.sprint) });
			new Notice(`「${card.title}」を「${name(card.from)}」→「${name(to)}」にしました`);
		} catch (e) {
			notifyError(e, 'スプリントを書き込めませんでした。ノートのプロパティ（YAML）が壊れていないか確かめてください');
		}
	}

	private drawCard(
		col: HTMLElement,
		row: TaskRow,
		from: NoteId,
		ctx: CalcContext,
		notes: SprintCardNotes | undefined,
		linked: { pred: number; succ: number } | undefined,
	): HTMLElement {
		const { task } = row;
		const card = col.createDiv({ cls: 'pm-kanban-card is-clickable' });
		card.dataset.task = task.id;
		formClick(card, () => openTaskForm(this.plugin, task.path));
		draggableCard(card, DRAG_TYPE, { path: task.path, title: task.title, from }, () => {
			for (const c of Array.from(card.closest('.pm-sprint-board')?.querySelectorAll('.is-drop-target') ?? [])) c.removeClass('is-drop-target');
		});
		// 指している間、そのカードの線を目立たせる
		card.addEventListener('mouseenter', () => focusLinks(card, task.id));
		card.addEventListener('mouseleave', () => focusLinks(card, undefined));

		const title = card.createDiv({ cls: 'pm-kanban-title' });
		kindMark(title.createSpan({ text: task.title }), 'task');
		if (task.epic) {
			const epic = card.createDiv({ cls: 'pm-kanban-meta' });
			kindMark(epic.createSpan({ text: row.epic ? epicLabel(row.epic) : `（見つからないエピック：${task.epic}）` }), 'epic');
		}
		const status = card.createDiv({ cls: 'pm-kanban-meta' });
		pluginStatusBadge(this.plugin, status, 'task', row.status);
		const assignees = row.assignees.map((m) => m.title).join('、');
		if (assignees) card.createDiv({ cls: 'pm-kanban-meta', text: `担当：${assignees}` });
		cardDue(card, row, ctx.calendar);
		if (task.estimate !== undefined) card.createDiv({ cls: 'pm-kanban-meta', text: `見積 ${task.estimate}h` });

		const deps = [
			linked && linked.pred > 0 ? `先行 ${linked.pred}` : '',
			linked && linked.succ > 0 ? `後続 ${linked.succ}` : '',
			notes && notes.external > 0 ? `別プロジェクトの先行 ${notes.external}` : '',
		].filter((s) => s !== '');
		if (deps.length > 0) card.createDiv({ cls: 'pm-kanban-meta pm-sprint-deps', text: `依存：${deps.join('・')}` });

		cardWarnings(card, row, { cls: 'is-sprint', label: 'スプリント', messages: notes?.warnings ?? [] });
		return card;
	}
}
