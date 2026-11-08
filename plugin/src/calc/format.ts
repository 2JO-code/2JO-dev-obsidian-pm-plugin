import type { CalcContext } from './context';
import type { CountProgress, TaskProgress } from './progress';
import { WARNING_LABELS, type Warning, type WarningKind } from './warnings';
import type { Member, NoteId, NoteType, SubtaskCount } from '../model';
import { parseLinkId } from '../parse/values';

/** 選択肢に無い値の表示名。ID なら「見つかりません」、読めない値なら「読めません」 */
export const missingLabel = (value: string, type: NoteType): string =>
	`${value}（${parseLinkId(value, type) === value ? '見つかりません' : '読めません'}）`;

/** ノートのタイトル（見つからなければID） */
export function noteTitle(ctx: CalcContext, id: NoteId): string {
	const note = ctx.index.get(id);
	return note && 'title' in note ? note.title : id;
}

/** ID のメンバー（見つからない・空は除く）。個人休日の印に使う */
export function membersOf(ctx: CalcContext, ...ids: (NoteId | undefined)[]): Member[] {
	return ids.flatMap((id) => {
		const note = id ? ctx.index.get(id) : undefined;
		return note?.type === 'user' ? [note] : [];
	});
}

/** 進捗率（対象が無ければ「—」） */
export const pct = (p: CountProgress) => (p.ratio === null ? '—' : `${Math.round(p.ratio * 100)}%`);

/** 進捗率の件数（例：（54/316））。対象が無ければ空 */
export const countText = (p: CountProgress) => (p.ratio === null ? '' : `（${p.done}/${p.total}）`);

/** 進捗率と件数（例：17%（54/316）） */
export const progressDetail = (p: CountProgress) => `${pct(p)}${countText(p)}`;

/** 負荷率などの割合（null なら「—」） */
export const rateText = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)}%`);

/** タスク1件の進捗（完了なら「完了」、それ以外はチェックリストの割合と件数。例：50%（1/2）） */
export const subtaskText = (p: TaskProgress, subtasks: SubtaskCount) =>
	p.done ? '完了' : p.subtaskRatio === null ? '—' : `${rateText(p.subtaskRatio)}（${subtasks.done}/${subtasks.total}）`;

/** 時間（3けた区切り、小数は2けたまで。例：8,123.5）。値が無ければ「—」（設計書 9.1） */
export const hoursText = (h: number | undefined) => (h === undefined ? '—' : h.toLocaleString('ja-JP', { maximumFractionDigits: 2 }));

/** マスに出す時間。0 は空、ほかは hoursText と同じ */
export const cellHoursText = (h: number) => (h === 0 ? '' : hoursText(h));

/** 警告の種類の並び（重いものから。印・件数の表示に使う） */
export const WARNING_ORDER: readonly WarningKind[] = ['overdue', 'overdueRisk', 'overEstimate', 'overAllocation', 'loadWarning', 'loadCaution', 'holidayWork'];

/** 警告を種類ごとに数える（重いものから） */
export function warningCounts(warnings: readonly Warning[]): [WarningKind, number][] {
	const counts = new Map<WarningKind, number>();
	for (const w of warnings) counts.set(w.kind, (counts.get(w.kind) ?? 0) + 1);
	return WARNING_ORDER.filter((k) => counts.has(k)).map((k) => [k, counts.get(k) ?? 0]);
}

/** 警告を種類ごとの件数にする（例：期限超過 2・工数超過 1） */
export function warningSummary(warnings: readonly Warning[]): string {
	return warningCounts(warnings)
		.map(([kind, n]) => `${WARNING_LABELS[kind]} ${n}`)
		.join('・');
}
