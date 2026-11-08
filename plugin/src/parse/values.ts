import { parseNoteId } from '../id';
import type { NoteId, NoteType } from '../model';

/** 配列でないオブジェクトか（外から来た値の中を読む前に確かめる。規約 4章） */
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** オブジェクトのそのキーの値。オブジェクトでなければ undefined（ビューの状態などを読むとき） */
export const field = (v: unknown, key: string): unknown => (isRecord(v) ? v[key] : undefined);

/** 文字の配列として読む。配列でなければ空、文字でない要素は除く */
export const stringArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

/** `YYYY-MM-DD` で実在する日付か */
export function isIsoDate(value: string): boolean {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!m) return false;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const date = new Date(Date.UTC(y, mo - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function isYearMonth(value: string): boolean {
	return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** 工数（時間）を読む。0以上・0.25刻みでなければ null */
export function parseHours(value: string): number | null {
	const text = value.trim();
	if (!/^\d+(\.\d+)?$/.test(text)) return null;
	const hours = Number(text);
	return Number.isFinite(hours) && Number.isInteger(hours * 4) ? hours : null;
}

/** リンクか ID から ID を取り出す。種類が違えば null（設計書 7章） */
export function parseLinkId(value: string, type?: NoteType): NoteId | null {
	const text = value.trim();
	const m = /^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/.exec(text);
	const target = (m ? (m[1] ?? '') : text).trim();
	// フォルダ付きならファイル名だけ
	const id = target.split('/').pop() ?? '';
	const parsed = parseNoteId(id);
	if (!parsed || (type && parsed.type !== type)) return null;
	return id;
}
