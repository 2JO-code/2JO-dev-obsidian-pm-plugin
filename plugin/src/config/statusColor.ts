import type { StatusCategory, StatusDef } from '../model';
import { findStatus } from './status';

/** 色を選んでいないステータスの色（分類ごと。設計書 6章） */
export const CATEGORY_COLORS: Record<StatusCategory, string> = {
	not_started: '#8a8f98',
	in_progress: '#2f7ed8',
	done: '#2e9d5b',
	stopped: '#e07b39',
};

/** ステータスの色。選んだ色、なければ分類の色。設定に無いステータスは undefined（旧名も対象） */
export function statusColor(defs: readonly StatusDef[], colors: Readonly<Record<string, string>>, value: string): string | undefined {
	const def = findStatus(defs, value);
	if (!def) return undefined;
	return colors[def.name] ?? CATEGORY_COLORS[def.category];
}

/** ステータスの名前を変えたとき、選んだ色も新しい名前に付け替える */
export function renameStatusColor(colors: Readonly<Record<string, string>>, from: string, to: string): Record<string, string> {
	const next = { ...colors };
	const color = next[from];
	if (color === undefined || from === to) return next;
	delete next[from];
	next[to] = color;
	return next;
}

/** 選んだ色を消す（分類の色に戻す） */
export function removeStatusColor(colors: Readonly<Record<string, string>>, name: string): Record<string, string> {
	const next = { ...colors };
	delete next[name];
	return next;
}
