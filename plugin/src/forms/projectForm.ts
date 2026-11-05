import { findStatus } from '../config/status';
import type { NoteId, StatusDef } from '../model';
import type { FrontmatterUpdate } from '../write/frontmatter';
import { date, keepFrames, link, linkValue, text, warnUnreadable } from './formValues';

/** プロジェクトの入力補助フォームの値。本文の表（マイルストーン・工数配分）は変えない（設計書 4.5） */
export interface ProjectForm {
	title: string;
	officialName: string;
	caseId: string;
	status: string;
	start: string;
	due: string;
	manager: NoteId;
}

/** frontmatter からフォームの初期値を作る。読めない責任者は消さずに残す（設計書 4.5） */
export function projectFormFromFrontmatter(fm: Record<string, unknown>): ProjectForm {
	return {
		title: text(fm.title),
		officialName: text(fm.official_name),
		caseId: text(fm.case_id),
		status: text(fm.status),
		start: text(fm.start),
		due: text(fm.due),
		manager: link(fm.manager, 'user'),
	};
}

export interface ProjectFormResult {
	/** 入力の誤り。空なら保存できる */
	errors: string[];
	/** 保存してよいが知らせておくこと */
	warnings: string[];
	update: FrontmatterUpdate;
}

/** フォームの値を確かめ、frontmatter の変更内容にする（設計書 4.5） */
export function projectFormToUpdate(form: ProjectForm, statuses: readonly StatusDef[]): ProjectFormResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const title = form.title.trim();
	if (title === '') errors.push('簡易プロジェクト名を入力してください');
	const officialName = form.officialName.trim();
	if (officialName === '') errors.push('正式案件名を入力してください');
	const caseId = form.caseId.trim();
	if (caseId === '') errors.push('案件IDを入力してください');
	const status = findStatus(statuses, form.status);
	if (!status) errors.push('ステータスを選んでください');
	const start = date(form.start, '開始日', errors);
	const due = date(form.due, '期限日', errors);
	if (start && due && due < start) warnings.push('期限日が開始日より前になっています');

	warnUnreadable('責任者', [form.manager], 'user', warnings);

	const update: FrontmatterUpdate = {
		type: 'project',
		title,
		aliases: [title],
		// 数字に見えても文字列で書く（設計書 4.1）
		case_id: caseId,
		official_name: officialName,
		status: status?.name ?? form.status,
		start,
		due,
		manager: form.manager ? linkValue(form.manager, 'user') : undefined,
	};
	return { errors, warnings, update: keepFrames(update) };
}
