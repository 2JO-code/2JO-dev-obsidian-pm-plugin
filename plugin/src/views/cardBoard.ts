import { COLUMN_WIDTH, columnWidthOf, type DraggedCard } from '../calc/kanban';
import type { TaskRow } from '../calc/taskList';
import type { WorkCalendar } from '../calc/workdays';
import { holidayMark, warningBadges } from './badges';
import { rangeSlider } from './filterBar';

// カードを列に並べるボード（カンバン・スプリント）の共通部品（設計書 9.6）

/** 1列に一度に出すカードの数 */
export const CARD_PAGE = 50;

/**
 * 列の幅のつまみと「元に戻す」。動かしている間は見た目だけ変え、離したときに保存する（描き直さない）
 * @param board 幅（`--pm-kanban-col`）を付ける要素
 */
export function columnWidthControl(
	settings: HTMLElement,
	board: HTMLElement,
	width: number,
	handlers: { onInput?: () => void; onSave: (width: number) => void; onReset: () => void },
): HTMLElement {
	const apply = (w: number) => board.setCssProps({ '--pm-kanban-col': `${w}px` });
	apply(width);
	const field = rangeSlider(
		settings,
		'列の幅',
		width,
		{ ...COLUMN_WIDTH, unit: 'px' },
		(w) => {
			apply(w);
			handlers.onInput?.();
		},
		(w) => handlers.onSave(columnWidthOf(w)),
	);
	const reset = field.createEl('button', { cls: 'pm-row-button', text: '元に戻す' });
	reset.addEventListener('click', (e) => {
		e.preventDefault();
		handlers.onReset();
	});
	return field;
}

/**
 * 列の見出し：開閉の印・名前・件数。押すと開閉する
 * @param mark 名前と件数の間に出す印（スプリントの状態）
 */
export function columnHead(
	parent: HTMLElement,
	options: { name: string; count: number; collapsed: boolean; onToggle: () => void; mark?: { cls: string; text: string } },
): HTMLElement {
	const { name, count, collapsed, onToggle, mark } = options;
	const head = parent.createDiv({ cls: 'pm-kanban-head is-clickable' });
	head.createSpan({ cls: 'pm-toggle', text: collapsed ? '▶' : '▼' });
	head.createSpan({ cls: 'pm-kanban-name', text: name });
	if (mark) head.createSpan({ cls: `pm-mark is-tinted ${mark.cls}`, text: mark.text });
	head.createSpan({ cls: 'pm-mark is-plain pm-kanban-count', text: String(count) });
	head.setAttr('aria-label', collapsed ? 'クリックで開く' : 'クリックでたたむ');
	head.addEventListener('click', onToggle);
	return head;
}

/**
 * カードをドラッグできるようにする
 * @param type ドラッグの種類（ボードごとに分け、ほかのボードに落とせないようにする）
 */
export function draggableCard(card: HTMLElement, type: string, dragged: DraggedCard, onEnd?: () => void): void {
	card.draggable = true;
	card.addEventListener('dragstart', (e) => {
		e.dataTransfer?.setData(type, JSON.stringify(dragged));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		card.addClass('is-dragging');
	});
	card.addEventListener('dragend', () => {
		card.removeClass('is-dragging');
		onEnd?.();
	});
}

/** カードの期限日の行。休日の印を付け、期限超過なら赤にして警告の文を説明に出す */
export function cardDue(card: HTMLElement, row: TaskRow, calendar: WorkCalendar): void {
	const { due } = row.task;
	if (!due) return;
	const el = card.createDiv({ cls: 'pm-kanban-meta', text: `期限：${due}` });
	holidayMark(el, calendar, due, row.assignees);
	const overdue = row.warnings.find((w) => w.kind === 'overdue');
	if (overdue) {
		el.addClass('pm-text-error');
		el.setAttr('aria-label', overdue.message);
	}
}

/**
 * カードの警告の印。説明に警告の文を並べる
 * @param extra ボード独自の警告（印は1つ、文は全部）
 */
export function cardWarnings(card: HTMLElement, row: TaskRow, extra?: { cls: string; label: string; messages: readonly string[] }): void {
	const extraMessages = extra?.messages ?? [];
	if (row.warnings.length === 0 && extraMessages.length === 0) return;
	const box = card.createDiv({ cls: 'pm-kanban-meta' });
	const badges = warningBadges(box, row.warnings, false);
	if (extra && extraMessages.length > 0) badges.createSpan({ cls: `pm-mark is-tinted pm-badge ${extra.cls}`, text: extra.label });
	box.setAttr('aria-label', [...row.warnings.map((w) => w.message), ...extraMessages].join('\n'));
}
