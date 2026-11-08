import { describe, expect, it } from 'vitest';
import { field, isRecord } from './values';

describe('isRecord', () => {
	it('配列でないオブジェクトだけを受け付ける', () => {
		expect(isRecord({ a: 1 })).toBe(true);
		expect(isRecord({})).toBe(true);
		expect(isRecord([])).toBe(false);
		expect(isRecord(null)).toBe(false);
		expect(isRecord(undefined)).toBe(false);
		expect(isRecord('a')).toBe(false);
	});
});

describe('field', () => {
	it('オブジェクトならキーの値を返す', () => {
		expect(field({ gantt: { unit: 'day' } }, 'gantt')).toEqual({ unit: 'day' });
		expect(field({ a: 1 }, 'b')).toBeUndefined();
	});

	it('オブジェクトでなければ undefined', () => {
		expect(field(undefined, 'a')).toBeUndefined();
		expect(field(null, 'a')).toBeUndefined();
		expect(field(['a'], '0')).toBeUndefined();
		expect(field('text', 'length')).toBeUndefined();
	});

	it('入れ子のキーは重ねて読む', () => {
		expect(field(field({ charts: { burnup: false } }, 'charts'), 'burnup')).toBe(false);
		expect(field(field({}, 'charts'), 'burnup')).toBeUndefined();
	});
});
