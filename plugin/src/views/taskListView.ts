import type { ViewStateResult } from 'obsidian';
import type { CalcContext } from '../calc/context';
import type ProjectManagerPlugin from '../main';
import { PmView } from './baseView';
import { openView } from './openView';
import { TaskListPanel } from './taskListPanel';
import { TASK_LIST_VIEW_TYPE } from './viewTypes';

/** タスク一覧のビューと、開くコマンドを登録する */
export function registerTaskListView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(TASK_LIST_VIEW_TYPE, (leaf) => new TaskListView(leaf, plugin));
	plugin.addCommand({
		id: 'open-task-list',
		name: 'タスク一覧を開く',
		callback: () => void openView(plugin.app, TASK_LIST_VIEW_TYPE),
	});
}

/** タスク一覧（要件4.8、設計書 9.2）。中身は部品（TaskListPanel）に任せる */
export class TaskListView extends PmView {
	private panel = new TaskListPanel(this.panelHost());

	getViewType(): string {
		return TASK_LIST_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'タスク一覧';
	}

	getIcon(): string {
		return 'list-checks';
	}

	protected getDescription(): string {
		return 'タスクを表で一覧。絞り込み・並べ替え（列の見出しをクリック）・グループ分けができます。行をクリックすると入力補助フォームを開きます';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), ...this.panel.getState() };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.panel.setState(state);
		await super.setState(state, result);
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-task-list');
		this.panel.draw(this.shell(el, { grid: true }), ctx);
	}
}
