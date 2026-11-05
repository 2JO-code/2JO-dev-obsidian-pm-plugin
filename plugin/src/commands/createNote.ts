import { Notice, normalizePath } from 'obsidian';
import type { IdKind } from '../id';
import type ProjectManagerPlugin from '../main';
import { NewNoteModal, type NewNoteModalOptions } from '../ui/newNoteModal';
import { createNoteFile } from '../write/frontmatterFile';
import { planNewNote, type NewNoteInput } from './newNote';
import { storeReady } from './ready';

const COMMANDS: { kind: IdKind; id: string; name: string }[] = [
	{ kind: 'project', id: 'create-project', name: '新しいプロジェクトを作成' },
	{ kind: 'epic', id: 'create-epic', name: '新しいエピックを作成' },
	{ kind: 'task', id: 'create-task', name: '新しいタスクを作成' },
	{ kind: 'user', id: 'create-member', name: '新しいメンバーを作成' },
];

/** ノート作成コマンド4種を登録する */
export function registerCreateCommands(plugin: ProjectManagerPlugin): void {
	for (const { kind, id, name } of COMMANDS) {
		plugin.addCommand({ id, name, callback: () => openNewNoteModal(plugin, kind) });
	}
}

/** 作成画面を開く。initial はビューから作るときに最初から選んでおくもの */
export function openNewNoteModal(plugin: ProjectManagerPlugin, kind: IdKind, initial?: NewNoteModalOptions['initial']): void {
	const { index } = plugin.store;
	if (!storeReady(plugin)) return;
	const projects = index.projects();
	if ((kind === 'epic' || kind === 'task') && projects.length === 0) {
		new Notice('先にプロジェクトを作成してください');
		return;
	}
	new NewNoteModal(plugin.app, {
		kind,
		projects,
		epics: index.epics(),
		displayName: plugin.personal.projectDisplayName,
		...(initial ? { initial } : {}),
		onSubmit: (input) => createNote(plugin, input),
	}).open();
}

/** ノートを作り、作ったことを通知する。ノートは開かない（設計書 4.4） */
async function createNote(plugin: ProjectManagerPlugin, input: NewNoteInput): Promise<void> {
	const { app, settings, store } = plugin;
	const plan = planNewNote(input, plugin.config.statuses, settings.folders, (id) => store.index.hasId(id));
	const path = normalizePath(plan.path);
	const { frontmatterWritten } = await createNoteFile(app, path, plan.body, input.kind, plan.frontmatter);
	// ファイルはできているので画面は閉じ（もう一度作らせない）、作りかけを知らせる（設計書 4.4）
	if (!frontmatterWritten) new Notice(`ノートは作りましたが、プロパティを書き込めませんでした（${path}）。ノートを開いて確認してください`, 10000);
	else new Notice(`「${input.title.trim()}」を作成しました`);
}
