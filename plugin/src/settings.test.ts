import { describe, expect, it } from 'vitest';
import {
	cleanColor,
	cleanFolderPath,
	cleanProjectSections,
	DEFAULT_PERSONAL,
	DEFAULT_SETTINGS,
	mergePersonal,
	mergeSettings,
	moveSection,
	projectLabel,
	reportFolderProblem,
} from './settings';

describe('projectLabel', () => {
	const p = { title: '新製品CG', caseId: '0123', officialName: '' };
	it('設定で選んだ項目を使い、空なら簡易プロジェクト名', () => {
		expect(projectLabel(p, 'case_id')).toBe('0123');
		expect(projectLabel(p, 'official_name')).toBe('新製品CG');
		expect(projectLabel(p, 'title')).toBe('新製品CG');
	});
});

describe('cleanFolderPath', () => {
	it('区切りを / にそろえ、前後の空白と / を取り除く', () => {
		expect(cleanFolderPath(' /Members\\Logs/ ')).toBe('Members/Logs');
		expect(cleanFolderPath('a//b/./c')).toBe('a/b/c');
	});

	it('空や Vault の外を指すパスは null', () => {
		expect(cleanFolderPath('  ')).toBeNull();
		expect(cleanFolderPath('/')).toBeNull();
		expect(cleanFolderPath('../outside')).toBeNull();
	});
});

describe('mergeSettings', () => {
	it('保存データが無ければ既定値', () => {
		expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
	});

	it('保存されている値を使い、足りない項目は既定値で補う', () => {
		const result = mergeSettings({ folders: { tasks: 'Work/Tasks/' } });
		expect(result.folders.tasks).toBe('Work/Tasks');
		expect(result.folders.projects).toBe('Projects');
	});

	it('不正な値は既定値に置き換える', () => {
		const result = mergeSettings({ folders: { tasks: '', logs: 3 } });
		expect(result.folders.tasks).toBe('Tasks');
		expect(result.folders.logs).toBe('Members/Logs');
	});

	it('個人の設定（以前は data.json に入れていた項目）は持たない', () => {
		expect(mergeSettings({ projectDisplayName: 'case_id', openNoteIn: 'window' })).toEqual(DEFAULT_SETTINGS);
	});

	it('色は #rrggbb だけを受け付け、小文字にそろえる', () => {
		const result = mergeSettings({ colors: { project: '#AABBCC', epic: 'red', task: 3 } });
		expect(result.colors).toEqual({ project: '#aabbcc', epic: DEFAULT_SETTINGS.colors.epic, task: DEFAULT_SETTINGS.colors.task });
		expect(cleanColor(' #123456 ')).toBe('#123456');
		expect(cleanColor('#12345')).toBeUndefined();
	});

	it('ステータスの色は、使える色だけをステータス名ごとに残す', () => {
		const result = mergeSettings({ statusColors: { task: { 進行中: '#AABBCC', 完了: 'green' }, project: 'x' } });
		expect(result.statusColors).toEqual({ task: { 進行中: '#aabbcc' }, project: {} });
	});

	it('既定値のオブジェクトを書き換えない', () => {
		mergeSettings({ folders: { tasks: 'X' } });
		expect(DEFAULT_SETTINGS.folders.tasks).toBe('Tasks');
	});
});

describe('reportFolderProblem', () => {
	it('Windows の絶対パスだけを受け付ける', () => {
		expect(reportFolderProblem('C:\\reports')).toBeNull();
		expect(reportFolderProblem('Z:/共有/pm')).toBeNull();
		expect(reportFolderProblem('\\\\server\\share')).toBeNull();
		expect(reportFolderProblem('')).toContain('決まっていません');
		expect(reportFolderProblem('reports')).toContain('の形で');
		expect(reportFolderProblem('\\\\server')).toContain('の形で');
	});
});

describe('mergePersonal', () => {
	it('保存データが無ければ既定値', () => {
		expect(mergePersonal(null)).toEqual(DEFAULT_PERSONAL);
	});

	it('不正な値は既定値に置き換える', () => {
		expect(mergePersonal({ projectDisplayName: 'name' })).toEqual(DEFAULT_PERSONAL);
		expect(mergePersonal({ reportFolder: 3 }).reportFolder).toBe('');
		expect(mergePersonal({ reportFolder: ' \\\\server\\share\\pm ' }).reportFolder).toBe('\\\\server\\share\\pm');
	});

	it('個人の設定がまだ無ければ、以前 data.json に入れていた値を引き継ぐ', () => {
		expect(mergePersonal(null, { projectDisplayName: 'case_id' })).toEqual({ ...DEFAULT_PERSONAL, projectDisplayName: 'case_id' });
		expect(mergePersonal({ projectDisplayName: 'title' }, { projectDisplayName: 'case_id' }).projectDisplayName).toBe('title');
	});
});

describe('プロジェクト状況の節の並び', () => {
	it('保存が無ければ初期の並びで全部表示', () => {
		expect(cleanProjectSections(undefined)).toEqual(DEFAULT_PERSONAL.projectSections);
	});

	it('保存した並びと表示を守り、知らない節・重複は捨て、足りない節は末尾に足す', () => {
		const raw = [
			{ id: 'epics', visible: false },
			{ id: 'unknown', visible: true },
			{ id: 'milestones' },
			{ id: 'epics', visible: true },
			'progress',
		];
		expect(cleanProjectSections(raw)).toEqual([
			{ id: 'epics', visible: false },
			{ id: 'milestones', visible: true },
			{ id: 'progress', visible: true },
			{ id: 'allocation', visible: true },
		]);
	});

	it('1つ上・下へ動かす。端では変えない', () => {
		const list = DEFAULT_PERSONAL.projectSections;
		expect(moveSection(list, 1, -1).map((s) => s.id)).toEqual(['milestones', 'progress', 'epics', 'allocation']);
		expect(moveSection(list, 1, 1).map((s) => s.id)).toEqual(['progress', 'epics', 'milestones', 'allocation']);
		expect(moveSection(list, 0, -1)).toEqual(list);
		expect(moveSection(list, 3, 1)).toEqual(list);
	});
});
