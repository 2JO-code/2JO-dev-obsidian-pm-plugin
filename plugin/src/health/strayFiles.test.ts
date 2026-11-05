import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings';
import { findStrayFiles, isStrayPath } from './strayFiles';

const U = '0192f3a0-1234-7abc-8def-000000000001';
const folders = DEFAULT_SETTINGS.folders;

describe('isStrayPath', () => {
	it('管理フォルダの ID の形でない Markdown は対象', () => {
		expect(isStrayPath('Tasks/無題のファイル.md', folders)).toBe(true);
		expect(isStrayPath(`Tasks/TASK-${U} 1.md`, folders)).toBe(true);
		expect(isStrayPath('Projects/sub/メモ.md', folders)).toBe(true);
		expect(isStrayPath('Members/Logs/メモ.md', folders)).toBe(true);
		expect(isStrayPath('Archive/2025/メモ.md', folders)).toBe(true);
	});

	it('ID の形のノートは対象外', () => {
		expect(isStrayPath(`Tasks/TASK-${U}.md`, folders)).toBe(false);
		expect(isStrayPath(`Members/Logs/USER-${U}_2026-11.md`, folders)).toBe(false);
	});

	it('管理フォルダの外・共有設定のフォルダ・Markdown 以外は対象外', () => {
		expect(isStrayPath('README.md', folders)).toBe(false);
		expect(isStrayPath('Daily/メモ.md', folders)).toBe(false);
		expect(isStrayPath('TasksOld/メモ.md', folders)).toBe(false);
		expect(isStrayPath('_pm/メモ.md', folders)).toBe(false);
		expect(isStrayPath('Tasks/画像.png', folders)).toBe(false);
	});

	it('設定したフォルダのパスに従う', () => {
		const custom = { ...folders, tasks: 'PM/タスク' };
		expect(isStrayPath('PM/タスク/メモ.md', custom)).toBe(true);
		expect(isStrayPath('Tasks/メモ.md', custom)).toBe(false);
	});
});

describe('findStrayFiles', () => {
	it('対象のファイルだけを警告にする', () => {
		const problems = findStrayFiles(['README.md', 'Tasks/メモ.md', `Tasks/TASK-${U}.md`], folders);
		expect(problems.map((p) => p.path)).toEqual(['Tasks/メモ.md']);
		expect(problems[0]?.message).toContain('ID の形でない');
	});
});
