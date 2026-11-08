/** タスクの本文のチェックリストの編集画面の値（設計書 4.10） */

export interface ChecklistRow {
	/** 元の行番号。新しい項目は無し */
	line?: number;
	done: boolean;
	text: string;
}

/** 本文のチェックリストの1行 */
export interface ChecklistLine {
	line: number;
	/** 行そのもの（行末の \r は除く） */
	raw: string;
	/** `[` の前まで（字下げと `- ` など） */
	prefix: string;
	/** `[ ]` の中の文字 */
	mark: string;
	text: string;
}

export interface ChecklistRows {
	rows: ChecklistRow[];
	/** 開いたときの項目の行。保存のときに変わっていないかを確かめる */
	snapshot: string[];
}

export interface ChecklistEdit {
	line?: number;
	/** 元の行から変えたか。変えていない行は1文字も変えない */
	changed: boolean;
	done: boolean;
	text: string;
}

export interface ChecklistEditResult {
	errors: string[];
	warnings: string[];
	edits: ChecklistEdit[];
}

const ITEM = /^(\s*(?:[-*+]|\d+[.)])\s+)\[(.)\](?:\s(.*))?$/;

/** 本文が始まる行（frontmatter の次の行。frontmatter が無ければ 0） */
export function bodyStartLine(lines: readonly string[]): number {
	if (lines[0]?.replace(/\r$/, '') !== '---') return 0;
	const end = lines.findIndex((l, i) => i > 0 && l.replace(/\r$/, '') === '---');
	return end > 0 ? end + 1 : 0;
}

/** 本文のチェックリストの行。[ ] [x] [X] だけ（数え方は完了の割合と同じ）。frontmatter とコードブロックの中は除く */
export function checklistLines(lines: readonly string[]): ChecklistLine[] {
	const start = bodyStartLine(lines);
	let inCode = false;
	const out: ChecklistLine[] = [];
	for (let i = start; i < lines.length; i++) {
		const raw = (lines[i] ?? '').replace(/\r$/, '');
		if (/^\s*(```|~~~)/.test(raw)) inCode = !inCode;
		if (inCode) continue;
		const m = ITEM.exec(raw);
		if (!m) continue;
		const mark = m[2] ?? '';
		if (mark !== ' ' && mark !== 'x' && mark !== 'X') continue;
		out.push({ line: i, raw, prefix: m[1] ?? '', mark, text: (m[3] ?? '').trim() });
	}
	return out;
}

const snapshotOf = (items: readonly ChecklistLine[]) => items.map((it) => `${it.line}:${it.raw}`);

/** 編集画面に出す項目 */
export function checklistRows(content: string): ChecklistRows {
	const items = checklistLines(content.split('\n'));
	return { rows: items.map((it) => ({ line: it.line, done: it.mark !== ' ', text: it.text })), snapshot: snapshotOf(items) };
}

/** 項目に書ける形（改行は空白に） */
const itemText = (text: string) => text.replace(/\r?\n/g, ' ').trim();

/** 編集を確かめ、書き換えにする。内容の無い新しい項目・内容を消した項目は誤り */
export function checklistEdits(rows: readonly ChecklistRow[], initial: readonly ChecklistRow[]): ChecklistEditResult {
	const errors: string[] = [];
	const edits: ChecklistEdit[] = [];
	const before = new Map(initial.map((r) => [r.line, r]));
	rows.forEach((row, i) => {
		const text = itemText(row.text);
		const old = row.line === undefined ? undefined : before.get(row.line);
		const changed = !old || old.done !== row.done || itemText(old.text) !== text;
		if (changed && text === '') errors.push(`${i + 1}つ目の項目：内容を入力してください（要らなければごみ箱のボタンで消してください）`);
		edits.push({ ...(row.line !== undefined ? { line: row.line } : {}), changed, done: row.done, text });
	});
	return { errors, warnings: [], edits };
}

/**
 * 編集で本文を書き換える。変えた行だけ書き換え、消した項目の行を除き、新しい項目は今の最後の項目の下（無ければ本文の末尾）に足す（設計書 4.10）
 * 開いたあとにチェックリストが変わっていたら、行番号がずれるので例外にする
 */
export function applyChecklistEdits(content: string, snapshot: readonly string[], edits: readonly ChecklistEdit[]): string {
	const lines = content.split('\n');
	const items = checklistLines(lines);
	if (JSON.stringify(snapshotOf(items)) !== JSON.stringify(snapshot)) {
		throw new Error('チェックリストが、画面を開いたあとに変わっています。画面を開き直してください');
	}
	const added = edits.filter((e) => e.line === undefined).map((e) => `- [${e.done ? 'x' : ' '}] ${e.text}`);
	const kept = new Map(edits.filter((e) => e.line !== undefined).map((e) => [e.line, e]));
	const last = items[items.length - 1];

	if (!last) {
		if (added.length === 0) return content;
		const body = content === '' || content.endsWith('\n') ? content : `${content}\n`;
		const eol = body.endsWith('\r\n') ? '\r' : '';
		// 前とは空行で分ける（本文が frontmatter だけ、または空なら分けない）
		const gap = body === '' || /\r?\n\r?\n$/.test(body) || /^---\r?\n[\s\S]*\r?\n---\r?\n$/.test(body) ? '' : `${eol}\n`;
		return `${body}${gap}${added.map((l) => `${l}${eol}\n`).join('')}`;
	}

	// 改行コード（CRLF）を保つ
	const eol = (lines[last.line] ?? '').endsWith('\r') ? '\r' : '';
	// 最後の項目の下の字下げした行（入れ子の項目や続きの行）の後ろに足す
	let insertAt = last.line + 1;
	while (insertAt < lines.length && /^\s+\S/.test(lines[insertAt] ?? '')) insertAt++;
	const byLine = new Map(items.map((it) => [it.line, it]));
	const out: string[] = [];
	lines.forEach((l, i) => {
		if (i === insertAt) out.push(...added.map((a) => a + eol));
		const item = byLine.get(i);
		if (!item) out.push(l);
		else {
			const edit = kept.get(i);
			if (!edit) return;
			if (!edit.changed) out.push(l);
			else {
				const mark = edit.done ? (item.mark === ' ' ? 'x' : item.mark) : ' ';
				out.push(`${item.prefix}[${mark}]${edit.text ? ` ${edit.text}` : ''}${eol}`);
			}
		}
	});
	if (insertAt >= lines.length) out.push(...added.map((a) => a + eol));
	return out.join('\n');
}
