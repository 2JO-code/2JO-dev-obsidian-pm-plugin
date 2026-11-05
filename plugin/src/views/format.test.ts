import { describe, expect, it } from 'vitest';
import type { Warning } from '../calc/warnings';
import { hoursText, progressDetail, subtaskText, warningCounts, warningSummary } from './format';

const w = (kind: Warning['kind']) => ({ kind }) as Warning;

describe('hoursText', () => {
	it('3けた区切り、小数は2けたまで', () => {
		expect(hoursText(8123.5)).toBe('8,123.5');
		expect(hoursText(0.25)).toBe('0.25');
		expect(hoursText(1086.75)).toBe('1,086.75');
		expect(hoursText(undefined)).toBe('—');
	});
});

describe('progressDetail', () => {
	it('進捗率と件数。対象が無ければ「—」', () => {
		expect(progressDetail({ done: 54, total: 316, ratio: 54 / 316 })).toBe('17%（54/316）');
		expect(progressDetail({ done: 0, total: 0, ratio: null })).toBe('—');
	});
});

describe('subtaskText', () => {
	it('完了なら「完了」、それ以外はチェックリストの割合と件数', () => {
		expect(subtaskText({ done: true, subtaskRatio: 0.5 }, { done: 1, total: 2 })).toBe('完了');
		expect(subtaskText({ done: false, subtaskRatio: 1 / 3 }, { done: 1, total: 3 })).toBe('33%（1/3）');
		expect(subtaskText({ done: false, subtaskRatio: null }, { done: 0, total: 0 })).toBe('—');
	});
});

describe('warningCounts', () => {
	it('種類ごとに数え、重いものから並べる', () => {
		const warnings = [w('overEstimate'), w('overdue'), w('overEstimate'), w('overAllocation')];
		expect(warningCounts(warnings)).toEqual([
			['overdue', 1],
			['overEstimate', 2],
			['overAllocation', 1],
		]);
		expect(warningSummary(warnings)).toBe('期限超過 1・工数超過 2・配分超過 1');
	});
});
