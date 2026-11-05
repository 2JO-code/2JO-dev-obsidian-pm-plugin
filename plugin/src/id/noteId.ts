import { ID_PREFIX, type NoteId, type NoteType, type YearMonth } from '../model';
import { isUuid7, uuid7 } from './uuid7';

/** 作業ログ以外の、IDを採番する種類 */
export type IdKind = keyof typeof ID_PREFIX;

const MAX_ATTEMPTS = 10;

/**
 * 接頭辞付きの新しいID（例：`TASK-0192f3a0-...`）。重複したら作り直す
 * @param exists そのIDのノートが Vault 内にすでにあるか
 */
export function newNoteId(kind: IdKind, exists: (id: NoteId) => boolean, generate: () => string = uuid7): NoteId {
	for (let i = 0; i < MAX_ATTEMPTS; i++) {
		const id = `${ID_PREFIX[kind]}-${generate()}`;
		if (!exists(id)) return id;
	}
	throw new Error(`Could not generate a unique ${ID_PREFIX[kind]} id`);
}

/** 作業ログのID（例：`USER-0192f3a0-..._2026-11`） */
export function worklogId(member: NoteId, month: YearMonth): NoteId {
	return `${member}_${month}`;
}

export type ParsedNoteId =
	| { type: Exclude<NoteType, 'worklog'>; uuid: string }
	| { type: 'worklog'; member: NoteId; month: YearMonth };

const KIND_BY_PREFIX: Record<string, IdKind> = Object.fromEntries(
	Object.entries(ID_PREFIX).map(([kind, prefix]) => [prefix, kind as IdKind]),
);
const NOTE_ID_PATTERN = /^([A-Z]+)-([0-9a-f-]{36})(?:_(\d{4}-(?:0[1-9]|1[0-2])))?$/;

/** IDの形式を確かめ、種類を判定する。形式外は null */
export function parseNoteId(id: string): ParsedNoteId | null {
	const m = NOTE_ID_PATTERN.exec(id);
	if (!m) return null;
	const [, prefix = '', uuid = '', month] = m;
	const kind = KIND_BY_PREFIX[prefix];
	if (!kind || !isUuid7(uuid)) return null;
	if (month !== undefined) {
		return kind === 'user' ? { type: 'worklog', member: `${prefix}-${uuid}`, month } : null;
	}
	return { type: kind, uuid };
}
