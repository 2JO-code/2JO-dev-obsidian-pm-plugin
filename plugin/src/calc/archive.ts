import { findStatus, isFinished } from '../config/status';
import type { NoteId, Project, StatusSets } from '../model';
import type { VaultIndex } from '../store/vaultIndex';

export type ArchiveKind = 'project' | 'epic' | 'task';

export const ARCHIVE_KIND_LABELS: Record<ArchiveKind, string> = { project: 'プロジェクト', epic: 'エピック', task: 'タスク' };

/** アーカイブフォルダへ動かす1ファイル */
export interface ArchiveItem {
	kind: ArchiveKind;
	id: NoteId;
	title: string;
	/** 今の場所（Vault のルートからのパス） */
	from: string;
	/** 移動先 */
	to: string;
	/** 移動の前に確かめてほしいこと */
	notes: string[];
}

/** 移動元のフォルダごとのまとまり（TortoiseSVN ではフォルダごとに動かすため） */
export interface ArchiveGroup {
	fromFolder: string;
	toFolder: string;
	items: ArchiveItem[];
}

export interface ArchivePlan {
	items: ArchiveItem[];
	groups: ArchiveGroup[];
	/** すでにアーカイブフォルダにあるファイルの数 */
	alreadyArchived: number;
}

const folderOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const join = (folder: string, rest: string) => (rest === '' ? folder : `${folder}/${rest}`);

/**
 * クローズしたプロジェクトと、そのエピック・タスクのアーカイブ先（要件4.9、設計書 11.14）。
 * 移動先は、アーカイブフォルダの下に今のパスをそのまま付けた場所。作業ログは動かさない
 */
export function archivePlan(index: VaultIndex, project: Project, archiveFolder: string, statuses: StatusSets): ArchivePlan {
	const all = { includeArchived: true };
	const targets: { kind: ArchiveKind; id: NoteId; title: string; path: string; status?: string }[] = [
		{ kind: 'project', id: project.id, title: project.title, path: project.path },
		...index
			.epics(all)
			.filter((e) => e.project === project.id)
			.map((e) => ({ kind: 'epic' as const, id: e.id, title: e.title, path: e.path, status: e.status })),
		...index
			.tasks(all)
			.filter((t) => t.project === project.id)
			.map((t) => ({ kind: 'task' as const, id: t.id, title: t.title, path: t.path, status: t.status })),
	];

	let alreadyArchived = 0;
	const items: ArchiveItem[] = [];
	for (const t of targets) {
		if (index.getRecord(t.path)?.archived) {
			alreadyArchived++;
			continue;
		}
		const to = join(archiveFolder, t.path);
		const notes: string[] = [];
		if (t.status !== undefined) {
			const category = findStatus(statuses.task, t.status)?.category;
			if (!isFinished(category)) notes.push(`ステータスが「${t.status}」のままです（完了系・停止系ではありません）`);
		}
		if (index.getRecord(to)) notes.push('移動先に同じ名前のファイルがあります');
		items.push({ kind: t.kind, id: t.id, title: t.title, from: t.path, to, notes });
	}

	const order: Record<ArchiveKind, number> = { project: 0, epic: 1, task: 2 };
	items.sort((a, b) => order[a.kind] - order[b.kind] || a.from.localeCompare(b.from));
	const groups = new Map<string, ArchiveGroup>();
	for (const item of items) {
		const fromFolder = folderOf(item.from);
		const group = groups.get(fromFolder) ?? { fromFolder, toFolder: join(archiveFolder, fromFolder), items: [] };
		group.items.push(item);
		groups.set(fromFolder, group);
	}
	return { items, groups: [...groups.values()], alreadyArchived };
}

/** アーカイブできるプロジェクト：クローズ済み（完了系）で、まだアーカイブフォルダの外にファイルが残っているもの */
export function archivableProjects(index: VaultIndex, archiveFolder: string, statuses: StatusSets): Project[] {
	return index
		.projects({ includeArchived: true })
		.filter((p) => findStatus(statuses.project, p.status)?.category === 'done')
		.filter((p) => archivePlan(index, p, archiveFolder, statuses).items.length > 0);
}

/**
 * svn のコマンドを使える人向けに、移動のコマンドを並べる（Vault のフォルダで実行する）。
 * `--parents` で移動先のフォルダも作る
 */
export function svnMoveCommands(items: readonly ArchiveItem[]): string {
	const win = (path: string) => `"${path.replace(/\//g, '\\')}"`;
	return items.map((i) => `svn move --parents ${win(i.from)} ${win(i.to)}`).join('\n');
}
