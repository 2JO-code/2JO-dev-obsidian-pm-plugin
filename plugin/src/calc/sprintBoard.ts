import { findStatus, isFinished } from '../config/status';
import type { IsoDate, NoteId, Sprint, StatusDef, Task } from '../model';
import { compareNumeric } from './compare';
import { monthDayText } from './dates';
import type { TaskRow } from './taskList';

/** スプリントの状態。期間から計算する（ファイルに持たない。設計書 11.24） */
export type SprintPhase = 'planned' | 'active' | 'done';

export const SPRINT_PHASE_LABELS: Record<SprintPhase, string> = { planned: '開始前', active: '進行中', done: '終了' };

/** 状態。開始日・終了日のどちらかが無ければ undefined */
export function sprintPhase(sprint: Pick<Sprint, 'start' | 'end'>, today: IsoDate): SprintPhase | undefined {
	const { start, end } = sprint;
	if (!start || !end) return undefined;
	if (today < start) return 'planned';
	return today > end ? 'done' : 'active';
}

/** 期間の短い表示（例：11/4〜11/15） */
export function sprintPeriodText(sprint: Pick<Sprint, 'start' | 'end'>): string {
	const { start, end } = sprint;
	if (!start && !end) return '期間なし';
	return `${start ? monthDayText(start) : '?'}〜${end ? monthDayText(end) : '?'}`;
}

/** スプリントを開始日の順に並べる（開始日の無いものは最後、同じなら名前の順） */
export function sortSprints(sprints: readonly Sprint[]): Sprint[] {
	return [...sprints].sort((a, b) => {
		if (a.start !== b.start) {
			if (!a.start) return 1;
			if (!b.start) return -1;
			return a.start.localeCompare(b.start);
		}
		return compareNumeric(a.title, b.title);
	});
}

/** 「未割り当て」の列の ID */
export const BACKLOG = '';

export interface SprintColumn {
	/** スプリントの ID。未割り当ての列は BACKLOG */
	id: NoteId;
	sprint?: Sprint;
	phase?: SprintPhase;
	rows: TaskRow[];
	/** 段の数（sprintBoardRows が、いちばん段の多い行に合わせて決める） */
	laneCount: number;
	/** 見積工数の合計(h)。停止系は除く */
	estimate: number;
	/** 完了系の件数 */
	done: number;
	/** 完了の割合の分母（停止系を除いた件数） */
	counted: number;
	/** 初めからたたむか（終わったスプリント） */
	collapsedByDefault: boolean;
}

/**
 * スプリントのビューの列（設計書 11.24）。左から未割り当て、スプリント（開始日の順）。
 * タスクが無くても列を出す。プロジェクトのスプリントに無いリンクのタスクは未割り当てに入れる
 * @param sprints そのプロジェクトのスプリント
 */
export function sprintColumns(rows: readonly TaskRow[], sprints: readonly Sprint[], today: IsoDate): SprintColumn[] {
	const column = (id: NoteId, sprint?: Sprint): SprintColumn => {
		const phase = sprint ? sprintPhase(sprint, today) : undefined;
		return {
			id,
			...(sprint ? { sprint } : {}),
			...(phase ? { phase } : {}),
			rows: [],
			laneCount: 1,
			estimate: 0,
			done: 0,
			counted: 0,
			collapsedByDefault: phase === 'done',
		};
	};
	const backlog = column(BACKLOG);
	const columns = [backlog, ...sortSprints(sprints).map((s) => column(s.id, s))];
	const byId = new Map(columns.map((c) => [c.id, c]));
	for (const r of rows) {
		const col = (r.task.sprint ? byId.get(r.task.sprint) : undefined) ?? backlog;
		col.rows.push(r);
		if (r.category === 'stopped') continue;
		col.counted++;
		if (r.category === 'done') col.done++;
		col.estimate += r.task.estimate ?? 0;
	}
	return columns;
}

/** ボードの1行（全部の列をまたぐ） */
export interface SprintBoardRow {
	/** 依存でつながったまとまりか。false はつながりの無いタスクの行 */
	linked: boolean;
	/** 列ごとの段（columns と同じ順）。カードの無い列は空の段1つ */
	cells: TaskRow[][][];
}

/**
 * ボードの行（設計書 11.24）。スプリントをまたいで依存でつながったまとまりを1行にし、
 * 線がほかの行のカードを通らないようにする。つながりの無いタスクは最後の1行。
 * 行の中の列は、同じ列の先行タスクより右の段に置く（未割り当ても同じ）。列の段の数もここで決める
 */
export function sprintBoardRows(columns: SprintColumn[]): SprintBoardRow[] {
	const columnOf = new Map<NoteId, number>();
	columns.forEach((c, i) => c.rows.forEach((r) => columnOf.set(r.task.id, i)));
	const { linked, alone } = dependencyGroups(columns.flatMap((c) => c.rows));
	const row = (rows: readonly TaskRow[], isLinked: boolean): SprintBoardRow => ({
		linked: isLinked,
		cells: columns.map((_, i) => dependencyLanes(rows.filter((r) => columnOf.get(r.task.id) === i))),
	});
	const rows = linked.map((g) => row(g, true));
	if (alone.length > 0 || rows.length === 0) rows.push(row(alone, false));
	columns.forEach((c, i) => (c.laneCount = Math.max(1, ...rows.map((r) => r.cells[i]?.length ?? 1))));
	return rows;
}

/**
 * 依存でつながったまとまりに分ける（設計書 11.24）。まとまりは最初のタスクの並びの順。
 * どれともつながらないタスクは alone にまとめる。rows に無い先行タスクは見ない
 */
export function dependencyGroups(rows: readonly TaskRow[]): { linked: TaskRow[][]; alone: TaskRow[] } {
	const ids = new Set(rows.map((r) => r.task.id));
	const parent = new Map<NoteId, NoteId>();
	const root = (id: NoteId): NoteId => {
		let r = id;
		while (parent.has(r) && parent.get(r) !== r) r = parent.get(r) ?? r;
		return r;
	};
	const linked = new Set<NoteId>();
	for (const r of rows) {
		for (const pred of r.task.dependsOn) {
			if (pred === r.task.id || !ids.has(pred)) continue;
			linked.add(pred).add(r.task.id);
			const a = root(pred);
			const b = root(r.task.id);
			if (a !== b) parent.set(b, a);
		}
	}
	const groups = new Map<NoteId, TaskRow[]>();
	const alone: TaskRow[] = [];
	for (const r of rows) {
		if (!linked.has(r.task.id)) {
			alone.push(r);
			continue;
		}
		const key = root(r.task.id);
		const group = groups.get(key);
		if (group) group.push(r);
		else groups.set(key, [r]);
	}
	return { linked: [...groups.values()], alone };
}

/**
 * 同じ列の中の依存で段に分ける（設計書 11.24）。先行タスクが列の中に無ければ1段目、
 * あれば先行タスクのいちばん右の段の次。段の中は rows の並びのまま。循環は先にたどった側で止める
 */
export function dependencyLanes(rows: readonly TaskRow[]): TaskRow[][] {
	const byId = new Map(rows.map((r) => [r.task.id, r]));
	const levels = new Map<NoteId, number>();
	const visiting = new Set<NoteId>();
	const level = (id: NoteId): number => {
		const known = levels.get(id);
		if (known !== undefined) return known;
		if (visiting.has(id)) return -1;
		visiting.add(id);
		let n = 0;
		for (const pred of byId.get(id)?.task.dependsOn ?? []) {
			if (pred !== id && byId.has(pred)) n = Math.max(n, level(pred) + 1);
		}
		visiting.delete(id);
		levels.set(id, n);
		return n;
	};
	const lanes: TaskRow[][] = [];
	for (const r of rows) (lanes[level(r.task.id)] ??= []).push(r);
	// 先行タスクの無い段は作らない（循環で飛んだ番号を詰める）
	const packed = lanes.filter((lane) => lane !== undefined);
	return packed.length > 0 ? packed : [[]];
}

/** スプリントの並び（未割り当ては最後とみなす）。先行タスクの順番の確かめに使う */
export function sprintRanks(sprints: readonly Sprint[]): (sprint: NoteId | undefined) => number {
	const ranks = new Map(sortSprints(sprints).map((s, i) => [s.id, i]));
	return (sprint) => (sprint === undefined ? Infinity : (ranks.get(sprint) ?? Infinity));
}

/** 依存の線（先行 → 後続） */
export interface SprintLink {
	from: NoteId;
	to: NoteId;
	/** 先行が後のスプリントか未割り当てにある（順番違い） */
	reversed: boolean;
}

/** カードごとの、線を引いた先行・後続の数 */
export function linkCounts(links: readonly SprintLink[]): Map<NoteId, { pred: number; succ: number }> {
	const counts = new Map<NoteId, { pred: number; succ: number }>();
	const of = (id: NoteId) => {
		let c = counts.get(id);
		if (!c) counts.set(id, (c = { pred: 0, succ: 0 }));
		return c;
	};
	for (const l of links) {
		of(l.to).pred++;
		of(l.from).succ++;
	}
	return counts;
}

/** カードの印と警告 */
export interface SprintCardNotes {
	/** 警告の文（期限日がスプリントの期間の外、先行タスクの順番違い） */
	warnings: string[];
	/** 別のプロジェクトの先行タスクの数（線を引かず印だけ） */
	external: number;
}

const finished = (task: Task, statuses: readonly StatusDef[]) => isFinished(findStatus(statuses, task.status)?.category);

/**
 * スプリントのビューの依存の線と、カードの警告（要件 4.17、設計書 11.24）。
 * 完了系・停止系のタスク（先行・後続のどちらか）は順番違いにしない
 * @param tasks 出すタスク
 * @param taskOf 先行タスクを引く（アーカイブ内も含む）
 * @param sprints そのプロジェクトのスプリント
 */
export function sprintBoardLinks(
	tasks: readonly Task[],
	taskOf: (id: NoteId) => Task | undefined,
	sprints: readonly Sprint[],
	statuses: readonly StatusDef[],
): { links: SprintLink[]; notes: Map<NoteId, SprintCardNotes> } {
	const rank = sprintRanks(sprints);
	const sprintById = new Map(sprints.map((s) => [s.id, s]));
	const shown = new Set(tasks.map((t) => t.id));
	const links: SprintLink[] = [];
	const notes = new Map<NoteId, SprintCardNotes>();
	for (const task of tasks) {
		const warnings: string[] = [];
		let external = 0;
		const done = finished(task, statuses);
		const own = task.sprint ? sprintById.get(task.sprint) : undefined;
		if (!done && own && task.due) {
			if (own.start && task.due < own.start) warnings.push(`期限日（${task.due}）がスプリントの開始日（${own.start}）より前です`);
			else if (own.end && task.due > own.end) warnings.push(`期限日（${task.due}）がスプリントの終了日（${own.end}）より後です`);
		}
		const ownRank = rank(own?.id);
		for (const id of task.dependsOn) {
			const pred = taskOf(id);
			if (!pred) continue;
			if (pred.project !== task.project) {
				external++;
				continue;
			}
			const predRank = rank(pred.sprint !== undefined && sprintById.has(pred.sprint) ? pred.sprint : undefined);
			const reversed = !done && !finished(pred, statuses) && predRank > ownRank;
			if (reversed) {
				const where = predRank === Infinity ? '未割り当て' : '後のスプリント';
				warnings.push(`先行タスク「${pred.title}」が${where}にあります`);
			}
			if (shown.has(pred.id)) links.push({ from: pred.id, to: task.id, reversed });
		}
		if (warnings.length > 0 || external > 0) notes.set(task.id, { warnings, external });
	}
	return { links, notes };
}

/**
 * カードを列へ動かしたときに書く `sprint` の値（要件 4.17）。同じ列なら null。
 * 未割り当ての列へは、キーを空の枠にする（null）
 */
export function sprintMove(from: NoteId, to: NoteId): { sprint: NoteId | null } | null {
	if (from === to) return null;
	return { sprint: to === BACKLOG ? null : to };
}
