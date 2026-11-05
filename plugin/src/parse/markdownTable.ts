/** Markdown の表を読む。行番号はファイル先頭からの0始まり（設計書 7章） */

export interface RawTable {
	/** 列名（normalizeLabel 済み） */
	headers: string[];
	/** 見出し行の行番号 */
	headerLine: number;
	rows: RawTableRow[];
}

export interface RawTableRow {
	line: number;
	cells: string[];
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const SEPARATOR_CELL = /^:?-{1,}:?$/;

// 全角の括弧（直接書くと lint に掛かるため文字コードで作る）
const FULLWIDTH_OPEN = String.fromCharCode(0xff08);
const FULLWIDTH_CLOSE = String.fromCharCode(0xff09);

/** 比較用にそろえる。全角括弧を半角に、空白（全角を含む）を除く */
export function normalizeLabel(text: string): string {
	return text.split(FULLWIDTH_OPEN).join('(').split(FULLWIDTH_CLOSE).join(')').replace(/\s+/g, '');
}

/** 表の1行をセルに分ける。`\|` は文字の `|` */
export function splitRow(line: string): string[] | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith('|')) return null;
	const cells: string[] = [];
	let current = '';
	for (let i = 1; i < trimmed.length; i++) {
		const ch = trimmed[i];
		if (ch === '\\' && trimmed[i + 1] === '|') {
			current += '|';
			i++;
		} else if (ch === '|') {
			cells.push(current.trim());
			current = '';
		} else {
			current += ch;
		}
	}
	// 末尾の | が無い行も受け付ける
	if (current.trim() !== '') cells.push(current.trim());
	return cells;
}

function isSeparatorRow(cells: string[]): boolean {
	return cells.length > 0 && cells.every((c) => SEPARATOR_CELL.test(c.replace(/\s/g, '')));
}

/** 見出しの直後にある最初の表。無ければ null（設計書 7章） */
export function findTableUnderHeading(text: string, heading: string): RawTable | null {
	const lines = text.split(/\r?\n/);
	const target = normalizeLabel(heading);
	let inCode = false;
	let level = 0;
	let i = 0;

	for (; i < lines.length; i++) {
		const line = lines[i] ?? '';
		if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
		if (inCode) continue;
		const m = HEADING.exec(line);
		if (m && normalizeLabel(m[2] ?? '') === target) {
			level = (m[1] ?? '').length;
			break;
		}
	}
	if (level === 0) return null;

	for (i++; i < lines.length; i++) {
		const line = lines[i] ?? '';
		if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
		if (inCode) continue;
		const m = HEADING.exec(line);
		if (m && (m[1] ?? '').length <= level) return null;
		const headers = splitRow(line);
		const separator = splitRow(lines[i + 1] ?? '');
		if (headers && separator && isSeparatorRow(separator)) {
			const table: RawTable = { headers: headers.map(normalizeLabel), headerLine: i, rows: [] };
			for (let j = i + 2; j < lines.length; j++) {
				const cells = splitRow(lines[j] ?? '');
				if (!cells) break;
				table.rows.push({ line: j, cells });
			}
			return table;
		}
	}
	return null;
}
