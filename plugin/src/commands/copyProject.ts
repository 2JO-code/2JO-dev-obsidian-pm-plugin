import { Notice, normalizePath } from 'obsidian';
import { WorkCalendar } from '../calc/workdays';
import type ProjectManagerPlugin from '../main';
import type { NoteId } from '../model';
import { CopyProjectModal } from '../ui/copyProjectModal';
import { notifyError } from '../ui/notify';
import { createNoteFile } from '../write/frontmatterFile';
import { planProjectCopy, type ProjectCopyInput } from './projectCopy';
import { storeReady } from './ready';

/** プロジェクトの複製のコマンドを登録する */
export function registerCopyProject(plugin: ProjectManagerPlugin): void {
	plugin.addCommand({ id: 'copy-project', name: 'プロジェクトを複製して作成', callback: () => openCopyProjectModal(plugin) });
}

/** 複製の画面を開く。initial は最初から選んでおく元のプロジェクト */
export function openCopyProjectModal(plugin: ProjectManagerPlugin, initial?: NoteId): void {
	if (!storeReady(plugin)) return;
	const { index } = plugin.store;
	const all = { includeArchived: true };
	const projects = index.projects(all);
	if (projects.length === 0) {
		new Notice('元にするプロジェクトがありません。先にプロジェクトを作成してください');
		return;
	}
	new CopyProjectModal(plugin.app, {
		projects,
		displayName: plugin.personal.projectDisplayName,
		...(initial ? { initial } : {}),
		countOf: (id) => ({
			epics: index.epics(all).filter((e) => e.project === id).length,
			tasks: index.tasks(all).filter((t) => t.project === id).length,
		}),
		onSubmit: (source, input) => copyProject(plugin, source, input),
	}).open();
}

/** 元のプロジェクトを読み、新しいノートの一式を作る。ノートは開かない（設計書 4.4） */
async function copyProject(plugin: ProjectManagerPlugin, sourceId: NoteId, input: ProjectCopyInput): Promise<void> {
	const { app, settings, store, config } = plugin;
	const all = { includeArchived: true };
	const project = store.index.projects(all).find((p) => p.id === sourceId);
	if (!project) throw new Error('元のプロジェクトが見つかりません');
	const epics = store.index.epics(all).filter((e) => e.project === sourceId);
	const tasks = store.index.tasks(all).filter((t) => t.project === sourceId);

	// 説明とチェックリストを写すため、本文を読む
	const bodies = new Map<NoteId, string>();
	for (const note of [...epics, ...tasks]) {
		const file = app.vault.getFileByPath(note.path);
		if (file) bodies.set(note.id, await app.vault.cachedRead(file));
	}

	const notes = planProjectCopy(input, { project, epics, tasks, bodies }, config.statuses, settings.folders, new WorkCalendar(config.calendar), (id) => store.index.hasId(id));

	let created = 0;
	const unwritten: string[] = [];
	try {
		for (const note of notes) {
			const path = normalizePath(note.path);
			const { frontmatterWritten } = await createNoteFile(app, path, note.body, note.kind, note.frontmatter);
			created++;
			if (!frontmatterWritten) unwritten.push(path);
		}
	} catch (e) {
		if (created === 0) throw e;
		// 途中まで作ったノートは残るので、画面は閉じ（もう一度作らせない）、件数を知らせる
		notifyError(e, `${notes.length}件のうち${created}件を作ったところで止まりました`);
		return;
	}
	if (unwritten.length > 0) new Notice(`ノートは作りましたが、プロパティを書き込めなかったものがあります（${unwritten.join('、')}）`, 10000);
	new Notice(`「${input.title.trim()}」を作成しました（エピック ${epics.length}件・タスク ${tasks.length}件）`);
}
