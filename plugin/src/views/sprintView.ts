import type { CalcContext } from '../calc/context';
import type ProjectManagerPlugin from '../main';
import { PmView } from './baseView';
import { openView } from './openView';
import { SprintPanel } from './sprintPanel';
import { SPRINT_VIEW_TYPE } from './viewTypes';

/** スプリントのビューと、開くコマンドを登録する */
export function registerSprintView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(SPRINT_VIEW_TYPE, (leaf) => new SprintView(leaf, plugin));
	plugin.addCommand({
		id: 'open-sprint-board',
		name: 'スプリントを開く',
		callback: () => void openView(plugin.app, SPRINT_VIEW_TYPE),
	});
}

/** スプリント（要件 4.17、設計書 9.16）。中身は部品（SprintPanel）に任せる */
export class SprintView extends PmView {
	private panel = new SprintPanel(this.panelHost());

	getViewType(): string {
		return SPRINT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'スプリント';
	}

	getIcon(): string {
		return 'timer';
	}

	protected getDescription(): string {
		return 'スプリントごとの列。カードを別の列へドラッグするとスプリントが変わります';
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
