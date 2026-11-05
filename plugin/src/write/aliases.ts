/** タイトルに合わせた aliases。変更が不要なら null（設計書 4.2） */
export function syncAliases(title: string, aliases: readonly string[]): string[] | null {
	const name = title.trim();
	if (name === '') return null;
	return isSynced(name, aliases) ? null : [name];
}

/** aliases がタイトル1つだけになっているか */
export function isSynced(title: string, aliases: readonly string[]): boolean {
	return aliases.length === 1 && aliases[0] === title.trim();
}
