import { findStatus } from '../config/status';
import type { NoteId, StatusDef } from '../model';
import type { FrontmatterUpdate } from '../write/frontmatter';
import { date, keepFrames, link, links, linkValue, text, warnUnreadable } from './formValues';

/** タスクの WBS 番号（エピック内の連番）の形。1以上の整数 */
const TASK_WBS = /^[1-9]\d*$/;

/** タスクの入力補助フォームの値。入力欄の文字列のまま持つ。読めないリンクは元の文字列のまま（設計書 4.5） */
export interface TaskForm {
	title: string;
	project: NoteId;
	epic: NoteId;
	/** エピック内の連番 */
	wbs: string;
	status: string;
	/** 担当者。1人まで（リストのまま持つ） */
	assignees: NoteId[];
	estimate: string;
	dependsOn: NoteId[];
	lagDays: string;
	start: string;
	durationDays: string;
	due: string;
	planStart: string;
	planEnd: string;
}

/** frontmatter からフォームの初期値を作る。読めないリンクは消さずに残す（設計書 4.5） */
export function taskFormFromFrontmatter(fm: Record<string, unknown>): TaskForm {
	return {
		title: text(fm.title),
		project: link(fm.project, 'project'),
		epic: link(fm.epic, 'epic'),
		wbs: text(fm.wbs),
		status: text(fm.status),
		assignees: links(fm.assignees, 'user'),
		estimate: text(fm.estimate),
		dependsOn: links(fm.depends_on, 'task'),
		lagDays: text(fm.lag_days),
		start: text(fm.start),
		durationDays: text(fm.duration_days),
		due: text(fm.due),
		planStart: text(fm.plan_start),
		planEnd: text(fm.plan_end),
	};
}

export interface TaskFormResult {
	/** 入力の誤り。空なら保存できる */
	errors: string[];
	/** 保存してよいが知らせておくこと */
	warnings: string[];
	update: FrontmatterUpdate;
}

function number(value: string, label: string, step: number, errors: string[]): number | undefined {
	if (value.trim() === '') return undefined;
	const n = Number(value);
	if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n / step)) {
		errors.push(step === 1 ? `${label}は0以上の整数で入力してください` : `${label}は0以上で${step}刻みの数値で入力してください`);
		return undefined;
	}
	return n;
}

/** フォームの値を確かめ、frontmatter の変更内容にする（設計書 4.5） */
export function taskFormToUpdate(form: TaskForm, statuses: readonly StatusDef[], selfId: NoteId): TaskFormResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const title = form.title.trim();
	if (title === '') errors.push('タイトルを入力してください');
	if (!form.project) errors.push('プロジェクトを選んでください');
	const status = findStatus(statuses, form.status);
	if (!status) errors.push('ステータスを選んでください');
	if (form.dependsOn.includes(selfId)) errors.push('先行タスクに自分自身は選べません');
	// 担当者は1人まで。キーはリストのまま（要件 3.5、設計書 4.5）
	if (new Set(form.assignees).size > 1) errors.push('担当者は1人だけ選んでください');

	const wbs = form.wbs.trim();
	if (wbs !== '' && !TASK_WBS.test(wbs)) errors.push('WBS番号は1以上の整数で入力してください');
	const estimate = number(form.estimate, '見積工数', 0.25, errors);
	const lagDays = number(form.lagDays, '相対日数', 1, errors);
	const durationDays = number(form.durationDays, '所要日数', 1, errors);
	const start = date(form.start, '開始日', errors);
	const due = date(form.due, '期限日', errors);
	const planStart = date(form.planStart, '予定開始日', errors);
	const planEnd = date(form.planEnd, '予定終了日', errors);
	// 予定は期間として使うので、両方そろえる（要件 3.5）
	if ((form.planStart.trim() === '') !== (form.planEnd.trim() === '')) errors.push('予定開始日と予定終了日は両方入れてください');
	if (planStart && planEnd && planEnd < planStart) errors.push('予定終了日が予定開始日より前になっています');

	if (start && due && due < start) warnings.push('期限日が開始日より前になっています');
	if (start && form.dependsOn.length > 0) warnings.push('先行タスクがあるときは、開始日ではなく先行タスクの終了日から日程を計算します');
	if (lagDays !== undefined && form.dependsOn.length === 0) warnings.push('相対日数は先行タスクがあるときだけ使われます');

	warnUnreadable('プロジェクト', [form.project], 'project', warnings);
	warnUnreadable('エピック', [form.epic], 'epic', warnings);
	warnUnreadable('担当者', form.assignees, 'user', warnings);
	warnUnreadable('先行タスク', form.dependsOn, 'task', warnings);

	const unique = (ids: string[]) => [...new Set(ids)];
	const update: FrontmatterUpdate = {
		type: 'task',
		title,
		aliases: [title],
		project: form.project ? linkValue(form.project, 'project') : undefined,
		epic: form.epic ? linkValue(form.epic, 'epic') : undefined,
		// 数に見える値も文字列で書く（設計書 4.1）
		wbs: TASK_WBS.test(wbs) ? wbs : undefined,
		status: status?.name ?? form.status,
		assignees: form.assignees.length > 0 ? unique(form.assignees).map((v) => linkValue(v, 'user')) : undefined,
		estimate,
		depends_on: form.dependsOn.length > 0 ? unique(form.dependsOn).map((v) => linkValue(v, 'task')) : undefined,
		lag_days: lagDays,
		start,
		duration_days: durationDays,
		due,
		plan_start: planStart,
		plan_end: planEnd,
	};
	return { errors, warnings, update: keepFrames(update) };
}
