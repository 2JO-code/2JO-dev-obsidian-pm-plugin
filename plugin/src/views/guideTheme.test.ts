import { describe, expect, it } from 'vitest';
import { activeSectionIndex, GUIDE_THEME_STYLE_ID, guideThemeCss, withGuideTheme } from './guideTheme';

const values: Record<string, string> = {
	'--background-primary': '#ffffff',
	'--text-normal': ' #222222 ',
	'--interactive-accent': 'hsl(258, 88%, 66%)',
	'--color-yellow': '#e0ac00',
};
const read = (name: string) => values[name] ?? '';

describe('guideThemeCss', () => {
	it('Obsidian の変数の値を使い方の変数に入れる', () => {
		const css = guideThemeCss(read, false);
		expect(css).toContain('--bg:#ffffff');
		expect(css).toContain('--surface:#ffffff');
		expect(css).toContain('--fg:#222222');
		expect(css).toContain('--accent:hsl(258, 88%, 66%)');
	});

	it('値の無い変数は入れない（HTML の元の色のまま）', () => {
		expect(guideThemeCss(read, false)).not.toContain('--c-red:');
	});

	it('薄い背景は元の色の 14%、保存前の黄色は 25%', () => {
		const css = guideThemeCss(read, false);
		expect(css).toContain('--accent-soft:color-mix(in srgb, var(--accent) 14%, transparent)');
		expect(css).toContain('--c-yellow:color-mix(in srgb, #e0ac00 25%, transparent)');
	});

	it('暗いテーマなら color-scheme を dark にする', () => {
		expect(guideThemeCss(read, true)).toContain('color-scheme:dark');
		expect(guideThemeCss(read, false)).toContain('color-scheme:light');
	});

	it('HTML の暗い配色の指定より強い選択子にする', () => {
		expect(guideThemeCss(read, false).startsWith(':root:root:root{')).toBe(true);
	});
});

describe('withGuideTheme', () => {
	it('head の終わりに style を入れる', () => {
		const html = withGuideTheme('<html><head><title>t</title></head><body></body></html>', 'a{}');
		expect(html).toBe(`<html><head><title>t</title><style id="${GUIDE_THEME_STYLE_ID}">a{}</style></head><body></body></html>`);
	});

	it('head が無ければ先頭に入れる', () => {
		expect(withGuideTheme('<p>x</p>', 'a{}')).toBe(`<style id="${GUIDE_THEME_STYLE_ID}">a{}</style><p>x</p>`);
	});
});

describe('activeSectionIndex', () => {
	const tops = [0, 500, 1200];

	it('上から120pxの位置を過ぎた最後の章を返す', () => {
		expect(activeSectionIndex(tops, 0, 600, 3000)).toBe(0);
		expect(activeSectionIndex(tops, 380, 600, 3000)).toBe(1);
		expect(activeSectionIndex(tops, 1100, 600, 3000)).toBe(2);
	});

	it('いちばん下まで来たら最後の章を返す', () => {
		expect(activeSectionIndex(tops, 2400, 600, 3000)).toBe(2);
	});

	it('章が無ければ -1', () => {
		expect(activeSectionIndex([], 0, 600, 3000)).toBe(-1);
	});
});
