import { findTableUnderHeading, normalizeLabel, type RawTableRow } from '../parse/markdownTable';

/** 本文の表の書き出し（設計書 4.3, 4.7） */

export interface TableSpec {
	heading: string;
	columns: Record<string, string>;
}

/** 表のセルに入れられるよう、改行を空白にし、`|` を `\|` にする */
export function tableCell(text: string): string {
	return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/** 表の中のリンク。タイトルがあれば `[[ID\|タイトル]]`（要件3.5） */
export function tableLink(id: string, title: string): string {
	return title ? `[[${id}\\|${tableCell(title)}]]` : `[[${id}]]`;
}

/** 表の1行。セルは書き込める形にしてから渡す */
export function tableRow(cells: readonly string[]): string {
	return `| ${cells.join(' | ')} |`;
}

/** 空の表（見出しから区切り行まで） */
export function emptyTable(spec: TableSpec): string {
	const columns = Object.values(spec.columns);
	return [`## ${spec.heading}`, tableRow(columns), tableRow(columns.map(() => '---'))].join('\n');
}

/** 本文の末尾に表（見出しと行）を足す。前とは空行で分ける（本文が frontmatter だけなら分けない） */
export function appendTable(content: string, spec: TableSpec, rows: readonly string[]): string {
	const body = content === '' || content.endsWith('\n') ? content : `${content}\n`;
	const gap = body === '' || body.endsWith('\n\n') || /^---\n[\s\S]*\n---\n$/.test(body) ? '' : '\n';
	return `${body}${gap}${emptyTable(spec)}\n${rows.join('\n')}\n`;
}

/** 編集画面の1行。line は元の行番号（新しい行は無し） */
export interface TableEdit {
	line?: number;
	/** 元の行から変えたか。変えていない行は1文字も変えない */
	changed: boolean;
	/** 列のキー（spec.columns のキー）ごとの、書き込める形のセル */
	cells: Record<string, string>;
}

/** 編集画面を開いたときの表の行。無ければ null */
export function tableSnapshot(content: string, spec: TableSpec): RawTableRow[] | null {
	return findTableUnderHeading(content, spec.heading)?.rows ?? null;
}

/**
 * 編集画面の行で表を書き換える。変えた行だけ書き換え、消した行を除き、新しい行は sortKey の順の位置に入れる（設計書 4.7）
 * 開いたあとに表が変わっていたら、行番号がずれるので例外にする
 */
export function applyTableEdits(
	content: string,
	spec: TableSpec,
	sortKey: string,
	snapshot: RawTableRow[] | null,
	edits: readonly TableEdit[],
): string {
	const table = findTableUnderHeading(content, spec.heading);
	if (JSON.stringify(table?.rows ?? null) !== JSON.stringify(snapshot)) {
		throw new Error(`「${spec.heading}」の表が、画面を開いたあとに変わっています。画面を開き直してください`);
	}
	const keyOf = (e: TableEdit) => e.cells[sortKey] ?? '';
	const added = edits.filter((e) => e.line === undefined).sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));

	if (!table) {
		if (added.length === 0) return content;
		const keys = Object.keys(spec.columns);
		return appendTable(
			content,
			spec,
			added.map((e) => tableRow(keys.map((k) => e.cells[k] ?? ''))),
		);
	}

	// 表の列の順で書く。決めていない列は元の値（新しい行は空）
	const keyAt = table.headers.map((h) => Object.keys(spec.columns).find((k) => normalizeLabel(spec.columns[k] ?? '') === h));
	const format = (e: TableEdit, original: readonly string[] = []) =>
		tableRow(keyAt.map((k, i) => (k !== undefined ? (e.cells[k] ?? '') : (original[i] ?? ''))));

	const lines = content.split('\n');
	// 改行コード（CRLF）を保つ
	const eol = (lines[table.headerLine] ?? '').endsWith('\r') ? '\r' : '';
	const kept = new Map(edits.filter((e) => e.line !== undefined).map((e) => [e.line, e]));
	const sortCol = keyAt.indexOf(sortKey);
	const pending = [...added];
	const out: string[] = [];
	for (const row of table.rows) {
		const key = row.cells[sortCol] ?? '';
		while (pending[0] && key !== '' && keyOf(pending[0]) < key) out.push(format(pending.shift() as TableEdit) + eol);
		const edit = kept.get(row.line);
		if (edit) out.push(edit.changed ? format(edit, row.cells) + eol : (lines[row.line] ?? ''));
		// 空の行は編集画面に出さないので残す。ほかの行は消した行
		else if (row.cells.every((c) => c === '')) out.push(lines[row.line] ?? '');
	}
	out.push(...pending.map((e) => format(e) + eol));
	lines.splice(table.headerLine + 2, table.rows.length, ...out);
	return lines.join('\n');
}
