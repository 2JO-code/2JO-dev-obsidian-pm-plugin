import { gridHoursOf, gridKey, gridKeyDates, tasksWithHours, type GridHours, type GridMode } from '../calc/worklogCells';
import type { IsoDate, NoteId, Worklog } from '../model';
import { cellEdited, cellHours, gridChanges, savedInIndex, type GridChange } from './worklogGrid';

/**
 * 作業ログの入力画面の、保存前と保存済みの値（設計書 4.3）。
 * メンバーごとに持ち、期間・メンバーを替えても残す
 */
export class WorklogGridDraft {
	/** 入力したマス */
	private readonly edits = new Map<NoteId, Map<string, GridHours>>();
	/** 保存したが索引にまだ載っていないマス。載ったら消す */
	private readonly saved = new Map<NoteId, Map<string, GridHours>>();

	/** @param worklogs 保存後も最新を見られるよう毎回取り出す */
	constructor(private readonly worklogs: () => readonly Worklog[]) {}

	private mapOf(store: Map<NoteId, Map<string, GridHours>>, member: NoteId): Map<string, GridHours> {
		let map = store.get(member);
		if (!map) {
			map = new Map();
			store.set(member, map);
		}
		return map;
	}

	/** 記録の値。保存して索引にまだ載っていない値を上に重ねる */
	baseOf(member: NoteId, dates: readonly IsoDate[]): Map<string, GridHours> {
		const base = gridHoursOf(this.worklogs(), member, dates);
		for (const [key, h] of this.saved.get(member) ?? []) base.set(key, h);
		return base;
	}

	/** マスの今の値。入力していればその値、無ければ base の値 */
	hours(member: NoteId, key: string, base: ReadonlyMap<string, GridHours>): GridHours {
		return cellHours(key, this.edits.get(member) ?? new Map(), base);
	}

	/** マスの予定か実績を入れる。もう片方は今の値のまま */
	set(member: NoteId, key: string, mode: GridMode, value: string, base: ReadonlyMap<string, GridHours>): void {
		const edits = this.mapOf(this.edits, member);
		edits.set(key, { ...cellHours(key, edits, base), [mode]: value });
	}

	/** マスの予定か実績を、記録から変えたか（保存前の変更） */
	edited(member: NoteId, key: string, mode: GridMode, base: ReadonlyMap<string, GridHours>): boolean {
		return cellEdited(key, mode, this.edits.get(member) ?? new Map(), base);
	}

	/** 入力したマスのタスク */
	editedTasks(member: NoteId): NoteId[] {
		return tasksWithHours(this.edits.get(member) ?? new Map());
	}

	/** 保存していないマスの変更（全メンバー・全期間）。変更の無いメンバーも出す */
	changes(): { member: NoteId; changes: GridChange[] }[] {
		return [...this.edits].map(([member, edits]) => ({ member, changes: gridChanges(edits, this.baseOf(member, gridKeyDates(edits.keys()))) }));
	}

	/** 保存していないマスの数 */
	dirtyCount(): number {
		return this.changes().reduce((n, c) => n + c.changes.length, 0);
	}

	/** 書けたマスを入力から外し、索引に載るまで重ねて出す */
	markSaved(member: NoteId, changes: readonly GridChange[]): void {
		const edits = this.mapOf(this.edits, member);
		const saved = this.mapOf(this.saved, member);
		for (const c of changes) {
			const key = gridKey(c.date, c.task);
			edits.delete(key);
			saved.set(key, { planned: c.planned, actual: c.actual });
		}
	}

	/** 索引に同じ値が載った、保存済みのマスを片付ける */
	pruneSaved(): void {
		for (const [member, saved] of this.saved) {
			const index = gridHoursOf(this.worklogs(), member, gridKeyDates(saved.keys()));
			for (const key of savedInIndex(saved, index)) saved.delete(key);
		}
	}
}
