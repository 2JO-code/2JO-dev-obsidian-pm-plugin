import { describe, expect, it } from 'vitest';
import { applyChecklistEdits, checklistEdits, checklistRows, type ChecklistRow } from './checklist';

const note = [
	'---',
	'title: "- [ ] frontmatter"',
	'---',
	'説明の文',
	'',
	'- [ ] 下書き',
	'- [x] 確認',
	'  - [X] 子の項目',
	'- [-] 数えない',
	'```',
	'- [ ] コードの中',
	'```',
	'',
	'メモ',
	'',
].join('\n');

/** 画面で編集して保存したときの本文 */
function edit(content: string, change: (rows: ChecklistRow[]) => void): string {
	const { rows, snapshot } = checklistRows(content);
	const initial = rows.map((r) => ({ ...r }));
	change(rows);
	const result = checklistEdits(rows, initial);
	expect(result.errors).toEqual([]);
	return applyChecklistEdits(content, snapshot, result.edits);
}

describe('checklistRows', () => {
	it('[ ] [x] [X] の項目だけを出す（frontmatter・コードブロック・ほかの記号は除く）', () => {
		expect(checklistRows(note).rows).toEqual([
			{ line: 5, done: false, text: '下書き' },
			{ line: 6, done: true, text: '確認' },
			{ line: 7, done: true, text: '子の項目' },
		]);
	});
});

describe('checklistEdits', () => {
	it('内容を消した項目と、内容の無い新しい項目は誤りにする', () => {
		const initial: ChecklistRow[] = [{ line: 3, done: false, text: 'a' }];
		const result = checklistEdits([{ line: 3, done: false, text: ' ' }, { done: false, text: '' }], initial);
		expect(result.errors).toHaveLength(2);
		expect(result.errors[1]).toContain('2つ目の項目');
	});

	it('変えていない項目は changed: false', () => {
		const initial: ChecklistRow[] = [{ line: 3, done: false, text: 'a' }];
		expect(checklistEdits([{ line: 3, done: false, text: 'a ' }], initial).edits[0]?.changed).toBe(false);
	});
});

describe('applyChecklistEdits', () => {
	it('チェックと内容を変えた行だけ書き換え、ほかの行は変えない', () => {
		const out = edit(note, (rows) => {
			rows[0]!.done = true;
			rows[1]!.text = '確認する';
		});
		const lines = out.split('\n');
		expect(lines[5]).toBe('- [x] 下書き');
		expect(lines[6]).toBe('- [x] 確認する');
		expect(lines.filter((_, i) => i !== 5 && i !== 6)).toEqual(note.split('\n').filter((_, i) => i !== 5 && i !== 6));
	});

	it('[X] はチェックを残したまま内容を変えても X のまま。チェックを外すと [ ]', () => {
		const out = edit(note, (rows) => {
			rows[2]!.text = '子';
			rows[1]!.done = false;
		});
		expect(out.split('\n')[7]).toBe('  - [X] 子');
		expect(out.split('\n')[6]).toBe('- [ ] 確認');
	});

	it('消した項目の行を除く', () => {
		const out = edit(note, (rows) => rows.splice(0, 1));
		expect(out).toBe(note.replace('- [ ] 下書き\n', ''));
	});

	it('新しい項目は最後の項目（とその下の字下げした行）の下に足す', () => {
		const out = edit(note, (rows) => rows.push({ done: false, text: '公開' }, { done: true, text: '連絡' }));
		expect(out.split('\n').slice(6, 10)).toEqual(['- [x] 確認', '  - [X] 子の項目', '- [ ] 公開', '- [x] 連絡']);
	});

	it('最後の項目を消しても、その位置に足す', () => {
		const content = '- [ ] a\n- [ ] b\n\n本文\n';
		const out = edit(content, (rows) => {
			rows.splice(1, 1);
			rows.push({ done: false, text: 'c' });
		});
		expect(out).toBe('- [ ] a\n- [ ] c\n\n本文\n');
	});

	it('項目が無ければ本文の末尾に、空行をはさんで足す（本文が frontmatter だけならはさまない）', () => {
		const add = (rows: ChecklistRow[]) => rows.push({ done: false, text: '作業' });
		expect(edit('---\ntitle: x\n---\n説明', add)).toBe('---\ntitle: x\n---\n説明\n\n- [ ] 作業\n');
		expect(edit('---\ntitle: x\n---\n', add)).toBe('---\ntitle: x\n---\n- [ ] 作業\n');
		expect(edit('---\ntitle: x\n---\n', () => {})).toBe('---\ntitle: x\n---\n');
	});

	it('改行コード（CRLF）を保つ', () => {
		const content = '- [ ] a\r\n本文\r\n';
		const out = edit(content, (rows) => {
			rows[0]!.done = true;
			rows.push({ done: false, text: 'b' });
		});
		expect(out).toBe('- [x] a\r\n- [ ] b\r\n本文\r\n');
		expect(edit('本文\r\n', (rows) => rows.push({ done: false, text: 'b' }))).toBe('本文\r\n\r\n- [ ] b\r\n');
	});

	it('開いたあとにチェックリストが変わっていたら例外にする', () => {
		const { snapshot } = checklistRows(note);
		expect(() => applyChecklistEdits(note.replace('下書き', '下書き2'), snapshot, [])).toThrow();
	});
});
