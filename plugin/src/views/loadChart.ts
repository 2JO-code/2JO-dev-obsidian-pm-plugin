import type { LoadChart, LoadChartRow } from '../calc/loadChart';
import { hoursText, rateText } from '../calc/format';

const LEVEL_TEXT = { caution: '注意', warning: '警告' } as const;

export interface LoadChartHandlers {
	/** メンバー名のクリック */
	openMember: (row: LoadChartRow, el: HTMLElement) => void;
	/** 棒の行のクリック */
	openRow: () => void;
}

/** 横軸上の位置（%） */
const at = (top: number, pct: number) => `${Math.min(100, (pct / top) * 100)}%`;

/**
 * メンバーの予定負荷率の横棒グラフ（要件4.8b、設計書 9.5）。
 * 1行1人。100% の線と、その人の負荷許容率の印を重ねる
 */
export function renderLoadChart(parent: HTMLElement, chart: LoadChart, handlers: LoadChartHandlers): void {
	const root = parent.createDiv({ cls: 'pm-loadchart' });
	const legend = root.createDiv({ cls: 'pm-legend' });
	for (const [cls, label] of [
		['is-normal', '100%以下'],
		['is-caution', '負荷注意（100%超）'],
		['is-warning', '負荷警告（負荷許容率超）'],
		['is-limit', 'その人の負荷許容率'],
	] as const) {
		const item = legend.createSpan({ cls: 'pm-burnup-key' });
		item.createSpan({ cls: `pm-loadchart-swatch ${cls}` });
		item.appendText(label);
	}

	const top = chart.ticks[chart.ticks.length - 1] || 100;
	// 罫線は目盛りの間隔で背景に引く（行ごとに要素を作らない）
	root.setCssProps({ '--pm-loadchart-step': `${(chart.ticks[1] ?? top) / top * 100}%`, '--pm-loadchart-100': at(top, 100) });

	const axis = root.createDiv({ cls: 'pm-loadchart-row pm-loadchart-axis' });
	axis.createDiv();
	const scale = axis.createDiv({ cls: 'pm-loadchart-track' });
	for (const t of chart.ticks) {
		scale.createSpan({ cls: 'pm-loadchart-tick', text: `${t}%` }).setCssProps({ '--pm-x': at(top, t) });
	}
	axis.createDiv();

	for (const row of chart.rows) {
		const { member, load } = row;
		const line = root.createDiv({ cls: 'pm-loadchart-row is-clickable' });
		line.addEventListener('click', handlers.openRow);
		const name = line.createDiv({ cls: 'pm-loadchart-name pm-link', text: member.title });
		name.setAttr('aria-label', 'メンバーの入力補助フォームを開く');
		handlers.openMember(row, name);

		const track = line.createDiv({ cls: 'pm-loadchart-track' });
		if (load.plannedRate !== null) {
			track.createDiv({ cls: `pm-loadchart-bar is-${load.plannedLevel}` }).setCssProps({ '--pm-w': at(top, load.plannedRate * 100) });
		}
		track.createDiv({ cls: 'pm-loadchart-limit' }).setCssProps({ '--pm-x': at(top, member.loadLimitPct) });

		const value = line.createDiv({ cls: 'pm-loadchart-value' });
		value.createSpan({ cls: 'pm-loadchart-rate', text: rateText(load.plannedRate) });
		const level = load.plannedLevel;
		if (level === 'caution' || level === 'warning') {
			value.createSpan({ cls: `pm-mark is-tinted pm-loadchart-level is-${level}`, text: LEVEL_TEXT[level] });
		}
		if (load.holiday.planned > 0) value.createSpan({ cls: 'pm-mark is-tinted pm-load-holiday-mark', text: '休稼' });

		const parts = load.base > 0
			? [`予定 ${hoursText(load.work.planned)}h`, `働ける時間 ${hoursText(load.base)}h`, `負荷許容率 ${member.loadLimitPct}%`]
			: ['この期間に稼働日がありません'];
		if (load.holiday.planned > 0) parts.push(`休日の予定 ${hoursText(load.holiday.planned)}h（負荷率に入れない）`);
		track.setAttr('aria-label', `${member.title}：${parts.join('／')}`);
	}
}
