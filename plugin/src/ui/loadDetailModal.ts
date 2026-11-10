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

/** メンバー×期間の負荷の内訳（要件4.8：セルをクリックしてプロジェクト別の配分・予定・実績） */
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
		summary.createEl('li', { text: `配分 ${hoursText(load.allocated)}h（配分負荷率 ${rateText(load.allocatedRate)}）` });
		summary.createEl('li', { text: `予定 ${hoursText(load.work.planned)}h（予定負荷率 ${rateText(load.plannedRate)}）` });
		summary.createEl('li', { text: `実績 ${hoursText(load.work.actual)}h（実績稼働率 ${rateText(load.actualRate)}）` });
		if (load.holiday.planned > 0 || load.holiday.actual > 0) {
			summary.createEl('li', {
				cls: 'pm-text-warning',
				text: `休日稼働：予定 ${hoursText(load.holiday.planned)}h／実績 ${hoursText(load.holiday.actual)}h（負荷率には入れていません）`,
			});
		}

		const ids = new Set([...load.allocatedByProject.keys(), ...load.byProject.keys()]);
		if (ids.size === 0) {
			contentEl.createDiv({ cls: 'pm-view-empty', text: 'この期間の配分・作業ログはありません' });
			return;
		}
		const rows = [...ids].map((id) => ({
			id,
			allocated: load.allocatedByProject.get(id) ?? 0,
			...(load.byProject.get(id) ?? { planned: 0, actual: 0 }),
		}));
		rows.sort((a, b) => b.allocated - a.allocated || b.planned - a.planned || b.actual - a.actual);
		const table = contentEl.createEl('table', { cls: 'pm-table' });
		tableHeader(table, [
			'プロジェクト',
			{ label: '配分(h)', numeric: true },
			{ label: '予定(h)', numeric: true },
			{ label: '実績(h)', numeric: true },
		]);
		const body = table.createEl('tbody');
		for (const r of rows) {
			const tr = body.createEl('tr');
			tr.createEl('td', { text: projectName(r.id) });
			tr.createEl('td', { text: hoursText(r.allocated), cls: 'is-numeric' });
			tr.createEl('td', { text: hoursText(r.planned), cls: 'is-numeric' });
			tr.createEl('td', { text: hoursText(r.actual), cls: 'is-numeric' });
		}
		contentEl.createDiv({ cls: 'pm-note', text: '配分は月の工数配分を勤務日（稼働日−個人休日）で割った、この期間の分です。予定・実績には休日・個人休日の分も含みます' });
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
