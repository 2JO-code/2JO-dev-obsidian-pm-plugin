import { describe, expect, it } from 'vitest';
import { applyFrontmatter, toLink } from './frontmatter';

describe('applyFrontmatter', () => {
	it('種類ごとの順にキーを並べ直し、未知のキーは元の順で後ろに付ける', () => {
		const fm: Record<string, unknown> = {
			status: '進行中',
			memo: 'x',
			title: 'A',
			due: '2026-11-30',
			type: 'task',
			extra: 1,
			aliases: ['A'],
		};
		applyFrontmatter(fm, 'task', {});
		expect(Object.keys(fm)).toEqual(['type', 'title', 'aliases', 'status', 'due', 'memo', 'extra']);
	});

	it('値を変更・追加し、undefined のキーは削除する', () => {
		const fm: Record<string, unknown> = { type: 'task', title: 'A', due: '2026-11-30', epic: '[[EPIC-x]]' };
		applyFrontmatter(fm, 'task', { status: '完了', due: '2026-12-01', epic: undefined });
		expect(fm).toEqual({ type: 'task', title: 'A', status: '完了', due: '2026-12-01' });
		expect(Object.keys(fm)).toEqual(['type', 'title', 'status', 'due']);
	});

	it('Date を渡すとエラー', () => {
		const update = { due: new Date() } as unknown as Record<string, string>;
		expect(() => applyFrontmatter({}, 'task', update)).toThrow();
	});
});

describe('toLink', () => {
	it('[[ID]] にする', () => {
		expect(toLink('TASK-1')).toBe('[[TASK-1]]');
	});
});
