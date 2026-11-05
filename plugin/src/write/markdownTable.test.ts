import { describe, expect, it } from 'vitest';
import { TABLE_SPEC } from '../parse/bodyTables';
import { appendTable } from './markdownTable';

describe('appendTable', () => {
	const row = '| 2026-11-04 | [[TASK-0192f3a0-1234-7abc-8def-000000000001]] | 1 |  |  |';

	it('本文の後ろに空行をはさんで表を足す', () => {
		expect(appendTable('メモ', TABLE_SPEC.worklog, [row]).split('\n').slice(0, 3)).toEqual(['メモ', '', '## 作業ログ']);
	});

	it('本文が frontmatter だけなら空行を入れない', () => {
		expect(appendTable('---\ntype: worklog\n---\n', TABLE_SPEC.worklog, [row]).split('\n')[3]).toBe('## 作業ログ');
	});

	it('行は区切り行の後ろに並び、末尾は改行で終わる', () => {
		const lines = appendTable('', TABLE_SPEC.worklog, [row, row]).split('\n');
		expect(lines.slice(3)).toEqual([row, row, '']);
	});
});
