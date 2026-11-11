/** プラグイン設定（全員共通）と個人の設定の型と既定値（設計書 6章） */
import { cleanMemberDashboardLayout, defaultMemberDashboardLayout, type MemberDashboardLayout } from './memberDashboardLayout';
import { isRecord, oneOf } from './parse/values';

/** ビューでのプロジェクト表示名に使う項目（要件3.5） */
export type ProjectDisplayName = 'title' | 'case_id' | 'official_name';

export const PROJECT_DISPLAY_NAMES: readonly ProjectDisplayName[] = ['title', 'case_id', 'official_name'];

/** 各フォルダのパス（Vaultのルートからの相対パス） */
export interface FolderSettings {
	projects: string;
	epics: string;
	tasks: string;
	members: string;
	/** 作業ログ */
	logs: string;
	archive: string;
	/** 共有設定（statuses.json, calendar.json） */
	config: string;
}

/** 種類ごとの色（`#rrggbb`。設計書 6章） */
export interface KindColors {
	project: string;
	epic: string;
	task: string;
}

/** ステータスごとに選んだ色（ステータス名 → `#rrggbb`）。選んでいないものは分類の色（設計書 6章） */
export interface StatusColors {
	/** タスク・エピック用 */
	task: Record<string, string>;
	project: Record<string, string>;
}

/** 全員共通の設定。data.json に保存する */
export interface PluginSettings {
	folders: FolderSettings;
	colors: KindColors;
	statusColors: StatusColors;
}

/** 個人の設定。この PC・この Vault だけに保存する */
export interface PersonalSettings {
	projectDisplayName: ProjectDisplayName;
	/** HTMLレポートの出力先フォルダ（絶対パス。Vault の外も可）。空なら未設定 */
	reportFolder: string;
	/** プロジェクト状況の節の並び順と表示（概要は常に先頭なので含めない） */
	projectSections: ProjectSectionSetting[];
	/** メンバーダッシュボードの部品の配置（設計書 9.12） */
	memberDashboard: MemberDashboardLayout;
}

/** プロジェクト状況の、並び替え・非表示にできる節 */
export const PROJECT_SECTIONS = ['progress', 'milestones', 'epics', 'allocation'] as const;
export type ProjectSection = (typeof PROJECT_SECTIONS)[number];

export interface ProjectSectionSetting {
	id: ProjectSection;
	visible: boolean;
}

/** 要件3.3のフォルダ構成 */
export const DEFAULT_SETTINGS: PluginSettings = {
	folders: {
		projects: 'Projects',
		epics: 'Epics',
		tasks: 'Tasks',
		members: 'Members',
		logs: 'Members/Logs',
		archive: 'Archive',
		config: '_pm',
	},
	colors: {
		project: '#3b6fd8',
		epic: '#2a9d8f',
		task: '#8a6be0',
	},
	statusColors: { task: {}, project: {} },
};

/** 色を `#rrggbb`（小文字）にそろえる。使えない値は undefined */
export function cleanColor(value: unknown): string | undefined {
	return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : undefined;
}

export const DEFAULT_PERSONAL: PersonalSettings = {
	projectDisplayName: 'title',
	reportFolder: '',
	projectSections: PROJECT_SECTIONS.map((id) => ({ id, visible: true })),
	memberDashboard: defaultMemberDashboardLayout(),
};

/** 保存された節の並びを整える。知らない節・重複は捨て、足りない節は末尾に表示ありで足す */
export function cleanProjectSections(raw: unknown): ProjectSectionSetting[] {
	const result: ProjectSectionSetting[] = [];
	if (Array.isArray(raw)) {
		for (const item of raw) {
			if (!isRecord(item)) continue;
			const id = oneOf(item.id, PROJECT_SECTIONS);
			if (id && !result.some((s) => s.id === id)) result.push({ id, visible: item.visible !== false });
		}
	}
	for (const id of PROJECT_SECTIONS) if (!result.some((s) => s.id === id)) result.push({ id, visible: true });
	return result;
}

/** 節（部品）を1つ上（-1）か下（+1）へ動かした並びを返す。端なら変えない */
export function moveSection<T>(sections: readonly T[], index: number, delta: -1 | 1): T[] {
	const list = [...sections];
	const to = index + delta;
	const item = list[index];
	const other = list[to];
	if (!item || !other) return list;
	list[index] = other;
	list[to] = item;
	return list;
}

/** フォルダパスを整える。使えないパスは null（設計書 6章） */
export function cleanFolderPath(value: string): string | null {
	const path = value
		.trim()
		.replace(/\\/g, '/')
		.split('/')
		.map((part) => part.trim())
		.filter((part) => part !== '' && part !== '.')
		.join('/');
	if (path === '' || path.split('/').includes('..')) return null;
	return path;
}

/** `loadData()` の結果を既定値と合わせる。不正な値は既定値にする */
export function mergeSettings(raw: unknown): PluginSettings {
	const data = isRecord(raw) ? raw : {};
	const rawFolders = isRecord(data.folders) ? data.folders : {};
	const folders = { ...DEFAULT_SETTINGS.folders };
	for (const key of Object.keys(folders) as (keyof FolderSettings)[]) {
		const value = rawFolders[key];
		if (typeof value === 'string') folders[key] = cleanFolderPath(value) ?? folders[key];
	}
	const rawColors = isRecord(data.colors) ? data.colors : {};
	const colors = { ...DEFAULT_SETTINGS.colors };
	for (const key of Object.keys(colors) as (keyof KindColors)[]) colors[key] = cleanColor(rawColors[key]) ?? colors[key];
	const rawStatus = isRecord(data.statusColors) ? data.statusColors : {};
	const statusColors: StatusColors = { task: cleanColorMap(rawStatus.task), project: cleanColorMap(rawStatus.project) };
	return { folders, colors, statusColors };
}

/** ステータス名 → 色 の表から、使えない色を除く */
function cleanColorMap(raw: unknown): Record<string, string> {
	const map: Record<string, string> = {};
	if (!isRecord(raw)) return map;
	for (const [name, value] of Object.entries(raw)) {
		const color = cleanColor(value);
		if (color && name !== '') map[name] = color;
	}
	return map;
}

/**
 * 個人の設定を既定値と合わせる
 * @param legacy 以前 data.json に入れていた値（個人の設定がまだ無いときに引き継ぐ）
 */
export function mergePersonal(raw: unknown, legacy?: unknown): PersonalSettings {
	const data = isRecord(raw) ? raw : isRecord(legacy) ? legacy : {};
	return {
		projectDisplayName: oneOf(data.projectDisplayName, PROJECT_DISPLAY_NAMES) ?? DEFAULT_PERSONAL.projectDisplayName,
		reportFolder: typeof data.reportFolder === 'string' ? data.reportFolder.trim() : DEFAULT_PERSONAL.reportFolder,
		projectSections: cleanProjectSections(data.projectSections),
		memberDashboard: cleanMemberDashboardLayout(data.memberDashboard),
	};
}

/**
 * HTMLレポートの出力先フォルダの誤り。問題なければ null（設計書 13章）。
 * Windows の絶対パス（`C:\…` か `\\サーバー\…`）だけを受け付ける
 */
export function reportFolderProblem(folder: string): string | null {
	if (folder === '') return '出力先フォルダが決まっていません。設定の「HTMLレポートの出力先」に書いてください';
	if (!/^[A-Za-z]:[\\/]/.test(folder) && !/^\\\\[^\\]+\\[^\\]+/.test(folder)) {
		return '出力先フォルダは「C:\\…」か「\\\\サーバー名\\共有名\\…」の形で書いてください';
	}
	return null;
}

/** プロジェクトの表示名。選んだ項目が空なら簡易プロジェクト名 */
export function projectLabel(
	project: { title: string; caseId: string; officialName: string },
	mode: ProjectDisplayName,
): string {
	const value = mode === 'case_id' ? project.caseId : mode === 'official_name' ? project.officialName : project.title;
	return value !== '' ? value : project.title;
}
