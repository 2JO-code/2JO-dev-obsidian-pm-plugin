import type { CalcContext } from '../calc/context';
import type ProjectManagerPlugin from '../main';
import { PmView } from './baseView';
import { openView } from './openView';
import { WorklogPanel } from './worklogPanel';
import { WORKLOG_VIEW_TYPE } from './viewTypes';

/** 作業ログのビューと、開くコマンドを登録する */
export function registerWorklogView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(WORKLOG_VIEW_TYPE, (leaf) => new WorklogView(leaf, plugin));
	plugin.addCommand({
		id: 'open-worklog',
		name: '作業ログを開く',
		callback: () => void openView(plugin.app, WORKLOG_VIEW_TYPE),
	});
}

/** 作業ログ（見るだけ。設計書 9.10）。中身は部品（WorklogPanel）に任せる */
export class WorklogView extends PmView {
	private panel = new WorklogPanel(this.panelHost());

	getViewType(): string {
		return WORKLOG_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '作業ログ';
	}

	getIcon(): string {
		return 'calendar-days';
	}

	protected getDescription(): string {
		return 'タスクごとの作業ログ（予定・実績）を日付で表示。タスク名や日の欄を押すと、記録した人の入力フォームを開きます';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), ...this.panel.getState() };
	}

	protected readState(state: unknown): void {
		this.panel.setState(state);
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-worklog-view');
		this.panel.draw(this.shell(el, { grid: true }), ctx);
	}
}
