// テスト用のデータを作る関数（calc/ のテストで共有する）
import type { Epic, Member, Project, Task, Worklog, WorklogEntry } from '../model';
import type { AnyNote } from '../store/buildNote';
import { VaultIndex } from '../store/vaultIndex';

export const PJT = 'PJT-1';
export const PJT2 = 'PJT-2';
export const EPIC = 'EPIC-1';
export const USER = 'USER-1';
export const USER2 = 'USER-2';

export function task(id: string, overrides: Partial<Task> = {}): Task {
	return {
		id,
		path: `Tasks/${id}.md`,
		type: 'task',
		title: id,
		aliases: [id],
		project: PJT,
		status: '未着手',
		assignees: [USER],
		dependsOn: [],
		subtasks: { done: 0, total: 0 },
		...overrides,
	};
}

export function epic(id: string, overrides: Partial<Epic> = {}): Epic {
	return { id, path: `Epics/${id}.md`, type: 'epic', title: id, aliases: [id], project: PJT, status: '進行中', inputs: [], outputs: [], ...overrides };
}

export function project(id: string, overrides: Partial<Project> = {}): Project {
	return {
		id,
		path: `Projects/${id}.md`,
		type: 'project',
		title: id,
		aliases: [id],
		caseId: '',
		officialName: '',
		status: '進行中',
		milestones: [],
		allocations: [],
		...overrides,
	};
}

export function member(id: string, overrides: Partial<Member> = {}): Member {
	return { id, path: `Members/${id}.md`, type: 'user', title: id, aliases: [id], dailyHours: 8, loadLimitPct: 120, active: true, holidays: [], ...overrides };
}

/** ノートを入れた索引 */
export function indexOf(notes: AnyNote[]): VaultIndex {
	const index = new VaultIndex();
	for (const note of notes) index.set({ path: note.path, id: note.id, type: note.type, note, archived: false, problems: [] });
	return index;
}

export function worklog(memberId: string, month: string, entries: [date: string, task: string, planned: number, actual: number][]): Worklog {
	return {
		id: `${memberId}_${month}`,
		path: `Members/Logs/${memberId}_${month}.md`,
		type: 'worklog',
		member: memberId,
		month,
		entries: entries.map(([date, t, planned, actual], line): WorklogEntry => ({ line, date, task: t, planned, actual, memo: '' })),
	};
}
