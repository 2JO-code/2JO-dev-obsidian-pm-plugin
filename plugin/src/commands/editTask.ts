import { Notice, TFile } from 'obsidian';
import { localToday } from '../calc/dates';
import { WorkCalendar } from '../calc/workdays';
import { checklistRows } from '../forms/checklist';
import { epicFormFromFrontmatter } from '../forms/epicForm';
import { memberFormFromFrontmatter } from '../forms/memberForm';
import { DESCRIPTION_KEY, formatItemValue, type NoteItems } from '../forms/noteChanges';
import { projectFormFromFrontmatter } from '../forms/projectForm';
import { taskFormFromFrontmatter } from '../forms/taskForm';
import type ProjectManagerPlugin from '../main';
import { EpicFormModal } from '../ui/epicFormModal';
import type { FormNote } from '../ui/formModal';
import { MemberFormModal } from '../ui/memberFormModal';
import { ProjectFormModal } from '../ui/projectFormModal';
import { TaskFormModal } from '../ui/taskFormModal';
import { readNoteItems } from '../write/noteFile';
import { openChecklistEditor } from './editChecklist';
import { isNoteFile } from './noteFiles';
import { storeReady } from './ready';

type FormOpener = (plugin: ProjectManagerPlugin, target: TFile | string) => void;

/** 入力補助フォームのある種類と、そのコマンド */
const FORMS: { type: FormNote['type']; id: string; name: string; open: FormOpener }[] = [
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

/**
 * フォームを開けるか確かめ、ノートを読んで開いたときの写しを作る。開けなければお知らせを出して undefined
 * プロパティは metadataCache でなくファイルから読む（保存のときと同じ読み方で比べるため。設計書 4.15）
 */
async function formSource(
	plugin: ProjectManagerPlugin,
	target: TFile | string,
	type: FormNote['type'],
	open: FormOpener,
): Promise<{ file: TFile; fm: NoteItems; note: FormNote } | undefined> {
	if (!storeReady(plugin)) return undefined;
	const file = typeof target === 'string' ? plugin.app.vault.getFileByPath(target) : target;
	if (!file) return undefined;
	const opened = await readNoteItems(plugin.app, file, type === 'task');
	if (!opened) {
		new Notice('プロパティ（frontmatter）が読めないため、フォームで開けません。警告一覧を確認してください');
		return undefined;
	}
	const { index } = plugin.store;
	const note: FormNote = {
		file,
		type,
		opened,
		format: (value) => formatItemValue(value, (id) => index.title(id) || undefined),
		reopen: () => open(plugin, file.path),
	};
	return { file, fm: opened, note };
}

/** 開くまでに失敗したら知らせる */
function openForm(work: Promise<void>): void {
	void work.catch((e: unknown) => {
		console.error('[project-manager] フォームを開けませんでした', e);
		new Notice('フォームを開けませんでした');
	});
}

/** エピックの入力補助フォームを開く（ファイルかパス） */
export function openEpicForm(plugin: ProjectManagerPlugin, target: TFile | string): void {
	openForm(
		formSource(plugin, target, 'epic', openEpicForm).then((src) => {
			if (!src) return;
			const { file, fm, note } = src;
			const { index } = plugin.store;
			const form = epicFormFromFrontmatter(fm);
			// タスクかマイルストーンの連動があれば、プロジェクトは変えられない（設計書 4.5）
			const id = file.basename;
			const linked =
				index.tasks({ includeArchived: true }).some((t) => t.epic === id) ||
				index.projects({ includeArchived: true }).some((p) => p.milestones.some((m) => m.epic === id));
			new EpicFormModal(plugin.app, {
				note,
				form,
				projects: index.projects(),
				members: index.members(),
				statuses: plugin.config.statuses.task,
				displayName: plugin.personal.projectDisplayName,
				calendar: new WorkCalendar(plugin.config.calendar),
				...(linked ? { fixedProject: form.project } : {}),
			}).open();
		}),
	);
}

/** プロジェクトの入力補助フォームを開く（ファイルかパス） */
export function openProjectForm(plugin: ProjectManagerPlugin, target: TFile | string): void {
	openForm(
		formSource(plugin, target, 'project', openProjectForm).then((src) => {
			if (!src) return;
			new ProjectFormModal(plugin.app, {
				note: src.note,
				form: projectFormFromFrontmatter(src.fm),
				members: plugin.store.index.members(),
				statuses: plugin.config.statuses.project,
				calendar: new WorkCalendar(plugin.config.calendar),
			}).open();
		}),
	);
}

/** メンバーの入力補助フォームを開く（ファイルかパス） */
export function openMemberForm(plugin: ProjectManagerPlugin, target: TFile | string): void {
	openForm(
		formSource(plugin, target, 'user', openMemberForm).then((src) => {
			if (!src) return;
			new MemberFormModal(plugin.app, { note: src.note, form: memberFormFromFrontmatter(src.fm) }).open();
		}),
	);
}

/** タスクの入力補助フォームを開く（ファイルかパス） */
export function openTaskForm(plugin: ProjectManagerPlugin, target: TFile | string): void {
	openForm(
		formSource(plugin, target, 'task', openTaskForm).then(async (src) => {
			if (!src) return;
			const { file, fm, note } = src;
			const content = await plugin.app.vault.read(file);
			const { index } = plugin.store;
			const description = fm[DESCRIPTION_KEY];
			new TaskFormModal(plugin.app, {
				note,
				description: typeof description === 'string' ? description : '',
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
		}),
	);
}
