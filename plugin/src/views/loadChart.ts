import { chartPoint, type LoadChart, type LoadChartRow } from '../calc/loadChart';
import { hoursText, rateText } from '../calc/format';
import { loadHoursText, loadValue } from '../calc/load';

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
 * メンバーの負荷率（配分・予定・実績のうち選んだ値）の横棒グラフ（要件4.8b、設計書 9.5）。
 * 1行1人。100% の線と、その人の負荷許容率の印を重ねる
 */
export function renderLoadChart(parent: HTMLElement, chart: LoadChart, handlers: LoadChartHandlers): void {
	const hours = chart.scale === 'hours';
	const root = parent.createDiv({ cls: `pm-loadchart${hours ? ' is-hours' : ''}` });
	const legend = root.createDiv({ cls: 'pm-legend' });
	const keys: [string, string][] = [
		['is-normal', '100%以下'],
		['is-caution', '負荷注意（100%超）'],
		['is-warning', '負荷警告（負荷許容率超）'],
	];
	// 工数では人ごとに働ける時間が違うので、100% の線も人ごとに引く
	if (hours) keys.push(['is-full', 'その人の100%（働ける時間）']);
	keys.push(['is-limit', 'その人の負荷許容率']);
	for (const [cls, label] of keys) {
		const item = legend.createSpan({ cls: 'pm-burnup-key' });
		item.createSpan({ cls: `pm-loadchart-swatch ${cls}` });
		item.appendText(label);
	}

	const top = chart.top || 100;
	// 罫線は目盛りの間隔で背景に引く（行ごとに要素を作らない）
	root.setCssProps({ '--pm-loadchart-step': `${(chart.ticks[1] ?? top) / top * 100}%`, '--pm-loadchart-100': at(top, 100) });

	const axis = root.createDiv({ cls: 'pm-loadchart-row pm-loadchart-axis' });
	axis.createDiv();
	const scale = axis.createDiv({ cls: 'pm-loadchart-track' });
	for (const t of chart.ticks) {
		scale.createSpan({ cls: 'pm-loadchart-tick', text: hours ? `${t}h` : `${t}%` }).setCssProps({ '--pm-x': at(top, t) });
	}
	axis.createDiv();

	for (const row of chart.rows) {
		const { member, load } = row;
		const line = root.createDiv({ cls: 'pm-loadchart-row is-clickable' });
		line.addEventListener('click', handlers.openRow);
		const name = line.createDiv({ cls: 'pm-loadchart-name pm-link', text: member.title });
		name.setAttr('aria-label', 'メンバーの入力補助フォームを開く');
		handlers.openMember(row, name);

		const v = loadValue(load, chart.mode);
		const point = chartPoint(row, chart.mode, chart.scale);
		const track = line.createDiv({ cls: 'pm-loadchart-track' });
		if (point.value !== null) {
			track.createDiv({ cls: `pm-loadchart-bar is-${v.level}` }).setCssProps({ '--pm-w': at(top, point.value) });
		}
		if (hours && load.base > 0) track.createDiv({ cls: 'pm-loadchart-full' }).setCssProps({ '--pm-x': at(top, point.full) });
		track.createDiv({ cls: 'pm-loadchart-limit' }).setCssProps({ '--pm-x': at(top, point.limit) });

		const value = line.createDiv({ cls: 'pm-loadchart-value' });
		value.createSpan({ cls: 'pm-loadchart-rate', text: hours ? (point.value === null ? '—' : `${hoursText(point.value)}h`) : rateText(v.rate) });
		const level = v.level;
		if (level === 'caution' || level === 'warning') {
			value.createSpan({ cls: `pm-mark is-tinted pm-loadchart-level is-${level}`, text: LEVEL_TEXT[level] });
		}
		if (v.holiday > 0) value.createSpan({ cls: 'pm-mark is-tinted pm-load-holiday-mark', text: '休稼' });

		const text = load.base > 0 ? `${loadHoursText(load)}／負荷許容率 ${member.loadLimitPct}%` : 'この期間に稼働日がありません';
		track.setAttr('aria-label', `${member.title}：${text}`);
	}
}
