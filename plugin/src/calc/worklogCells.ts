import { compareJa } from './compare';
import { addDays, eachDate, firstDayOf, lastDayOf, monthOfDate } from './dates';
import { missingLabel } from './format';
import { periodOf } from './workdays';
import { sortByWbs, taskWbsLabel } from './wbsOrder';
import type { Epic, IsoDate, NoteId, Task, Worklog, YearMonth } from '../model';
import { parseHours } from '../parse/values';

/** 作業ログのマス目（縦タスク×横日付）の値・期間・行の階層。入力画面とビューで使う（設計書 4.3, 9.10） */

/** マスの予定・実績(h)。入力のままの文字 */
export interface GridHours {
	planned: string;
	actual: string;
}

/** 入力している側 */
export type GridMode = keyof GridHours;

export const MODE_LABEL: Record<GridMode, string> = { planned: '予定', actual: '実績' };

/** 横に並べる期間の単位 */
export type GridUnit = 'week' | 'month';

/** 期間の単位の名前と、前・次・今の期間へ移るボタンの名前 */
export const UNIT_LABEL: Record<GridUnit, { name: string; prev: string; next: string; now: string }> = {
	week: { name: '1週間', prev: '前の週', next: '次の週', now: '今週' },
	month: { name: '1か月', prev: '前の月', next: '次の月', now: '今月' },
};

/** 保存されていた単位を読む。読めなければ1週間 */
export const parseGridUnit = (value: unknown): GridUnit => (value === 'month' ? 'month' : 'week');

/** その日を含む期間の最初の日（週は月曜、月は1日） */
export function periodStartOf(date: IsoDate, unit: GridUnit): IsoDate {
	return periodOf(date, unit).start;
}

/** 期間の日付（週は7日、月はその月の全日） */
export function periodDates(start: IsoDate, unit: GridUnit): IsoDate[] {
	const p = periodOf(start, unit);
	return [...eachDate(p.start, p.end)];
}

/** n 期間だけ進めた（負なら戻した）期間の最初の日 */
export function shiftPeriod(start: IsoDate, unit: GridUnit, n: number): IsoDate {
	let p = periodOf(start, unit);
	for (let i = 0; i < Math.abs(n); i++) p = periodOf(n > 0 ? addDays(p.end, 1) : addDays(p.start, -1), unit);
	return p.start;
}

/** 月の全日 */
export function monthDates(month: YearMonth): IsoDate[] {
	return [...eachDate(firstDayOf(month), lastDayOf(month))];
}

/** 日付の並びに出てくる月（順に、重ねない） */
export function monthsOf(dates: readonly IsoDate[]): YearMonth[] {
	return [...new Set(dates.map(monthOfDate))];
}

export const gridKey = (date: IsoDate, task: NoteId) => `${date} ${task}`;

/** マスのキーを日付とタスクに分ける（gridKey の逆） */
export function parseGridKey(key: string): { date: IsoDate; task: NoteId } {
	const space = key.indexOf(' ');
	return { date: key.slice(0, space), task: key.slice(space + 1) };
}

/** マスのキーに出てくる日付（重ねない） */
export function gridKeyDates(keys: Iterable<string>): IsoDate[] {
	return [...new Set([...keys].map((k) => parseGridKey(k).date))];
}

/** 時間の文字をそろえる。空と0は空、読める値は数値の形（`2.50` → `2.5`）、読めない値はそのまま */
export function normalizeHours(value: string): string {
	const text = value.trim();
	const hours = parseHours(text);
	if (hours === null) return text;
	return hours === 0 ? '' : String(hours);
}

/** 予定・実績が同じか（書き方の違い・0と空は同じ） */
export const sameHours = (a: GridHours, b: GridHours): boolean =>
	normalizeHours(a.planned) === normalizeHours(b.planned) && normalizeHours(a.actual) === normalizeHours(b.actual);

export const EMPTY_HOURS: GridHours = { planned: '', actual: '' };

/** メンバーの、日付ごと・タスクごとの予定・実績。同じ日付・タスクの行は合計する */
export function gridHoursOf(logs: readonly Worklog[], member: NoteId, dates: readonly IsoDate[]): Map<string, GridHours> {
	const months = new Set(dates.map(monthOfDate));
	const days = new Set(dates);
	const sums = new Map<string, { planned: number; actual: number }>();
	for (const log of logs) {
		if (log.member !== member || !months.has(log.month)) continue;
		for (const e of log.entries) {
			if (!days.has(e.date)) continue;
			const key = gridKey(e.date, e.task);
			const sum = sums.get(key) ?? { planned: 0, actual: 0 };
			sums.set(key, { planned: sum.planned + e.planned, actual: sum.actual + e.actual });
		}
	}
	const text = (h: number) => (h === 0 ? '' : String(h));
	return new Map([...sums].map(([key, s]) => [key, { planned: text(s.planned), actual: text(s.actual) }]));
}

/** その週に記録のあるタスク */
export function tasksWithHours(hours: ReadonlyMap<string, GridHours>): NoteId[] {
	const ids = [...hours].filter(([, h]) => h.planned !== '' || h.actual !== '').map(([key]) => parseGridKey(key).task);
	return [...new Set(ids)];
}

/** 行の階層を作るためのタスクの情報。見つからないタスクは undefined */
export interface GridTaskInfo {
	project: NoteId;
	projectLabel: string;
	/** 空はエピックなし */
	epic: NoteId;
	epicTitle: string;
	epicWbs?: string;
	title: string;
	wbs?: string;
}

/** タスクの、行の階層を作るための情報（入力フォームとビューで同じ。設計書 4.3） */
export function gridTaskInfo(
	t: Task | undefined,
	epicOf: (id: NoteId) => Pick<Epic, 'title' | 'wbs'> | undefined,
	projectName: (id: NoteId) => string,
): GridTaskInfo | undefined {
	if (!t) return undefined;
	const epic = t.epic ? epicOf(t.epic) : undefined;
	return {
		project: t.project,
		projectLabel: projectName(t.project) || missingLabel(t.project, 'project'),
		epic: t.epic ?? '',
		epicTitle: epic?.title ?? (t.epic ? missingLabel(t.epic, 'epic') : ''),
		...(epic?.wbs ? { epicWbs: epic.wbs } : {}),
		title: t.title,
		...(t.wbs ? { wbs: t.wbs } : {}),
	};
}

/** マス目の1行。プロジェクト・エピックの行は配下のタスクをまとめる（設計書 4.3） */
export interface GridLine {
	kind: 'project' | 'epic' | 'task';
	/** 開閉のキー（タスクの行はタスクの ID） */
	key: string;
	/** 0=プロジェクト、1=エピック、2=タスク */
	depth: number;
	/** 上の行（プロジェクト・エピック）のキー */
	parents: string[];
	label: string;
	/** WBS 番号（無ければ空） */
	wbs: string;
	/** 配下のタスク（タスクの行はそれ自身） */
	tasks: NoteId[];
}

const NO_PROJECT = '（見つからないタスク）';
const NO_EPIC = '（エピックなし）';

/** タスクを、プロジェクト → エピック → タスクの行に並べる（ガントと同じ順。設計書 9.8） */
export function gridLines(ids: readonly NoteId[], infoOfId: (id: NoteId) => GridTaskInfo | undefined): GridLine[] {
	// 並べ替えで何度も引くので、先に1回ずつ作っておく
	const infos = new Map(ids.map((id) => [id, infoOfId(id)]));
	const infoOf = (id: NoteId) => infos.get(id);
	type EpicGroup = { title: string; wbs?: string; tasks: NoteId[] };
	type ProjectGroup = { label: string; epics: Map<NoteId, EpicGroup> };
	const projects = new Map<NoteId, ProjectGroup>();
	for (const id of ids) {
		const info = infoOf(id);
		const pid = info?.project ?? '';
		const project: ProjectGroup = projects.get(pid) ?? { label: info?.projectLabel ?? NO_PROJECT, epics: new Map<NoteId, EpicGroup>() };
		projects.set(pid, project);
		const eid = info?.epic ?? '';
		const epic: EpicGroup = project.epics.get(eid) ?? { title: info?.epicTitle ?? '', ...(info?.epicWbs ? { wbs: info.epicWbs } : {}), tasks: [] };
		project.epics.set(eid, epic);
		epic.tasks.push(id);
	}

	const byLabel = <T>(items: T[], label: (x: T) => string) => [...items].sort((a, b) => compareJa(label(a), label(b)));
	const lines: GridLine[] = [];
	const projectList = [...byLabel([...projects].filter(([id]) => id), ([, p]) => p.label), ...[...projects].filter(([id]) => !id)];
	for (const [pid, project] of projectList) {
		const pKey = `p:${pid}`;
		const all = [...project.epics.values()].flatMap((e) => e.tasks);
		lines.push({ kind: 'project', key: pKey, depth: 0, parents: [], label: project.label, wbs: '', tasks: all });
		const named = sortByWbs(byLabel([...project.epics].filter(([id]) => id), ([, e]) => e.title), ([, e]) => e.wbs);
		const epics = [...named, ...[...project.epics].filter(([id]) => !id)];
		for (const [eid, epic] of epics) {
			// 見つからないタスクはエピックの行をはさまない
			const withEpic = pid !== '';
			const eKey = `e:${pid}:${eid}`;
			if (withEpic) {
				lines.push({ kind: 'epic', key: eKey, depth: 1, parents: [pKey], label: eid ? epic.title : NO_EPIC, wbs: epic.wbs ?? '', tasks: epic.tasks });
			}
			const tasks = sortByWbs(byLabel(epic.tasks, (id) => infoOf(id)?.title ?? id), (id) => infoOf(id)?.wbs);
			for (const id of tasks) {
				const info = infoOf(id);
				lines.push({
					kind: 'task',
					key: id,
					depth: withEpic ? 2 : 1,
					parents: withEpic ? [pKey, eKey] : [pKey],
					label: info?.title ?? id,
					wbs: taskWbsLabel(info?.epicWbs, info?.wbs),
					tasks: [id],
				});
			}
		}
	}
	return lines;
}

/** たたんだ行の配下を除いた、見える行 */
export function visibleGridLines<T extends Pick<GridLine, 'parents'>>(lines: readonly T[], collapsed: ReadonlySet<string>): T[] {
	return lines.filter((l) => !l.parents.some((k) => collapsed.has(k)));
}

/** 時間の合計。読めない値は数えない */
export function sumHours(values: readonly string[]): number {
	return values.reduce((s, v) => s + (parseHours(v) ?? 0), 0);
}

/** タスクの見積(h)の合計。見積のあるタスクが無ければ null（参考の表示。設計書 4.3） */
export function sumEstimates(tasks: readonly NoteId[], estimateOf: (id: NoteId) => number | undefined): number | null {
	const values = tasks.flatMap((id) => {
		const e = estimateOf(id);
		return e === undefined ? [] : [e];
	});
	return values.length === 0 ? null : values.reduce((s, e) => s + e, 0);
}

