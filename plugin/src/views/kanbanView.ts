import type { CalcContext } from '../calc/context';
import type ProjectManagerPlugin from '../main';
import { PmView } from './baseView';
import { KanbanPanel } from './kanbanPanel';
import { openView } from './openView';
import { KANBAN_VIEW_TYPE } from './viewTypes';

/** カンバンのビューと、開くコマンドを登録する */
export function registerKanbanView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(KANBAN_VIEW_TYPE, (leaf) => new KanbanView(leaf, plugin));
	plugin.addCommand({
		id: 'open-kanban',
		name: 'カンバンを開く',
		callback: () => void openView(plugin.app, KANBAN_VIEW_TYPE),
	});
}

/** カンバン（要件4.8b・4.8c、設計書 9.6）。中身は部品（KanbanPanel）に任せる */
export class KanbanView extends PmView {
	private panel = new KanbanPanel(this.panelHost());

	getViewType(): string {
		return KANBAN_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'カンバン';
	}

	getIcon(): string {
		return 'columns-3';
	}

	protected getDescription(): string {
		return 'ステータスごとの列。カードを別の列へドラッグするとステータスが変わります';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), ...this.panel.getState() };
	}

	protected readState(state: unknown): void {
		this.panel.setState(state);
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-kanban-view');
		this.panel.draw(this.shell(el), ctx);
	}
}
