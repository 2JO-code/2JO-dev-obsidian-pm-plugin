import { describe, expect, it } from 'vitest';
import { compareJa, compareNumeric } from './compare';

describe('compareJa・compareNumeric', () => {
	it('日本語の名前を並べる', () => {
		expect(['佐藤', 'あおき', '伊藤'].sort(compareJa)).toEqual(['佐藤', 'あおき', '伊藤'].sort((a, b) => a.localeCompare(b, 'ja')));
	});

	it('数字の部分を数として比べる', () => {
		expect(['タスク10', 'タスク2', 'タスク1'].sort(compareNumeric)).toEqual(['タスク1', 'タスク2', 'タスク10']);
		expect(['1.10', '1.2', '2', '1.1'].sort(compareNumeric)).toEqual(['1.1', '1.2', '1.10', '2']);
	});
});
