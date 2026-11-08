import { TFile } from 'obsidian';
import { parseNoteId } from '../id';
import type { NoteType } from '../model';

/** その種類のノートか（ファイル名で判定） */
export function isNoteFile(file: unknown, type: NoteType): file is TFile {
	return file instanceof TFile && file.extension === 'md' && parseNoteId(file.basename)?.type === type;
}

/** タスクのノートか */
export const isTaskFile = (file: unknown): file is TFile => isNoteFile(file, 'task');
/** メンバーのノートか（作業ログは除く） */
export const isMemberFile = (file: unknown): file is TFile => isNoteFile(file, 'user');
