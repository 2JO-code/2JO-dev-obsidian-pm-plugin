import { describe, expect, it } from 'vitest';
import { activePanel, cleanMemberDashboardLayout, defaultMemberDashboardLayout } from './memberDashboardLayout';

describe('cleanMemberDashboardLayout', () => {
	it('無ければ初期の配置（縦並び・全部表示）', () => {
		expect(cleanMemberDashboardLayout(undefined)).toEqual(defaultMemberDashboardLayout());
	});

	it('並び・表示・状態を保ち、知らない部品と重複は捨て、足りない部品は末尾に足す', () => {
		const layout = cleanMemberDashboardLayout({
			style: 'tabs',
			active: 'taskList',
			panels: [
				{ id: 'taskList', visible: true, state: { taskList: { sort: 'title' } } },
				{ id: 'unknown', visible: true },
				{ id: 'load', visible: false, state: 'bad' },
				{ id: 'taskList', visible: false },
			],
		});
		expect(layout).toEqual({
			style: 'tabs',
			active: 'taskList',
			panels: [
				{ id: 'taskList', visible: true, state: { taskList: { sort: 'title' } } },
				{ id: 'load', visible: false, state: {} },
				{ id: 'projects', visible: true, state: {} },
				{ id: 'worklog', visible: true, state: {} },
				{ id: 'gantt', visible: true, state: {} },
				{ id: 'kanban', visible: true, state: {} },
				{ id: 'wbs', visible: true, state: {} },
			],
		});
	});

	it('不正な見せ方・開いている部品は捨てる', () => {
		const layout = cleanMemberDashboardLayout({ style: 'grid', active: 'x' });
		expect(layout.style).toBe('stack');
		expect(layout.active).toBeUndefined();
	});
});

describe('activePanel', () => {
	const base = defaultMemberDashboardLayout();
	it('選んだ部品が表示中ならそれ', () => {
		expect(activePanel({ ...base, active: 'projects' })).toBe('projects');
	});
	it('選んだ部品が非表示なら、表示している最初の部品', () => {
		const panels = base.panels.map((p) => (p.id === 'projects' || p.id === 'load' ? { ...p, visible: false } : p));
		expect(activePanel({ ...base, active: 'projects', panels })).toBe('taskList');
	});
	it('1つも表示していなければ undefined', () => {
		expect(activePanel({ ...base, panels: base.panels.map((p) => ({ ...p, visible: false })) })).toBeUndefined();
	});
});
