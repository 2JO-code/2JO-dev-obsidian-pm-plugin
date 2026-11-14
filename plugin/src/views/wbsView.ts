import type { CalcContext } from '../calc/context';
import type ProjectManagerPlugin from '../main';
import { PmView } from './baseView';
import { openView } from './openView';
import { WbsPanel } from './wbsPanel';
import { WBS_VIEW_TYPE } from './viewTypes';

/** WBS のビューと、開くコマンドを登録する */
export function registerWbsView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(WBS_VIEW_TYPE, (leaf) => new WbsView(leaf, plugin));
	plugin.addCommand({
		id: 'open-wbs',
		name: 'WBSを開く',
		callback: () => void openView(plugin.app, WBS_VIEW_TYPE),
	});
}

/** WBS（要件4.8b、設計書 9.7）。中身は部品（WbsPanel）に任せる */
export class WbsView extends PmView {
	private panel = new WbsPanel(this.panelHost());

	getViewType(): string {
		return WBS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'WBS';
	}

	getIcon(): string {
		return 'list-tree';
	}

	protected getDescription(): string {
		return 'プロジェクト → エピック → タスクの階層と見込みの日程。▶／▼ を押すと開閉。エピック・タスクの行をドラッグすると番号を入れ替え';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), ...this.panel.getState() };
	}

	protected readState(state: unknown): void {
		this.panel.setState(state);
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-wbs');
		this.panel.draw(this.shell(el, { grid: true }), ctx);
	}
}
