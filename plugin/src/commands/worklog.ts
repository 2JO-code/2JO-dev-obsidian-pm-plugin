import { Notice, normalizePath, TFile } from 'obsidian';
import { defaultWorklogMember, monthOf, upsertWorklogRow, type WorklogInput } from '../forms/worklogForm';
import { worklogId } from '../id';
import type ProjectManagerPlugin from '../main';
import type { Task, Worklog } from '../model';
import { parseHours } from '../parse/values';
import { WorklogModal } from '../ui/worklogModal';
import { toLink } from '../write/frontmatter';
import { createNoteFile } from '../write/frontmatterFile';
import { openWorklogEditorOf } from './editWorklog';
import { storeReady } from './ready';

/** 前回選んだメンバーを覚えておくキー（設計書 6章） */
const MEMBER_KEY = 'project-manager:worklog-member';

export function registerWorklog(plugin: ProjectManagerPlugin): void {
	plugin.addCommand({ id: 'input-worklog', name: '作業ログを入力', callback: () => openWorklogModal(plugin) });
}

/** 作業ログの入力フォームを開く。task を渡すと、そのタスクを選んだ状態で開く（設計書 4.3） */
export function openWorklogModal(plugin: ProjectManagerPlugin, task?: Task): void {
	const { app, store } = plugin;
	if (!storeReady(plugin)) return;
	const stored: unknown = app.loadLocalStorage(MEMBER_KEY);
	const remembered = typeof stored === 'string' ? stored : '';
	const members = store.index.members();
	const active = members.filter((m) => m.active).map((m) => m.id);
	new WorklogModal(app, {
		members,
		...(task ? { task } : {}),
		projects: store.index.projects(),
		tasks: store.index.tasks(),
		// 保存後も最新を見られるよう毎回取り出す
		get worklogs(): Worklog[] {
			return store.index.worklogs();
		},
		displayName: plugin.personal.projectDisplayName,
		defaultMember: task ? defaultWorklogMember(remembered, task.assignees, active) : remembered,
		onMemberChange: (member) => app.saveLocalStorage(MEMBER_KEY, member || null),
		subscribe: (callback) => {
			const ref = store.onUpdated(callback);
			return () => store.offref(ref);
		},
		onSave: (input) => saveWorklogEntry(plugin, input),
		editMonth: (member, month) => openWorklogEditorOf(plugin, member, month),
	}).open();
}

/** 作業ログに1行書き込む。戻り値は既存の行を書き換えたか（設計書 4.3） */
async function saveWorklogEntry(plugin: ProjectManagerPlugin, input: WorklogInput): Promise<boolean> {
	const { app, settings, store } = plugin;
	const month = monthOf(input.date);
	const id = worklogId(input.member, month);
	const entry = {
		date: input.date,
		task: input.task,
		taskTitle: store.index.title(input.task),
		planned: input.planned.trim() === '' ? null : parseHours(input.planned),
		actual: input.actual.trim() === '' ? null : parseHours(input.actual),
		memo: input.memo.trim(),
	};

	const path = normalizePath(`${settings.folders.logs}/${id}.md`);
	// 作業ログのフォルダの外（アーカイブなど）にあってもそれを使う。作ったばかりで索引に無いものはパスで探す（設計書 4.3）
	const existingPath = store.index.pathOf(id) ?? path;
	const existing = app.vault.getFileByPath(existingPath);
	if (existing instanceof TFile) {
		let updated = false;
		await app.vault.process(existing, (content) => {
			const result = upsertWorklogRow(content, entry);
			updated = result.updated;
			return result.content;
		});
		return updated;
	}

	const { frontmatterWritten } = await createNoteFile(app, path, upsertWorklogRow('', entry).content, 'worklog', {
		type: 'worklog',
		member: toLink(input.member),
		month,
	});
	// 行は書けているので保存は成功とし、作りかけを知らせる（設計書 4.4）
	if (!frontmatterWritten) new Notice(`記録は書きましたが、作業ログのプロパティを書き込めませんでした（${path}）。警告一覧で確認してください`, 10000);
	return false;
}
