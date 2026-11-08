import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

describe('errorMessage', () => {
	it('Error は message', () => {
		expect(errorMessage(new Error('書けません'))).toBe('書けません');
	});

	it('Error でない値は文字にする', () => {
		expect(errorMessage('文字')).toBe('文字');
		expect(errorMessage(42)).toBe('42');
		expect(errorMessage(undefined)).toBe('undefined');
	});

	it('まとめた誤りは中の文を重ねずに並べる', () => {
		const e = new AggregateError([new Error('A'), new Error('B'), new Error('A')], '全体');
		expect(errorMessage(e)).toBe('A\nB');
	});

	it('中が空のまとめた誤りは全体の文', () => {
		expect(errorMessage(new AggregateError([], '全体'))).toBe('全体');
	});
});
