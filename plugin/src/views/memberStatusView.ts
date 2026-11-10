import type { ViewStateResult } from 'obsidian';
import type { CalcContext } from '../calc/context';
import { openNewNoteModal } from '../commands/createNote';
import { chooseMemberForHolidays } from '../commands/editHolidays';
import { openMemberForm } from '../commands/editTask';
import { openWorklogModal } from '../commands/worklog';
import { dayOfWeek, WEEKDAYS } from '../calc/dates';
import { LOAD_MODE_LABEL, LOAD_SCALES, loadHoursText, loadValue, type MemberLoad } from '../calc/load';
import {
	DEFAULT_MEMBER_STATUS,
	displayRange,
	memberStatusTable,
	membersOfProjects,
	parseMemberStatusOptions,
	type LoadMode,
	type MemberStatusOptions,
} from '../calc/memberStatus';
import { periodOf, type Period, type PeriodUnit } from '../calc/workdays';
import { UNKNOWN_PROJECT } from '../calc/worklogSummary';
import type ProjectManagerPlugin from '../main';
import type { Member } from '../model';
import { projectLabel } from '../settings';
import { LoadDetailModal } from '../ui/loadDetailModal';
import { actionButtons, formClick } from './actions';
import { PmView } from './baseView';
import { hoursText, rateText } from '../calc/format';
import { projectChoices } from './choices';
import { dateRange, renderFilterBar, singleSelect } from './filterBar';
import { openView } from './openView';
import { tableHeader } from '../ui/table';
import { field } from '../parse/values';
import { MEMBER_STATUS_VIEW_TYPE } from './viewTypes';
import { checkbox } from '../ui/controls';

const UNIT_CHOICES: { value: PeriodUnit; label: string }[] = [
	{ value: 'day', label: '日' },
	{ value: 'week', label: '週' },
	{ value: 'month', label: '月' },
];

const MODE_CHOICES: { value: LoadMode; label: string }[] = [
	{ value: 'allocated', label: '配分' },
	{ value: 'planned', label: '予定' },
	{ value: 'actual', label: '実績' },
];

/** メンバー状況のビューと、開くコマンドを登録する */
export function registerMemberStatusView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(MEMBER_STATUS_VIEW_TYPE, (leaf) => new MemberStatusView(leaf, plugin));
	plugin.addCommand({
		id: 'open-member-status',
		name: 'メンバー状況を開く',
		callback: () => void openView(plugin.app, MEMBER_STATUS_VIEW_TYPE),
	});
}

/** メンバー状況（要件4.8、設計書 9.3） */
export class MemberStatusView extends PmView {
	private options: MemberStatusOptions = { ...DEFAULT_MEMBER_STATUS };

	getViewType(): string {
		return MEMBER_STATUS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'メンバー状況';
	}

	getIcon(): string {
		return 'users';
	}

	protected getDescription(): string {
		return 'メンバーごとの負荷率（全プロジェクトの合計）。マスをクリックするとプロジェクト別の内訳';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), memberStatus: this.options };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.options = parseMemberStatusOptions(
			field(state, 'memberStatus'),
		);
		await super.setState(state, result);
	}

	private setOptions(options: MemberStatusOptions): void {
		this.options = options;
		this.app.workspace.requestSaveLayout();
		this.redraw();
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-member-status');
		const mode = this.plugin.personal.projectDisplayName;
		const { options } = this;
		const range = displayRange(options, ctx.today);
		const { summary, filters, settings, actions, notes, body: scroll } = this.shell(el, { grid: true });

		renderFilterBar(
			filters,
			this.filter,
			{
				projects: projectChoices(ctx, mode),
				extra: (bar) => {
					dateRange(bar, '表示期間', range.start, range.end, (start, end) => {
						const next: MemberStatusOptions = { ...options };
						delete next.start;
						delete next.end;
						this.setOptions({ ...next, ...(start ? { start } : {}), ...(end ? { end } : {}) });
					});
					checkbox(bar, '在籍者のみ', options.activeOnly, (activeOnly) => this.setOptions({ ...options, activeOnly }));
				},
				onClear: () => {
					this.options = { ...DEFAULT_MEMBER_STATUS, unit: options.unit, mode: options.mode, scale: options.scale };
				},
			},
			(filter) => this.setFilter(filter),
		);

		singleSelect(settings, '単位', options.unit, UNIT_CHOICES, (unit) => this.setOptions({ ...options, unit }));
		singleSelect(settings, '表示', options.mode, MODE_CHOICES, (m) => this.setOptions({ ...options, mode: m }));
		singleSelect(settings, '数値', options.scale, [...LOAD_SCALES], (scale) => this.setOptions({ ...options, scale }));
		actionButtons(actions, [
			{ text: '作業ログを入力', onClick: () => openWorklogModal(this.plugin) },
			{ text: '個人休日を編集', onClick: () => chooseMemberForHolidays(this.plugin) },
			{ text: '新しいメンバー', onClick: () => openNewNoteModal(this.plugin, 'user') },
		]);
		const legend = notes.createDiv({ cls: 'pm-legend' });
		legend.createSpan({ cls: 'pm-load-cell pm-load-normal', text: '100%以下' });
		legend.createSpan({ cls: 'pm-load-cell pm-load-caution', text: '注意（100%超）' });
		legend.createSpan({ cls: 'pm-load-cell pm-load-warning', text: '警告（負荷許容率超）' });
		legend.createSpan({ cls: 'pm-mark is-tinted pm-load-holiday-mark', text: '休稼＝休日稼働あり' });
		notes.createDiv({
			cls: 'pm-note',
			text: `${options.scale === 'hours' ? `マスは${LOAD_MODE_LABEL[options.mode]}の時間(h)。色は負荷率で付けます。` : ''}負荷率＝${LOAD_MODE_LABEL[options.mode]}の時間 ÷ 基準工数（勤務日 × 1日の通常稼働時間。勤務日＝稼働日−個人休日）。配分は月の工数配分を勤務日で割って期間の分を足したもの。個人休日の日は「—」。マスにマウスを乗せると配分・予定・実績の時間が出ます`,
		});

		let members = ctx.index.members().filter((m) => !options.activeOnly || m.active);
		if (this.filter.projects.length > 0) {
			const involved = membersOfProjects(ctx, this.filter.projects);
			members = members.filter((m) => involved.has(m.id));
		}
		summary.setText(`メンバー ${members.length} 人`);
		if (members.length === 0) {
			scroll.createDiv({ cls: 'pm-view-empty', text: '条件に合うメンバーはいません' });
			return;
		}

		const table = memberStatusTable(ctx, members, range, options.unit);
		const current = periodOf(ctx.today, options.unit).key;
		const tableEl = scroll.createEl('table', { cls: 'pm-table pm-load-table' });
		const heads = tableHeader(tableEl, [{ label: 'メンバー', cls: 'pm-load-member' }, ...table.periods.map((p) => ({ label: periodLabel(p), numeric: true }))]);
		table.periods.forEach((p, i) => {
			const th = heads[i + 1];
			if (p.key === current) th?.addClass('is-today');
			if (p.unit === 'day' && !ctx.calendar.isWorkday(p.start)) th?.addClass('is-holiday');
		});

		const body = tableEl.createEl('tbody');
		for (const row of table.rows) {
			const tr = body.createEl('tr');
			const name = tr.createEl('td', { text: row.member.title, cls: 'pm-load-member pm-link' });
			name.setAttr('aria-label', 'メンバーの入力補助フォームを開く');
			formClick(name, () => openMemberForm(this.plugin, row.member.path));
			for (const load of row.cells) this.drawCell(tr, row.member, load, ctx);
		}
	}

	private drawCell(tr: HTMLElement, member: Member, load: MemberLoad, ctx: CalcContext): void {
		const { hours, rate, level, holiday } = loadValue(load, this.options.mode);
		const td = tr.createEl('td', { cls: `is-numeric is-clickable pm-load-cell pm-load-${level}` });
		td.setText(this.options.scale === 'hours' ? (load.base > 0 || hours > 0 ? hoursText(hours) : '—') : rateText(rate));
		if (holiday > 0) td.createSpan({ cls: 'pm-mark is-tinted pm-load-holiday-mark', text: '休稼' });
		td.setAttr('aria-label', loadHoursText(load));

		td.addEventListener('click', () => {
			const mode = this.plugin.personal.projectDisplayName;
			new LoadDetailModal(this.app, {
				member,
				load,
				projectName: (id) => {
					if (id === UNKNOWN_PROJECT) return '（所属不明のタスク）';
					const project = ctx.projects.get(id);
					return project ? projectLabel(project, mode) : id;
				},
			}).open();
		});
	}
}

/** 列の見出し。日は「11/02(月)」、週は「11/02〜」、月は「2026-11」 */
function periodLabel(p: Period): string {
	const md = `${p.start.slice(5, 7)}/${p.start.slice(8, 10)}`;
	switch (p.unit) {
		case 'day':
			return `${md}(${WEEKDAYS[dayOfWeek(p.start)] ?? ''})`;
		case 'week':
			return `${md}〜`;
		case 'month':
			return p.key;
	}
}
