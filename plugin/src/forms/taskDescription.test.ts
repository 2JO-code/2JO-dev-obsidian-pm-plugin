import { describe, expect, it } from 'vitest';
import { applyDescription, descriptionErrors, descriptionOf } from './taskDescription';

const note = ['---', 'type: task', '---', '説明の1行目', '説明の2行目', '', '- [ ] 下書き', '- [x] 確認', '', 'メモ', ''].join('\n');

describe('descriptionOf', () => {
	it('frontmatter の次から最初のチェックリストの項目の前までを返す', () => {
		expect(descriptionOf(note)).toBe('説明の1行目\n説明の2行目');
	});

	it('チェックリストが無ければ本文全体を返す', () => {
		expect(descriptionOf('---\ntype: task\n---\n\n説明\n\n')).toBe('説明');
	});

	it('説明が無ければ空', () => {
		expect(descriptionOf('---\ntype: task\n---\n- [ ] 項目\n')).toBe('');
		expect(descriptionOf('---\ntype: task\n---\n')).toBe('');
	});

	it('コードブロックの中の項目はチェックリストと見なさない', () => {
		expect(descriptionOf('---\na: 1\n---\n```\n- [ ] 例\n```\n- [ ] 項目\n')).toBe('```\n- [ ] 例\n```');
	});
});

describe('applyDescription', () => {
	it('説明だけを書き換え、チェックリストとその後ろは変えない', () => {
		const out = applyDescription(note, '説明の1行目\n説明の2行目', '新しい説明');
		expect(out).toBe(['---', 'type: task', '---', '新しい説明', '', '- [ ] 下書き', '- [x] 確認', '', 'メモ', ''].join('\n'));
	});

	it('変えていなければ元のまま（前後の空行・末尾の空白の違いは無視）', () => {
		expect(applyDescription(note, '説明の1行目\n説明の2行目', '\n説明の1行目\n説明の2行目  \n')).toBe(note);
	});

	it('説明を空にすると、チェックリストを frontmatter のすぐ下にする', () => {
		expect(applyDescription(note, '説明の1行目\n説明の2行目', '')).toBe(
			['---', 'type: task', '---', '- [ ] 下書き', '- [x] 確認', '', 'メモ', ''].join('\n'),
		);
	});

	it('説明が無いノートに足す', () => {
		expect(applyDescription('---\ntype: task\n---\n- [ ] 項目\n', '', '説明')).toBe('---\ntype: task\n---\n説明\n\n- [ ] 項目\n');
		expect(applyDescription('---\ntype: task\n---\n', '', '説明')).toBe('---\ntype: task\n---\n説明\n');
		expect(applyDescription('---\ntype: task\n---', '', '説明')).toBe('---\ntype: task\n---\n説明\n');
	});

	it('チェックリストが無ければ本文全体を置き換える', () => {
		expect(applyDescription('---\na: 1\n---\n古い\n', '古い', '新しい\n2行目')).toBe('---\na: 1\n---\n新しい\n2行目\n');
	});

	it('改行コード（CRLF）を保つ', () => {
		const crlf = note.replace(/\n/g, '\r\n');
		expect(applyDescription(crlf, '説明の1行目\n説明の2行目', 'A\nB')).toBe(
			['---', 'type: task', '---', 'A', 'B', '', '- [ ] 下書き', '- [x] 確認', '', 'メモ', ''].join('\r\n'),
		);
	});

	it('開いたあとに説明が変わっていたら例外', () => {
		expect(() => applyDescription(note, '別の説明', '新しい説明')).toThrow('画面を開き直して');
	});
});

describe('descriptionErrors', () => {
	it('普通の文は誤りなし', () => {
		expect(descriptionErrors('説明\n- 箇条書き\n```\n- [ ] 例\n```')).toEqual([]);
	});

	it('チェックリストの行は書けない', () => {
		expect(descriptionErrors('説明\n- [ ] 項目')).toHaveLength(1);
	});

	it('閉じていないコードブロックは書けない', () => {
		expect(descriptionErrors('```\nコード')).toHaveLength(1);
	});
});
