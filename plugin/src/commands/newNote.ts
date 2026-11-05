import { newNoteId, type IdKind } from '../id';
import { emptyValue, FRONTMATTER_KEYS, MEMBER_DEFAULTS, type NoteId, type StatusSets } from '../model';
import type { FolderSettings } from '../settings';
import { TABLE_SPEC } from '../parse/bodyTables';
import { toLink, type FrontmatterUpdate } from '../write/frontmatter';
import { emptyTable } from '../write/markdownTable';

/** 作成画面で入力する内容 */
export type NewNoteInput =
	| { kind: 'project'; title: string; caseId: string; officialName: string }
	| { kind: 'epic'; title: string; project: NoteId; wbs: string }
	| { kind: 'task'; title: string; project: NoteId; epic?: NoteId }
	| { kind: 'user'; title: string };

/** 作成するノートの中身 */
export interface NewNotePlan {
	id: NoteId;
	path: string;
	frontmatter: FrontmatterUpdate;
	body: string;
}

const FOLDER: Record<IdKind, keyof FolderSettings> = {
	project: 'projects',
	epic: 'epics',
	task: 'tasks',
	user: 'members',
};

/**
 * 入力を確かめて、作成するノートの中身を決める（設計書 4.4）
 * @param exists そのIDのノートが Vault 内にすでにあるか
 */
export function planNewNote(
	input: NewNoteInput,
	statuses: StatusSets,
	folders: FolderSettings,
	exists: (id: NoteId) => boolean,
	generateId: (kind: IdKind, exists: (id: NoteId) => boolean) => NoteId = newNoteId,
): NewNotePlan {
	const title = input.title.trim();
	if (title === '') throw new Error(input.kind === 'user' ? '氏名を入力してください' : 'タイトルを入力してください');
	const base: FrontmatterUpdate = { type: input.kind, title, aliases: [title] };
	const firstStatus = (set: keyof StatusSets) => {
		const name = statuses[set][0]?.name;
		if (!name) throw new Error('ステータスが設定されていません');
		return name;
	};

	let frontmatter: FrontmatterUpdate;
	let body = '';
	switch (input.kind) {
		case 'project': {
			const caseId = input.caseId.trim();
			const officialName = input.officialName.trim();
			if (caseId === '') throw new Error('案件IDを入力してください');
			if (officialName === '') throw new Error('正式案件名を入力してください');
			frontmatter = { ...base, case_id: caseId, official_name: officialName, status: firstStatus('project') };
			body = `${emptyTable(TABLE_SPEC.milestones)}\n\n${emptyTable(TABLE_SPEC.allocations)}\n`;
			break;
		}
		case 'epic': {
			if (!input.project) throw new Error('プロジェクトを選んでください');
			const wbs = input.wbs.trim();
			frontmatter = { ...base, project: toLink(input.project), status: firstStatus('task') };
			if (wbs !== '') frontmatter.wbs = wbs;
			break;
		}
		case 'task':
			if (!input.project) throw new Error('プロジェクトを選んでください');
			frontmatter = { ...base, project: toLink(input.project), status: firstStatus('task') };
			if (input.epic) frontmatter.epic = toLink(input.epic);
			break;
		case 'user':
			frontmatter = {
				...base,
				daily_hours: MEMBER_DEFAULTS.dailyHours,
				load_limit_pct: MEMBER_DEFAULTS.loadLimitPct,
				active: MEMBER_DEFAULTS.active,
			};
			body = `${emptyTable(TABLE_SPEC.holidays)}\n`;
			break;
	}

	// まだ書いていないプロパティも空の枠として入れておく（設計書 4.4）
	for (const key of FRONTMATTER_KEYS[input.kind]) if (!(key in frontmatter)) frontmatter[key] = emptyValue(key);

	const id = generateId(input.kind, exists);
	return { id, path: `${folders[FOLDER[input.kind]]}/${id}.md`, frontmatter, body };
}
