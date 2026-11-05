import type { NoteType } from './common';

/** 種類ごとの frontmatter のキーと書き出し順（要件3.5の表の順。設計書 4.1） */
export const FRONTMATTER_KEYS = {
	project: ['type', 'title', 'aliases', 'case_id', 'official_name', 'status', 'start', 'due', 'manager'],
	epic: ['type', 'title', 'aliases', 'project', 'status', 'owner', 'wbs', 'start', 'due', 'inputs', 'outputs'],
	task: [
		'type',
		'title',
		'aliases',
		'project',
		'epic',
		'status',
		'assignees',
		'estimate',
		'depends_on',
		'lag_days',
		'start',
		'duration_days',
		'due',
	],
	user: ['type', 'title', 'aliases', 'daily_hours', 'load_limit_pct', 'active'],
	worklog: ['type', 'member', 'month'],
} as const satisfies Record<NoteType, readonly string[]>;

/** リストの値を持つキー。空の枠は `[]`、ほかは `null` にする（設計書 4.4） */
export const LIST_KEYS: ReadonlySet<string> = new Set(['aliases', 'inputs', 'outputs', 'assignees', 'depends_on']);

/** 値が空のときに書く値（キーは消さずに枠として残す。設計書 4.4） */
export const emptyValue = (key: string): null | [] => (LIST_KEYS.has(key) ? [] : null);

/** 必須キー（要件3.5の「必須」列） */
export const REQUIRED_KEYS = {
	project: ['type', 'title', 'aliases', 'case_id', 'official_name', 'status'],
	epic: ['type', 'title', 'aliases', 'project', 'status'],
	task: ['type', 'title', 'aliases', 'project', 'status'],
	user: ['type', 'title', 'aliases', 'daily_hours', 'load_limit_pct', 'active'],
	worklog: ['type', 'member', 'month'],
} as const satisfies Record<NoteType, readonly string[]>;
