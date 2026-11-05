import { describe, expect, it } from 'vitest';
import { FRONTMATTER_KEYS, REQUIRED_KEYS } from './frontmatter';

describe('FRONTMATTER_KEYS', () => {
	it.each(Object.entries(FRONTMATTER_KEYS))('%s は type で始まり、重複がない', (_type, keys) => {
		expect(keys[0]).toBe('type');
		expect(new Set(keys).size).toBe(keys.length);
	});

	it.each(Object.entries(REQUIRED_KEYS))('%s の必須キーはすべて書き出し順に含まれる', (type, required) => {
		const keys: readonly string[] = FRONTMATTER_KEYS[type as keyof typeof FRONTMATTER_KEYS];
		for (const key of required) expect(keys).toContain(key);
	});
});
