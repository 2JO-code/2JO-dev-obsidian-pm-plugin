import { Notice, TFile } from 'obsidian';
import { localToday } from '../calc/dates';
import { WorkCalendar } from '../calc/workdays';
import { checklistRows } from '../forms/checklist';
import { epicFormFromFrontmatter } from '../forms/epicForm';
import { memberFormFromFrontmatter } from '../forms/memberForm';
import { projectFormFromFrontmatter } from '../forms/projectForm';
import { descriptionOf } from '../forms/taskDescription';
import { taskFormFromFrontmatter } from '../forms/taskForm';
import type ProjectManagerPlugin from '../main';
import type { NoteType } from '../model';
import { EpicFormModal } from '../ui/epicFormModal';
import { MemberFormModal } from '../ui/memberFormModal';
import { ProjectFormModal } from '../ui/projectFormModal';
import { TaskFormModal } from '../ui/taskFormModal';
import { openChecklistEditor } from './editChecklist';
import { isNoteFile } from './noteFiles';
import { storeReady } from './ready';

type FormOpener = (plugin: ProjectManagerPlugin, target: TFile | string) => void;

/** 入力補助フォームのある種類と、そのコマンド */
const FORMS: { type: NoteType; id: string; name: string; open: FormOpener }[] = [
	{ type: 'task', id: 'edit-task', name: 'タスクを入力補助フォームで編集', open: openTaskForm },
	{ type: 'epic', id: 'edit-epic', name: 'エピックを入力補助フォームで編集', open: openEpicForm },
	{ type: 'project', id: 'edit-project', name: 'プロジェクトを入力補助フォームで編集', open: openProjectForm },
	{ type: 'user', id: 'edit-member', name: 'メンバーを入力補助フォームで編集', open: openMemberForm },
];

/** そのノートの入力補助フォームを開く関数。フォームの無い種類は undefined */
export function formOpenerOf(file: unknown): FormOpener | undefined {
	return FORMS.find((f) => isNoteFile(file, f.type))?.open;
}

/** 入力補助フォームを開くコマンドと右クリックメニューを登録する（タスク・エピック・プロジェクト・メンバー） */
export function registerEditTask(plugin: ProjectManagerPlugin): void {
	for (const f of FORMS) {
		plugin.addCommand({
			id: f.id,
			name: f.name,
			checkCallback: (checking) => {
				const file = plugin.app.workspace.getActiveFile();
				if (!isNoteFile(file, f.type)) return false;
				if (!checking) f.open(plugin, file);
				return true;
			},
		});
	}

	plugin.registerEvent(
		plugin.app.workspace.on('file-menu', (menu, file) => {
			const open = formOpenerOf(file);
			if (!open || !(file instanceof TFile)) return;
			menu.addItem((item) =>
				item
					.setTitle('入力補助フォームで編集')
					.setIcon('list-checks')
					.onClick(() => open(plugin, file)),
			);
		}),
	);
}

/** フォームを開けるか確かめ、ファイルと frontmatter を返す。開けなければお知らせを出して undefined */
function formSource(plugin: ProjectManagerPlugin, target: TFile | string): { file: TFile; fm: Record<string, unknown> } | undefined {
	if (!storeReady(plugin)) return undefined;
	const file = typeof target === 'string' ? plugin.app.vault.getFileByPath(target) : target;
	if (!file) return undefined;
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm) {
		new Notice('プロパティ（frontmatter）が読めないため、フォームで開けません。警告一覧を確認してください');
		return undefined;
	}
	return { file, fm };
}

/** エピックの入力補助フォームを開く（ファイルかパス） */
export function openEpicForm(plugin: ProjectManagerPlugin, target: TFile | string): void {
	const src = formSource(plugin, target);
	if (!src) return;
	const { file, fm } = src;
	const { index } = plugin.store;
	const form = epicFormFromFrontmatter(fm);
	// タスクかマイルストーンの連動があれば、プロジェクトは変えられない（設計書 4.5）
	const id = file.basename;
	const linked =
		index.tasks({ includeArchived: true }).some((t) => t.epic === id) ||
		index.projects({ includeArchived: true }).some((p) => p.milestones.some((m) => m.epic === id));
	new EpicFormModal(plugin.app, {
		file,
		form,
		projects: index.projects(),
		members: index.members(),
		statuses: plugin.config.statuses.task,
		displayName: plugin.personal.projectDisplayName,
		...(linked ? { fixedProject: form.project } : {}),
	}).open();
}

/** プロジェクトの入力補助フォームを開く（ファイルかパス） */
export function openProjectForm(plugin: ProjectManagerPlugin, target: TFile | string): void {
	const src = formSource(plugin, target);
	if (!src) return;
	const { file, fm } = src;
	new ProjectFormModal(plugin.app, {
		file,
		form: projectFormFromFrontmatter(fm),
		members: plugin.store.index.members(),
		statuses: plugin.config.statuses.project,
	}).open();
}

/** メンバーの入力補助フォームを開く（ファイルかパス） */
export function openMemberForm(plugin: ProjectManagerPlugin, target: TFile | string): void {
	const src = formSource(plugin, target);
	if (!src) return;
	new MemberFormModal(plugin.app, { file: src.file, form: memberFormFromFrontmatter(src.fm) }).open();
}

/** タスクの入力補助フォームを開く（ファイルかパス） */
export function openTaskForm(plugin: ProjectManagerPlugin, target: TFile | string): void {
	const src = formSource(plugin, target);
	if (!src) return;
	const { file, fm } = src;
	void plugin.app.vault.read(file).then((content) => openTaskFormWith(plugin, file, fm, content));
}

/** 本文を読んだあとで、タスクの入力補助フォームを開く */
function openTaskFormWith(plugin: ProjectManagerPlugin, file: TFile, fm: Record<string, unknown>, content: string): void {
	const { index } = plugin.store;
	new TaskFormModal(plugin.app, {
		description: descriptionOf(content),
		file,
		taskId: file.basename,
		form: taskFormFromFrontmatter(fm),
		projects: index.projects(),
		epics: index.epics(),
		tasks: index.tasks(),
		allTasks: index.tasks({ includeArchived: true }),
		members: index.members(),
		statuses: plugin.config.statuses.task,
		displayName: plugin.personal.projectDisplayName,
		calendar: new WorkCalendar(plugin.config.calendar),
		today: localToday(),
		checklist: checklistRows(content).rows,
		editChecklist: (onSaved) => void openChecklistEditor(plugin, file.path, (saved) => onSaved(checklistRows(saved).rows)),
	}).open();
}
