import { Notice, normalizePath, TFile } from 'obsidian';
import { ContextCache } from '../calc/context';
import { localToday } from '../calc/dates';
import { taskRanges } from '../calc/taskRange';
import { WorkCalendar } from '../calc/workdays';
import { currentStatusName } from '../calc/filter';
import { findStatus, isFinished } from '../config/status';
import { defaultWorklogMember, worklogGridEdits, type GridChange } from '../forms/worklogGrid';
import { parseGridUnit, type GridMode } from '../calc/worklogCells';
import { worklogRows } from '../forms/worklogTable';
import { worklogId } from '../id';
import type ProjectManagerPlugin from '../main';
import type { IsoDate, NoteId, Task, YearMonth } from '../model';
import { TABLE_SPEC } from '../parse/bodyTables';
import { projectLabel } from '../settings';
import { WorklogGridModal, type WorklogSaveResult } from '../ui/worklogGridModal';
import { toLink } from '../write/frontmatter';
import { createNoteFile } from '../write/frontmatterFile';
import { applyTableEdits } from '../write/markdownTable';
import { openWorklogEditorOf } from './editWorklog';
import { storeReady } from './ready';

/** 前回選んだメンバーを覚えておくキー（設計書 6章） */
const MEMBER_KEY = 'project-manager:worklog-member';
/** 前回の表示の期間（1週間・1か月）を覚えておくキー（設計書 6章） */
const UNIT_KEY = 'project-manager:worklog-unit';
/** 前回の「完了・停止した担当タスクも表示」を覚えておくキー（設計書 6章） */
const FINISHED_KEY = 'project-manager:worklog-show-finished';

/** 入力画面で計算上の日程を引くための計算用データ。索引が変わるまで使い回す */
const contextCache = new ContextCache();

export function registerWorklog(plugin: ProjectManagerPlugin): void {
	plugin.addCommand({ id: 'input-worklog', name: '作業ログを入力', callback: () => openWorklogModal(plugin) });
}

/**
 * 作業ログの入力画面（マス目）を開く。task を渡すと、そのタスクの行を足した状態で開く（設計書 4.3）。
 * at はビューから開くときのメンバーと日（設計書 9.10）
 */
/** 入力フォームを開く位置。作業ログのビューから開くときに使う */
export interface WorklogModalAt {
	member?: NoteId;
	/** 最初に出す期間に含まれる日 */
	date?: IsoDate;
	/** 最初に入るマスの日 */
	focusDate?: IsoDate;
	/** 最初に入力する値（予定か実績） */
	mode?: GridMode;
}

export function openWorklogModal(plugin: ProjectManagerPlugin, task?: Task, at?: WorklogModalAt): void {
	const { app, store, config } = plugin;
	if (!storeReady(plugin)) return;
	const stored: unknown = app.loadLocalStorage(MEMBER_KEY);
	const remembered = typeof stored === 'string' ? stored : '';
	const { index } = store;
	const members = index.members();
	const active = members.filter((m) => m.active).map((m) => m.id);
	const all = new Map(index.tasks({ includeArchived: true }).map((t) => [t.id, t]));
	const projects = new Map(index.projects({ includeArchived: true }).map((p) => [p.id, p]));
	const epics = new Map(index.epics({ includeArchived: true }).map((e) => [e.id, e]));
	new WorklogGridModal(app, {
		members,
		...(task ? { task } : {}),
		tasks: index.tasks(),
		taskOf: (id) => all.get(id),
		rangesOf: (id) => {
			const ctx = contextCache.get(store.index, plugin.config.statuses, plugin.config.calendar, localToday());
			const t = ctx.index.get(id);
			return t?.type === 'task' ? taskRanges(t, ctx.schedule.schedules.get(id)) : {};
		},
		statuses: config.statuses.task.map((s) => s.name),
		statusName: (value) => currentStatusName(value, config.statuses.task),
		isOpen: (t) => !isFinished(findStatus(config.statuses.task, t.status)?.category),
		projectName: (id) => {
			const p = projects.get(id);
			return p ? projectLabel(p, plugin.personal.projectDisplayName) : '';
		},
		projects: index.projects(),
		epics: index.epics(),
		displayName: plugin.personal.projectDisplayName,
		epicOf: (id) => epics.get(id),
		worklogs: () => store.index.worklogs(),
		calendar: new WorkCalendar(config.calendar),
		defaultMember: at?.member ?? (task ? defaultWorklogMember(remembered, task.assignees, active) : remembered),
		...(at?.date ? { defaultDate: at.date } : {}),
		...(at?.focusDate ? { focusDate: at.focusDate } : {}),
		...(at?.mode ? { defaultMode: at.mode } : {}),
		onMemberChange: (member) => app.saveLocalStorage(MEMBER_KEY, member || null),
		defaultUnit: parseGridUnit(app.loadLocalStorage(UNIT_KEY)),
		onUnitChange: (unit) => app.saveLocalStorage(UNIT_KEY, unit),
		defaultShowFinished: app.loadLocalStorage(FINISHED_KEY) === true,
		onShowFinishedChange: (show) => app.saveLocalStorage(FINISHED_KEY, show || null),
		subscribe: (callback) => {
			const ref = store.onUpdated(callback);
			return () => store.offref(ref);
		},
		save: (member, month, changes) => saveWorklogMonth(plugin, member, month, changes),
		editMonth: (member, month) => openWorklogEditorOf(plugin, member, month),
	}).open();
}

/** メンバー・月の作業ログに、変えたマスを書き込む。ファイルが無ければ作る（設計書 4.3） */
async function saveWorklogMonth(plugin: ProjectManagerPlugin, member: NoteId, month: YearMonth, changes: GridChange[]): Promise<WorklogSaveResult> {
	const { app, settings, store } = plugin;
	const title = (id: string) => store.index.title(id);
	const id = worklogId(member, month);
	let result: WorklogSaveResult = { merged: 0, droppedMemos: 0 };
	// 書く時点の本文から行を読むので、開いたあとにほかの行が変わっていてもよい
	const apply = (content: string) => {
		const table = worklogRows(content);
		if (table.error) throw new Error(`${month} の作業ログ：${table.error}`);
		const edits = worklogGridEdits(table.rows, changes, title);
		result = { merged: edits.merged, droppedMemos: edits.droppedMemos };
		return applyTableEdits(content, TABLE_SPEC.worklog, 'date', table.snapshot, edits.edits);
	};

	const path = normalizePath(`${settings.folders.logs}/${id}.md`);
	// 作業ログのフォルダの外（アーカイブなど）にあってもそれを使う。作ったばかりで索引に無いものはパスで探す（設計書 4.3）
	const existing = app.vault.getFileByPath(store.index.pathOf(id) ?? path);
	if (existing instanceof TFile) {
		await app.vault.process(existing, apply);
		return result;
	}

	// 消すだけなら作らない
	if (changes.every((c) => c.planned === '' && c.actual === '')) return result;
	const { frontmatterWritten } = await createNoteFile(app, path, apply(''), 'worklog', { type: 'worklog', member: toLink(member), month });
	// 行は書けているので保存は成功とし、作りかけを知らせる（設計書 4.4）
	if (!frontmatterWritten) new Notice(`記録は書きましたが、作業ログのプロパティを書き込めませんでした（${path}）。警告一覧で確認してください`, 10000);
	return result;
}
