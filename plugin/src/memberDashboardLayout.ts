import { isRecord } from './parse/values';

/** メンバーダッシュボードに置ける部品（設計書 9.12）。並びは初期の並び */
export const MEMBER_PANELS = ['load', 'projects', 'taskList', 'worklog', 'gantt', 'kanban', 'wbs'] as const;
export type MemberPanelKind = (typeof MEMBER_PANELS)[number];

export const MEMBER_PANEL_LABELS: Record<MemberPanelKind, string> = {
	load: '月の負荷',
	projects: 'アサインされている案件',
	taskList: 'タスク一覧',
	worklog: '作業ログ',
	gantt: 'ガントチャート',
	kanban: 'カンバン',
	wbs: 'WBS',
};

/** 部品の見せ方。tabs＝タブで1つずつ、stack＝縦に並べる */
export type PanelLayoutStyle = 'tabs' | 'stack';
export const PANEL_LAYOUT_STYLES: readonly PanelLayoutStyle[] = ['tabs', 'stack'];

export interface MemberPanelSetting {
	id: MemberPanelKind;
	visible: boolean;
	/** 部品の状態（絞り込み・表示の設定） */
	state: Record<string, unknown>;
}

/** メンバーダッシュボードの部品の配置（個人の設定。要件4.12） */
export interface MemberDashboardLayout {
	style: PanelLayoutStyle;
	/** タブのとき開いている部品 */
	active?: MemberPanelKind;
	panels: MemberPanelSetting[];
}

export const defaultMemberDashboardLayout = (): MemberDashboardLayout => ({
	style: 'stack',
	panels: MEMBER_PANELS.map((id) => ({ id, visible: true, state: {} })),
});

const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => list.find((x) => x === v);

/** 保存された配置を整える。知らない部品・重複は捨て、足りない部品は末尾に表示ありで足す */
export function cleanMemberDashboardLayout(raw: unknown): MemberDashboardLayout {
	const data = isRecord(raw) ? raw : {};
	const panels: MemberPanelSetting[] = [];
	if (Array.isArray(data.panels)) {
		for (const item of data.panels as unknown[]) {
			if (!isRecord(item)) continue;
			const id = oneOf(item.id, MEMBER_PANELS);
			if (!id || panels.some((p) => p.id === id)) continue;
			panels.push({ id, visible: item.visible !== false, state: isRecord(item.state) ? item.state : {} });
		}
	}
	for (const id of MEMBER_PANELS) if (!panels.some((p) => p.id === id)) panels.push({ id, visible: true, state: {} });
	const active = oneOf(data.active, MEMBER_PANELS);
	return { style: oneOf(data.style, PANEL_LAYOUT_STYLES) ?? 'stack', ...(active ? { active } : {}), panels };
}

/** タブで開く部品。選んだ部品が非表示なら、表示している最初の部品。1つも無ければ undefined */
export function activePanel(layout: MemberDashboardLayout): MemberPanelKind | undefined {
	const visible = layout.panels.filter((p) => p.visible);
	return visible.find((p) => p.id === layout.active)?.id ?? visible[0]?.id;
}
