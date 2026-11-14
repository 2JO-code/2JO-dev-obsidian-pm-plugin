import type { CalcContext } from '../calc/context';
import type ProjectManagerPlugin from '../main';
import { PmView } from './baseView';
import { GanttPanel } from './ganttPanel';
import { openView } from './openView';
import { GANTT_VIEW_TYPE } from './viewTypes';

/** ガントチャートのビューと、開くコマンドを登録する */
export function registerGanttView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(GANTT_VIEW_TYPE, (leaf) => new GanttView(leaf, plugin));
	plugin.addCommand({
		id: 'open-gantt',
		name: 'ガントチャートを開く',
		callback: () => void openView(plugin.app, GANTT_VIEW_TYPE),
	});
}

/** ガントチャート（要件4.8c、設計書 9.8）。中身は部品（GanttPanel）に任せる */
export class GanttView extends PmView {
	private panel = new GanttPanel(this.panelHost());

	getViewType(): string {
		return GANTT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'ガントチャート';
	}

	getIcon(): string {
		return 'calendar-range';
	}

	protected getDescription(): string {
		return 'タスクの日程の棒グラフ（見込み開始日〜終了日）。棒を指すと依存関係の線。左の名前をドラッグすると番号を入れ替え';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), ...this.panel.getState() };
	}

	protected readState(state: unknown): void {
		this.panel.setState(state);
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-gantt-view');
		this.panel.draw(this.shell(el, { grid: true }), ctx);
	}
}
