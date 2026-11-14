import type { IsoDate } from './model';
import { isIsoDate, isRecord } from './parse/values';

/** 名前の長さの上限（文字） */
export const LAYOUT_NAME_MAX = 40;

/** このPCに保存したレイアウト（タブの並び。個人の設定） */
export interface SavedLayout {
	name: string;
	/** 保存した日 */
	savedAt: IsoDate;
	/** `workspace.getLayout()` の結果そのまま */
	layout: Record<string, unknown>;
}

/** 保存された値を読む。形の合わないものは捨てる */
export function parseSavedLayouts(stored: unknown): SavedLayout[] {
	if (!Array.isArray(stored)) return [];
	const result: SavedLayout[] = [];
	for (const item of stored) {
		if (!isRecord(item)) continue;
		const { name, savedAt, layout } = item;
		if (typeof name !== 'string' || name.trim() === '' || !isRecord(layout)) continue;
		if (result.some((l) => l.name === name)) continue;
		result.push({ name, savedAt: typeof savedAt === 'string' && isIsoDate(savedAt) ? savedAt : '', layout });
	}
	return result;
}

/** 入力された名前を確かめる。exists は同じ名前がもうあるか（上書きになる） */
export function checkLayoutName(input: string, layouts: readonly SavedLayout[]): { name: string; errors: string[]; exists: boolean } {
	const name = input.trim();
	const errors: string[] = [];
	if (name === '') errors.push('名前を入力してください');
	else if ([...name].length > LAYOUT_NAME_MAX) errors.push(`名前は${LAYOUT_NAME_MAX}文字までにしてください`);
	return { name, errors, exists: layouts.some((l) => l.name === name) };
}

/** 同じ名前があれば同じ位置で置き換え、無ければ末尾に足す */
export function putLayout(layouts: readonly SavedLayout[], next: SavedLayout): SavedLayout[] {
	const index = layouts.findIndex((l) => l.name === next.name);
	if (index < 0) return [...layouts, next];
	return layouts.map((l, i) => (i === index ? next : l));
}

/** 名前の一致するものを除く */
export function removeLayout(layouts: readonly SavedLayout[], name: string): SavedLayout[] {
	return layouts.filter((l) => l.name !== name);
}

/** 一覧に出す文字（名前と保存日） */
export function layoutLabel(layout: SavedLayout): string {
	return layout.savedAt ? `${layout.name}（${layout.savedAt} 保存）` : layout.name;
}
