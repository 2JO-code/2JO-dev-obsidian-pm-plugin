import { Menu } from 'obsidian';
import { openNewNoteModal } from '../commands/createNote';
import { isTaskFile, openTaskForm } from '../commands/editTask';
import { exportHtmlReport } from '../commands/htmlReport';
import { openReadme } from '../commands/readme';
import { reloadData } from '../commands/reload';
import { openWorklogModal } from '../commands/worklog';
import type ProjectManagerPlugin from '../main';
import { ARCHIVE_VIEW_TYPE } from '../views/archiveView';
import { DASHBOARD_VIEW_TYPE } from '../views/dashboardView';
import { GANTT_VIEW_TYPE } from '../views/ganttView';
import { HEALTH_VIEW_TYPE } from '../views/healthView';
import { KANBAN_VIEW_TYPE } from '../views/kanbanView';
import { MEMBER_STATUS_VIEW_TYPE } from '../views/memberStatusView';
import { openView } from '../views/openView';
import { PROJECT_STATUS_VIEW_TYPE } from '../views/projectStatusView';
import { TASK_LIST_VIEW_TYPE } from '../views/taskListView';
import { WBS_VIEW_TYPE } from '../views/wbsView';

/** リボンのボタンと、そのメニューを登録する（設計書 9章） */
export function registerMainMenu(plugin: ProjectManagerPlugin): void {
	plugin.addRibbonIcon('briefcase', 'プロジェクト管理', (evt) => showMainMenu(plugin, evt));
}

function showMainMenu(plugin: ProjectManagerPlugin, evt: MouseEvent): void {
	const menu = new Menu();
	const add = (title: string, icon: string, action: () => void, disabled = false) =>
		menu.addItem((item) => item.setTitle(title).setIcon(icon).setDisabled(disabled).onClick(action));

	add('新しいプロジェクト', 'folder-plus', () => openNewNoteModal(plugin, 'project'));
	add('新しいエピック', 'layers', () => openNewNoteModal(plugin, 'epic'));
	add('新しいタスク', 'square-plus', () => openNewNoteModal(plugin, 'task'));
	add('新しいメンバー', 'user-plus', () => openNewNoteModal(plugin, 'user'));
	menu.addSeparator();
	add('作業ログを入力', 'clock', () => openWorklogModal(plugin));
	const active = plugin.app.workspace.getActiveFile();
	add(
		'開いているタスクを編集',
		'list-checks',
		() => {
			if (isTaskFile(active)) openTaskForm(plugin, active);
		},
		!isTaskFile(active),
	);
	menu.addSeparator();
	add('ダッシュボード', 'layout-dashboard', () => void openView(plugin.app, DASHBOARD_VIEW_TYPE));
	add('タスク一覧', 'list-checks', () => void openView(plugin.app, TASK_LIST_VIEW_TYPE));
	add('カンバン', 'columns-3', () => void openView(plugin.app, KANBAN_VIEW_TYPE));
	add('WBS', 'list-tree', () => void openView(plugin.app, WBS_VIEW_TYPE));
	add('ガントチャート', 'calendar-range', () => void openView(plugin.app, GANTT_VIEW_TYPE));
	add('メンバー状況', 'users', () => void openView(plugin.app, MEMBER_STATUS_VIEW_TYPE));
	add('プロジェクト状況', 'gauge', () => void openView(plugin.app, PROJECT_STATUS_VIEW_TYPE));
	add('警告一覧', 'alert-triangle', () => void openView(plugin.app, HEALTH_VIEW_TYPE));
	menu.addSeparator();
	add('HTMLレポートを書き出す', 'file-output', () => void exportHtmlReport(plugin));
	add('アーカイブ対象の一覧', 'archive', () => void openView(plugin.app, ARCHIVE_VIEW_TYPE));
	menu.addSeparator();
	add('使い方（README）', 'help-circle', () => void openReadme(plugin));
	add('データを再読み込み', 'refresh-cw', () => void reloadData(plugin));
	menu.showAtMouseEvent(evt);
}
