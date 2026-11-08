import { monthTicks, niceTicks, type Burnup, type BurnupPoint, type ProgressPlan } from '../calc/burnup';
import { daysBetween, monthDayText as md } from '../calc/dates';
import type { IsoDate } from '../model';
import { hoursText } from '../calc/format';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** 描く範囲（viewBox の座標）。右は線の端のラベルの分を空ける */
const W = 720;
const H = 240;
const M = { left: 56, right: 96, top: 16, bottom: 28 };
/** 端のラベルが重なると見なす縦の距離 */
const LABEL_GAP = 14;

/** 時間の表示（例：8,123.5h） */
const hours = (h: number) => `${hoursText(h)}h`;

function svg<K extends keyof SVGElementTagNameMap>(parent: Element, tag: K, attrs: Record<string, string | number>, cls?: string): SVGElementTagNameMap[K] {
	const el = document.createElementNS(SVG_NS, tag);
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
	if (cls) el.classList.add(...cls.split(' '));
	parent.appendChild(el);
	return el;
}

/** 凡例。色の見本と名前を並べる */
function legendOf(root: HTMLElement, items: readonly (readonly [string, string])[]): void {
	const legend = root.createDiv({ cls: 'pm-legend' });
	for (const [cls, label] of items) {
		const item = legend.createSpan({ cls: 'pm-burnup-key' });
		item.createSpan({ cls: `pm-burnup-swatch ${cls}` });
		item.appendText(label);
	}
}

interface FrameOptions {
	start: IsoDate;
	end: IsoDate;
	today: IsoDate;
	projectStart?: IsoDate;
	projectDue?: IsoDate;
	/** 縦軸の最大値（これ以上のきりのよい値まで目盛りを出す） */
	max: number;
	tick: (v: number) => string;
	label: string;
}

/** 2つのグラフで共通の枠：縦軸の目盛りと罫線、横軸の月、プロジェクトの期間の線、今日の線 */
function frame(root: HTMLElement, o: FrameOptions) {
	const ticks = niceTicks(o.max);
	const top = ticks[ticks.length - 1] || 1;
	const days = daysBetween(o.start, o.end);
	const plotW = W - M.left - M.right;
	const plotH = H - M.top - M.bottom;
	const x = (d: IsoDate) => M.left + (days <= 1 ? 0 : ((daysBetween(o.start, d) - 1) / (days - 1)) * plotW);
	const y = (v: number) => M.top + plotH - (v / top) * plotH;

	const chart = root.createDiv({ cls: 'pm-burnup-chart' });
	const el = svg(chart, 'svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
	el.setAttribute('aria-label', o.label);

	// 目盛りと罫線（うっすら）
	for (const t of ticks) {
		svg(el, 'line', { x1: M.left, x2: W - M.right, y1: y(t), y2: y(t) }, 'pm-burnup-grid');
		svg(el, 'text', { x: M.left - 8, y: y(t) + 4, 'text-anchor': 'end' }, 'pm-burnup-tick').textContent = o.tick(t);
	}
	monthTicks(o.start, o.end).forEach((d, i) => {
		const m = Number(d.slice(5, 7));
		const label = i === 0 || m === 1 ? `${d.slice(0, 4)}年${m}月` : `${m}月`;
		svg(el, 'line', { x1: x(d), x2: x(d), y1: M.top + plotH, y2: M.top + plotH + 4 }, 'pm-burnup-axis');
		svg(el, 'text', { x: x(d), y: H - 8, 'text-anchor': 'middle' }, 'pm-burnup-tick').textContent = label;
	});
	svg(el, 'line', { x1: M.left, x2: W - M.right, y1: M.top + plotH, y2: M.top + plotH }, 'pm-burnup-axis');

	// プロジェクトの期間の線。ラベルは線の内側に付け、上の「今日」と重ねない
	for (const [d, label, anchor] of [
		[o.projectStart, '開始', 'start'],
		[o.projectDue, '期限', 'end'],
	] as const) {
		if (!d) continue;
		svg(el, 'line', { x1: x(d), x2: x(d), y1: M.top, y2: M.top + plotH }, 'pm-burnup-period');
		svg(el, 'text', { x: x(d) + (anchor === 'start' ? 4 : -4), y: M.top + 12, 'text-anchor': anchor }, 'pm-burnup-tick').textContent = `${label} ${md(d)}`;
	}
	if (o.today >= o.start && o.today <= o.end) {
		svg(el, 'line', { x1: x(o.today), x2: x(o.today), y1: M.top, y2: M.top + plotH }, 'pm-burnup-today');
		svg(el, 'text', { x: x(o.today), y: M.top - 4, 'text-anchor': 'middle' }, 'pm-burnup-tick').textContent = '今日';
	}
	return { el, chart, x, y, plotW, plotH };
}

/** 期間の中のマウスの位置にいちばん近い点の番号 */
function nearest(el: SVGSVGElement, e: MouseEvent, plotW: number, count: number): number {
	const box = el.getBoundingClientRect();
	const vx = ((e.clientX - box.left) / box.width) * W;
	return Math.max(0, Math.min(count - 1, Math.round(((vx - M.left) / plotW) * (count - 1))));
}

/** マウスの説明の位置。右半分では左側に出す（はみ出さないように） */
function placeTip(tip: HTMLElement, el: SVGSVGElement, px: number): void {
	tip.setCssProps({ '--pm-x': `${(px / W) * el.getBoundingClientRect().width}px` });
	tip.toggleClass('is-left', px > W / 2);
	tip.addClass('is-shown');
}

const percent = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : '—');

/**
 * 進捗率の予定の線と今日の実績の点（要件4.8b、設計書 9.5）。
 * 完了した日は記録が無いので、実績は今日の点だけ。縦軸は 0〜100%
 */
export function renderProgress(parent: HTMLElement, plan: ProgressPlan, range: { start: IsoDate; end: IsoDate; projectStart?: IsoDate; projectDue?: IsoDate }, today: IsoDate): void {
	const root = parent.createDiv({ cls: 'pm-burnup' });
	legendOf(root, [
		['is-planned', '予定の進捗率（その日までに終わるはずのタスク）'],
		['is-actual-dot', '今日の実際の進捗率'],
		['is-period', 'プロジェクトの期間（開始日・期限日）'],
	]);
	const { points, total, done } = plan;
	const rate = (n: number) => (total > 0 ? (n / total) * 100 : 0);
	const { el, chart, x, y, plotW, plotH } = frame(root, {
		...range,
		today,
		max: 100,
		tick: (t) => `${t}%`,
		label: `進捗率。今日の実績 ${percent(done, total)}`,
	});

	const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(rate(p.planned)).toFixed(1)}`).join(' ');
	svg(el, 'path', { d }, 'pm-burnup-line is-planned');
	const last = points[points.length - 1];
	const todayPoint = points.find((p) => p.date === today);
	const labels: { v: number; text: string; px: number }[] = [];
	if (last) labels.push({ v: rate(last.planned), text: `予定 ${percent(last.planned, total)}`, px: x(last.date) });
	if (today >= range.start && today <= range.end) {
		svg(el, 'circle', { cx: x(today), cy: y(rate(done)), r: 5 }, 'pm-burnup-dot is-actual');
		labels.push({ v: rate(done), text: `実績 ${percent(done, total)}`, px: x(today) });
	}
	for (const l of labels) {
		const crowded = labels.some((o) => o !== l && Math.abs(o.px - l.px) < 60 && Math.abs(y(o.v) - y(l.v)) < LABEL_GAP);
		if (!crowded) svg(el, 'text', { x: l.px + 8, y: y(l.v) + 4 }, 'pm-burnup-label').textContent = l.text;
	}

	const hover = svg(el, 'g', {}, 'pm-burnup-hover');
	const cross = svg(hover, 'line', { y1: M.top, y2: M.top + plotH }, 'pm-burnup-cross');
	const dot = svg(hover, 'circle', { r: 4 }, 'pm-burnup-dot is-planned');
	const tip = chart.createDiv({ cls: 'pm-burnup-tip' });
	const area = svg(el, 'rect', { x: M.left, y: M.top, width: plotW, height: plotH }, 'pm-burnup-hit');
	area.addEventListener('mouseleave', () => {
		hover.classList.remove('is-shown');
		tip.removeClass('is-shown');
	});
	area.addEventListener('mousemove', (e) => {
		const p = points[nearest(el, e, plotW, points.length)];
		if (!p) return;
		const px = x(p.date);
		for (const a of ['x1', 'x2'] as const) cross.setAttribute(a, String(px));
		dot.setAttribute('cx', String(px));
		dot.setAttribute('cy', String(y(rate(p.planned))));
		hover.classList.add('is-shown');
		tip.empty();
		tip.createDiv({ cls: 'pm-burnup-tip-date', text: p.date });
		tip.createDiv({ text: `予定の進捗率 ${percent(p.planned, total)}（${p.planned}／${total} 件）` });
		if (p.date === today) tip.createDiv({ text: `実際の進捗率 ${percent(done, total)}（${done}／${total} 件）` });
		placeTip(tip, el, px);
	});

	const planned = todayPoint?.planned ?? (today > range.end ? (last?.planned ?? 0) : 0);
	const gap = total > 0 ? Math.round(((done - planned) / total) * 100) : 0;
	const notes = [
		`今日の予定 ${percent(planned, total)}（${planned} 件） ／ 実績 ${percent(done, total)}（${done} 件）（予定との差 ${gap >= 0 ? '+' : ''}${gap} ポイント）`,
		`対象 ${total} 件（保留・中止を除く）`,
	];
	if (plan.unscheduled > 0) notes.push(`日程を計算できないタスク ${plan.unscheduled} 件は予定の線に入っていません`);
	root.createDiv({ cls: 'pm-note', text: notes.join(' ／ ') });
}

/**
 * 工数の累積の折れ線（バーンアップ。要件4.8b、設計書 9.5）。
 * 予定・実績の累積の2本と、見積の合計の線、今日の線。マウスを乗せるとその日の値を出す
 */
export function renderBurnup(parent: HTMLElement, data: Burnup, today: IsoDate): void {
	const root = parent.createDiv({ cls: 'pm-burnup' });
	legendOf(root, [
		['is-planned', '予定の累積'],
		['is-actual', '実績の累積（今日まで）'],
		['is-estimate', '見積の合計'],
		['is-period', 'プロジェクトの期間（開始日・期限日）'],
	]);

	const { points } = data;
	const last = points[points.length - 1];
	const maxValue = Math.max(data.estimate, last?.planned ?? 0, ...points.map((p) => p.actual ?? 0));
	const { el, chart, x, y, plotW, plotH } = frame(root, {
		...data,
		today,
		max: maxValue,
		tick: (t) => t.toLocaleString('ja-JP'),
		label: `工数の累積。見積 ${hours(data.estimate)}`,
	});
	if (data.estimate > 0) {
		svg(el, 'line', { x1: M.left, x2: W - M.right, y1: y(data.estimate), y2: y(data.estimate) }, 'pm-burnup-estimate');
	}

	// 予定・実績の線
	const actual = points.filter((p): p is BurnupPoint & { actual: number } => p.actual !== undefined);
	const path = (list: { date: IsoDate; v: number }[]) => list.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
	svg(el, 'path', { d: path(points.map((p) => ({ date: p.date, v: p.planned }))) }, 'pm-burnup-line is-planned');
	if (actual.length > 0) svg(el, 'path', { d: path(actual.map((p) => ({ date: p.date, v: p.actual }))) }, 'pm-burnup-line is-actual');

	// 端の点とラベル。近すぎて重なるときはラベルを出さず、凡例とマウスの説明に任せる
	const ends: { cls: string; label: string; date: IsoDate; v: number }[] = [];
	if (last) ends.push({ cls: 'is-planned', label: `予定 ${hours(last.planned)}`, date: last.date, v: last.planned });
	const lastActual = actual[actual.length - 1];
	if (lastActual) ends.push({ cls: 'is-actual', label: `実績 ${hours(lastActual.actual)}`, date: lastActual.date, v: lastActual.actual });
	if (data.estimate > 0) ends.push({ cls: 'is-estimate', label: `見積 ${hours(data.estimate)}`, date: data.end, v: data.estimate });
	ends.forEach((p, i) => {
		if (p.cls !== 'is-estimate') svg(el, 'circle', { cx: x(p.date), cy: y(p.v), r: 4 }, `pm-burnup-dot ${p.cls}`);
		const crowded = ends.some((o, j) => j !== i && o.date === p.date && Math.abs(y(o.v) - y(p.v)) < LABEL_GAP);
		if (!crowded) svg(el, 'text', { x: x(p.date) + 8, y: y(p.v) + 4 }, 'pm-burnup-label').textContent = p.label;
	});

	// マウスを乗せたとき：縦の線・点・説明
	const hover = svg(el, 'g', {}, 'pm-burnup-hover');
	const cross = svg(hover, 'line', { y1: M.top, y2: M.top + plotH }, 'pm-burnup-cross');
	const dotP = svg(hover, 'circle', { r: 4 }, 'pm-burnup-dot is-planned');
	const dotA = svg(hover, 'circle', { r: 4 }, 'pm-burnup-dot is-actual');
	const tip = chart.createDiv({ cls: 'pm-burnup-tip' });
	const area = svg(el, 'rect', { x: M.left, y: M.top, width: plotW, height: plotH }, 'pm-burnup-hit');
	const hide = () => {
		hover.classList.remove('is-shown');
		tip.removeClass('is-shown');
	};
	area.addEventListener('mouseleave', hide);
	area.addEventListener('mousemove', (e) => {
		const p = points[nearest(el, e, plotW, points.length)];
		if (!p) return hide();
		const px = x(p.date);
		cross.setAttribute('x1', String(px));
		cross.setAttribute('x2', String(px));
		dotP.setAttribute('cx', String(px));
		dotP.setAttribute('cy', String(y(p.planned)));
		dotA.classList.toggle('is-hidden', p.actual === undefined);
		if (p.actual !== undefined) {
			dotA.setAttribute('cx', String(px));
			dotA.setAttribute('cy', String(y(p.actual)));
		}
		hover.classList.add('is-shown');
		tip.empty();
		tip.createDiv({ cls: 'pm-burnup-tip-date', text: p.date });
		tip.createDiv({ text: `予定の累積 ${hours(p.planned)}` });
		tip.createDiv({ text: `実績の累積 ${p.actual === undefined ? '—（今日より後）' : hours(p.actual)}` });
		if (data.estimate > 0) tip.createDiv({ text: `見積の合計 ${hours(data.estimate)}` });
		placeTip(tip, el, px);
	});

	// 数字でも読めるように（色だけに頼らない）
	const now = [...points].reverse().find((p) => p.date <= today) ?? points[0];
	if (now) {
		const diff = (now.actual ?? 0) - now.planned;
		root.createDiv({
			cls: 'pm-note',
			text: `今日までの予定 ${hours(now.planned)} ／ 実績 ${hours(now.actual ?? 0)}（予定との差 ${diff >= 0 ? '+' : ''}${hours(diff)}） ／ 期間全体の予定 ${hours(last?.planned ?? 0)} ／ 見積 ${hours(data.estimate)}`,
		});
	}
}
