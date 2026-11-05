import { findStatus } from '../config/status';
import type { NoteId, StatusDef } from '../model';
import type { FrontmatterUpdate } from '../write/frontmatter';
import { date, keepFrames, link, linkValue, text, warnUnreadable } from './formValues';

/** エピックの入力補助フォームの値（設計書 4.5） */
export interface EpicForm {
	title: string;
	project: NoteId;
	status: string;
	owner: NoteId;
	wbs: string;
	start: string;
	due: string;
	/** インプット・アウトプットは1行に1つ */
	inputs: string;
	outputs: string;
}

/** リストの値を1行に1つの文字列にする */
const lines = (v: unknown): string =>
	(Array.isArray(v) ? v : [v])
		.map(text)
		.filter((s) => s !== '')
		.join('\n');

/** 1行に1つの文字列をリストにする。空ならリストを空の枠にする */
const list = (value: string): string[] | undefined => {
	const items = value
		.split('\n')
		.map((s) => s.trim())
		.filter((s) => s !== '');
	return items.length > 0 ? items : undefined;
};

/** frontmatter からフォームの初期値を作る。読めないリンクは消さずに残す（設計書 4.5） */
export function epicFormFromFrontmatter(fm: Record<string, unknown>): EpicForm {
	return {
		title: text(fm.title),
		project: link(fm.project, 'project'),
		status: text(fm.status),
		owner: link(fm.owner, 'user'),
		wbs: text(fm.wbs),
		start: text(fm.start),
		due: text(fm.due),
		inputs: lines(fm.inputs),
		outputs: lines(fm.outputs),
	};
}

export interface EpicFormResult {
	/** 入力の誤り。空なら保存できる */
	errors: string[];
	/** 保存してよいが知らせておくこと */
	warnings: string[];
	update: FrontmatterUpdate;
}

/**
 * フォームの値を確かめ、frontmatter の変更内容にする（設計書 4.5）
 * @param fixedProject タスクやマイルストーンの連動があり、プロジェクトを変えられないときの元のプロジェクト
 */
export function epicFormToUpdate(form: EpicForm, statuses: readonly StatusDef[], fixedProject?: NoteId): EpicFormResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const title = form.title.trim();
	if (title === '') errors.push('タイトルを入力してください');
	if (form.project === '') errors.push('プロジェクトを選んでください');
	else if (fixedProject !== undefined && form.project !== fixedProject) errors.push('タスクかマイルストーンの連動があるエピックは、プロジェクトを変えられません');
	const status = findStatus(statuses, form.status);
	if (!status) errors.push('ステータスを選んでください');
	const start = date(form.start, '開始日', errors);
	const due = date(form.due, '完了予定日', errors);
	if (start && due && due < start) warnings.push('完了予定日が開始日より前になっています');

	warnUnreadable('プロジェクト', [form.project], 'project', warnings);
	warnUnreadable('担当者', [form.owner], 'user', warnings);

	const wbs = form.wbs.trim();
	const update: FrontmatterUpdate = {
		type: 'epic',
		title,
		aliases: [title],
		project: form.project ? linkValue(form.project, 'project') : undefined,
		status: status?.name ?? form.status,
		owner: form.owner ? linkValue(form.owner, 'user') : undefined,
		// 数字に見えても文字列で書く（設計書 4.1）
		wbs: wbs !== '' ? wbs : undefined,
		start,
		due,
		inputs: list(form.inputs),
		outputs: list(form.outputs),
	};
	return { errors, warnings, update: keepFrames(update) };
}
