/** 投げられた値から、画面に出す誤りの文を取り出す。まとめた誤りは中の文を重ねずに並べる（設計書 4.13） */
export function errorMessage(e: unknown): string {
	if (e instanceof AggregateError && e.errors.length > 0) return [...new Set(e.errors.map(errorMessage))].join('\n');
	return e instanceof Error ? e.message : String(e);
}
