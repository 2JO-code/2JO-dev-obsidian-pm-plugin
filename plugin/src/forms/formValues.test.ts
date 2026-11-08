import { describe, expect, it } from 'vitest';
import {
	date,
	isReadable,
	keepFrames,
	link,
	links,
	linkValue,
	text,
	warnUnreadable,
} from './formValues';
import { missingLabel } from '../calc/format';

const PJT = 'PJT-0192f3a0-1234-7abc-8def-000000000001';
const USER = 'USER-0192f3a0-1234-7abc-8def-000000000002';

describe('formValues', () => {
	it('入力欄の文字列：文字列は前後の空白を除き、数値は文字列に、ほかは空', () => {
		expect(text(' a ')).toBe('a');
		expect(text(1.5)).toBe('1.5');
		expect(text(null)).toBe('');
		expect(text(['a'])).toBe('');
	});

	it('リンクは ID に。読めない値は元の文字列のまま残す', () => {
		expect(link(`[[${PJT}]]`, 'project')).toBe(PJT);
		expect(link(`[[${USER}]]`, 'project')).toBe(`[[${USER}]]`);
		expect(links([`[[${USER}]]`, '', null, 'abc'], 'user')).toEqual([USER, 'abc']);
		expect(links(`[[${USER}]]`, 'user')).toEqual([USER]);
	});

	it('読める ID はリンクにして書き、読めない値はそのまま書く', () => {
		expect(isReadable(PJT, 'project')).toBe(true);
		expect(isReadable(PJT, 'user')).toBe(false);
		expect(linkValue(PJT, 'project')).toBe(`[[${PJT}]]`);
		expect(linkValue('abc', 'project')).toBe('abc');
		expect(missingLabel(PJT, 'project')).toBe(`${PJT}（見つかりません）`);
		expect(missingLabel('abc', 'project')).toBe('abc（読めません）');
	});

	it('読めない値が残っていれば保存時の知らせを足す', () => {
		const warnings: string[] = [];
		warnUnreadable('担当者', [USER, '', 'abc', 'x'], 'user', warnings);
		warnUnreadable('担当者', [USER], 'user', warnings);
		expect(warnings).toEqual(['担当者の読めない値（abc、x）はそのまま残しました。直すか、外してください']);
	});

	it('空欄の項目は空の枠にする（リストの項目は []、ほかは null）', () => {
		expect(keepFrames({ title: 'A', due: undefined, assignees: undefined })).toEqual({ title: 'A', due: null, assignees: [] });
	});

	it('日付の入力：空は undefined、誤りは errors に足す', () => {
		const errors: string[] = [];
		expect(date(' ', '期限日', errors)).toBeUndefined();
		expect(date('2026-11-07', '期限日', errors)).toBe('2026-11-07');
		expect(date('2026-13-01', '期限日', errors)).toBeUndefined();
		expect(errors).toEqual(['期限日の日付が正しくありません']);
	});
});
