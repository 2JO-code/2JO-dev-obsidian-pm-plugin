import type { NoteType } from '../model';

/** フォームの保存で、開いたあとのノートの更新を見つける（設計書 4.15） */

/** ノートの項目の写し。プロパティはキーごと、タスクの説明は `description` */
export type NoteItems = Record<string, unknown>;

/** 説明の項目のキー */
export const DESCRIPTION_KEY = 'description';

/** 書く直前に、ノートが確かめた写しから変わっていたときの例外 */
export class NoteChangedError extends Error {
	constructor() {
		super('ノートが、確かめたあとにさらに更新されました');
		this.name = 'NoteChangedError';
	}
}

const isEmpty = (v: unknown): boolean => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** 比べるための形。空はすべて ''、数値は文字列、配列は要素ごと */
function canonical(v: unknown): unknown {
	if (isEmpty(v)) return '';
	if (typeof v === 'number') return String(v);
	if (Array.isArray(v)) return v.map(canonical);
	return v;
}

/** 値が同じか。空（undefined・null・''・[]）どうしは同じ。数値と数字の文字列は同じ。配列は順序つき */
export function sameItemValue(a: unknown, b: unknown): boolean {
	return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** 差分の1行 */
export interface NoteChange {
	key: string;
	label: string;
	opened: unknown;
	current: unknown;
	form: unknown;
	/** 開いたあとにノートで変わった */
	changedInNote: boolean;
	/** フォームで変えた */
	editedInForm: boolean;
}

/** ノートで変わった項目と、フォームで変えた項目。並びはフォームの項目の順。labels に無いキーは出さない */
export function noteChanges(opened: NoteItems, current: NoteItems, form: NoteItems, labels: Readonly<Record<string, string>>): NoteChange[] {
	const rows: NoteChange[] = [];
	for (const key of Object.keys(form)) {
		const label = labels[key];
		if (label === undefined) continue;
		const row = {
			key,
			label,
			opened: opened[key],
			current: current[key],
			form: form[key],
			changedInNote: !sameItemValue(current[key], opened[key]),
			editedInForm: !sameItemValue(form[key], opened[key]),
		};
		if (row.changedInNote || row.editedInForm) rows.push(row);
	}
	return rows;
}

/** フォームの値で上書きされる行（ノートとフォームの両方で変わり、値が違う） */
export const isOverwritten = (row: NoteChange): boolean => row.changedInNote && row.editedInForm && !sameItemValue(row.current, row.form);

/** 注意ダイアログを出すか。ノートで変わった項目があれば出す。フォームと同じ値に変わっただけなら出さない */
export const needsConfirm = (rows: readonly NoteChange[]): boolean =>
	rows.some((r) => r.changedInNote && !(r.editedInForm && sameItemValue(r.current, r.form)));

/** 注意ダイアログでの保存のしかた。edited：フォームで変えた項目だけ、all：フォームの内容ですべて */
export type OverwriteMode = 'edited' | 'all';

/** 保存したあとの値 */
export const savedValue = (row: NoteChange, mode: OverwriteMode): unknown => (mode === 'all' || row.editedInForm ? row.form : row.current);

/** フォームで変えた項目だけの写し（書く項目） */
export function editedItems(opened: NoteItems, form: NoteItems): NoteItems {
	return Object.fromEntries(Object.entries(form).filter(([key, value]) => !sameItemValue(value, opened[key])));
}

/** ノートに無いキーのうち、空の枠として書く項目（設計書 4.4） */
export function frameItems(form: NoteItems, present: NoteItems): NoteItems {
	return Object.fromEntries(Object.entries(form).filter(([key, value]) => key !== DESCRIPTION_KEY && isEmpty(value) && !(key in present)));
}

/** 書く直前に、ノートの今の値が確かめた写しと同じか（フォームの項目だけ見る） */
export function sameAsChecked(current: NoteItems, checked: NoteItems, keys: readonly string[]): boolean {
	return keys.every((key) => sameItemValue(current[key], checked[key]));
}

/** 差分の表に出す文字。空は「なし」、リンクはタイトル、配列は「、」でつなぐ */
export function formatItemValue(value: unknown, titleOf: (id: string) => string | undefined): string {
	if (isEmpty(value)) return 'なし';
	if (Array.isArray(value)) return value.map((v) => formatItemValue(v, titleOf)).join('、');
	if (typeof value === 'boolean') return value ? 'はい' : 'いいえ';
	if (typeof value === 'string') {
		const id = /^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/.exec(value.trim())?.[1];
		return id ? (titleOf(id) ?? id) : value;
	}
	if (typeof value === 'number') return String(value);
	return JSON.stringify(value);
}

/** 差分の表に出す項目名。aliases・type は出さない（タイトルと一緒に変わるため） */
export const ITEM_LABELS: Readonly<Record<Exclude<NoteType, 'worklog'>, Readonly<Record<string, string>>>> = {
	task: {
		title: 'タイトル',
		project: 'プロジェクト',
		epic: 'エピック',
		wbs: 'WBS番号',
		status: 'ステータス',
		assignees: '担当者',
		estimate: '見積工数',
		depends_on: '先行タスク',
		start: '開始日',
		due: '期限日',
		plan_start: '当初開始日',
		plan_end: '当初終了日',
		[DESCRIPTION_KEY]: '説明',
	},
	epic: {
		title: 'タイトル',
		project: 'プロジェクト',
		wbs: 'WBS番号',
		status: 'ステータス',
		owner: '担当者',
		start: '開始日',
		due: '期限日',
		inputs: 'インプット',
		outputs: 'アウトプット',
	},
	project: {
		title: '簡易プロジェクト名',
		official_name: '正式案件名',
		case_id: '案件ID',
		status: 'ステータス',
		start: '開始日',
		due: '期限日',
		manager: '責任者',
	},
	user: {
		title: '氏名',
		family_name: '姓',
		given_name: '名',
		daily_hours: '1日の通常稼働時間(h)',
		load_limit_pct: '負荷許容率(%)',
		active: '在籍',
	},
};
