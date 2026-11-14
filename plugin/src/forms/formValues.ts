import type { WorkCalendar } from '../calc/workdays';
import { emptyValue, type NoteType } from '../model';
import { isIsoDate, parseLinkId } from '../parse/values';
import { toLink, type FrontmatterUpdate } from '../write/frontmatter';

/** 入力補助フォームで共通の、値の読み取りと確かめ（設計書 4.5） */

/** frontmatter の値を入力欄の文字列にする */
export const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** リンク1つを ID にする。読めなければ元の文字列のまま（消さずに残す。設計書 4.5） */
export const link = (v: unknown, type: NoteType): string => {
	const raw = text(v);
	return parseLinkId(raw, type) ?? raw;
};

/** リンクのリストを ID のリストにする。読めないものは元の文字列のまま */
export const links = (v: unknown, type: NoteType): string[] =>
	(Array.isArray(v) ? v : [v]).map((item) => link(item, type)).filter((s) => s !== '');

/** その種類の ID として読めるか（読めない値は元の文字列のまま持っている） */
export const isReadable = (value: string, type: NoteType): boolean => parseLinkId(value, type) === value;

/** 書き込む値。読める ID はリンクに、読めない値は元のまま */
export const linkValue = (value: string, type: NoteType): string => (isReadable(value, type) ? toLink(value) : value);

/** 読めない値が残っていれば、保存時に知らせる文言を足す */
export function warnUnreadable(label: string, values: readonly string[], type: NoteType, warnings: string[]): void {
	const bad = values.filter((v) => v !== '' && !isReadable(v, type));
	if (bad.length > 0) warnings.push(`${label}の読めない値（${bad.join('、')}）はそのまま残しました。直すか、外してください`);
}

/** 空欄の項目はキーを消さず、空の枠（`null` か `[]`）にする（設計書 4.4, 4.5） */
export function keepFrames(update: FrontmatterUpdate): FrontmatterUpdate {
	return Object.fromEntries(Object.entries(update).map(([key, value]) => [key, value === undefined ? emptyValue(key) : value]));
}

/** 日付の入力を確かめる。空なら undefined、誤りなら errors に足す */
export function date(value: string, label: string, errors: string[]): string | undefined {
	if (value.trim() === '') return undefined;
	if (isIsoDate(value)) return value;
	errors.push(`${label}の日付が正しくありません`);
	return undefined;
}

/** 期限日が休日（会社休日・土日）なら注意の文。空・日付でない・稼働日なら空（設計書 4.12） */
export function holidayDueNote(value: string, calendar: Pick<WorkCalendar, 'isWorkday' | 'holidayMarks'>): string {
	if (!isIsoDate(value) || calendar.isWorkday(value)) return '';
	const reason = calendar.holidayMarks(value).map((m) => m.label).join('、');
	return `休日${reason ? `（${reason}）` : ''}です。このまま保存できます`;
}
