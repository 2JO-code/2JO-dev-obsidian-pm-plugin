import { describe, expect, it } from 'vitest';
import { applyFrontmatter } from '../write/frontmatter';
import { memberFormFromFrontmatter, memberFormToUpdate, type MemberForm } from './memberForm';

const form = (overrides: Partial<MemberForm> = {}): MemberForm => ({
	title: '佐藤',
	dailyHours: '8',
	loadLimitPct: '120',
	active: true,
	...overrides,
});

describe('memberFormFromFrontmatter', () => {
	it('frontmatter からフォームの値を作る（数値は文字列に）', () => {
		expect(memberFormFromFrontmatter({ title: '佐藤', daily_hours: 7.5, load_limit_pct: 150, active: false })).toEqual(
			form({ dailyHours: '7.5', loadLimitPct: '150', active: false }),
		);
	});

	it('空の項目は既定値にする', () => {
		expect(memberFormFromFrontmatter({ title: '佐藤', daily_hours: null, active: 'はい' })).toEqual(form());
	});
});

describe('memberFormToUpdate', () => {
	it('入力を frontmatter の変更内容にする（数値は数値、在籍は true/false）', () => {
		const { errors, update } = memberFormToUpdate(form({ title: ' 佐藤 樹 ', dailyHours: '7.75', active: false }));
		expect(errors).toEqual([]);
		expect(update).toEqual({ type: 'user', title: '佐藤 樹', aliases: ['佐藤 樹'], daily_hours: 7.75, load_limit_pct: 120, active: false });
	});

	it('書き込むと、キーは決めた順になる', () => {
		const fm: Record<string, unknown> = { active: true, dummy: true, type: 'user', title: '佐藤' };
		applyFrontmatter(fm, 'user', memberFormToUpdate(form({ loadLimitPct: '150' })).update);
		expect(Object.keys(fm)).toEqual(['type', 'title', 'aliases', 'daily_hours', 'load_limit_pct', 'active', 'dummy']);
		expect(fm.load_limit_pct).toBe(150);
	});

	it('入力の誤りと、保存はできるが知らせることを返す', () => {
		expect(memberFormToUpdate(form({ title: ' ', dailyHours: '0', loadLimitPct: '1.5' })).errors).toEqual([
			'氏名を入力してください',
			'1日の通常稼働時間は0より大きく24以下の、0.25刻みの数値で入力してください（例：8）',
			'負荷許容率は1以上の整数で入力してください（例：120）',
		]);
		expect(memberFormToUpdate(form({ dailyHours: '7.3' })).errors).toHaveLength(1);
		const low = memberFormToUpdate(form({ loadLimitPct: '90' }));
		expect(low.errors).toEqual([]);
		expect(low.warnings).toEqual(['負荷許容率が100%より小さいため、負荷率が100%以下でも負荷警告になることがあります']);
	});
});
