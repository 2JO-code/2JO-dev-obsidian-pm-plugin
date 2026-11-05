/** 並びを保ったまま、キーが同じものをまとめる（中央のタブを枠ごとに分ける。設計書 9.1） */
export function groupsInOrder<T, K>(items: readonly T[], key: (item: T) => K): T[][] {
	const groups = new Map<K, T[]>();
	for (const item of items) {
		const k = key(item);
		const group = groups.get(k);
		if (group) group.push(item);
		else groups.set(k, [item]);
	}
	return [...groups.values()];
}
