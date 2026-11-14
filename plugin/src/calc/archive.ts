import { findStatus, isFinished } from '../config/status';
import type { NoteId, Project, StatusSets } from '../model';
import type { VaultIndex } from '../store/vaultIndex';

export type ArchiveKind = 'project' | 'epic' | 'task';

export const ARCHIVE_KIND_LABELS: Record<ArchiveKind, string> = { project: 'プロジェクト', epic: 'エピック', task: 'タスク' };

/** アーカイブへ動かす・アーカイブから戻す1ファイル */
export interface ArchiveItem {
	kind: ArchiveKind;
	id: NoteId;
	title: string;
	/** 今の場所（Vault のルートからのパス） */
	from: string;
	/** 移動先 */
	to: string;
	/** 移動先に同じ名前のノートがある（動かさない） */
	clash: boolean;
	/** 移動の前に確かめてほしいこと */
	notes: string[];
}

export interface ArchivePlan {
	items: ArchiveItem[];
	/** すでに移動先の側にあるファイルの数（アーカイブなら アーカイブ済み、戻すなら戻し済み） */
	alreadyDone: number;
}

interface Target {
	kind: ArchiveKind;
	id: NoteId;
	title: string;
	path: string;
	status?: string;
}

/** パスのフォルダの部分。直下なら空 */
export const folderOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const join = (folder: string, rest: string) => (rest === '' ? folder : `${folder}/${rest}`);
const ORDER: Record<ArchiveKind, number> = { project: 0, epic: 1, task: 2 };

/** プロジェクトと、そのエピック・タスク（アーカイブ内も含む） */
function projectTargets(index: VaultIndex, project: Project): Target[] {
	const all = { includeArchived: true };
	return [
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
}

/** 移動の計画を作る。`toOf` が undefined を返したものは移動済みとして数える */
function makePlan(
	index: VaultIndex,
	targets: readonly Target[],
	toOf: (t: Target) => string | undefined,
	notesOf: (t: Target) => string[],
): ArchivePlan {
	let alreadyDone = 0;
	const items: ArchiveItem[] = [];
	for (const t of targets) {
		const to = toOf(t);
		if (to === undefined) {
			alreadyDone++;
			continue;
		}
		const clash = index.getRecord(to) !== undefined;
		const notes = notesOf(t);
		if (clash) notes.push('移動先に同じ名前のファイルがあるので動かしません');
		items.push({ kind: t.kind, id: t.id, title: t.title, from: t.path, to, clash, notes });
	}
	items.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.from.localeCompare(b.from));
	return { items, alreadyDone };
}

/**
 * クローズしたプロジェクトと、そのエピック・タスクのアーカイブ先（要件4.9、設計書 11.14）。
 * 移動先は、アーカイブフォルダの下に今のパスをそのまま付けた場所。作業ログは動かさない
 */
export function archivePlan(index: VaultIndex, project: Project, archiveFolder: string, statuses: StatusSets): ArchivePlan {
	return makePlan(
		index,
		projectTargets(index, project),
		(t) => (index.getRecord(t.path)?.archived ? undefined : join(archiveFolder, t.path)),
		(t) => {
			if (t.status === undefined) return [];
			const category = findStatus(statuses.task, t.status)?.category;
			return isFinished(category) ? [] : [`ステータスが「${t.status}」のままです（完了系・停止系ではありません）`];
		},
	);
}

/** アーカイブから元の場所へ戻す計画。戻す先はアーカイブフォルダの部分を取ったパス（設計書 11.14） */
export function restorePlan(index: VaultIndex, project: Project, archiveFolder: string): ArchivePlan {
	const prefix = `${archiveFolder}/`;
	return makePlan(
		index,
		projectTargets(index, project),
		(t) => (index.getRecord(t.path)?.archived && t.path.startsWith(prefix) ? t.path.slice(prefix.length) : undefined),
		() => [],
	);
}

/** アーカイブできるプロジェクト：クローズ済み（完了系）で、まだアーカイブフォルダの外にファイルが残っているもの */
export function archivableProjects(index: VaultIndex, archiveFolder: string, statuses: StatusSets): Project[] {
	return index
		.projects({ includeArchived: true })
		.filter((p) => findStatus(statuses.project, p.status)?.category === 'done')
		.filter((p) => archivePlan(index, p, archiveFolder, statuses).items.length > 0);
}

/** 戻せるプロジェクト：アーカイブフォルダの中にファイルがあるもの */
export function restorableProjects(index: VaultIndex, archiveFolder: string): Project[] {
	return index.projects({ includeArchived: true }).filter((p) => restorePlan(index, p, archiveFolder).items.length > 0);
}
