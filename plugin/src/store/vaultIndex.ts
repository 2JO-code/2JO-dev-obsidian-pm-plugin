import type { UsageCounter } from '../config/impact';
import type { Epic, IsoDate, Member, NoteId, NoteType, Project, StatusSets, Task, Worklog } from '../model';
import type { AnyNote, NoteProblem, NoteRecord } from './buildNote';

/** Vault 全体のノートの索引。パスとIDで引ける。計算結果は持たない（設計書 1.3） */
export class VaultIndex implements UsageCounter {
	private byPath = new Map<string, NoteRecord>();
	/** 同じIDのファイルが複数あり得るので集合で持つ */
	private pathsById = new Map<NoteId, Set<string>>();
	/** 中身が変わるたびに増える番号。計算結果を使い回すかの判定に使う（設計書 11章） */
	private changes = 0;
	/** 種類ごとの一覧。中身が変わったら作り直す（設計書 3.5） */
	private lists?: { version: number; all: Map<NoteType, AnyNote[]>; active: Map<NoteType, AnyNote[]> };

	get size(): number {
		return this.byPath.size;
	}

	get version(): number {
		return this.changes;
	}

	clear(): void {
		this.changes++;
		this.byPath.clear();
		this.pathsById.clear();
	}

	set(record: NoteRecord): void {
		this.changes++;
		this.delete(record.path);
		this.byPath.set(record.path, record);
		const paths = this.pathsById.get(record.id) ?? new Set<string>();
		paths.add(record.path);
		this.pathsById.set(record.id, paths);
	}

	delete(path: string): void {
		const old = this.byPath.get(path);
		if (!old) return;
		this.changes++;
		this.byPath.delete(path);
		const paths = this.pathsById.get(old.id);
		paths?.delete(path);
		if (paths?.size === 0) this.pathsById.delete(old.id);
	}

	/** そのIDのファイルがあるか（読めないノートも含む） */
	hasId(id: NoteId): boolean {
		return this.pathsById.has(id);
	}

	getRecord(path: string): NoteRecord | undefined {
		return this.byPath.get(path);
	}

	/** IDからノートを引く。重複していれば最初のもの */
	get(id: NoteId): AnyNote | undefined {
		for (const path of this.pathsById.get(id) ?? []) {
			const note = this.byPath.get(path)?.note;
			if (note) return note;
		}
		return undefined;
	}

	/** IDのノートのタイトル。見つからない・タイトルの無い種類は空 */
	title(id: NoteId): string {
		const note = this.get(id);
		return note && 'title' in note ? note.title : '';
	}

	/** IDのファイルのパス（読めないノートも含む。重複していれば最初のもの） */
	pathOf(id: NoteId): string | undefined {
		return this.pathsById.get(id)?.values().next().value;
	}

	records(): NoteRecord[] {
		return [...this.byPath.values()];
	}

	projects(options?: ListOptions): readonly Project[] {
		return this.list('project', options);
	}

	epics(options?: ListOptions): readonly Epic[] {
		return this.list('epic', options);
	}

	tasks(options?: ListOptions): readonly Task[] {
		return this.list('task', options);
	}

	members(): readonly Member[] {
		return this.list('user', { includeArchived: true });
	}

	worklogs(): readonly Worklog[] {
		return this.list('worklog', { includeArchived: true });
	}

	/** 全ノートの問題と、IDの重複 */
	problems(): NoteProblem[] {
		const problems = this.records().flatMap((r) => r.problems);
		for (const [id, paths] of this.pathsById) {
			if (paths.size > 1) {
				for (const path of paths) problems.push({ path, message: `同じID（${id}）のファイルが${paths.size}つあります` });
			}
		}
		return problems;
	}

	countStatus(set: keyof StatusSets, names: string[]): number {
		const types = set === 'task' ? ['task', 'epic'] : ['project'];
		const targets = new Set(names);
		let count = 0;
		for (const { note } of this.byPath.values()) {
			if (note && types.includes(note.type) && 'status' in note && targets.has(note.status)) count++;
		}
		return count;
	}

	countWorklogEntriesOn(date: IsoDate): number {
		let count = 0;
		for (const log of this.worklogs()) {
			for (const e of log.entries) if (e.date === date && (e.planned > 0 || e.actual > 0)) count++;
		}
		return count;
	}

	private list<T extends AnyNote>(type: T['type'], options: ListOptions = {}): readonly T[] {
		const lists = this.groupedLists();
		const notes = (options.includeArchived ? lists.all : lists.active).get(type) ?? [];
		return notes as T[];
	}

	/** 全ノートを1回だけ見て、種類ごと（アーカイブ内を含む・含まない）に分ける */
	private groupedLists(): NonNullable<VaultIndex['lists']> {
		if (this.lists?.version === this.changes) return this.lists;
		const all = new Map<NoteType, AnyNote[]>();
		const active = new Map<NoteType, AnyNote[]>();
		const push = (map: Map<NoteType, AnyNote[]>, note: AnyNote): void => {
			const notes = map.get(note.type);
			if (notes) notes.push(note);
			else map.set(note.type, [note]);
		};
		for (const r of this.byPath.values()) {
			if (!r.note) continue;
			push(all, r.note);
			if (!r.archived) push(active, r.note);
		}
		this.lists = { version: this.changes, all, active };
		return this.lists;
	}
}

export interface ListOptions {
	/** アーカイブ内も含めるか（既定は含めない） */
	includeArchived?: boolean;
}
