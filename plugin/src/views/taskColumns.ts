import { planDelayText, taskPlanPeriod } from '../calc/planDelay';
import type { RowLabels, TaskRow } from '../calc/taskList';
import { epicLabel } from '../calc/taskList';
import type { WorkCalendar } from '../calc/workdays';
import { taskWbsLabel } from '../calc/wbsOrder';
import type { Task } from '../model';
import { subtaskCell } from './actions';
import { dateCell, kindMark, taskWarningCell } from './badges';
import { hoursText } from '../calc/format';
import { dueCell, scheduleEndCell, scheduleStartCell } from './scheduleCells';
import type { HeaderCell } from '../ui/table';

/** タスクのセルを描くのに使うもの */
export interface TaskCellEnv {
	calendar: WorkCalendar;
	labels: RowLabels;
	/** ステータスのセル（`PmView.statusCell`） */
	statusCell: (tr: HTMLElement, status: string) => HTMLElement;
	/** チェックリストの編集画面を開く */
	openChecklist: (task: Task) => void;
	/** 行を置くエピックの WBS 番号（WBS の列で使う） */
	epicWbs?: string;
}

/** タスクの表の1列。見出しとセルの作り方（設計書 9.1） */
export interface TaskColumn extends HeaderCell {
	cell: (tr: HTMLElement, row: TaskRow, env: TaskCellEnv) => HTMLElement;
}

const num = (tr: HTMLElement, value: number | undefined) => tr.createEl('td', { cls: 'is-numeric', text: hoursText(value) });

/** タイトルの列。cls はセルに付けるクラス（字下げなど） */
export const titleColumn = (cls?: string): TaskColumn => ({
	label: 'タイトル',
	cell: (tr, { task }) => {
		const td = tr.createEl('td', { text: task.title, ...(cls ? { cls } : {}) });
		kindMark(td, 'task');
		return td;
	},
});

/** WBS 番号の列（エピックの番号.連番。設計書 11.17）。cls はセルに付けるクラス */
export const wbsColumn = (cls?: string): TaskColumn => ({
	label: 'WBS',
	cell: (tr, { task }, env) => tr.createEl('td', { text: taskWbsLabel(env.epicWbs, task.wbs), ...(cls ? { cls } : {}) }),
});

/** 中身の無い列（開閉の印・行のボタンの位置をそろえる） */
export const blankColumn = (label = ''): TaskColumn => ({ label, cell: (tr) => tr.createEl('td') });

type TaskColumnKey =
	| 'project'
	| 'epic'
	| 'status'
	| 'assignees'
	| 'start'
	| 'end'
	| 'startDate'
	| 'due'
	| 'planDelay'
	| 'estimate'
	| 'planned'
	| 'actual'
	| 'progress'
	| 'warnings';

/** どの表でも同じ作りの列 */
export const TASK_COLUMNS: Readonly<Record<TaskColumnKey, TaskColumn>> = {
	project: {
		label: 'プロジェクト',
		cell: (tr, row, env) => tr.createEl('td', { text: row.project ? env.labels.project(row.project) : row.task.project }),
	},
	epic: {
		label: 'エピック',
		cell: (tr, row) => tr.createEl('td', { text: row.epic ? epicLabel(row.epic) : (row.task.epic ?? '') }),
	},
	status: { label: 'ステータス', cell: (tr, row, env) => env.statusCell(tr, row.status) },
	assignees: { label: '担当者', cell: (tr, row) => tr.createEl('td', { text: row.assignees.map((m) => m.title).join('、') }) },
	start: { label: '開始（計算）', cell: (tr, row, env) => scheduleStartCell(tr, env.calendar, row.schedule, row.assignees) },
	end: { label: '終了（計算）', cell: (tr, row, env) => scheduleEndCell(tr, env.calendar, row, row.category, row.assignees) },
	startDate: { label: '開始日', cell: (tr, row, env) => dateCell(tr, env.calendar, row.task.start, row.assignees) },
	due: { label: '期限日', cell: (tr, row, env) => dueCell(tr, env.calendar, row) },
	planDelay: {
		label: '予定差',
		// 予定終了日からの遅れ。遅れていればオレンジ（設計書 11.18）
		cell: (tr, row) => {
			const td = tr.createEl('td', { text: row.planDelay !== undefined ? planDelayText(row.planDelay) : '' });
			if ((row.planDelay ?? 0) > 0) td.addClass('pm-text-warning');
			const period = taskPlanPeriod(row.task);
			if (period) td.setAttr('aria-label', `予定 ${period.start}〜${period.end}`);
			return td;
		},
	},
	estimate: { label: '見積(h)', numeric: true, cell: (tr, row) => num(tr, row.task.estimate) },
	planned: { label: '予定(h)', numeric: true, cell: (tr, row) => num(tr, row.hours.planned) },
	actual: { label: '実績(h)', numeric: true, cell: (tr, row) => num(tr, row.hours.actual) },
	progress: {
		label: '進捗',
		numeric: true,
		cell: (tr, row, env) => subtaskCell(tr, row.progress, row.task.subtasks, () => env.openChecklist(row.task)),
	},
	warnings: { label: '警告', cell: (tr, row) => taskWarningCell(tr, row.warnings) },
};

/** タスクの1行のセルを、列の並びのとおりに作る */
export function taskCells(tr: HTMLElement, row: TaskRow, columns: readonly TaskColumn[], env: TaskCellEnv): void {
	for (const column of columns) column.cell(tr, row, env);
}
