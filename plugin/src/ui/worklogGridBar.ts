import { ButtonComponent, DropdownComponent } from 'obsidian';
import { compareJa } from '../calc/compare';
import { localToday } from '../calc/dates';
import { MODE_LABEL, periodStartOf, UNIT_LABEL, type GridMode, type GridUnit } from '../calc/worklogCells';
import type { Epic, IsoDate, Member, NoteId, Project } from '../model';
import type { ProjectDisplayName } from '../settings';
import { checkbox, periodNavOptions, stepNav } from './controls';
import { epicOptions, projectOptions } from './formParts';

/** 作業ログの入力画面の上の欄で選ぶ値（設計書 4.3） */
export interface GridBarState {
	member: NoteId;
	unit: GridUnit;
	/** 表示している期間の最初の日 */
	start: IsoDate;
	mode: GridMode;
	/** 絞り込み。空は絞らない */
	project: NoteId;
	epic: NoteId;
	status: string;
	/** 完了・停止した担当タスクも並べるか */
	showFinished: boolean;
}

/** 上の欄の選択肢 */
export interface GridBarSource {
	members: readonly Member[];
	projects: readonly Project[];
	epics: readonly Epic[];
	displayName: ProjectDisplayName;
	/** 絞り込みに出すステータス名（設定の順） */
	statuses: readonly string[];
}

/** メンバー・期間・予定と実績・絞り込みの欄。変えた値を change に渡す（状態の書き換えと描き直しは画面が行う） */
export function worklogGridBar(el: HTMLElement, source: GridBarSource, state: GridBarState, change: (patch: Partial<GridBarState>) => void): void {
	const bar = el.createDiv({ cls: 'pm-worklog-grid-bar' });
	const d = new DropdownComponent(bar);
	d.addOption('', 'メンバーを選ぶ');
	for (const m of source.members.filter((m) => m.active).sort((a, b) => compareJa(a.title, b.title))) d.addOption(m.id, m.title);
	d.selectEl.setAttr('aria-label', 'メンバー');
	d.setValue(state.member).onChange((member) => change({ member }));

	const week = bar.createDiv({ cls: 'pm-worklog-grid-week' });
	const unit = new DropdownComponent(week);
	for (const u of ['week', 'month'] as const) unit.addOption(u, UNIT_LABEL[u].name);
	unit.selectEl.setAttr('aria-label', '表示の期間');
	unit.setValue(state.unit).onChange((v) => {
		const u: GridUnit = v === 'month' ? 'month' : 'week';
		// 今の期間の最初の日を含む期間にする
		change({ unit: u, start: periodStartOf(state.start, u) });
	});
	stepNav(week, periodNavOptions(state.start, state.unit, localToday(), (start) => change({ start })));

	const modes = bar.createDiv({ cls: 'pm-worklog-grid-mode' });
	for (const mode of ['planned', 'actual'] as const) {
		const b = new ButtonComponent(modes).setButtonText(MODE_LABEL[mode]).onClick(() => change({ mode }));
		if (mode === state.mode) b.setCta();
	}

	const filter = bar.createDiv({ cls: 'pm-worklog-grid-filter' });
	const p = new DropdownComponent(filter);
	projectOptions(p, source.projects, source.displayName, state.project, 'すべてのプロジェクト');
	p.selectEl.setAttr('aria-label', 'プロジェクトで絞る');
	p.onChange((project) => change({ project, epic: '' }));
	if (state.project) {
		const e = new DropdownComponent(filter);
		epicOptions(e, source.epics, state.project, state.epic, 'すべてのエピック');
		e.selectEl.setAttr('aria-label', 'エピックで絞る');
		e.onChange((epic) => change({ epic }));
	}
	const s = new DropdownComponent(filter);
	s.addOption('', 'すべてのステータス');
	for (const name of source.statuses) s.addOption(name, name);
	s.selectEl.setAttr('aria-label', 'ステータスで絞る');
	s.setValue(state.status).onChange((status) => change({ status }));
	checkbox(filter, '完了・停止した担当タスクも表示', state.showFinished, (showFinished) => change({ showFinished }));
}
