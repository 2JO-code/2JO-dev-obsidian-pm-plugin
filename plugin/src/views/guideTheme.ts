/** 使い方の HTML の色・文字の名前と、そこに入れる Obsidian の CSS 変数（設計書 9.14） */
const THEME_VARS: readonly (readonly [string, string])[] = [
	['--bg', '--background-primary'],
	['--surface', '--background-primary'],
	['--fill', '--background-secondary'],
	['--fg', '--text-normal'],
	['--muted', '--text-muted'],
	['--line', '--background-modifier-border'],
	['--grid', '--pm-grid-color'],
	['--accent', '--interactive-accent'],
	['--on-accent', '--text-on-accent'],
	['--tip', '--color-cyan'],
	['--note', '--color-purple'],
	['--c-orange', '--color-orange'],
	['--c-purple', '--color-purple'],
	['--c-gray', '--text-faint'],
	['--c-red', '--color-red'],
	['--c-green', '--color-green'],
	['--c-blue', '--color-blue'],
	['--c-ink', '--text-normal'],
	['--type-epic', '--pm-color-epic'],
	['--type-task', '--pm-color-task'],
	['--f-head', '--font-interface'],
	['--f-body', '--font-interface'],
	['--f-mono', '--font-monospace'],
];

/** 薄い背景にする色（UI_STYLE_GUIDE 4章の 14%） */
const SOFT_VARS: readonly (readonly [string, string])[] = [
	['--accent-soft', '--accent'],
	['--tip-soft', '--tip'],
	['--note-soft', '--note'],
	['--c-orange-soft', '--c-orange'],
	['--c-purple-soft', '--c-purple'],
	['--c-gray-soft', '--c-gray'],
	['--c-red-soft', '--c-red'],
	['--c-green-soft', '--c-green'],
];

/** 使い方の HTML の中に入れるテーマの style の id */
export const GUIDE_THEME_STYLE_ID = 'pm-guide-theme';

/**
 * Obsidian の今の色・文字で、使い方の HTML の変数を上書きする CSS を作る。
 * @param read Obsidian の CSS 変数の今の値を返す。無ければ空文字
 */
export function guideThemeCss(read: (name: string) => string, dark: boolean): string {
	const props: string[] = [];
	for (const [token, source] of THEME_VARS) {
		const value = read(source).trim();
		if (value) props.push(`${token}:${value}`);
	}
	for (const [token, base] of SOFT_VARS) props.push(`${token}:color-mix(in srgb, var(${base}) 14%, transparent)`);
	const yellow = read('--color-yellow').trim();
	if (yellow) props.push(`--c-yellow:color-mix(in srgb, ${yellow} 25%, transparent)`);
	props.push(`color-scheme:${dark ? 'dark' : 'light'}`);
	// HTML の中の暗い配色の指定（:root:not(...)）より強くするため、:root を重ねる
	return `:root:root:root{${props.join(';')}}`;
}

/** 使い方の HTML の head の終わりに、テーマの style を入れる */
export function withGuideTheme(html: string, css: string): string {
	const style = `<style id="${GUIDE_THEME_STYLE_ID}">${css}</style>`;
	const at = html.indexOf('</head>');
	return at < 0 ? style + html : html.slice(0, at) + style + html.slice(at);
}

/** 目次で色を付ける章の番号。上から offset の位置を過ぎた最後の章。いちばん下まで来たら最後の章 */
export function activeSectionIndex(tops: readonly number[], scrollTop: number, viewHeight: number, scrollHeight: number, offset = 120): number {
	if (tops.length === 0) return -1;
	if (scrollTop + viewHeight >= scrollHeight - 4) return tops.length - 1;
	let current = 0;
	tops.forEach((top, i) => {
		if (top <= scrollTop + offset) current = i;
	});
	return current;
}
