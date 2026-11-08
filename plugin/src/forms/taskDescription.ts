import { bodyStartLine, checklistLines } from './checklist';

/** タスクの本文の説明（frontmatter の次から最初のチェックリストの項目の前まで。設計書 4.11） */

/** 改行を LF にし、前後の空行と末尾の空白を除く */
export function normalizeDescription(text: string): string {
	return text
		.replace(/\r\n?/g, '\n')
		.replace(/^(?:[ \t]*\n)+/, '')
		.trimEnd();
}

/** 説明の行の範囲。end は最初のチェックリストの項目の行（無ければ行数） */
function descriptionRange(lines: readonly string[]): { start: number; end: number } {
	return { start: bodyStartLine(lines), end: checklistLines(lines)[0]?.line ?? lines.length };
}

/** 本文から説明を取り出す */
export function descriptionOf(content: string): string {
	const lines = content.split('\n');
	const { start, end } = descriptionRange(lines);
	return normalizeDescription(lines.slice(start, end).join('\n'));
}

/** 説明に書けない内容の誤り。チェックリストの行と、閉じていないコードブロック */
export function descriptionErrors(text: string): string[] {
	const lines = normalizeDescription(text).split('\n');
	const errors: string[] = [];
	// 先頭の --- を frontmatter と見なさないよう、空行を前に置いて調べる
	if (checklistLines(['', ...lines]).length > 0) {
		errors.push('説明にチェックリストの行（- [ ] …）は書けません。チェックリストは「チェックリストを編集」で変えてください');
	}
	if (lines.filter((l) => /^\s*(```|~~~)/.test(l)).length % 2 !== 0) {
		errors.push('説明のコードブロック（``` で始まる行）が閉じていません');
	}
	return errors;
}

/**
 * 説明を書き換えた本文を返す。変えていなければ元のまま。チェックリストとその後ろは1文字も変えない（設計書 4.11）
 * 開いたあとに説明が変わっていたら例外にする
 * @param opened 画面を開いたときの説明
 */
export function applyDescription(content: string, opened: string, text: string): string {
	const next = normalizeDescription(text);
	if (next === normalizeDescription(opened)) return content;
	if (descriptionOf(content) !== normalizeDescription(opened)) {
		throw new Error('説明が、画面を開いたあとに変わっています。画面を開き直してください');
	}
	const lines = content.split('\n');
	const { start, end } = descriptionRange(lines);
	const written = next === '' ? [] : next.split('\n');
	// チェックリストがあれば空行で分ける。無ければ本文の末尾を改行で終える
	const region = end < lines.length ? (written.length > 0 ? [...written, ''] : []) : [...written, ''];
	// 改行コード（CRLF）を保つ。ファイルの最後の行には付けない
	const eol = content.includes('\r\n') ? '\r' : '';
	const atFileEnd = end >= lines.length;
	const withEol = region.map((l, i) => (atFileEnd && i === region.length - 1 ? l : l + eol));
	return [...lines.slice(0, start), ...withEol, ...lines.slice(end)].join('\n');
}
