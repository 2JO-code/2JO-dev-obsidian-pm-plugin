import { addDays } from '../calc/dates';
import { bodyStartLine, checklistLines } from '../forms/checklist';
import { newNoteId, type IdKind } from '../id';
import type { Epic, IsoDate, NoteId, Project, StatusSets, Task } from '../model';
import { isIsoDate } from '../parse/values';
import { TABLE_SPEC } from '../parse/bodyTables';
import type { FolderSettings } from '../settings';
import type { WorkCalendar } from '../calc/workdays';
import { toLink, type FrontmatterUpdate } from '../write/frontmatter';
import { emptyTable, tableCell, tableLink, tableRow } from '../write/markdownTable';
import { planNewNote, type NewNotePlan } from './newNote';

/** 複製するときの日付の扱い：開始日に合わせて稼働日でずらす／空にする */
export type CopyDates = { mode: 'shift'; start: IsoDate } | { mode: 'clear' };

/** 複製の画面で入力する内容 */
export interface ProjectCopyInput {
	title: string;
	caseId: string;
	officialName: string;
	dates: CopyDates;
}

/** 複製の元：プロジェクトと、その中のエピック・タスク。bodies はノートの全文（ID ごと） */
export interface ProjectCopySource {
	project: Project;
	epics: readonly Epic[];
	tasks: readonly Task[];
	bodies: ReadonlyMap<NoteId, string>;
}

/** 作る順（プロジェクト → エピック → タスク）に並べたノート */
export interface ProjectCopyNote extends NewNotePlan {
	kind: IdKind;
	title: string;
}

/**
 * 元のプロジェクトを写した、新しいノートの一式を決める（設計書 4.4）
 * 担当者・工数配分・作業ログは写さず、ステータスは最初のものにする
 */
export function planProjectCopy(
	input: ProjectCopyInput,
	src: ProjectCopySource,
	statuses: StatusSets,
	folders: FolderSettings,
	calendar: WorkCalendar,
	exists: (id: NoteId) => boolean,
	generateId: (kind: IdKind, exists: (id: NoteId) => boolean) => NoteId = newNoteId,
): ProjectCopyNote[] {
	if (input.dates.mode === 'shift' && !isIsoDate(input.dates.start)) throw new Error('新しいプロジェクトの開始日を入力してください');
	const epics = src.epics.filter((e) => e.project === src.project.id);
	const tasks = src.tasks.filter((t) => t.project === src.project.id);
	const date = dateMapper(input.dates, src.project, epics, tasks, calendar);

	// 一式の中でも ID が重ならないようにする
	const made = new Set<NoteId>();
	const taken = (id: NoteId) => made.has(id) || exists(id);
	const nextId = (kind: IdKind, e: (id: NoteId) => boolean) => {
		const id = generateId(kind, e);
		made.add(id);
		return id;
	};
	const notes: ProjectCopyNote[] = [];

	const project = planNewNote({ kind: 'project', title: input.title, caseId: input.caseId, officialName: input.officialName }, statuses, folders, taken, nextId);
	const projectNote: ProjectCopyNote = { ...project, kind: 'project', title: input.title.trim() };
	notes.push(projectNote);

	const epicIds = new Map<NoteId, NoteId>();
	for (const epic of epics) {
		const plan = planNewNote({ kind: 'epic', title: epic.title, project: project.id, wbs: epic.wbs ?? '' }, statuses, folders, taken, nextId);
		epicIds.set(epic.id, plan.id);
		Object.assign(plan.frontmatter, dateFields({ start: epic.start, due: epic.due }, date));
		if (epic.inputs.length > 0) plan.frontmatter.inputs = [...epic.inputs];
		if (epic.outputs.length > 0) plan.frontmatter.outputs = [...epic.outputs];
		notes.push({ ...plan, body: copyBody(src.bodies.get(epic.id)), kind: 'epic', title: epic.title });
	}

	// 先行タスクをつなぎ直すため、先に ID を決める
	const taskIds = new Map<NoteId, NoteId>();
	const taskPlans = tasks.map((task) => {
		const epic = task.epic ? epicIds.get(task.epic) : undefined;
		const plan = planNewNote(
			{ kind: 'task', title: task.title, project: project.id, ...(epic ? { epic } : {}), ...(task.wbs ? { wbs: task.wbs } : {}) },
			statuses,
			folders,
			taken,
			nextId,
		);
		taskIds.set(task.id, plan.id);
		return { task, plan };
	});
	for (const { task, plan } of taskPlans) {
		const fm = plan.frontmatter;
		Object.assign(fm, dateFields({ start: task.start, due: task.due, plan_start: task.planStart, plan_end: task.planEnd }, date));
		if (task.estimate !== undefined) fm.estimate = task.estimate;
		// 元のプロジェクトの外の先行タスクは写さない
		const deps = task.dependsOn.flatMap((id) => {
			const to = taskIds.get(id);
			return to ? [toLink(to)] : [];
		});
		if (deps.length > 0) fm.depends_on = deps;
		notes.push({ ...plan, body: copyBody(src.bodies.get(task.id)), kind: 'task', title: task.title });
	}

	// プロジェクトの本文は、エピックの新しい ID が決まってから作る
	Object.assign(project.frontmatter, dateFields({ start: src.project.start, due: src.project.due }, date));
	if (input.dates.mode === 'shift') project.frontmatter.start = input.dates.start;
	projectNote.body = projectBody(src.project, date, epicIds, epics);
	return notes;
}

/** 元の日付を新しい日付にする。空にするときは undefined */
type DateMapper = (d: IsoDate) => IsoDate | undefined;

/**
 * 稼働日でずらす（設計書 4.4）。元の基準日から n 稼働日目の日を、新しい開始日から n 稼働日目にする
 * 基準日は元のプロジェクトの開始日。無ければ元の中で最も早い日付
 */
function dateMapper(dates: CopyDates, project: Project, epics: readonly Epic[], tasks: readonly Task[], cal: WorkCalendar): DateMapper {
	if (dates.mode === 'clear') return () => undefined;
	const all = [
		project.due,
		...project.milestones.map((m) => m.date),
		...epics.flatMap((e) => [e.start, e.due]),
		...tasks.flatMap((t) => [t.start, t.due, t.planStart, t.planEnd]),
	].filter((d): d is IsoDate => d !== undefined);
	const origin = project.start ?? [...all].sort()[0];
	if (!origin) return () => undefined;
	const from = cal.workdayOnOrAfter(origin);
	const to = cal.workdayOnOrAfter(dates.start);
	return (d) => {
		// 基準日より後は「その日までの稼働日数 − 1」、前は「前日までの稼働日数」を負にする
		const n = d >= from ? cal.countWorkdays(from, d) - 1 : -cal.countWorkdays(d, addDays(from, -1));
		return cal.addWorkdays(to, n);
	};
}

/** 日付の項目を写す。元が空、または空にするときは書かない（空の枠のまま） */
function dateFields(fields: Record<string, IsoDate | undefined>, date: DateMapper): FrontmatterUpdate {
	const out: FrontmatterUpdate = {};
	for (const [key, value] of Object.entries(fields)) {
		const mapped = value === undefined ? undefined : date(value);
		if (mapped !== undefined) out[key] = mapped;
	}
	return out;
}

/** 本文を写す。frontmatter は除き、チェックリストのチェックを外す */
export function copyBody(content: string | undefined): string {
	if (!content) return '';
	const lines = content.replace(/\r\n?/g, '\n').split('\n');
	const start = bodyStartLine(lines);
	for (const item of checklistLines(lines)) {
		if (item.mark !== ' ') lines[item.line] = `${item.prefix}[ ]${item.raw.slice(item.prefix.length + 3)}`;
	}
	const body = lines.slice(start).join('\n').replace(/^\n+/, '').trimEnd();
	return body === '' ? '' : `${body}\n`;
}

/** 新しいプロジェクトの本文：ずらしたマイルストーンと、空の工数配分の表 */
function projectBody(project: Project, date: DateMapper, epicIds: ReadonlyMap<NoteId, NoteId>, epics: readonly Epic[]): string {
	const rows = project.milestones.flatMap((m) => {
		const d = date(m.date);
		if (d === undefined) return [];
		const epic = m.epic ? epicIds.get(m.epic) : undefined;
		const title = epics.find((e) => e.id === m.epic)?.title ?? '';
		return [tableRow([tableCell(m.name), d, epic ? tableLink(epic, title) : ''])];
	});
	const milestones = [emptyTable(TABLE_SPEC.milestones), ...rows].join('\n');
	return `${milestones}\n\n${emptyTable(TABLE_SPEC.allocations)}\n`;
}
