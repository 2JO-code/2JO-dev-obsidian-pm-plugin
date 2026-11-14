import { describe, expect, it } from 'vitest';
import { worklog } from '../calc/testData';
import { gridKey } from '../calc/worklogCells';
import type { Worklog } from '../model';
import { WorklogGridDraft } from './worklogGridDraft';

const U1 = 'USER-0192f3a0-1234-7abc-8def-000000000001';
const U2 = 'USER-0192f3a0-1234-7abc-8def-000000000002';
const T1 = 'TASK-0192f3a0-1234-7abc-8def-000000000011';
const T2 = 'TASK-0192f3a0-1234-7abc-8def-000000000012';
const D1 = '2026-11-02';
const D2 = '2026-12-01';
const week = [D1, '2026-11-03'];

/** 索引の作業ログを差し替えられる入力の状態 */
function setup(initial: Worklog[] = [worklog(U1, '2026-11', [[D1, T1, 1, 2]])]) {
	let logs = initial;
	const draft = new WorklogGridDraft(() => logs);
	return { draft, setLogs: (next: Worklog[]) => (logs = next) };
}

describe('WorklogGridDraft', () => {
	it('入力が無ければ記録の値。保存していないマスは0', () => {
		const { draft } = setup();
		const base = draft.baseOf(U1, week);
		expect(draft.hours(U1, gridKey(D1, T1), base)).toEqual({ planned: '1', actual: '2' });
		expect(draft.dirtyCount()).toBe(0);
	});

	it('予定か実績の片方を入れても、もう片方は記録の値のまま', () => {
		const { draft } = setup();
		const base = draft.baseOf(U1, week);
		draft.set(U1, gridKey(D1, T1), 'actual', '3', base);
		expect(draft.hours(U1, gridKey(D1, T1), base)).toEqual({ planned: '1', actual: '3' });
		expect(draft.edited(U1, gridKey(D1, T1), 'actual', base)).toBe(true);
		expect(draft.edited(U1, gridKey(D1, T1), 'planned', base)).toBe(false);
	});

	it('記録と同じ値に戻したら、保存していないマスに数えない', () => {
		const { draft } = setup();
		const base = draft.baseOf(U1, week);
		draft.set(U1, gridKey(D1, T1), 'actual', '3', base);
		draft.set(U1, gridKey(D1, T1), 'actual', '2.0', base);
		expect(draft.edited(U1, gridKey(D1, T1), 'actual', base)).toBe(false);
		expect(draft.dirtyCount()).toBe(0);
	});

	it('メンバーごとに分けて持ち、月をまたいでも数える', () => {
		const { draft } = setup();
		draft.set(U1, gridKey(D1, T2), 'planned', '1', draft.baseOf(U1, week));
		draft.set(U1, gridKey(D2, T2), 'planned', '2', draft.baseOf(U1, [D2]));
		draft.set(U2, gridKey(D1, T1), 'actual', '0.5', draft.baseOf(U2, week));
		expect(draft.dirtyCount()).toBe(3);
		expect(draft.editedTasks(U1)).toEqual([T2]);
		expect(draft.editedTasks(U2)).toEqual([T1]);
		expect(draft.changes().map((c) => [c.member, c.changes.map((x) => x.date)])).toEqual([
			[U1, [D1, D2]],
			[U2, [D1]],
		]);
	});

	it('保存したマスは入力から外し、索引に載るまで記録の値に重ねる', () => {
		const { draft, setLogs } = setup();
		const key = gridKey(D1, T1);
		draft.set(U1, key, 'actual', '3', draft.baseOf(U1, week));
		const [change] = draft.changes()[0]?.changes ?? [];
		draft.markSaved(U1, change ? [change] : []);
		expect(draft.dirtyCount()).toBe(0);
		expect(draft.baseOf(U1, week).get(key)).toEqual({ planned: '1', actual: '3' });

		// 索引がまだ古いうちは残す
		draft.pruneSaved();
		expect(draft.baseOf(U1, week).get(key)?.actual).toBe('3');

		// 索引に載ったら片付ける（索引の値をそのまま使う）
		setLogs([worklog(U1, '2026-11', [[D1, T1, 1, 3]])]);
		draft.pruneSaved();
		setLogs([]);
		expect(draft.baseOf(U1, week).has(key)).toBe(false);
	});
});
