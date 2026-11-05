/** 先頭に入れる注意書き（設計書 9章） */
export const README_NOTICE = [
	'> [!note] このノートはプラグインが作っています',
	'> 「使い方を開く」たびにプラグインの版の内容に戻るため、直接書き換えないでください。',
];

/** Vault に置く README の中身（見出しの次に注意書きを入れる） */
export function readmeContent(text: string): string {
	const lines = text.split('\n');
	const at = lines[0]?.startsWith('# ') ? 1 : 0;
	lines.splice(at, 0, ...(at ? [''] : []), ...README_NOTICE, ...(at ? [] : ['']));
	return lines.join('\n');
}

/** 今の README を書き直す必要があるか（改行コードの違いは見ない） */
export function readmeNeedsWrite(current: string, content: string): boolean {
	return current.replace(/\r\n/g, '\n') !== content;
}
