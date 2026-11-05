import { describe, expect, it } from 'vitest';
import type { StatusDef } from '../model';
import { CATEGORY_COLORS, removeStatusColor, renameStatusColor, statusColor } from './statusColor';

const defs: StatusDef[] = [
	{ name: '未着手', category: 'not_started', aliases: [] },
	{ name: 'レビュー中', category: 'in_progress', aliases: ['レビュー待ち'] },
	{ name: '完了', category: 'done', aliases: [] },
];

describe('statusColor', () => {
	it('選んだ色があればその色、なければ分類の色', () => {
		expect(statusColor(defs, { 完了: '#123456' }, '完了')).toBe('#123456');
		expect(statusColor(defs, {}, '未着手')).toBe(CATEGORY_COLORS.not_started);
	});

	it('旧名でも今の名前の色にする', () => {
		expect(statusColor(defs, { レビュー中: '#abcdef' }, 'レビュー待ち')).toBe('#abcdef');
	});

	it('設定に無いステータスは色なし', () => {
		expect(statusColor(defs, {}, '謎')).toBeUndefined();
		expect(statusColor(defs, {}, '')).toBeUndefined();
	});
});

describe('renameStatusColor / removeStatusColor', () => {
	it('名前を変えたら色も付け替える。色を選んでいなければ何もしない', () => {
		expect(renameStatusColor({ 進行中: '#111111', 完了: '#222222' }, '進行中', '作業中')).toEqual({ 作業中: '#111111', 完了: '#222222' });
		expect(renameStatusColor({ 完了: '#222222' }, '進行中', '作業中')).toEqual({ 完了: '#222222' });
	});

	it('色を消すと分類の色に戻る', () => {
		const colors = removeStatusColor({ 完了: '#222222' }, '完了');
		expect(colors).toEqual({});
		expect(statusColor(defs, colors, '完了')).toBe(CATEGORY_COLORS.done);
	});
});
