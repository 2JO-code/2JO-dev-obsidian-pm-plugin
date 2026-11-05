import { parseNoteId } from '../id';
import type { NoteType } from '../model';
import { TYPE_LABEL } from '../store/coerce';
import type { VaultIndex } from '../store/vaultIndex';

export interface FileLabel {
	/** ノートでないファイルは undefined */
	type?: NoteType;
	typeLabel?: string;
	/** 人が見分けるための名前 */
	title: string;
}

/** ファイルを人が見分けやすい名前で表す（設計書 8章） */
export function labelOf(path: string, index: VaultIndex): FileLabel {
	const basename = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
	const record = index.getRecord(path);
	const parsed = parseNoteId(basename);
	if (!parsed) return { title: basename };
	const type = parsed.type;
	const typeLabel = TYPE_LABEL[type];

	if (parsed.type === 'worklog') {
		const member = index.get(parsed.member);
		const name = member && 'title' in member && member.title !== '' ? member.title : parsed.member;
		return { type, typeLabel, title: `${name}の作業ログ（${parsed.month}）` };
	}
	const note = record?.note;
	const title = (note && 'title' in note && note.title !== '' ? note.title : undefined) ?? record?.title;
	return { type, typeLabel, title: title ?? basename };
}
