import type { Allocation, Milestone, PersonalHoliday, SubtaskCount, WorklogEntry, YearMonth } from '../model';
import { findTableUnderHeading, normalizeLabel, type RawTable, type RawTableRow } from './markdownTable';
import { isIsoDate, isYearMonth, parseHours, parseLinkId } from './values';

/** 表の読み取りで見つかった問題 */
export interface TableProblem {
	/** ファイル先頭からの行番号（0始まり） */
	line: number;
	message: string;
}

export interface TableResult<T> {
	/** 見出しの下に表が見つかったか */
	found: boolean;
	rows: T[];
	problems: TableProblem[];
}

/** 見出し名と列名（要件3.5） */
export const TABLE_SPEC = {
	milestones: { heading: 'マイルストーン', columns: { name: '名前', date: '日付', epic: '連動エピック' } },
	allocations: { heading: '工数配分', columns: { month: '月', member: 'メンバー', hours: '配分(h)' } },
	worklog: {
		heading: '作業ログ',
		columns: { date: '日付', task: 'タスク', planned: '予定(h)', actual: '実績(h)', memo: 'メモ' },
	},
	holidays: { heading: '個人休日', columns: { date: '日付', memo: 'メモ' } },
} as const;

type Columns = Record<string, string>;

/** 表を探し、列名で列を決めて1行ずつ読む（設計書 7章） */
function readTable<C extends Columns, T>(
	text: string,
	spec: { heading: string; columns: C },
	required: (keyof C)[],
	readRow: (get: (key: keyof C) => string, row: RawTableRow, problems: TableProblem[]) => T | null,
): TableResult<T> {
	const table: RawTable | null = findTableUnderHeading(text, spec.heading);
	if (!table) return { found: false, rows: [], problems: [] };

	const index = {} as Record<keyof C, number>;
	const missing: string[] = [];
	for (const key of Object.keys(spec.columns) as (keyof C)[]) {
		index[key] = table.headers.indexOf(normalizeLabel(spec.columns[key] ?? ''));
		if (index[key] < 0 && required.includes(key)) missing.push(spec.columns[key] ?? '');
	}
	if (missing.length > 0) {
		return {
			found: true,
			rows: [],
			problems: [{ line: table.headerLine, message: `「${spec.heading}」の表に列がありません: ${missing.join('、')}` }],
		};
	}

	const rows: T[] = [];
	const problems: TableProblem[] = [];
	for (const row of table.rows) {
		if (row.cells.every((c) => c === '')) continue;
		const get = (key: keyof C) => (index[key] >= 0 ? (row.cells[index[key]] ?? '') : '');
		const value = readRow(get, row, problems);
		if (value) rows.push(value);
	}
	return { found: true, rows, problems };
}

export function parseMilestones(text: string): TableResult<Milestone> {
	return readTable(text, TABLE_SPEC.milestones, ['name', 'date'], (get, { line }, problems) => {
		const name = get('name');
		const date = get('date');
		const epicText = get('epic');
		if (name === '') {
			problems.push({ line, message: 'マイルストーンの名前がありません' });
			return null;
		}
		if (!isIsoDate(date)) {
			problems.push({ line, message: `マイルストーン「${name}」の日付が YYYY-MM-DD ではありません: ${date}` });
			return null;
		}
		const milestone: Milestone = { line, name, date };
		if (epicText !== '') {
			const epic = parseLinkId(epicText, 'epic');
			if (epic) milestone.epic = epic;
			else problems.push({ line, message: `マイルストーン「${name}」の連動エピックがエピックへのリンクではありません: ${epicText}` });
		}
		return milestone;
	});
}

export function parseAllocations(text: string): TableResult<Allocation> {
	return readTable(text, TABLE_SPEC.allocations, ['month', 'member', 'hours'], (get, { line }, problems) => {
		const month = get('month');
		const member = parseLinkId(get('member'), 'user');
		const hours = parseHours(get('hours'));
		if (!isYearMonth(month)) problems.push({ line, message: `工数配分の月が YYYY-MM ではありません: ${month}` });
		if (!member) problems.push({ line, message: `工数配分のメンバーがメンバーへのリンクではありません: ${get('member')}` });
		if (hours === null) problems.push({ line, message: `工数配分の時間が0.25刻みの数値ではありません: ${get('hours')}` });
		if (!isYearMonth(month) || !member || hours === null) return null;
		return { line, month, member, hours };
	});
}

/**
 * 作業ログの表を読む。予定・実績の空欄は 0
 * @param month 対象月。月の外の行は読み飛ばす
 */
export function parseWorklogEntries(text: string, month: YearMonth): TableResult<WorklogEntry> {
	return readTable(text, TABLE_SPEC.worklog, ['date', 'task', 'planned', 'actual'], (get, { line }, problems) => {
		const date = get('date');
		const task = parseLinkId(get('task'), 'task');
		const hours = (key: 'planned' | 'actual') => (get(key) === '' ? 0 : parseHours(get(key)));
		const planned = hours('planned');
		const actual = hours('actual');
		const ok = isIsoDate(date) && date.startsWith(`${month}-`) && task !== null && planned !== null && actual !== null;

		if (!isIsoDate(date)) problems.push({ line, message: `作業ログの日付が YYYY-MM-DD ではありません: ${date}` });
		else if (!date.startsWith(`${month}-`)) problems.push({ line, message: `作業ログの日付が対象月（${month}）の外です: ${date}` });
		if (!task) problems.push({ line, message: `作業ログのタスクがタスクへのリンクではありません: ${get('task')}` });
		if (planned === null) problems.push({ line, message: `作業ログの予定が0.25刻みの数値ではありません: ${get('planned')}` });
		if (actual === null) problems.push({ line, message: `作業ログの実績が0.25刻みの数値ではありません: ${get('actual')}` });
		if (!ok) return null;
		return { line, date, task, planned, actual, memo: get('memo') };
	});
}

/** メンバーノートの個人休日の表を読む。同じ日付は1つにまとめる（最初の行） */
export function parsePersonalHolidays(text: string): TableResult<PersonalHoliday> {
	const seen = new Set<string>();
	return readTable(text, TABLE_SPEC.holidays, ['date'], (get, { line }, problems) => {
		const date = get('date');
		if (!isIsoDate(date)) {
			problems.push({ line, message: `個人休日の日付が YYYY-MM-DD ではありません: ${date}` });
			return null;
		}
		if (seen.has(date)) return null;
		seen.add(date);
		return { line, date, memo: get('memo') };
	});
}

/** 本文のチェックリストを数える。[x] [X] は完了、[ ] は未完了、他の記号は数えない */
export function countSubtasks(text: string): SubtaskCount {
	const lines = text.split(/\r?\n/);
	let start = 0;
	if (lines[0] === '---') {
		const end = lines.indexOf('---', 1);
		if (end > 0) start = end + 1;
	}
	let inCode = false;
	const count: SubtaskCount = { done: 0, total: 0 };
	for (const line of lines.slice(start)) {
		if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
		if (inCode) continue;
		const m = /^\s*(?:[-*+]|\d+[.)])\s+\[(.)\]\s/.exec(line + ' ');
		if (!m) continue;
		if (m[1] === ' ') count.total++;
		else if (m[1] === 'x' || m[1] === 'X') {
			count.total++;
			count.done++;
		}
	}
	return count;
}
