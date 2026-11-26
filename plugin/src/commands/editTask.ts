import { Notice, TFile } from 'obsidian';
import { WorkCalendar } from '../calc/workdays';
import { checklistRows } from '../forms/checklist';
import { epicFormFromFrontmatter } from '../forms/epicForm';
import { memberFormFromFrontmatter } from '../forms/memberForm';
import { DESCRIPTION_KEY, formatItemValue, type NoteItems } from '../forms/noteChanges';
import { projectFormFromFrontmatter } from '../forms/projectForm';
import { sprintFormFromFrontmatter } from '../forms/sprintForm';
import { taskDeleteBlockers } from '../forms/taskDelete';
import { taskFormFromFrontmatter } from '../forms/taskForm';
import type ProjectManagerPlugin from '../main';
import { confirm } from '../ui/confirmModal';
import { EpicFormModal } from '../ui/epicFormModal';
import type { FormNote } from '../ui/formModal';
import { MemberFormModal } from '../ui/memberFormModal';
import { ProjectFormModal } from '../ui/projectFormModal';
import { SprintFormModal } from '../ui/sprintFormModal';
import { notifyError } from '../ui/notify';
import { TaskFormModal } from '../ui/taskFormModal';
import { readNoteItems } from '../write/noteFile';
import { openChecklistEditor } from './editChecklist';
import { isNoteFile } from './noteFiles';
import { storeReady } from './ready';
import { taskFormChoices } from './taskFormOptions';

type FormOpener = (plugin: ProjectManagerPlugin, target: TFile | string) => void;

/** 入力補助フォームのある種類と、そのコマンド */
const FORMS: { type: FormNote['type']; id: string; name: string; open: FormOpener }[] = [
	{ type: 'task', id: 'edit-task', name: 'タスクを入力補助フォームで編集', open: openTaskForm },
	{ type: 'epic', id: 'edit-epic', name: 'エピックを入力補助フォームで編集', open: openEpicForm },
	{ type: 'sprint', id: 'edit-sprint', name: 'スプリントを入力補助フォームで編集', open: openSprintForm },
	{ type: 'project', id: 'edit-project', name: 'プロジェクトを入力補助フォームで編集', open: openProjectForm },
	{ type: 'user', id: 'edit-member', name: 'メンバーを入力補助フォームで編集', open: openMemberForm },
];

/** そのノートの入力補助フォームを開く関数。フォームの無い種類は undefined */
export function formOpenerOf(file: unknown): FormOpener | undefined {
	return FORMS.find((f) => isNoteFile(file, f.type))?.open;
}

/** 入力補助フォームを開くコマンドと右クリックメニューを登録する（タスク・エピック・スプリント・プロジェクト・メンバー） */
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
	void work.catch((e: unknown) => notifyError(e, 'フォームを開けませんでした'));
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

/** スプリントの入力補助フォームを開く（ファイルかパス） */
export function openSprintForm(plugin: ProjectManagerPlugin, target: TFile | string): void {
	openForm(
		formSource(plugin, target, 'sprint', openSprintForm).then((src) => {
			if (!src) return;
			const { file, fm, note } = src;
			const { index } = plugin.store;
			const form = sprintFormFromFrontmatter(fm);
			// タスクが入っていれば、プロジェクトは変えられない
			const id = file.basename;
			const linked = sprintTaskCount(plugin, id) > 0;
			new SprintFormModal(plugin.app, {
				target: { mode: 'edit', note, sprintId: id, deleteSprint: () => deleteSprint(plugin, file) },
				form,
				projects: index.projects(),
				sprints: index.sprints({ includeArchived: true }),
				displayName: plugin.personal.projectDisplayName,
				...(linked ? { fixedProject: form.project } : {}),
			}).open();
		}),
	);
}

/** スプリントに入っているタスクの数（アーカイブ内も含む） */
function sprintTaskCount(plugin: ProjectManagerPlugin, id: string): number {
	return plugin.store.index.tasks({ includeArchived: true }).filter((t) => t.sprint === id).length;
}

/** タスクが入っていなければ、確かめてからスプリントを Obsidian のごみ箱へ送る。消したら true */
async function deleteSprint(plugin: ProjectManagerPlugin, file: TFile): Promise<boolean> {
	const id = file.basename;
	const title = plugin.store.index.title(id) || id;
	const count = sprintTaskCount(plugin, id);
	if (count > 0) {
		new Notice(`「${title}」にはタスクが ${count} 件入っているため、削除できません。先に別のスプリントか未割り当てへ動かしてください`, 10000);
		return false;
	}
	return trashAfterConfirm(plugin, file, title, 'スプリントを削除', [`「${title}」を削除します`]);
}

/** 確かめてからノートを Obsidian のごみ箱へ送る。消したら true */
async function trashAfterConfirm(plugin: ProjectManagerPlugin, file: TFile, title: string, heading: string, details: string[]): Promise<boolean> {
	const { app } = plugin;
	const ok = await confirm(app, {
		title: heading,
		details: [...details, 'ファイルは Obsidian の設定「削除したファイル」の場所に移ります。戻すときは管理者に頼んでください'],
		confirmText: '削除',
		danger: true,
	});
	if (!ok) return false;
	try {
		await app.fileManager.trashFile(file);
	} catch (e) {
		notifyError(e, '削除できませんでした');
		return false;
	}
	new Notice(`「${title}」を削除しました`);
	return true;
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
			const description = fm[DESCRIPTION_KEY];
			new TaskFormModal(plugin.app, {
				target: {
					mode: 'edit',
					note,
					description: typeof description === 'string' ? description : '',
					taskId: file.basename,
					checklist: checklistRows(content).rows,
					editChecklist: (onSaved) => void openChecklistEditor(plugin, file.path, (saved) => onSaved(checklistRows(saved).rows)),
					deleteTask: () => deleteTask(plugin, file),
				},
				form: taskFormFromFrontmatter(fm),
				...taskFormChoices(plugin),
			}).open();
		}),
	);
}

/** 作業ログの記録や先行タスクの参照が無ければ、確認してからタスクを Obsidian のごみ箱へ送る。消したら true */
async function deleteTask(plugin: ProjectManagerPlugin, file: TFile): Promise<boolean> {
	const { index } = plugin.store;
	const id = file.basename;
	const title = index.title(id) || id;
	const blockers = taskDeleteBlockers(id, index.tasks({ includeArchived: true }), index.worklogs(), (m) => index.title(m));
	if (blockers.length > 0) {
		new Notice([`「${title}」は削除できません`, ...blockers, '使わないタスクは、ステータスを停止にしてください'].join('\n'), 10000);
		return false;
	}
	return trashAfterConfirm(plugin, file, title, 'タスクを削除', [
		`「${title}」を削除します。説明・チェックリストも消えます`,
		'フォームで保存していない変更も消えます',
	]);
}
