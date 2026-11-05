import type { NoteType } from '../model';
import { findTableUnderHeading, normalizeLabel, type RawTableRow } from '../parse/markdownTable';
import { tableCell, tableLink, type TableEdit, type TableSpec } from '../write/markdownTable';
import { isReadable } from './formValues';

/** 本文の表の編集画面で共通の、行の読み取り・変えたかの判定（設計書 4.7） */

export interface TableRows<T> {
	rows: T[];
	/** 開いたときの表の行。保存時に、表が変わっていないか確かめる */
	snapshot: RawTableRow[] | null;
	/** 表はあるが、必要な列が無い（このときは編集できない） */
	error?: string;
}

export interface TableEditResult {
	errors: string[];
	warnings: string[];
	edits: TableEdit[];
}

/** 表の行を列名で読む。空の行は出さない */
export function readRows<T>(content: string, spec: TableSpec, read: (get: (key: string) => string, line: number) => T): TableRows<T> {
	const table = findTableUnderHeading(content, spec.heading);
	if (!table) return { rows: [], snapshot: null };
	const index = Object.fromEntries(Object.entries(spec.columns).map(([k, label]) => [k, table.headers.indexOf(normalizeLabel(label))]));
	const missing = Object.entries(spec.columns).filter(([k]) => (index[k] ?? -1) < 0);
	if (missing.length > 0) {
		return { rows: [], snapshot: table.rows, error: `「${spec.heading}」の表に列がありません: ${missing.map(([, l]) => l).join('、')}。ノートで直してください` };
	}
	const rows = table.rows
		.filter((r) => r.cells.some((c) => c !== ''))
		.map((r) => read((key) => r.cells[index[key] ?? -1] ?? '', r.line));
	return { rows, snapshot: table.rows };
}

/** リンクのセル。読める ID はタイトル付きのリンク、読めない値は元のまま */
export function linkCell(value: string, type: NoteType, title: (id: string) => string): string {
	if (value === '') return '';
	return isReadable(value, type) ? tableLink(value, title(value)) : tableCell(value);
}

/** 元の行から変えたか（前後の空白は見ない） */
export function isChanged<T extends { line?: number }>(row: T, initial: readonly T[], keys: (keyof T)[]): boolean {
	const before = initial.find((r) => r.line === row.line);
	if (row.line === undefined || !before) return true;
	return keys.some((k) => String(row[k]).trim() !== String(before[k]).trim());
}
