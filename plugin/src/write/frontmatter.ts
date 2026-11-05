import { FRONTMATTER_KEYS, type NoteId, type NoteType } from '../model';

/** frontmatter に書く値。日付は `YYYY-MM-DD` の文字列 */
export type FrontmatterValue = string | number | boolean | null | string[];

/** 変更内容。undefined のキーは削除し、ここに無いキーは残す */
export type FrontmatterUpdate = Record<string, FrontmatterValue | undefined>;

/** ノートIDをリンクの値（`[[ID]]`）にする */
export function toLink(id: NoteId): string {
	return `[[${id}]]`;
}

/** frontmatter を変更し、キーを決めた順に並べ直す（その場で書き換える。設計書 4.1） */
export function applyFrontmatter(fm: Record<string, unknown>, type: NoteType, update: FrontmatterUpdate): void {
	for (const [key, value] of Object.entries(update)) {
		if (value instanceof Date) throw new Error(`Date is not allowed in frontmatter: ${key}`);
		if (value === undefined) delete fm[key];
		else fm[key] = value;
	}

	const entries = Object.entries(fm);
	for (const key of Object.keys(fm)) delete fm[key];
	const ordered: readonly string[] = FRONTMATTER_KEYS[type];
	const source = new Map(entries);
	for (const key of ordered) {
		if (source.has(key)) fm[key] = source.get(key);
	}
	for (const [key, value] of entries) {
		if (!ordered.includes(key)) fm[key] = value;
	}
}
