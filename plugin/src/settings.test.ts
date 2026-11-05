import { describe, expect, it } from 'vitest';
import { cleanColor, cleanFolderPath, cleanPaneRatio, DEFAULT_PERSONAL, DEFAULT_SETTINGS, mergePersonal, mergeSettings, projectLabel, reportFolderProblem } from './settings';

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

describe('cleanPaneRatio', () => {
	it('30〜80% の 5% 刻みに丸める', () => {
		expect(cleanPaneRatio(62)).toBe(60);
		expect(cleanPaneRatio(63)).toBe(65);
		expect(cleanPaneRatio(10)).toBe(30);
		expect(cleanPaneRatio(95)).toBe(80);
		expect(cleanPaneRatio(Number.NaN)).toBeUndefined();
		expect(cleanPaneRatio('60')).toBeUndefined();
	});
});

describe('mergePersonal', () => {
	it('保存データが無ければ既定値', () => {
		expect(mergePersonal(null)).toEqual(DEFAULT_PERSONAL);
	});

	it('不正な値は既定値に置き換える', () => {
		expect(mergePersonal({ projectDisplayName: 'name', openNoteIn: 'split' })).toEqual(DEFAULT_PERSONAL);
		expect(mergePersonal({ openNoteIn: 'window' }).openNoteIn).toBe('window');
		expect(mergePersonal({ openNoteIn: 'tab' }).openNoteIn).toBe('tab');
		expect(mergePersonal({}).openNoteIn).toBe('right');
		expect(mergePersonal({ paneRatio: '50' }).paneRatio).toBe(60);
		expect(mergePersonal({ paneRatio: 50 }).paneRatio).toBe(50);
		expect(mergePersonal({ reportFolder: 3 }).reportFolder).toBe('');
		expect(mergePersonal({ reportFolder: ' \\\\server\\share\\pm ' }).reportFolder).toBe('\\\\server\\share\\pm');
	});

	it('個人の設定がまだ無ければ、以前 data.json に入れていた値を引き継ぐ', () => {
		expect(mergePersonal(null, { projectDisplayName: 'case_id', openNoteIn: 'window' })).toEqual({
			projectDisplayName: 'case_id',
			openNoteIn: 'window',
			paneRatio: 60,
			reportFolder: '',
		});
		expect(mergePersonal({ projectDisplayName: 'title' }, { projectDisplayName: 'case_id' }).projectDisplayName).toBe('title');
	});
});
