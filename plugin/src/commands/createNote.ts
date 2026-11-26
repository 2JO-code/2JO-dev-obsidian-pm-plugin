import { Notice, normalizePath } from 'obsidian';
import { nextTaskWbsIn } from '../calc/wbsOrder';
import { localToday } from '../calc/dates';
import { emptySprintForm } from '../forms/sprintForm';
import { emptyTaskForm } from '../forms/taskForm';
import type { IdKind } from '../id';
import type ProjectManagerPlugin from '../main';
import type { NoteId } from '../model';
import { FOLDERS } from '../settings';
import { NewNoteModal } from '../ui/newNoteModal';
import { SprintFormModal } from '../ui/sprintFormModal';
import { TaskFormModal } from '../ui/taskFormModal';
import { createNoteFile } from '../write/frontmatterFile';
import type { FrontmatterUpdate } from '../write/frontmatter';
import { planNewNote, planNewNoteFromForm, planNewTaskFromForm, type NewNoteInput, type NewNotePlan } from './newNote';
import { storeReady } from './ready';
import { taskFormChoices } from './taskFormOptions';

const COMMANDS: { kind: IdKind; id: string; name: string }[] = [
	{ kind: 'project', id: 'create-project', name: '新しいプロジェクトを作成' },
	{ kind: 'epic', id: 'create-epic', name: '新しいエピックを作成' },
	{ kind: 'task', id: 'create-task', name: '新しいタスクを作成' },
	{ kind: 'user', id: 'create-member', name: '新しいメンバーを作成' },
	{ kind: 'sprint', id: 'create-sprint', name: '新しいスプリントを作成' },
];

/** ビューから作るときに最初から選んでおくプロジェクト・エピック */
export interface NewNoteInitial {
	project?: NoteId;
	epic?: NoteId;
}

/** ノート作成コマンドを登録する */
export function registerCreateCommands(plugin: ProjectManagerPlugin): void {
	for (const { kind, id, name } of COMMANDS) {
		plugin.addCommand({ id, name, callback: () => openNewNoteModal(plugin, kind) });
	}
}

/** 作成画面を開く。タスクはタスクのフォームで作る（設計書 4.4） */
export function openNewNoteModal(plugin: ProjectManagerPlugin, kind: IdKind, initial?: NewNoteInitial): void {
	const { index } = plugin.store;
	if (!storeReady(plugin)) return;
	const projects = index.projects();
	if ((kind === 'epic' || kind === 'task' || kind === 'sprint') && projects.length === 0) {
		new Notice('先にプロジェクトを作成してください');
		return;
	}
	if (kind === 'task') {
		openNewTaskForm(plugin, initial);
		return;
	}
	if (kind === 'sprint') {
		openNewSprintForm(plugin, initial);
		return;
	}
	new NewNoteModal(plugin.app, {
		kind,
		projects,
		displayName: plugin.personal.projectDisplayName,
		...(initial?.project ? { initialProject: initial.project } : {}),
		onSubmit: (input) => createNote(plugin, input),
	}).open();
}

/** 空のタスクのフォームを開く。選択肢に無いもの（アーカイブ内など）は選ばない */
function openNewTaskForm(plugin: ProjectManagerPlugin, initial?: NewNoteInitial): void {
	const choices = taskFormChoices(plugin);
	const { projects, epics, allTasks, statuses } = choices;
	const project = initial?.project && projects.some((p) => p.id === initial.project) ? initial.project : '';
	const epic = initial?.epic && epics.some((e) => e.id === initial.epic && e.project === project) ? initial.epic : '';
	// 同じエピックのタスクの続きの番号を付ける（設計書 11.17）
	const wbs = project ? nextTaskWbsIn(allTasks, project, epic) : '';
	new TaskFormModal(plugin.app, {
		target: { mode: 'create', create: (update, description) => createTask(plugin, update, description) },
		form: emptyTaskForm(statuses, project, epic, wbs),
		...choices,
	}).open();
}

/** 空のスプリントのフォームを開く。期間は最後のスプリントの続き */
function openNewSprintForm(plugin: ProjectManagerPlugin, initial?: NewNoteInitial): void {
	const { index } = plugin.store;
	const projects = index.projects();
	const project = initial?.project && projects.some((p) => p.id === initial.project) ? initial.project : '';
	const sprints = index.sprints({ includeArchived: true });
	const today = localToday();
	new SprintFormModal(plugin.app, {
		target: {
			mode: 'create',
			create: async (update) => {
				const plan = planNewNoteFromForm('sprint', update, '', FOLDERS, (id) => index.hasId(id));
				await writePlan(plugin, plan, 'sprint', typeof update.title === 'string' ? update.title : '');
			},
			suggest: (p) => emptySprintForm(p, sprints, today),
		},
		form: emptySprintForm(project, sprints, today),
		projects,
		sprints,
		displayName: plugin.personal.projectDisplayName,
	}).open();
}

/** タスクのフォームの値でノートを作る */
async function createTask(plugin: ProjectManagerPlugin, update: FrontmatterUpdate, description: string): Promise<void> {
	const plan = planNewTaskFromForm(update, description, FOLDERS, (id) => plugin.store.index.hasId(id));
	await writePlan(plugin, plan, 'task', typeof update.title === 'string' ? update.title : '');
}

/** ノートを作り、作ったことを通知する。ノートは開かない（設計書 4.4） */
async function createNote(plugin: ProjectManagerPlugin, input: NewNoteInput): Promise<void> {
	const plan = planNewNote(input, plugin.config.statuses, FOLDERS, (id) => plugin.store.index.hasId(id));
	await writePlan(plugin, plan, input.kind, input.title.trim());
}

async function writePlan(plugin: ProjectManagerPlugin, plan: NewNotePlan, kind: IdKind, title: string): Promise<void> {
	const path = normalizePath(plan.path);
	const { frontmatterWritten } = await createNoteFile(plugin.app, path, plan.body, kind, plan.frontmatter);
	// ファイルはできているので画面は閉じ（もう一度作らせない）、作りかけを知らせる（設計書 4.4）
	if (!frontmatterWritten) new Notice(`ノートは作りましたが、プロパティを書き込めませんでした（${path}）。警告一覧で確認してください`, 10000);
	else new Notice(`「${title}」を作成しました`);
}
