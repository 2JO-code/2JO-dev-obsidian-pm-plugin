import { DropdownComponent } from 'obsidian';
import { monthOfDate } from '../calc/dates';
import type { WorkSummary } from '../calc/worklogSummary';
import { allocationMatrix, allocationRows, milestoneEdits, milestoneRows, monthRange, type MilestoneRow } from '../forms/projectTables';
import type ProjectManagerPlugin from '../main';
import type { NoteId, YearMonth } from '../model';
import { TABLE_SPEC } from '../parse/bodyTables';
import { AllocationMatrixModal } from '../ui/allocationMatrixModal';
import { epicOptions, textCell } from '../ui/formParts';
import { TableEditModal } from '../ui/tableEditModal';
import { tableSource, usable } from './ready';

/** マイルストーンの表の編集画面を開く（設計書 4.7） */
export async function openMilestoneEditor(plugin: ProjectManagerPlugin, projectId: NoteId, path: string): Promise<void> {
	const src = await tableSource(plugin, path);
	if (!src) return;
	const table = milestoneRows(src.content);
	if (!usable(table)) return;
	const { index } = plugin.store;
	const epics = index.epics({ includeArchived: true });

	new TableEditModal<MilestoneRow>(plugin.app, {
		title: 'マイルストーンを編集',
		file: src.file,
		spec: TABLE_SPEC.milestones,
		sortKey: 'date',
		...table,
		blank: () => ({ name: '', date: '', epic: '' }),
		toEdits: (rows, initial) => milestoneEdits(rows, initial, (id) => index.title(id)),
		note: '連動エピックを選ぶと、プロジェクト状況にそのエピックの完了予定日が出ます。変えた行だけをノートに書き換えます',
		columns: [
			{ label: '名前', render: (td, row) => textCell(td, row.name, (v) => (row.name = v)) },
			{ label: '日付', render: (td, row) => textCell(td, row.date, (v) => (row.date = v), 'date') },
			{
				label: '連動エピック',
				// 選べるのはこのプロジェクトのエピック（WBS順）
				render: (td, row) => {
					const d = new DropdownComponent(td);
					epicOptions(d, epics, projectId, row.epic);
					d.onChange((v) => (row.epic = v));
				},
			},
		],
	}).open();
}

/** 工数配分の表の編集画面（メンバー×月のマス目）を開く（設計書 4.7） */
export async function openAllocationEditor(plugin: ProjectManagerPlugin, projectId: NoteId, path: string, summary: WorkSummary): Promise<void> {
	const src = await tableSource(plugin, path);
	if (!src) return;
	const table = allocationRows(src.content);
	if (!usable(table)) return;
	const { index } = plugin.store;
	const title = (id: string) => index.title(id);

	// 期間の月・作業ログのある月×メンバー・責任者も並べる
	const project = index.get(projectId);
	const months: YearMonth[] = [];
	const members: NoteId[] = [];
	if (project?.type === 'project') {
		if (project.start && project.due) months.push(...monthRange(monthOfDate(project.start), monthOfDate(project.due)));
		if (project.manager) members.push(project.manager);
	}
	for (const key of summary.allocationKeys(projectId)) {
		months.push(key.month);
		members.push(key.member);
	}

	new AllocationMatrixModal(plugin.app, {
		file: src.file,
		...table,
		matrix: allocationMatrix(table.rows, { months, members }, title),
		members: index.members(),
		hoursOf: (month, member) => summary.allocation(projectId, month, member),
		title,
	}).open();
}
