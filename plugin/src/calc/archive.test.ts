import { describe, expect, it } from 'vitest';
import { defaultStatusSets } from '../config/defaults';
import { archivableProjects, archivePlan, restorableProjects, restorePlan } from './archive';
import { epic, EPIC, indexOf, PJT, PJT2, project, task } from './testData';

const statuses = defaultStatusSets();
const closed = project(PJT, { status: 'クローズ' });
const index = indexOf([
	closed,
	project(PJT2, { status: 'クローズ' }),
	project('PJT-3', { status: '進行中' }),
	epic(EPIC, { status: '完了' }),
	task('T1', { status: '完了', epic: EPIC }),
	task('T2', { status: '進行中' }),
	task('T3', { status: '中止' }),
	task('T9', { project: 'PJT-3' }),
]);
// すでにアーカイブ済みのタスクと、移動先に同じ名前があるタスク
const archived = task('T4', { status: '完了', path: 'Archive/Tasks/T4.md' });
index.set({ path: archived.path, id: archived.id, type: 'task', note: archived, archived: true, problems: [] });
const clash = task('T5', { status: '完了' });
index.set({ path: clash.path, id: clash.id, type: 'task', note: clash, archived: false, problems: [] });
const other = task('T5-old', { status: '完了', project: 'PJT-3', path: 'Archive/Tasks/T5.md' });
index.set({ path: other.path, id: other.id, type: 'task', note: other, archived: true, problems: [] });
// PJT2 はすべてアーカイブ済み
index.set({ path: 'Archive/Projects/PJT-2.md', id: PJT2, type: 'project', note: project(PJT2, { status: 'クローズ', path: 'Archive/Projects/PJT-2.md' }), archived: true, problems: [] });
index.delete('Projects/PJT-2.md');

const plan = archivePlan(index, closed, 'Archive', statuses);

describe('archivePlan', () => {
	it('プロジェクト・エピック・タスクの順に、移動先はアーカイブの下に今のパス', () => {
		expect(plan.items.map((i) => [i.kind, i.from, i.to])).toEqual([
			['project', 'Projects/PJT-1.md', 'Archive/Projects/PJT-1.md'],
			['epic', 'Epics/EPIC-1.md', 'Archive/Epics/EPIC-1.md'],
			['task', 'Tasks/T1.md', 'Archive/Tasks/T1.md'],
			['task', 'Tasks/T2.md', 'Archive/Tasks/T2.md'],
			['task', 'Tasks/T3.md', 'Archive/Tasks/T3.md'],
			['task', 'Tasks/T5.md', 'Archive/Tasks/T5.md'],
		]);
		expect(plan.alreadyDone).toBe(1);
	});

	it('完了系・停止系でないもの、移動先に同じ名前があるものに注意を付ける', () => {
		const notes = new Map(plan.items.map((i) => [i.id, i.notes]));
		expect(notes.get('T1')).toEqual([]);
		expect(notes.get('T2')?.[0]).toContain('「進行中」');
		expect(notes.get('T3')).toEqual([]);
		expect(notes.get('T5')).toEqual(['移動先に同じ名前のファイルがあるので動かしません']);
		expect(plan.items.filter((i) => i.clash).map((i) => i.id)).toEqual(['T5']);
	});
});

describe('archivableProjects', () => {
	it('クローズ済みで、アーカイブの外にファイルが残っているもの', () => {
		expect(archivableProjects(index, 'Archive', statuses).map((p) => p.id)).toEqual([PJT]);
	});
});

describe('restorePlan', () => {
	it('アーカイブ内のファイルを、アーカイブの部分を取った場所へ戻す', () => {
		const back = restorePlan(index, closed, 'Archive');
		expect(back.items.map((i) => [i.from, i.to, i.clash])).toEqual([['Archive/Tasks/T4.md', 'Tasks/T4.md', false]]);
		expect(back.alreadyDone).toBe(6);
	});

	it('戻す先に同じ名前のファイルがあれば動かさない', () => {
		const pjt3 = index.projects({ includeArchived: true }).find((p) => p.id === 'PJT-3');
		if (!pjt3) throw new Error('PJT-3 が無い');
		const back = restorePlan(index, pjt3, 'Archive');
		expect(back.items.map((i) => [i.from, i.to, i.clash])).toEqual([['Archive/Tasks/T5.md', 'Tasks/T5.md', true]]);
	});
});

describe('restorableProjects', () => {
	it('アーカイブの中にファイルがあるもの', () => {
		expect(restorableProjects(index, 'Archive').map((p) => p.id)).toEqual([PJT, 'PJT-3', PJT2]);
	});
});
