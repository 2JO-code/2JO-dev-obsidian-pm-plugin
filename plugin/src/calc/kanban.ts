import type { StatusCategory, StatusDef } from '../model';
import type { TaskRow } from './taskList';

export interface KanbanColumn {
	/** ステータス名。設定に無いステータスをまとめた列は空文字 */
	name: string;
	category?: StatusCategory;
	rows: TaskRow[];
	/** 初めからたたむか（完了系・停止系） */
	collapsedByDefault: boolean;
}

/** 「設定に無いステータス」の列の名前 */
export const UNKNOWN_COLUMN = '';

/**
 * カンバンの列（要件4.8b、設計書 11.11）。列は設定の並び順で、タスクが無くても出す。
 * 設定に無いステータスのタスクは最後の1列にまとめる（あるときだけ）。列の中は rows の並びのまま
 */
export function kanbanColumns(rows: readonly TaskRow[], statuses: readonly StatusDef[]): KanbanColumn[] {
	const columns: KanbanColumn[] = statuses.map((s) => ({
		name: s.name,
		category: s.category,
		rows: [],
		collapsedByDefault: s.category === 'done' || s.category === 'stopped',
	}));
	const byName = new Map(columns.map((c) => [c.name, c]));
	const unknown: KanbanColumn = { name: UNKNOWN_COLUMN, rows: [], collapsedByDefault: false };
	// row.status は旧名を現在の名前にそろえたもの
	for (const r of rows) (byName.get(r.status) ?? unknown).rows.push(r);
	return unknown.rows.length > 0 ? [...columns, unknown] : columns;
}

/** ドラッグ中のカードの中身 */
export interface DraggedCard {
	path: string;
	title: string;
	/** 今の列（旧名は現在の名前にそろえたもの） */
	from: string;
}

/** ドロップで受け取った文字列をカードに戻す。形が違えば undefined（規約4章） */
export function parseDraggedCard(raw: string): DraggedCard | undefined {
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (typeof data !== 'object' || data === null) return undefined;
	const { path, title, from } = data as Record<string, unknown>;
	if (typeof path !== 'string' || path === '' || typeof title !== 'string' || typeof from !== 'string') return undefined;
	return { path, title, from };
}

/**
 * カードを列へ動かしたときに書くステータス（要件4.8c、設計書 11.11）。
 * 同じ列なら何もしない（null）。「設定に無いステータス」の列・設定に無い名前へは動かせない
 * @param from カードの今の列（旧名は現在の名前にそろえたもの）
 */
export function statusMove(from: string, to: string, statuses: readonly StatusDef[]): { status: string } | { error: string } | null {
	if (from === to) return null;
	if (to === UNKNOWN_COLUMN || !statuses.some((s) => s.name === to)) return { error: '「設定に無いステータス」の列には動かせません' };
	return { status: to };
}
