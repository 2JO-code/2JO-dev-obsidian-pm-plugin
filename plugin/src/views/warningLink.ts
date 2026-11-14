import type { App } from 'obsidian';
import { EMPTY_FILTER, type ViewFilter } from '../calc/filter';
import { parseTaskListOptions, type TaskListOptions } from '../calc/taskList';
import type { Warning } from '../calc/warnings';
import type { NoteId } from '../model';
import { warningBadges } from './badges';
import { openView } from './openView';
import { field } from '../parse/values';
import { TASK_LIST_VIEW_TYPE } from './viewTypes';

/**
 * タスク一覧を「そのプロジェクト（エピック）の警告のあるタスクだけ」で開く（設計書 9.1）。
 * グループ・並べ替え・行のクリックの動きは、開いているタスク一覧のまま残す
 */
export async function openTaskWarnings(app: App, target: { project: NoteId; epic?: NoteId }): Promise<void> {
	const current: unknown = app.workspace.getLeavesOfType(TASK_LIST_VIEW_TYPE)[0]?.view.getState();
	const { groupBy, sort, desc } = parseTaskListOptions(field(current, 'taskList'));
	const taskList: TaskListOptions = { epics: target.epic ? [target.epic] : [], warningsOnly: true, groupBy, sort, desc };
	// 警告の件数はクローズ済み・アーカイブ内のタスクも数えているので、一覧でも出す
	const filter: ViewFilter = { ...EMPTY_FILTER, projects: [target.project], includeClosed: true, includeArchived: true };
	await openView(app, TASK_LIST_VIEW_TYPE, { filter, taskList });
}

/**
 * 警告の種類ごとの印を cell に入れ、直す場所へのリンクにする（リンクは印だけ。セルの余白は押しても動かない）。
 * タスクの警告があればタスク一覧へ。配分超過はタスクではなくプロジェクトの工数配分の警告なので、onAllocation（プロジェクト状況など）へ。
 * 上位の期限超過見込みは、印を指すと文を出す
 */
export function warningLink(
	app: App,
	cell: HTMLElement,
	warnings: readonly Warning[],
	target: { project: NoteId; epic?: NoteId },
	onAllocation?: () => void,
): void {
	if (warnings.length === 0) return;
	const label = warningBadges(cell, warnings);
	const allocation = warnings.some((w) => w.kind === 'overAllocation');
	const onTasks = warnings.some((w) => w.target.type === 'task');
	// 上位の期限超過見込みは、文を指して読む（直す場所はエピック・プロジェクトのフォーム）
	const groups = warnings.filter((w) => w.kind === 'groupOverdueRisk').map((w) => w.message);
	if (groups.length > 0) label.setAttr('aria-label', groups.join('\n'));
	const action = onTasks ? () => void openTaskWarnings(app, target) : allocation ? onAllocation : undefined;
	if (!action) return;
	label.addClass('pm-action-link');
	const link = onTasks
		? `警告のあるタスクをタスク一覧で開く${allocation ? '（配分超過はプロジェクト状況の工数配分にあります）' : ''}`
		: '配分超過：プロジェクト状況の工数配分を開く';
	label.setAttr('aria-label', [link, ...groups].join('\n'));
	label.addEventListener('click', (evt) => {
		evt.stopPropagation();
		action();
	});
}
