import type { IsoDate, NoteId, TableRow, TitledNote, YearMonth } from './common';

export interface Milestone extends TableRow {
	name: string;
	date: IsoDate;
	/** 連動エピック（任意）。指定時はエピックの完了予定日を表示する */
	epic?: NoteId;
}

/** 工数配分表の1行：月×メンバーの配分工数 */
export interface Allocation extends TableRow {
	month: YearMonth;
	member: NoteId;
	hours: number;
}

export interface Project extends TitledNote {
	type: 'project';
	/** title は簡易プロジェクト名 */
	caseId: string;
	officialName: string;
	status: string;
	start?: IsoDate;
	due?: IsoDate;
	manager?: NoteId;
	milestones: Milestone[];
	allocations: Allocation[];
}

export interface Epic extends TitledNote {
	type: 'epic';
	project: NoteId;
	status: string;
	/** 担当者（1人） */
	owner?: NoteId;
	/** 例：`1.2`。表示順に使う。数値にしない（設計書 2章） */
	wbs?: string;
	start?: IsoDate;
	/** 完了予定日 */
	due?: IsoDate;
	inputs: string[];
	outputs: string[];
}

/** 本文のチェックリスト（サブタスク）の集計 */
export interface SubtaskCount {
	done: number;
	total: number;
}

export interface Task extends TitledNote {
	type: 'task';
	project: NoteId;
	epic?: NoteId;
	/** エピック内の連番（例：`3`）。表示は「エピックの WBS.連番」（設計書 11.17） */
	wbs?: string;
	status: string;
	assignees: NoteId[];
	/** 見積工数(h)。0.25刻み */
	estimate?: number;
	/** 先行タスク */
	dependsOn: NoteId[];
	/** 先行タスク終了からの稼働日数 */
	lagDays?: number;
	/** 先行タスクがない場合の開始日 */
	start?: IsoDate;
	/** 所要日数（稼働日） */
	durationDays?: number;
	/** 期限日（固定値） */
	due?: IsoDate;
	/** 予定開始日（最初の計画。固定値） */
	planStart?: IsoDate;
	/** 予定終了日（最初の計画。固定値）。計算上の終了日と比べて遅れを出す */
	planEnd?: IsoDate;
	subtasks: SubtaskCount;
}

/** 個人休日の表の1行（印を出すだけで計算には使わない。要件3.5） */
export interface PersonalHoliday extends TableRow {
	date: IsoDate;
	memo: string;
}

export interface Member extends TitledNote {
	type: 'user';
	// title は氏名（姓・名とは別に入力する）
	/** 姓。入力しなおす前の古いメンバーには無い（設計書 4.5） */
	familyName?: string;
	/** 名 */
	givenName?: string;
	dailyHours: number;
	loadLimitPct: number;
	active: boolean;
	/** 本文の「個人休日」の表 */
	holidays: PersonalHoliday[];
}

/** USER の既定値（要件3.5） */
export const MEMBER_DEFAULTS = {
	dailyHours: 8,
	loadLimitPct: 120,
	active: true,
} as const satisfies Pick<Member, 'dailyHours' | 'loadLimitPct' | 'active'>;
