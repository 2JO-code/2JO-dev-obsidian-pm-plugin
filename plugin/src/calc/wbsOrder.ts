import type { NoteId } from '../model';
import { compareNumeric } from './compare';

/** WBS 番号の表示・並び・振り直し（要件 3.5、設計書 11.17） */

/** 番号を持つもの（エピック・タスク） */
export interface Numbered {
	id: NoteId;
	wbs?: string;
}

/** 書き換える番号 */
export interface WbsChange {
	id: NoteId;
	wbs: string;
}

/** タスクの番号の表示。「エピックの WBS.連番」。連番が無ければ空 */
export function taskWbsLabel(epicWbs: string | undefined, taskWbs: string | undefined): string {
	if (!taskWbs) return '';
	return epicWbs ? `${epicWbs}.${taskWbs}` : taskWbs;
}

/** 番号順に並べる。番号の無いものは後ろに、元の順のまま */
export function sortByWbs<T>(items: readonly T[], wbsOf: (item: T) => string | undefined): T[] {
	const numbered = items.filter((i) => wbsOf(i)).sort((a, b) => compareNumeric(wbsOf(a) ?? '', wbsOf(b) ?? ''));
	return [...numbered, ...items.filter((i) => !wbsOf(i))];
}

/**
 * ドラッグで並べ替えた後の順。dragged を target の前（after=false）か後ろに置く。
 * どちらかが見つからないか、同じものなら undefined
 */
export function moveInOrder(ids: readonly NoteId[], dragged: NoteId, target: NoteId, after: boolean): NoteId[] | undefined {
	if (dragged === target || !ids.includes(dragged) || !ids.includes(target)) return undefined;
	const rest = ids.filter((id) => id !== dragged);
	const at = rest.indexOf(target) + (after ? 1 : 0);
	return [...rest.slice(0, at), dragged, ...rest.slice(at)];
}

/** 変わる番号だけを返す */
function changes(order: readonly Numbered[], numbers: readonly string[]): WbsChange[] {
	return order.flatMap((item, i) => {
		const wbs = numbers[i] ?? '';
		return wbs !== '' && wbs !== item.wbs ? [{ id: item.id, wbs }] : [];
	});
}

/** タスクの番号を、並べた順に 1, 2, 3… と振り直す */
export function renumberTasks(order: readonly Numbered[]): WbsChange[] {
	return changes(
		order,
		order.map((_, i) => String(i + 1)),
	);
}

/** 番号の末尾の数を1つ進める（1.9 → 1.10）。末尾が数でなければ「.1」を足す */
export function nextWbs(wbs: string): string {
	const m = /^(.*?)(\d+)$/.exec(wbs);
	return m ? `${m[1] ?? ''}${Number(m[2]) + 1}` : `${wbs}.1`;
}

/**
 * エピックの番号を、今使っている番号の組のまま並べた順に配り直す（1.2 のような番号を崩さないため）。
 * 番号が足りなければ、最後の番号の続きを足す
 */
export function renumberEpics(order: readonly Numbered[]): WbsChange[] {
	const used = [...new Set(order.map((e) => e.wbs ?? '').filter((w) => w !== ''))].sort(compareNumeric);
	const taken = new Set(used);
	let last = used[used.length - 1] ?? '0';
	while (used.length < order.length) {
		do last = nextWbs(last);
		while (taken.has(last));
		taken.add(last);
		used.push(last);
	}
	return changes(order, used);
}

/** 新しいタスクの番号：同じエピックのタスクの最大の連番＋1 */
export function nextTaskWbs(siblings: readonly { wbs?: string }[]): string {
	const max = siblings.reduce((m, t) => {
		const n = Number(t.wbs);
		return Number.isInteger(n) && n > m ? n : m;
	}, 0);
	return String(max + 1);
}

/**
 * プロジェクト・エピック（無しは undefined か空文字）のタスクの続きの番号
 * @param exceptId 番号を付けるタスク自身（フォームで直すとき）。数えない
 */
export function nextTaskWbsIn(
	tasks: readonly { id: NoteId; project: NoteId; epic?: NoteId; wbs?: string }[],
	project: NoteId,
	epic: NoteId | undefined,
	exceptId?: NoteId,
): string {
	const group = epic || undefined;
	return nextTaskWbs(tasks.filter((t) => t.id !== exceptId && t.project === project && t.epic === group));
}
