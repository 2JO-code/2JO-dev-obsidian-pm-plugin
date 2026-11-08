import { EMPTY_FILTER, type ViewFilter } from '../calc/filter';
import { checkbox } from '../ui/controls';

export interface Choice {
	value: string;
	label: string;
}

/** 表示する絞り込みの項目と選択肢。undefined の項目は表示しない */
export interface FilterBarOptions {
	projects?: Choice[];
	members?: Choice[];
	/** メンバーの項目名（タスク一覧では「担当者」） */
	membersLabel?: string;
	statuses?: Choice[];
	period?: boolean;
	closed?: boolean;
	archived?: boolean;
	/** ビュー独自の項目を「条件をクリア」の前に足す */
	extra?: (bar: HTMLElement) => void;
	/** 「条件をクリア」でビュー独自の条件も消す */
	onClear?: () => void;
}

/** ビュー共通の絞り込みの部品（要件4.1）。変更のたびに onChange を呼ぶ */
export function renderFilterBar(
	parent: HTMLElement,
	filter: ViewFilter,
	options: FilterBarOptions,
	onChange: (filter: ViewFilter) => void,
): void {
	const bar = parent.createDiv({ cls: 'pm-filter-bar' });
	const update = (patch: Partial<ViewFilter>) => onChange({ ...filter, ...patch });

	if (options.projects) {
		multiSelect(bar, 'プロジェクト', filter.projects, options.projects, (projects) => update({ projects }));
	}
	if (options.members) {
		multiSelect(bar, options.membersLabel ?? 'メンバー', filter.members, options.members, (members) => update({ members }));
	}
	if (options.statuses) {
		multiSelect(bar, 'ステータス', filter.statuses, options.statuses, (statuses) => update({ statuses }));
	}
	if (options.period) {
		dateRange(bar, '期間', filter.start, filter.end, (start, end) => {
			const next: ViewFilter = { ...filter };
			delete next.start;
			delete next.end;
			onChange({ ...next, ...(start ? { start } : {}), ...(end ? { end } : {}) });
		});
	}
	if (options.closed) checkbox(bar, 'クローズ済みも表示', filter.includeClosed, (includeClosed) => update({ includeClosed }));
	if (options.archived) checkbox(bar, 'アーカイブも表示', filter.includeArchived, (includeArchived) => update({ includeArchived }));
	options.extra?.(bar);

	const clear = bar.createEl('button', { cls: 'pm-filter-clear', text: '条件をクリア' });
	clear.addEventListener('click', () => {
		options.onClear?.();
		onChange({ ...EMPTY_FILTER });
	});
}

/** 複数選択。選んだものを×で外し、プルダウンで追加する */
export function multiSelect(
	parent: HTMLElement,
	label: string,
	selected: string[],
	choices: Choice[],
	onChange: (v: string[]) => void,
): void {
	const field = parent.createDiv({ cls: 'pm-filter-field' });
	field.createSpan({ cls: 'pm-filter-label', text: label });
	for (const value of selected) {
		const chip = field.createSpan({ cls: 'pm-mark is-plain pm-chip', text: choices.find((c) => c.value === value)?.label ?? value });
		const remove = chip.createSpan({ cls: 'pm-chip-remove', text: '×' });
		remove.setAttr('aria-label', '外す');
		remove.addEventListener('click', () => onChange(selected.filter((v) => v !== value)));
	}
	const select = field.createEl('select', { cls: 'dropdown' });
	select.createEl('option', { value: '', text: selected.length === 0 ? 'すべて' : '追加…' });
	for (const c of choices) if (!selected.includes(c.value)) select.createEl('option', { value: c.value, text: c.label });
	select.addEventListener('change', () => {
		if (select.value) onChange([...selected, select.value]);
	});
}

/** 日付の範囲。空欄は undefined */
export function dateRange(
	parent: HTMLElement,
	label: string,
	from: string | undefined,
	to: string | undefined,
	onChange: (from: string | undefined, to: string | undefined) => void,
): void {
	const field = parent.createDiv({ cls: 'pm-filter-field' });
	field.createSpan({ cls: 'pm-filter-label', text: label });
	const fromInput = field.createEl('input', { type: 'date', value: from ?? '' });
	field.createSpan({ text: '〜' });
	const toInput = field.createEl('input', { type: 'date', value: to ?? '' });
	const changed = () => onChange(fromInput.value || undefined, toInput.value || undefined);
	fromInput.addEventListener('change', changed);
	toInput.addEventListener('change', changed);
}

/** 1つだけ選ぶプルダウン */
export function singleSelect<T extends string>(
	parent: HTMLElement,
	label: string,
	value: T,
	choices: { value: T; label: string }[],
	onChange: (v: T) => void,
): void {
	const field = parent.createDiv({ cls: 'pm-filter-field' });
	field.createSpan({ cls: 'pm-filter-label', text: label });
	const select = field.createEl('select', { cls: 'dropdown' });
	for (const c of choices) select.createEl('option', { value: c.value, text: c.label });
	select.value = value;
	select.addEventListener('change', () => {
		const next = choices.find((c) => c.value === select.value);
		if (next) onChange(next.value);
	});
}

/**
 * つまみ（範囲の中の数値）。動かしている間は onInput、離したときに onChange を呼ぶ。
 * マウスを乗せると今の値（unit 付き）が出る。返す欄に、ボタンなどを続けて足せる
 */
export function rangeSlider(
	parent: HTMLElement,
	label: string,
	value: number,
	range: { min: number; max: number; step: number; unit: string },
	onInput: (v: number) => void,
	onChange: (v: number) => void,
): HTMLElement {
	const field = parent.createEl('label', { cls: 'pm-filter-field' });
	field.createSpan({ cls: 'pm-filter-label', text: label });
	const slider = field.createEl('input', { type: 'range', attr: { min: range.min, max: range.max, step: range.step } });
	slider.value = String(value);
	const tip = (v: number | string) => slider.setAttr('aria-label', `${v}${range.unit}`);
	tip(value);
	slider.addEventListener('input', () => {
		tip(slider.value);
		onInput(Number(slider.value));
	});
	slider.addEventListener('change', () => onChange(Number(slider.value)));
	return field;
}
