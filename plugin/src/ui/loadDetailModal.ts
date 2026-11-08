import { type App, Modal } from 'obsidian';
import type { MemberLoad } from '../calc/load';
import type { Member, NoteId } from '../model';
import { hoursText, rateText } from '../calc/format';
import { tableHeader } from './table';

export interface LoadDetailOptions {
	member: Member;
	load: MemberLoad;
	/** プロジェクトの表示名。所属不明のキーにも呼ばれる */
	projectName: (id: NoteId) => string;
}

/** メンバー×期間の負荷の内訳（要件4.8：セルをクリックしてプロジェクト別の内訳） */
export class LoadDetailModal extends Modal {
	constructor(
		app: App,
		private readonly options: LoadDetailOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		const { member, load, projectName } = this.options;
		const { period } = load;
		this.setTitle(`${member.title}：${period.start === period.end ? period.start : `${period.start}〜${period.end}`}`);

		const summary = contentEl.createEl('ul', { cls: 'pm-impact-list' });
		summary.createEl('li', { text: `基準工数 ${hoursText(load.base)}h（上限 ${hoursText(load.limit)}h、負荷許容率 ${member.loadLimitPct}%）` });
		summary.createEl('li', { text: `予定 ${hoursText(load.work.planned)}h（予定負荷率 ${rateText(load.plannedRate)}）` });
		summary.createEl('li', { text: `実績 ${hoursText(load.work.actual)}h（実績稼働率 ${rateText(load.actualRate)}）` });
		if (load.holiday.planned > 0 || load.holiday.actual > 0) {
			summary.createEl('li', {
				cls: 'pm-text-warning',
				text: `休日稼働：予定 ${hoursText(load.holiday.planned)}h／実績 ${hoursText(load.holiday.actual)}h（負荷率には入れていません）`,
			});
		}

		if (load.byProject.size === 0) {
			contentEl.createDiv({ cls: 'pm-view-empty', text: 'この期間の作業ログはありません' });
			return;
		}
		const table = contentEl.createEl('table', { cls: 'pm-table' });
		tableHeader(table, ['プロジェクト', { label: '予定(h)', numeric: true }, { label: '実績(h)', numeric: true }]);
		const body = table.createEl('tbody');
		const rows = [...load.byProject].sort((a, b) => b[1].planned - a[1].planned || b[1].actual - a[1].actual);
		for (const [id, hours] of rows) {
			const tr = body.createEl('tr');
			tr.createEl('td', { text: projectName(id) });
			tr.createEl('td', { text: hoursText(hours.planned), cls: 'is-numeric' });
			tr.createEl('td', { text: hoursText(hours.actual), cls: 'is-numeric' });
		}
		contentEl.createDiv({ cls: 'pm-note', text: '内訳には休日の予定・実績も含みます' });
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
