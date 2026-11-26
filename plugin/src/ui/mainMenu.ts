import { Menu } from 'obsidian';
import { openCopyProjectModal } from '../commands/copyProject';
import { openNewNoteModal } from '../commands/createNote';
import { deleteLayout, saveLayout, switchLayout } from '../commands/layouts';
import { exportHtmlReport } from '../commands/htmlReport';
import { reloadData } from '../commands/reload';
import { openWorklogModal } from '../commands/worklog';
import type ProjectManagerPlugin from '../main';
import { openGuide } from '../views/guideView';
import { openView } from '../views/openView';
import { openToolbar } from '../views/toolbarView';
import { ARCHIVE_VIEW_TYPE, DASHBOARD_VIEW_TYPE, GANTT_VIEW_TYPE, GUIDE_VIEW_TYPE, HEALTH_VIEW_TYPE, KANBAN_VIEW_TYPE, MEMBER_DASHBOARD_VIEW_TYPE, MEMBER_STATUS_VIEW_TYPE, PROJECT_STATUS_VIEW_TYPE, SPRINT_VIEW_TYPE, TASK_LIST_VIEW_TYPE, WBS_VIEW_TYPE, WORKLOG_VIEW_TYPE } from '../views/viewTypes';

/** メニューとツールバーの1項目。viewType はビューを開く項目だけ持つ */
export interface MenuEntry {
	title: string;
	icon: string;
	action: () => void;
	viewType?: string;
}

/** メニューの項目の組の名前 */
export type MenuGroup = 'create' | 'input' | 'views' | 'output' | 'layout' | 'other';

/** リボンのメニューとツールバーに出す項目（組ごと、出す順） */
export function mainMenuEntries(plugin: ProjectManagerPlugin): Record<MenuGroup, MenuEntry[]> {
	const view = (title: string, icon: string, viewType: string): MenuEntry => ({
		title,
		icon,
		viewType,
		action: () => void openView(plugin.app, viewType),
	});
	return {
		create: [
			{ title: '新しいプロジェクト', icon: 'folder-plus', action: () => openNewNoteModal(plugin, 'project') },
			{ title: 'プロジェクトを複製', icon: 'copy-plus', action: () => openCopyProjectModal(plugin) },
			{ title: '新しいエピック', icon: 'layers', action: () => openNewNoteModal(plugin, 'epic') },
			{ title: '新しいタスク', icon: 'square-plus', action: () => openNewNoteModal(plugin, 'task') },
			{ title: '新しいスプリント', icon: 'calendar-plus', action: () => openNewNoteModal(plugin, 'sprint') },
			{ title: '新しいメンバー', icon: 'user-plus', action: () => openNewNoteModal(plugin, 'user') },
		],
		input: [{ title: '作業ログを入力', icon: 'clock', action: () => openWorklogModal(plugin) }],
		views: [
			view('ダッシュボード', 'layout-dashboard', DASHBOARD_VIEW_TYPE),
			view('タスク一覧', 'list-checks', TASK_LIST_VIEW_TYPE),
			view('カンバン', 'columns-3', KANBAN_VIEW_TYPE),
			view('スプリント', 'timer', SPRINT_VIEW_TYPE),
			view('WBS', 'list-tree', WBS_VIEW_TYPE),
			view('ガントチャート', 'calendar-range', GANTT_VIEW_TYPE),
			view('作業ログ', 'calendar-days', WORKLOG_VIEW_TYPE),
			view('メンバー状況', 'users', MEMBER_STATUS_VIEW_TYPE),
			view('メンバーダッシュボード', 'user-round', MEMBER_DASHBOARD_VIEW_TYPE),
			view('プロジェクト状況', 'gauge', PROJECT_STATUS_VIEW_TYPE),
			view('警告一覧', 'alert-triangle', HEALTH_VIEW_TYPE),
		],
		output: [
			{ title: 'HTMLレポートを書き出す', icon: 'file-output', action: () => void exportHtmlReport(plugin) },
			view('アーカイブ', 'archive', ARCHIVE_VIEW_TYPE),
		],
		layout: [
			{ title: 'レイアウトを切り替え', icon: 'panels-top-left', action: () => switchLayout(plugin) },
			{ title: 'レイアウトを保存', icon: 'save', action: () => void saveLayout(plugin) },
			{ title: 'レイアウトを削除', icon: 'trash-2', action: () => deleteLayout(plugin) },
		],
		other: [
			{ title: '使い方', icon: 'help-circle', viewType: GUIDE_VIEW_TYPE, action: () => void openGuide(plugin) },
			{ title: 'データを再読み込み', icon: 'refresh-cw', action: () => void reloadData(plugin) },
		],
	};
}

/** リボンのボタンと、そのメニューを登録する（設計書 9章） */
export function registerMainMenu(plugin: ProjectManagerPlugin): void {
	plugin.addRibbonIcon('briefcase', 'プロジェクト管理', (evt) => showMainMenu(plugin, evt));
}

function showMainMenu(plugin: ProjectManagerPlugin, evt: MouseEvent): void {
	const menu = new Menu();
	const groups = Object.values(mainMenuEntries(plugin));
	groups.forEach((entries, i) => {
		if (i > 0) menu.addSeparator();
		for (const entry of entries) {
			menu.addItem((item) => item.setTitle(entry.title).setIcon(entry.icon).onClick(entry.action));
		}
	});
	menu.addSeparator();
	menu.addItem((item) => item.setTitle('ツールバーを開く').setIcon('panel-left').onClick(() => void openToolbar(plugin)));
	menu.showAtMouseEvent(evt);
}
