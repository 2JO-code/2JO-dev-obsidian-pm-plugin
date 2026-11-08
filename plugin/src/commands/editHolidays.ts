import { holidayEdits, holidayRows, type HolidayRow } from '../forms/holidayTable';
import type ProjectManagerPlugin from '../main';
import { TABLE_SPEC } from '../parse/bodyTables';
import { ChooseModal } from '../ui/chooseModal';
import { textCell } from '../ui/formParts';
import { TableEditModal } from '../ui/tableEditModal';
import { isMemberFile } from './noteFiles';
import { storeReady, tableSource, usable } from './ready';

/** 個人休日の編集画面を開くコマンドと右クリックメニューを登録する */
export function registerEditHolidays(plugin: ProjectManagerPlugin): void {
	plugin.addCommand({
		id: 'edit-holidays',
		name: '個人休日を編集',
		callback: () => {
			const file = plugin.app.workspace.getActiveFile();
			if (isMemberFile(file)) void openHolidayEditor(plugin, file.path);
			else chooseMemberForHolidays(plugin);
		},
	});

	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, file) => {
			if (!isMemberFile(file)) return;
			menu.addItem((item) =>
				item
					.setTitle('個人休日を編集')
					.setIcon('calendar-off')
					.onClick(() => void openHolidayEditor(plugin, file.path)),
			);
		}),
	);
}

/** メンバーを選んで個人休日の編集画面を開く */
export function chooseMemberForHolidays(plugin: ProjectManagerPlugin): void {
	if (!storeReady(plugin)) return;
	// 在籍者を先に
	const members = [...plugin.store.index.members()].sort((a, b) => Number(b.active) - Number(a.active));
	new ChooseModal(
		plugin.app,
		members,
		(m) => (m.active ? m.title : `${m.title}（在籍外）`),
		(m) => void openHolidayEditor(plugin, m.path),
		'個人休日を編集するメンバーを選ぶ',
	).open();
}

/** 個人休日の表の編集画面を開く（設計書 4.7） */
export async function openHolidayEditor(plugin: ProjectManagerPlugin, path: string): Promise<void> {
	const src = await tableSource(plugin, path);
	if (!src) return;
	const table = holidayRows(src.content);
	if (!usable(table)) return;

	new TableEditModal<HolidayRow>(plugin.app, {
		title: '個人休日を編集',
		file: src.file,
		spec: TABLE_SPEC.holidays,
		sortKey: 'date',
		...table,
		blank: () => ({ date: '', memo: '' }),
		toEdits: holidayEdits,
		note: '一覧の日付の列に印を出すだけで、稼働日・負荷・日程の計算には入りません。変えた行だけをノートに書き換えます',
		columns: [
			{ label: '日付', render: (td, row) => textCell(td, row.date, (v) => (row.date = v), 'date') },
			{ label: 'メモ', render: (td, row) => textCell(td, row.memo, (v) => (row.memo = v)) },
		],
	}).open();
}
