import { parseNoteId } from '../id';
import {
	MEMBER_DEFAULTS,
	REQUIRED_KEYS,
	type Epic,
	type Member,
	type NoteId,
	type NoteType,
	type Project,
	type SubtaskCount,
	type Task,
	type Worklog,
} from '../model';
import { parseAllocations, parseMilestones, parsePersonalHolidays, parseWorklogEntries, type TableProblem } from '../parse/bodyTables';
import { Coercer, TYPE_LABEL } from './coerce';

export type AnyNote = Project | Epic | Task | Member | Worklog;

/** 問題を直せる画面（設計書 8章）。入力補助フォームか、本文の表の編集画面 */
export type ProblemFix = 'form' | 'milestones' | 'allocations' | 'holidays' | 'worklog';

/** ノートごとの問題（警告一覧に出す） */
export interface NoteProblem {
	path: string;
	/** 本文の表の問題なら行番号（0始まり） */
	line?: number;
	message: string;
	/** 直せる画面。無ければノートを開いて直す */
	fix?: ProblemFix;
}

/** 問題を作る（行番号・直す画面は有るときだけ入れる） */
export function problem(path: string, message: string, fix?: ProblemFix, line?: number): NoteProblem {
	return { path, message, ...(line !== undefined ? { line } : {}), ...(fix ? { fix } : {}) };
}

/** 索引に入れる1ファイル分の情報 */
export interface NoteRecord {
	path: string;
	id: NoteId;
	type: NoteType;
	/** 読めなかったときは undefined（理由は problems） */
	note?: AnyNote;
	/** frontmatter の title。note が無くても持つ（設計書 3.4） */
	title?: string;
	/** アーカイブフォルダの中にあるか */
	archived: boolean;
	problems: NoteProblem[];
}

export interface NoteSource {
	path: string;
	/** 拡張子を除いたファイル名 */
	basename: string;
	/** 読めない・無い場合は undefined */
	frontmatter: Record<string, unknown> | undefined;
	/** 本文。プロジェクト・メンバー・作業ログだけ必要（設計書 3.2） */
	content?: string;
	/** タスク本文のチェックリストの集計 */
	subtasks?: SubtaskCount;
	archived?: boolean;
}

/** 1ファイル分の情報からモデルと問題を作る。対象外のファイルは null（設計書 3.1, 3.4） */
export function buildNote(src: NoteSource): NoteRecord | null {
	const parsed = parseNoteId(src.basename);
	if (!parsed) return null;
	const record: NoteRecord = { path: src.path, id: src.basename, type: parsed.type, archived: src.archived ?? false, problems: [] };
	// プロパティの問題は入力補助フォームで直す。作業ログのプロパティにはフォームが無い
	const form: ProblemFix | undefined = parsed.type === 'worklog' ? undefined : 'form';
	const report = (message: string, fix?: ProblemFix, line?: number) => record.problems.push(problem(src.path, message, fix, line));
	const reportTable = (problems: TableProblem[], fix?: ProblemFix) => problems.forEach((p) => report(p.message, fix, p.line));

	if (!src.frontmatter) {
		report('frontmatter（プロパティ）が読めません。SVNのコンフリクトの印（<<<<<<< など）や、書式の誤りがないか確認してください');
		return record;
	}

	const c = new Coercer(src.frontmatter);
	const rawTitle = src.frontmatter.title;
	if (typeof rawTitle === 'string' && rawTitle.trim() !== '') record.title = rawTitle.trim();
	const type = c.string('type');
	if (type !== parsed.type) {
		report(`type が「${type ?? '（なし）'}」ですが、ファイル名は${TYPE_LABEL[parsed.type]}（${parsed.type}）です`, form);
	}
	const missing = REQUIRED_KEYS[parsed.type].filter((key) => key !== 'type' && !c.has(key));
	if (missing.length > 0) report(`必須のプロパティがありません: ${missing.join(', ')}`, form);

	const base = { id: record.id, path: src.path };
	const titled = () => {
		const title = c.string('title') ?? '';
		return { ...base, title, aliases: c.strings('aliases') };
	};

	// 必須項目が欠けていても全項目を読む（設計書 3.4）
	switch (parsed.type) {
		case 'project': {
			const status = c.string('status');
			const fields = {
				caseId: c.string('case_id', true) ?? '',
				officialName: c.string('official_name') ?? '',
				...optional({ start: c.date('start'), due: c.date('due'), manager: c.link('manager', 'user') }),
			};
			const milestones = parseMilestones(src.content ?? '');
			const allocations = parseAllocations(src.content ?? '');
			reportTable(milestones.problems, 'milestones');
			reportTable(allocations.problems, 'allocations');
			if (status !== undefined) {
				record.note = {
					...titled(),
					type: 'project',
					status,
					...fields,
					milestones: milestones.rows,
					allocations: allocations.rows,
				};
			}
			break;
		}
		case 'epic': {
			const project = c.link('project', 'project');
			const status = c.string('status');
			const fields = {
				...optional({ owner: c.link('owner', 'user'), wbs: c.string('wbs', true), start: c.date('start'), due: c.date('due') }),
				inputs: c.strings('inputs'),
				outputs: c.strings('outputs'),
			};
			if (project && status !== undefined) {
				record.note = { ...titled(), type: 'epic', project, status, ...fields };
			}
			break;
		}
		case 'task': {
			const project = c.link('project', 'project');
			const status = c.string('status');
			const fields = {
				assignees: c.links('assignees', 'user'),
				dependsOn: c.links('depends_on', 'task'),
				...optional({
					epic: c.link('epic', 'epic'),
					wbs: c.string('wbs', true),
					estimate: c.number('estimate', { step: 0.25 }),
					lagDays: c.number('lag_days', { step: 1 }),
					start: c.date('start'),
					durationDays: c.number('duration_days', { step: 1 }),
					due: c.date('due'),
				}),
				subtasks: src.subtasks ?? { done: 0, total: 0 },
			};
			if (project && status !== undefined) {
				record.note = { ...titled(), type: 'task', project, status, ...fields };
			}
			break;
		}
		case 'user': {
			// 個人休日の表は任意（無ければ休日なし）
			const holidays = parsePersonalHolidays(src.content ?? '');
			reportTable(holidays.problems, 'holidays');
			record.note = {
				...titled(),
				type: 'user',
				dailyHours: c.number('daily_hours', { step: 0.25 }) ?? MEMBER_DEFAULTS.dailyHours,
				loadLimitPct: c.number('load_limit_pct', { step: 1 }) ?? MEMBER_DEFAULTS.loadLimitPct,
				active: c.boolean('active') ?? MEMBER_DEFAULTS.active,
				holidays: holidays.rows,
			};
			break;
		}
		case 'worklog': {
			// メンバーと月はファイル名を正とする
			if (c.has('member') && c.link('member', 'user') !== parsed.member) {
				report(`member がファイル名のメンバー（${parsed.member}）と一致しません`);
			}
			if (c.has('month') && c.string('month') !== parsed.month) {
				report(`month がファイル名の月（${parsed.month}）と一致しません`);
			}
			const entries = parseWorklogEntries(src.content ?? '', parsed.month);
			if (!entries.found) report('「## 作業ログ」の表がありません');
			reportTable(entries.problems, 'worklog');
			record.note = { ...base, type: 'worklog', member: parsed.member, month: parsed.month, entries: entries.rows };
			break;
		}
	}

	c.problems.forEach((message) => report(message, form));
	return record;
}

/** undefined の項目を取り除く */
function optional<T extends Record<string, unknown>>(values: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(values)) if (value !== undefined) result[key] = value;
	return result as { [K in keyof T]?: Exclude<T[K], undefined> };
}
