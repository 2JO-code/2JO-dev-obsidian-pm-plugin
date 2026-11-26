import { addDays, daysBetween } from '../calc/dates';
import type { IsoDate, NoteId, Sprint } from '../model';
import type { FrontmatterUpdate } from '../write/frontmatter';
import { date, keepFrames, link, linkValue, text, warnUnreadable } from './formValues';

/** スプリントの入力補助フォームの値（設計書 4.5） */
export interface SprintForm {
	title: string;
	project: NoteId;
	start: string;
	end: string;
	goal: string;
}

/** frontmatter からフォームの初期値を作る。読めないリンクは消さずに残す */
export function sprintFormFromFrontmatter(fm: Record<string, unknown>): SprintForm {
	return {
		title: text(fm.title),
		project: link(fm.project, 'project'),
		start: text(fm.start),
		end: text(fm.end),
		goal: text(fm.goal),
	};
}

/** 前のスプリントが無いときの長さ（日。両端を含む） */
const DEFAULT_LENGTH = 14;

/**
 * 新しいスプリントの初期値。名前は「スプリント N」、期間は最後のスプリントの翌日から同じ長さ。
 * スプリントが無ければ today から2週間
 */
export function emptySprintForm(project: NoteId, sprints: readonly Sprint[], today: IsoDate): SprintForm {
	const own = sprints.filter((s) => s.project === project);
	const last = own.filter((s) => s.start && s.end).sort((a, b) => (a.end ?? '').localeCompare(b.end ?? '')).at(-1);
	const length = last?.start && last.end ? Math.max(1, daysBetween(last.start, last.end)) : DEFAULT_LENGTH;
	const start = last?.end ? addDays(last.end, 1) : today;
	return {
		title: project ? `スプリント ${own.length + 1}` : '',
		project,
		start: project ? start : '',
		end: project ? addDays(start, length - 1) : '',
		goal: '',
	};
}

export interface SprintFormResult {
	errors: string[];
	warnings: string[];
	update: FrontmatterUpdate;
}

/**
 * フォームの値を確かめ、frontmatter の変更内容にする（設計書 4.5）
 * @param others 同じプロジェクトのほかのスプリント（期間の重なりを知らせる）
 * @param fixedProject タスクが入っていて、プロジェクトを変えられないときの元のプロジェクト
 */
export function sprintFormToUpdate(form: SprintForm, others: readonly Sprint[], fixedProject?: NoteId): SprintFormResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const title = form.title.trim();
	if (title === '') errors.push('スプリント名を入力してください');
	if (form.project === '') errors.push('プロジェクトを選んでください');
	else if (fixedProject !== undefined && form.project !== fixedProject) errors.push('タスクが入っているスプリントは、プロジェクトを変えられません');
	if (form.start.trim() === '') errors.push('開始日を入力してください');
	if (form.end.trim() === '') errors.push('終了日を入力してください');
	const start = date(form.start, '開始日', errors);
	const end = date(form.end, '終了日', errors);
	if (start && end && end < start) errors.push('終了日が開始日より前になっています');
	if (start && end) {
		const overlaps = others.filter((s) => s.project === form.project && s.start && s.end && s.start <= end && start <= s.end);
		if (overlaps.length > 0) warnings.push(`期間が「${overlaps.map((s) => s.title).join('」「')}」と重なっています`);
	}
	warnUnreadable('プロジェクト', [form.project], 'project', warnings);

	const goal = form.goal.trim();
	const update: FrontmatterUpdate = {
		type: 'sprint',
		title,
		aliases: [title],
		project: form.project ? linkValue(form.project, 'project') : undefined,
		start,
		end,
		goal: goal !== '' ? goal : undefined,
	};
	return { errors, warnings, update: keepFrames(update) };
}
