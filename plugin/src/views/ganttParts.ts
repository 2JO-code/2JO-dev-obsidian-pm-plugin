import type { CalcContext } from '../calc/context';
import { dayOfWeek, monthOfDate } from '../calc/dates';
import { barBox, dependencyLinks, markX, type GanttScale } from '../calc/gantt';
import type { MilestoneRow } from '../calc/projectStatus';
import { periodsBetween, type PeriodUnit } from '../calc/workdays';
import type { IsoDate, NoteId, StatusCategory, Task } from '../model';
import { WEEKDAYS } from './memberStatusView';

/** ガントチャートの部品（見出し・棒・印・依存の線。設計書 9.8） */

const SVG_NS = 'http://www.w3.org/2000/svg';
export const LINK_HINT = '棒を指すと、先行・後続の件数をここに出します';

/** 矢印の印の ID を、開いているガントごとに変える */
let arrowCount = 0;

/** 棒の日程と色の判定に使う値 */
export interface BarInfo {
	start: IsoDate;
	end: IsoDate;
	due?: IsoDate;
	category?: StatusCategory;
	delayed?: boolean;
}

/** 見出し：上の段に月、下の段に期間（日・週・月） */
export function ganttHeader(wrap: HTMLElement, scale: GanttScale, ctx: CalcContext): void {
	const head = wrap.createDiv({ cls: 'pm-gantt-head' });
	head.createDiv({ cls: 'pm-gantt-label', text: 'タイトル' });
	const track = head.createDiv({ cls: 'pm-gantt-track' });
	if (scale.unit !== 'month') {
		for (const m of periodsBetween(scale.start, scale.end, 'month')) {
			const box = barBox(scale, m.start, m.end);
			if (box) place(track.createDiv({ cls: 'pm-gantt-cell is-month', text: m.key }), box.left, box.width);
		}
	}
	const current = monthOfDate(ctx.today);
	for (const p of scale.periods) {
		const box = barBox(scale, p.start, p.end);
		if (!box) continue;
		const cell = track.createDiv({ cls: 'pm-gantt-cell is-period', text: periodText(p.unit, p.start) });
		place(cell, box.left, box.width);
		if (p.start <= ctx.today && ctx.today <= p.end) cell.addClass('is-today');
		if (p.unit === 'day') {
			cell.setAttr('aria-label', `${p.start}(${WEEKDAYS[dayOfWeek(p.start)] ?? ''})`);
			if (!ctx.calendar.isWorkday(p.start)) cell.addClass('is-holiday');
		}
		if (p.unit === 'month' && p.key === current) cell.addClass('is-today');
	}
}

/** 棒。色は WBS の開始日・終了日の色と同じ決まり（設計書 9.2） */
export function ganttBar(
	track: HTMLElement,
	scale: GanttScale,
	name: string,
	info: BarInfo,
	group: boolean,
	warnings = '',
	dependency = '',
): HTMLElement | undefined {
	const box = barBox(scale, info.start, info.end);
	if (!box) return undefined;
	const bar = track.createDiv({ cls: 'pm-gantt-bar' });
	place(bar, box.left, box.width);
	if (group) bar.addClass('is-group');
	if (box.cutStart) bar.addClass('is-cut-start');
	if (box.cutEnd) bar.addClass('is-cut-end');
	const closed = info.category === 'done' || info.category === 'stopped';
	const late = !closed && !!info.due && info.end > info.due;
	if (closed) bar.addClass('is-done');
	else if (late) bar.addClass('is-late');
	else if (info.delayed) bar.addClass('is-delayed');
	const lines = [name, `${info.start}〜${info.end}（計算）`];
	if (info.due) lines.push(`期限日 ${info.due}`);
	if (late) lines.push('期限日より後に終わる見込みです');
	if (info.delayed) lines.push('遅れを反映して、ずらしています');
	if (dependency) lines.push(dependency);
	if (warnings) lines.push(`警告：${warnings}`);
	bar.setAttr('aria-label', lines.join('\n'));
	return bar;
}

export function dueMark(track: HTMLElement, scale: GanttScale, due: IsoDate): void {
	const x = markX(scale, due);
	if (x === undefined) return;
	track.createDiv({ cls: 'pm-gantt-due', attr: { 'aria-label': `期限日 ${due}` } }).setCssProps({ '--pm-x': `${x}px` });
}

export function milestoneMark(track: HTMLElement, scale: GanttScale, m: MilestoneRow): void {
	const x = markX(scale, m.milestone.date);
	if (x === undefined) return;
	const mark = track.createDiv({ cls: 'pm-gantt-milestone', text: '◆' });
	mark.setCssProps({ '--pm-x': `${x}px` });
	const notes = [`${m.milestone.name}（${m.milestone.date}）`];
	if (m.missed) {
		mark.addClass('is-missed');
		notes.push('日付を過ぎたが、連動エピックが完了していません');
	} else if (m.late) {
		mark.addClass('is-late');
		notes.push('連動エピックの完了予定日がこの日より後です');
	}
	mark.setAttr('aria-label', notes.join('\n'));
}

/** 依存の線（要件4.8c）。棒を指している間だけ、先行・後続との間に引く。戻り値で後から足した棒にも付けられる */
export function dependencyLines(
	wrap: HTMLElement,
	tasks: readonly Task[],
	bars: Map<NoteId, HTMLElement>,
	note: HTMLElement,
): (id: NoteId, bar: HTMLElement) => void {
	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.classList.add('pm-gantt-links');
	const marker = document.createElementNS(SVG_NS, 'marker');
	marker.id = `pm-gantt-arrow-${++arrowCount}`;
	for (const [k, v] of Object.entries({ viewBox: '0 0 6 6', refX: '6', refY: '3', markerWidth: '6', markerHeight: '6', orient: 'auto' })) marker.setAttribute(k, v);
	const head = document.createElementNS(SVG_NS, 'path');
	head.setAttribute('d', 'M0,0 L6,3 L0,6 Z');
	marker.appendChild(head);
	const defs = document.createElementNS(SVG_NS, 'defs');
	defs.appendChild(marker);
	svg.appendChild(defs);
	wrap.appendChild(svg);

	const show = (id: NoteId | undefined) => {
		for (const p of Array.from(svg.querySelectorAll('.pm-gantt-link'))) p.remove();
		for (const b of Array.from(wrap.querySelectorAll('.pm-gantt-bar.is-linked, .pm-gantt-bar.is-selected'))) b.removeClasses(['is-linked', 'is-selected']);
		// 欄の高さが変わると棒の位置がずれるため、空にせず案内を出す
		note.setText(LINK_HINT);
		if (!id) return;
		const self = bars.get(id);
		if (!self) return;
		self.addClass('is-selected');
		const { predecessors, successors } = dependencyLinks(tasks, id);
		const base = wrap.getBoundingClientRect();
		svg.setAttribute('width', String(wrap.scrollWidth));
		svg.setAttribute('height', String(wrap.scrollHeight));
		let hidden = 0;
		const line = (from: HTMLElement, to: HTMLElement) => {
			const a = from.getBoundingClientRect();
			const b = to.getBoundingClientRect();
			const x1 = a.right - base.left;
			const y1 = a.top + a.height / 2 - base.top;
			const x2 = b.left - base.left;
			const y2 = b.top + b.height / 2 - base.top;
			const path = document.createElementNS(SVG_NS, 'path');
			path.classList.add('pm-gantt-link');
			path.setAttribute('d', `M${x1},${y1} H${x1 + 6} V${y2} H${x2}`);
			path.setAttribute('marker-end', `url(#${marker.id})`);
			svg.appendChild(path);
		};
		for (const p of predecessors) {
			const el = bars.get(p);
			if (el) {
				el.addClass('is-linked');
				line(el, self);
			} else hidden++;
		}
		for (const s of successors) {
			const el = bars.get(s);
			if (el) {
				el.addClass('is-linked');
				line(self, el);
			} else hidden++;
		}
		const title = tasks.find((t) => t.id === id)?.title ?? id;
		note.setText(
			`「${title}」 先行 ${predecessors.length} 件・後続 ${successors.length} 件${hidden > 0 ? `（うち ${hidden} 件は表示していないため線を引いていません）` : ''}`,
		);
	};

	const watch = (id: NoteId, bar: HTMLElement) => {
		bar.addEventListener('mouseenter', () => show(id));
		bar.addEventListener('mouseleave', () => show(undefined));
	};
	for (const [id, bar] of bars) watch(id, bar);
	// 後から足した棒（エピックを開いたとき）に、線を出す仕掛けを付ける
	return watch;
}

/** 横の位置と幅を CSS 変数で渡す（設計書 9.8） */
export function place(el: HTMLElement, left: number, width: number): void {
	el.setCssProps({ '--pm-x': `${left}px`, '--pm-w': `${width}px` });
}

/** 下の段の見出し。日は「2」（曜日はマウスを乗せると出る）、週は「11/2」、月は「11月」 */
function periodText(unit: PeriodUnit, start: IsoDate): string {
	const m = Number(start.slice(5, 7));
	const d = Number(start.slice(8, 10));
	switch (unit) {
		case 'day':
			return String(d);
		case 'week':
			return `${m}/${d}`;
		case 'month':
			return `${m}月`;
	}
}
