import { STATUS_CATEGORIES, type Calendar, type Holiday, type StatusCategory, type StatusDef, type StatusSets } from '../model';
import { defaultCalendar, defaultStatusSets } from './defaults';
import { isRecord } from '../parse/values';
import { errorMessage } from '../errors';

/** 読み取り結果。problems があれば一部が使えなかった */
export interface ParseResult<T> {
	value: T;
	problems: string[];
}

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function parseJson(text: string): { data: unknown; error?: string } {
	try {
		return { data: JSON.parse(text) as unknown };
	} catch (e) {
		return { data: undefined, error: errorMessage(e) };
	}
}

function parseStatusList(raw: unknown, label: string, problems: string[]): StatusDef[] | null {
	if (!Array.isArray(raw)) {
		problems.push(`${label}: 一覧になっていません`);
		return null;
	}
	const list: StatusDef[] = [];
	const seen = new Set<string>();
	raw.forEach((item, i) => {
		const where = `${label}の${i + 1}番目`;
		if (!isRecord(item) || typeof item.name !== 'string' || item.name.trim() === '') {
			problems.push(`${where}: 名前がありません`);
			return;
		}
		const name = item.name.trim();
		if (!STATUS_CATEGORIES.includes(item.category as StatusCategory)) {
			problems.push(`${where}（${name}）: 分類が不正です`);
			return;
		}
		const aliases = Array.isArray(item.aliases)
			? item.aliases.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map((a) => a.trim())
			: [];
		for (const n of [name, ...aliases]) {
			if (seen.has(n)) problems.push(`${where}: 「${n}」が重複しています`);
			seen.add(n);
		}
		list.push({ name, category: item.category as StatusCategory, aliases });
	});
	if (list.length === 0) {
		problems.push(`${label}: 有効なステータスがありません`);
		return null;
	}
	return list;
}

/** `statuses.json` を読む。壊れた部分は初期値で補う（設計書 5.3） */
export function parseStatusSets(text: string): ParseResult<StatusSets> {
	const defaults = defaultStatusSets();
	const { data, error } = parseJson(text);
	if (error !== undefined) return { value: defaults, problems: [`JSONとして読めません: ${error}`] };
	if (!isRecord(data)) return { value: defaults, problems: ['形式が不正です'] };
	const problems: string[] = [];
	return {
		value: {
			task: parseStatusList(data.task, 'タスク・エピック用', problems) ?? defaults.task,
			project: parseStatusList(data.project, 'プロジェクト用', problems) ?? defaults.project,
		},
		problems,
	};
}

/** `calendar.json` を読む。壊れた部分は初期値で補う（設計書 5.3） */
export function parseCalendar(text: string): ParseResult<Calendar> {
	const defaults = defaultCalendar();
	const { data, error } = parseJson(text);
	if (error !== undefined) return { value: defaults, problems: [`JSONとして読めません: ${error}`] };
	if (!isRecord(data)) return { value: defaults, problems: ['形式が不正です'] };

	const problems: string[] = [];
	let weekendsOff = defaults.weekendsOff;
	if (typeof data.weekendsOff === 'boolean') weekendsOff = data.weekendsOff;
	else problems.push('土日の扱い（weekendsOff）が true / false ではありません');

	const holidays: Holiday[] = [];
	if (Array.isArray(data.holidays)) {
		data.holidays.forEach((item, i) => {
			if (isRecord(item) && typeof item.date === 'string' && DATE_PATTERN.test(item.date)) {
				holidays.push({ date: item.date, name: typeof item.name === 'string' ? item.name : '' });
			} else {
				problems.push(`休日の${i + 1}番目: 日付が YYYY-MM-DD ではありません`);
			}
		});
	} else {
		problems.push('休日（holidays）が一覧になっていません');
	}
	holidays.sort((a, b) => a.date.localeCompare(b.date));
	return { value: { weekendsOff, holidays }, problems };
}

/** 書き出し用の文字列。書式を固定する（設計書 5.1） */
export function stringifyStatusSets(sets: StatusSets): string {
	const list = (defs: StatusDef[]) => defs.map((d) => ({ name: d.name, category: d.category, aliases: d.aliases }));
	return JSON.stringify({ task: list(sets.task), project: list(sets.project) }, null, 2) + '\n';
}

export function stringifyCalendar(calendar: Calendar): string {
	const holidays = [...calendar.holidays]
		.sort((a, b) => a.date.localeCompare(b.date))
		.map((h) => ({ date: h.date, name: h.name }));
	return JSON.stringify({ weekendsOff: calendar.weekendsOff, holidays }, null, 2) + '\n';
}
