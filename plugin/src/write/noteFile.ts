import { type App, getFrontMatterInfo, parseYaml, type TFile } from 'obsidian';
import { DESCRIPTION_KEY, frameItems, NoteChangedError, sameAsChecked, type NoteItems } from '../forms/noteChanges';
import { applyDescription, descriptionOf } from '../forms/taskDescription';
import type { NoteType } from '../model';
import { isRecord } from '../parse/values';
import { applyFrontmatter, type FrontmatterUpdate } from './frontmatter';

/** 本文の frontmatter を読む。無いか読めなければ undefined（metadataCache は遅れることがあるため。設計書 4.15） */
function parseFrontmatter(content: string): Record<string, unknown> | undefined {
	const info = getFrontMatterInfo(content);
	if (!info.exists) return undefined;
	try {
		const fm: unknown = parseYaml(info.frontmatter);
		return isRecord(fm) ? fm : fm === null ? {} : undefined;
	} catch {
		return undefined;
	}
}

/** ノートを読み、項目の写しにする。withDescription ならタスクの説明も入れる。プロパティが読めなければ undefined */
export async function readNoteItems(app: App, file: TFile, withDescription: boolean): Promise<NoteItems | undefined> {
	const content = await app.vault.read(file);
	const fm = parseFrontmatter(content);
	if (!fm) return undefined;
	return withDescription ? { ...fm, [DESCRIPTION_KEY]: descriptionOf(content) } : fm;
}

/**
 * フォームで変えた項目だけを書く。書く直前にノートが checked と同じか確かめ、違えば NoteChangedError（設計書 4.15）
 * 順序は説明 → プロパティ（説明で止まればプロパティも書かない）
 * @param checked 確かめたノートの写し（更新が無ければ開いたとき、上書きを選んだらダイアログで見せた今のノート）
 * @param form フォームの値のすべて（空の枠を足すのに使う）
 */
export async function writeNoteItems(
	app: App,
	file: TFile,
	type: NoteType,
	checked: NoteItems,
	edited: NoteItems,
	form: NoteItems,
): Promise<void> {
	if (DESCRIPTION_KEY in edited) {
		const text = typeof edited[DESCRIPTION_KEY] === 'string' ? edited[DESCRIPTION_KEY] : '';
		const before = typeof checked[DESCRIPTION_KEY] === 'string' ? checked[DESCRIPTION_KEY] : '';
		await app.vault.process(file, (content) => {
			if (descriptionOf(content) !== before) throw new NoteChangedError();
			return applyDescription(content, before, text);
		});
	}

	const keys = Object.keys(form).filter((k) => k !== DESCRIPTION_KEY);
	const update: FrontmatterUpdate = {};
	for (const [key, value] of Object.entries(edited)) if (key !== DESCRIPTION_KEY) update[key] = toFrontmatterValue(value);
	const frames = frameItems(form, checked);
	// 変える項目も足す枠も無ければ書かない（SVN の差分を出さないため）
	if (Object.keys(update).length === 0 && Object.keys(frames).length === 0) return;
	await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
		if (!sameAsChecked(fm, checked, keys)) throw new NoteChangedError();
		for (const [key, value] of Object.entries(frameItems(form, fm))) if (!(key in update)) update[key] = toFrontmatterValue(value);
		applyFrontmatter(fm, type, update);
	});
}

/** フォームの値（FrontmatterUpdate から来たもの）を書く値として受け取る */
function toFrontmatterValue(value: unknown): FrontmatterUpdate[string] {
	if (value === undefined || value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
	if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value;
	throw new Error(`書けない値です: ${JSON.stringify(value)}`);
}
