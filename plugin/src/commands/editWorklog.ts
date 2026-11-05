import { ButtonComponent, Notice, TextComponent } from 'obsidian';
import { compareJa } from '../calc/compare';
import { firstDayOf, lastDayOf } from '../calc/dates';
import { isReadable, missingLabel } from '../forms/formValues';
import { worklogEdits, worklogRows, type WorklogRow } from '../forms/worklogTable';
import { labelOf } from '../health/labels';
import { parseNoteId, worklogId } from '../id';
import type ProjectManagerPlugin from '../main';
import type { NoteId, Task, YearMonth } from '../model';
import { TABLE_SPEC } from '../parse/bodyTables';
import { projectLabel } from '../settings';
import { ChooseModal } from '../ui/chooseModal';
import { hoursCell, textCell } from '../ui/formParts';
import { TableEditModal } from '../ui/tableEditModal';
import { tableSource, usable } from './ready';

/** メンバー・月の作業ログの表の編集画面を開く。まだファイルが無ければお知らせを出す */
export function openWorklogEditorOf(plugin: ProjectManagerPlugin, member: NoteId, month: YearMonth): void {
	const path = plugin.store.index.pathOf(worklogId(member, month));
	if (!path) {
		new Notice(`${month} の作業ログはまだありません`);
		return;
	}
	void openWorklogEditor(plugin, path);
}

/** 作業ログの表の編集画面を開く（設計書 4.7） */
export async function openWorklogEditor(plugin: ProjectManagerPlugin, path: string): Promise<void> {
	const src = await tableSource(plugin, path);
	if (!src) return;
	const parsed = parseNoteId(src.file.basename);
	if (parsed?.type !== 'worklog') return;
	const { month } = parsed;
	const table = worklogRows(src.content);
	if (!usable(table)) return;

	const { index } = plugin.store;
	const title = (id: string) => index.title(id);
	const projects = new Map(index.projects({ includeArchived: true }).map((p) => [p.id, p]));
	const taskLabel = (t: Task) => {
		const p = projects.get(t.project);
		return p ? `${t.title}（${projectLabel(p, plugin.personal.projectDisplayName)}）` : t.title;
	};
	const taskText = (value: string) => {
		if (value === '') return '選んでください';
		return isReadable(value, 'task') && title(value) !== '' ? title(value) : missingLabel(value, 'task');
	};
	const tasks = [...index.tasks()].sort((a, b) => compareJa(taskLabel(a), taskLabel(b)));

	new TableEditModal<WorklogRow>(plugin.app, {
		title: `作業ログを編集（${labelOf(path, index).title}）`,
		file: src.file,
		spec: TABLE_SPEC.worklog,
		sortKey: 'date',
		...table,
		blank: () => ({ date: '', task: '', planned: '', actual: '', memo: '' }),
		toEdits: (rows, initial) => worklogEdits(rows, initial, month, title),
		note: `${month} の記録。日付はこの月の中だけ。タスクは押して名前で探します。予定・実績は0.25刻み（どちらかは必須）。変えた行だけをノートに書き換えます`,
		columns: [
			{
				label: '日付',
				render: (td, row) => {
					const t = new TextComponent(td).setValue(row.date).onChange((v) => (row.date = v));
					t.inputEl.type = 'date';
					t.inputEl.min = firstDayOf(month);
					t.inputEl.max = lastDayOf(month);
				},
			},
			{
				label: 'タスク',
				render: (td, row) => {
					const button = new ButtonComponent(td).setClass('pm-table-edit-pick').setButtonText(taskText(row.task));
					button.onClick(() =>
						new ChooseModal(
							plugin.app,
							tasks,
							taskLabel,
							(t) => {
								row.task = t.id;
								button.setButtonText(taskText(t.id));
							},
							'タスク名かプロジェクト名で探す',
						).open(),
					);
				},
			},
			{ label: '予定(h)', render: (td, row) => hoursCell(td, row.planned, (v) => (row.planned = v)) },
			{ label: '実績(h)', render: (td, row) => hoursCell(td, row.actual, (v) => (row.actual = v)) },
			{ label: 'メモ', render: (td, row) => textCell(td, row.memo, (v) => (row.memo = v)) },
		],
	}).open();
}
