import { parseNoteId } from '../id';
import type { FolderSettings } from '../settings';
import type { NoteProblem } from '../store/buildNote';

const STRAY_MESSAGE =
	'ファイル名が ID の形でないため、プラグインはこのファイルを読みません（一覧や集計に出ません）。不要なら削除し、必要ならプラグインの作成コマンドで作り直してください';

/** 管理フォルダの中にある、ファイル名が ID の形でない Markdown ファイルか（設計書 8章） */
export function isStrayPath(path: string, folders: FolderSettings): boolean {
	if (!path.endsWith('.md')) return false;
	const managed = [folders.projects, folders.epics, folders.tasks, folders.members, folders.logs, folders.archive];
	if (!managed.some((folder) => path.startsWith(`${folder}/`))) return false;
	const basename = path.split('/').pop()?.slice(0, -'.md'.length) ?? '';
	return parseNoteId(basename) === null;
}

/** ID の形でないファイルの警告（設計書 8章） */
export function findStrayFiles(paths: readonly string[], folders: FolderSettings): NoteProblem[] {
	return paths.filter((path) => isStrayPath(path, folders)).map((path) => ({ path, message: STRAY_MESSAGE }));
}
