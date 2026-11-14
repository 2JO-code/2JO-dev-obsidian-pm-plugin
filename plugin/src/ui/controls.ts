/** ビューと入力画面で使う小さな部品 */
import { periodStartOf, shiftPeriod, UNIT_LABEL, type GridUnit } from '../calc/worklogCells';
import type { IsoDate } from '../model';

/**
 * 開閉の印（▶／▼）。開け閉めはこの印を押したときだけ（行のほかの場所では開閉しない。設計書 9.1）。
 * 子が無ければ印を出さない（幅だけ取る）
 */
export function toggleMark(parent: HTMLElement, open: boolean, hasChildren: boolean, onToggle: () => void): HTMLElement {
	const mark = parent.createSpan({ cls: 'pm-toggle', text: hasChildren ? (open ? '▼' : '▶') : '' });
	if (!hasChildren) return mark;
	mark.addClass('is-button');
	mark.setAttr('aria-label', open ? 'たたむ' : '開く');
	mark.addEventListener('click', (evt) => {
		evt.stopPropagation();
		onToggle();
	});
	return mark;
}

/** 行の中の開閉の印（▶／▼）を書き換える（行を作り直さずに開閉するとき。設計書 9.7） */
export function updateToggleMark(row: HTMLElement, open: boolean): void {
	const mark = row.querySelector<HTMLElement>('.pm-toggle');
	mark?.setText(open ? '▼' : '▶');
	mark?.setAttr('aria-label', open ? 'たたむ' : '開く');
}

/** ラベルつきのチェックボックス（絞り込みの欄と同じ見た目） */
export function checkbox(parent: HTMLElement, label: string, checked: boolean, onChange: (v: boolean) => void): void {
	const field = parent.createEl('label', { cls: 'pm-filter-field pm-filter-check' });
	const input = field.createEl('input', { type: 'checkbox' });
	input.checked = checked;
	input.addEventListener('change', () => onChange(input.checked));
	field.appendText(label);
}

/** 期間の前後・選択・今への移動（stepNav）の中身 */
export interface StepNavOptions {
	/** 選ぶ欄の種類。日付か月 */
	input: 'date' | 'month';
	/** 今の値（日付か `YYYY-MM`） */
	value: string;
	/** 読み上げとボタンの文字 */
	labels: { prev: string; next: string; now: string; pick: string };
	/** n 期間ずらした値 */
	shift: (n: number) => string;
	/** 「今週」などで移る値 */
	now: string;
	/** 選んだ値から移る値。読めなければ undefined */
	pick: (v: string) => string | undefined;
	move: (v: string) => void;
}

/** 期間の ◀・選ぶ欄・▶・今週（今月）のボタン。作業ログの入力画面・ビュー、メンバーダッシュボードで共通 */
export function stepNav(parent: HTMLElement, o: StepNavOptions): HTMLElement {
	const nav = parent.createDiv({ cls: 'pm-filter-field' });
	const button = (text: string, label: string, onClick: () => void) => {
		const b = nav.createEl('button', { text });
		if (label !== text) b.setAttr('aria-label', label);
		b.addEventListener('click', onClick);
	};
	button('◀', o.labels.prev, () => o.move(o.shift(-1)));
	const input = nav.createEl('input', { type: o.input, value: o.value });
	input.setAttr('aria-label', o.labels.pick);
	input.addEventListener('change', () => {
		const v = input.value ? o.pick(input.value) : undefined;
		if (v) o.move(v);
	});
	button('▶', o.labels.next, () => o.move(o.shift(1)));
	button(o.labels.now, o.labels.now, () => o.move(o.now));
	return nav;
}

/** 作業ログの1週間・1か月の期間を動かすときの stepNav の中身（設計書 4.3, 9.10） */
export function periodNavOptions(start: IsoDate, unit: GridUnit, today: IsoDate, move: (start: IsoDate) => void): StepNavOptions {
	const label = UNIT_LABEL[unit];
	return {
		input: 'date',
		value: start,
		labels: { prev: label.prev, next: label.next, now: label.now, pick: `日付を選んでその${unit === 'week' ? '週' : '月'}へ` },
		shift: (n) => shiftPeriod(start, unit, n),
		now: periodStartOf(today, unit),
		pick: (v) => periodStartOf(v, unit),
		move,
	};
}
