import { describe, expect, it } from 'vitest';
import { defaultCalendar, defaultStatusSets } from '../config/defaults';
import { buildNote } from '../store/buildNote';
import { VaultIndex } from '../store/vaultIndex';
import { ContextCache } from './context';

const TASK = 'TASK-0192f3a0-1234-7abc-8def-000000000001';
const PJT = 'PJT-0192f3a0-1234-7abc-8def-000000000002';

const task = () =>
	buildNote({
		path: `tasks/${TASK}.md`,
		basename: TASK,
		frontmatter: { type: 'task', title: 'A', project: `[[${PJT}]]`, status: '未着手' },
	});

describe('ContextCache', () => {
	it('索引・共有設定・今日が同じなら同じものを返し、どれかが変われば作り直す', () => {
		const index = new VaultIndex();
		const statuses = defaultStatusSets();
		const calendar = defaultCalendar();
		const cache = new ContextCache();
		const first = cache.get(index, statuses, calendar, '2026-11-03');
		expect(cache.get(index, statuses, calendar, '2026-11-03')).toBe(first);

		const record = task();
		if (record) index.set(record);
		const afterChange = cache.get(index, statuses, calendar, '2026-11-03');
		expect(afterChange).not.toBe(first);
		expect(afterChange.index.tasks()).toHaveLength(1);

		expect(cache.get(index, defaultStatusSets(), calendar, '2026-11-03')).not.toBe(afterChange);
		const sameAgain = cache.get(index, statuses, calendar, '2026-11-03');
		expect(cache.get(index, statuses, defaultCalendar(), '2026-11-03')).not.toBe(sameAgain);
		expect(cache.get(index, statuses, calendar, '2026-11-04').today).toBe('2026-11-04');
	});

	it('索引からノートを消しても作り直す', () => {
		const index = new VaultIndex();
		const record = task();
		if (record) index.set(record);
		const cache = new ContextCache();
		const statuses = defaultStatusSets();
		const calendar = defaultCalendar();
		const before = cache.get(index, statuses, calendar, '2026-11-03');
		index.delete(`tasks/${TASK}.md`);
		expect(cache.get(index, statuses, calendar, '2026-11-03')).not.toBe(before);
	});
});
