import { Menu } from 'obsidian';
import { openCopyProjectModal } from '../commands/copyProject';
import { openNewNoteModal } from '../commands/createNote';
import { exportHtmlReport } from '../commands/htmlReport';
import { openReadme } from '../commands/readme';
import { reloadData } from '../commands/reload';
import { openWorklogModal } from '../commands/worklog';
import type ProjectManagerPlugin from '../main';
import { openView } from '../views/openView';
import { ARCHIVE_VIEW_TYPE, DASHBOARD_VIEW_TYPE, GANTT_VIEW_TYPE, HEALTH_VIEW_TYPE, KANBAN_VIEW_TYPE, MEMBER_DASHBOARD_VIEW_TYPE, MEMBER_STATUS_VIEW_TYPE, PROJECT_STATUS_VIEW_TYPE, TASK_LIST_VIEW_TYPE, WBS_VIEW_TYPE, WORKLOG_VIEW_TYPE } from '../views/viewTypes';

/** リボンのボタンと、そのメニューを登録する（設計書 9章） */
export function registerMainMenu(plugin: ProjectManagerPlugin): void {
	plugin.addRibbonIcon('briefcase', 'プロジェクト管理', (evt) => showMainMenu(plugin, evt));
}

function showMainMenu(plugin: ProjectManagerPlugin, evt: MouseEvent): void {
	const menu = new Menu();
	const add = (title: string, icon: string, action: () => void) =>
		menu.addItem((item) => item.setTitle(title).setIcon(icon).onClick(action));

	add('新しいプロジェクト', 'folder-plus', () => openNewNoteModal(plugin, 'project'));
	add('プロジェクトを複製', 'copy-plus', () => openCopyProjectModal(plugin));
	add('新しいエピック', 'layers', () => openNewNoteModal(plugin, 'epic'));
	add('新しいタスク', 'square-plus', () => openNewNoteModal(plugin, 'task'));
	add('新しいメンバー', 'user-plus', () => openNewNoteModal(plugin, 'user'));
	menu.addSeparator();
	add('作業ログを入力', 'clock', () => openWorklogModal(plugin));
	menu.addSeparator();
	add('ダッシュボード', 'layout-dashboard', () => void openView(plugin.app, DASHBOARD_VIEW_TYPE));
	add('タスク一覧', 'list-checks', () => void openView(plugin.app, TASK_LIST_VIEW_TYPE));
	add('カンバン', 'columns-3', () => void openView(plugin.app, KANBAN_VIEW_TYPE));
	add('WBS', 'list-tree', () => void openView(plugin.app, WBS_VIEW_TYPE));
	add('ガントチャート', 'calendar-range', () => void openView(plugin.app, GANTT_VIEW_TYPE));
	add('作業ログ', 'calendar-days', () => void openView(plugin.app, WORKLOG_VIEW_TYPE));
	add('メンバー状況', 'users', () => void openView(plugin.app, MEMBER_STATUS_VIEW_TYPE));
	add('メンバーダッシュボード', 'user-round', () => void openView(plugin.app, MEMBER_DASHBOARD_VIEW_TYPE));
	add('プロジェクト状況', 'gauge', () => void openView(plugin.app, PROJECT_STATUS_VIEW_TYPE));
	add('警告一覧', 'alert-triangle', () => void openView(plugin.app, HEALTH_VIEW_TYPE));
	menu.addSeparator();
	add('HTMLレポートを書き出す', 'file-output', () => void exportHtmlReport(plugin));
	add('アーカイブ', 'archive', () => void openView(plugin.app, ARCHIVE_VIEW_TYPE));
	menu.addSeparator();
	add('使い方（README）', 'help-circle', () => void openReadme(plugin));
	add('データを再読み込み', 'refresh-cw', () => void reloadData(plugin));
	menu.showAtMouseEvent(evt);
}
