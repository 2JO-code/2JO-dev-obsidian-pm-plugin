import type { CountProgress } from '../calc/progress';
import type { HolidayKind, WorkCalendar } from '../calc/workdays';
import type { Member } from '../model';
import { isIsoDate } from '../parse/values';
import { WARNING_LABELS, type Warning } from '../calc/warnings';
import { countText, pct, warningCounts } from '../calc/format';

/**
 * 進捗率の横棒と文字（例：▬▬▭ 17%（54/316））。設計書 9.1。
 * 横棒の長さは CSS 変数（--pm-ratio）で渡す
 */
export function progressBar(parent: HTMLElement, p: CountProgress): void {
	const box = parent.createDiv({ cls: 'pm-progress' });
	if (p.ratio !== null) {
		box.createDiv({ cls: 'pm-progress-track' }).createDiv({ cls: 'pm-progress-fill' }).setCssProps({ '--pm-ratio': `${Math.round(p.ratio * 100)}%` });
	}
	// ％と件数を分け、表の中で％の位置と「（」の位置をそろえる（設計書 9.1）
	const text = box.createSpan({ cls: 'pm-progress-text' });
	text.createSpan({ cls: 'pm-progress-pct', text: pct(p) });
	text.createSpan({ cls: 'pm-progress-count', text: countText(p) });
}

/** 個人休日を見るメンバー（行の担当者・責任者） */
export type People = readonly Pick<Member, 'title' | 'holidays'>[];

/** 休日の種類ごとの印の文字と、理由の前に付ける名前（要件3.6） */
const HOLIDAY_TEXT: Record<HolidayKind, { text: string; name: string }> = {
	company: { text: '社休', name: '会社休日' },
	personal: { text: '個休', name: '個人休日' },
	weekend: { text: '土日', name: '土日休日' },
};

/** 日付が休日なら、後ろに種類ごとの小さな印（社休・個休・土日）を付ける。マウスを乗せると理由（設計書 9.1） */
export function holidayMark(el: HTMLElement, calendar: WorkCalendar, date: string | undefined, people: People = []): void {
	if (!date || !isIsoDate(date)) return;
	for (const mark of calendar.holidayMarks(date, people)) {
		const { text, name } = HOLIDAY_TEXT[mark.kind];
		el.createSpan({ cls: `pm-mark is-tinted pm-holiday-mark is-${mark.kind}`, text, attr: { 'aria-label': `${name}：${mark.label}` } });
	}
}

/** 日付のセル。休日なら印を付ける */
export function dateCell(tr: HTMLElement, calendar: WorkCalendar, date: string | undefined, people: People = []): HTMLElement {
	const td = tr.createEl('td', { text: date ?? '' });
	holidayMark(td, calendar, date, people);
	return td;
}

/** 期間（開始日 〜 期限日）。片方だけなら「?」。両方無ければ「—」。休日の日付には印を付ける */
export function periodText(el: HTMLElement, calendar: WorkCalendar, start: string | undefined, due: string | undefined, people: People = []): void {
	if (!start && !due) {
		el.appendText('—');
		return;
	}
	el.appendText(start ?? '?');
	holidayMark(el, calendar, start, people);
	el.appendText(' 〜 ');
	el.appendText(due ?? '?');
	holidayMark(el, calendar, due, people);
}

/** 表の期間を2つのセル（開始日／〜 期限日）に分けて出す。休日の印の有無で「〜」がずれないように（設計書 9.1） */
export function periodCells(tr: HTMLElement, calendar: WorkCalendar, start: string | undefined, due: string | undefined, people: People = []): void {
	const startTd = tr.createEl('td', { cls: 'pm-period-start' });
	const dueTd = tr.createEl('td', { cls: 'pm-period-due' });
	if (!start && !due) {
		startTd.appendText('—');
		return;
	}
	startTd.appendText(start ?? '?');
	holidayMark(startTd, calendar, start, people);
	dueTd.appendText(`〜 ${due ?? '?'}`);
	holidayMark(dueTd, calendar, due, people);
}

/** 種類（プロジェクト・エピック・タスク）の色の印。要素の先頭に入れる（設計書 9.1） */
export function kindMark(el: HTMLElement, kind: 'project' | 'epic' | 'task'): void {
	el.prepend(createSpan({ cls: `pm-kind-mark is-${kind}` }));
}

/** ステータスを色の枠で囲んで出す。色が無い（設定に無いステータス）ときは注意の色の文字（設計書 9.1） */
export function statusBadge(parent: HTMLElement, status: string, color: string | undefined): void {
	if (status === '') return;
	if (!color) {
		parent.createSpan({ cls: 'pm-text-warning', text: status, attr: { 'aria-label': '設定に無いステータスです' } });
		return;
	}
	parent.createSpan({ cls: 'pm-mark is-tinted pm-status', text: status }).setCssProps({ '--pm-mark-color': color });
}

/**
 * 警告の種類ごとの小さな印（例：［期限超過 2］［工数超過 1］）。設計書 9.1。
 * 色は種類ごとに変えるが、名前を必ず書くので色だけに頼らない。withCount=false なら件数を書かない（タスク1件の行）
 */
export function warningBadges(parent: HTMLElement, warnings: readonly Warning[], withCount = true): HTMLElement {
	const box = parent.createSpan({ cls: 'pm-badges' });
	for (const [kind, n] of warningCounts(warnings)) {
		box.createSpan({ cls: `pm-mark is-tinted pm-badge is-${kind}`, text: withCount ? `${WARNING_LABELS[kind]} ${n}` : WARNING_LABELS[kind] });
	}
	return box;
}

/** タスクの行の警告のセル：種類の印（件数なし）。マウスを乗せると警告の文を出す */
export function taskWarningCell(tr: HTMLElement, warnings: readonly Warning[]): HTMLElement {
	const td = tr.createEl('td');
	if (warnings.length === 0) return td;
	warningBadges(td, warnings, false);
	td.setAttr('aria-label', warnings.map((w) => w.message).join('\n'));
	return td;
}
