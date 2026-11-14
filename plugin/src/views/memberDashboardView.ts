import type { CalcContext } from '../calc/context';
import { addMonths, monthOfDate } from '../calc/dates';
import { parseMemberDashboardOptions, pickMember, type MemberDashboardOptions } from '../calc/memberDashboard';
import { openWorklogModal } from '../commands/worklog';
import type ProjectManagerPlugin from '../main';
import { activePanel, MEMBER_PANEL_LABELS, type MemberDashboardLayout, type MemberPanelKind } from '../memberDashboardLayout';
import { field } from '../parse/values';
import { MemberPanelsModal } from '../ui/memberPanelsModal';
import { actionButtons } from './actions';
import { PmView } from './baseView';
import { memberChoices } from './choices';
import { singleSelect } from './filterBar';
import { createMemberPanel, initialMemberPanelState } from './memberPanels';
import { openView } from './openView';
import { panelShell, type Panel, type PanelScope } from './panel';
import { MEMBER_DASHBOARD_VIEW_TYPE, MEMBER_STATUS_VIEW_TYPE } from './viewTypes';

/** メンバーダッシュボードのビューと、開くコマンドを登録する */
export function registerMemberDashboardView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(MEMBER_DASHBOARD_VIEW_TYPE, (leaf) => new MemberDashboardView(leaf, plugin));
	plugin.addCommand({
		id: 'open-member-dashboard',
		name: 'メンバーダッシュボードを開く',
		callback: () => void openView(plugin.app, MEMBER_DASHBOARD_VIEW_TYPE),
	});
}

/** メンバーダッシュボード（要件4.14、設計書 9.11） */
export class MemberDashboardView extends PmView {
	private options: MemberDashboardOptions = {};
	/** 作った部品。状態は個人の設定に保存する（設計書 9.12） */
	private readonly panels = new Map<MemberPanelKind, Panel>();

	getViewType(): string {
		return MEMBER_DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'メンバーダッシュボード';
	}

	getIcon(): string {
		return 'user-round';
	}

	protected getDescription(): string {
		return '1人のメンバーの、月ごとのアサイン案件と担当タスク。出す部品と並びは「部品を選ぶ」で各自が決められます';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), memberDashboard: this.options };
	}

	protected readState(state: unknown): void {
		this.options = parseMemberDashboardOptions(field(state, 'memberDashboard'));
	}

	private setOptions(options: MemberDashboardOptions): void {
		this.options = options;
		this.saveState();
		this.redraw();
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-member-dashboard');
		const { summary, settings, actions, body } = this.shell(el, { grid: true });
		const member = pickMember(ctx.index.members(), this.options.member);
		const thisMonth = monthOfDate(ctx.today);
		const month = this.options.month ?? thisMonth;

		actionButtons(actions, [
			{ text: '部品を選ぶ', tooltip: '出す部品・並び順・見せ方（タブ／縦並び）を選びます', onClick: () => this.editLayout() },
			{ text: '作業ログを入力', onClick: () => openWorklogModal(this.plugin) },
			{ text: 'メンバー状況', onClick: () => void openView(this.app, MEMBER_STATUS_VIEW_TYPE) },
		]);
		if (!member) {
			body.createDiv({ cls: 'pm-view-empty', text: 'メンバーがいません。「新しいメンバー」で作ってください' });
			return;
		}

		// 在籍者の選択肢。在籍していない人を選んでいれば、その人も足す
		const choices = memberChoices(ctx);
		if (!choices.some((c) => c.value === member.id)) choices.unshift({ value: member.id, label: `${member.title}（在籍なし）` });
		singleSelect(settings, 'メンバー', member.id, choices, (id) => this.setOptions({ ...this.options, member: id }));
		this.monthNav(settings, month, thisMonth);
		summary.setText(`${member.title}／${month}`);

		const scope: PanelScope = { member, month };
		const layout = this.layout;
		const visible = layout.panels.filter((p) => p.visible);
		if (visible.length === 0) {
			body.createDiv({ cls: 'pm-view-empty', text: '出す部品がありません。「部品を選ぶ」で選んでください' });
			return;
		}
		if (layout.style === 'stack') {
			for (const p of visible) this.drawPanel(body, p.id, ctx, scope);
			return;
		}
		const active = activePanel(layout);
		const tabs = body.createDiv({ cls: 'pm-panel-tabs', attr: { role: 'tablist' } });
		for (const p of visible) {
			const tab = tabs.createEl('button', { cls: 'pm-panel-tab', text: MEMBER_PANEL_LABELS[p.id], attr: { role: 'tab' } });
			tab.setAttr('aria-selected', String(p.id === active));
			if (p.id === active) tab.addClass('is-active');
			tab.addEventListener('click', () => this.saveLayout({ ...this.layout, active: p.id }));
		}
		if (active) this.drawPanel(body, active, ctx, scope);
	}

	/** 個人の設定の部品の配置 */
	private get layout(): MemberDashboardLayout {
		return this.plugin.personal.memberDashboard;
	}

	private saveLayout(layout: MemberDashboardLayout): void {
		this.plugin.personal.memberDashboard = layout;
		this.plugin.savePersonal();
		this.redraw();
	}

	private editLayout(): void {
		new MemberPanelsModal(this.app, this.layout, (layout) => this.saveLayout(layout)).open();
	}

	/** 部品を1つ描く。初めて使う部品は作って、保存されていた状態を読む */
	private drawPanel(parent: HTMLElement, kind: MemberPanelKind, ctx: CalcContext, scope: PanelScope): void {
		let panel = this.panels.get(kind);
		if (!panel) {
			const store = (redraw: boolean) => {
				const layout = this.layout;
				const state = created.getState();
				this.plugin.personal.memberDashboard = { ...layout, panels: layout.panels.map((p) => (p.id === kind ? { ...p, state } : p)) };
				this.plugin.savePersonal();
				if (redraw) this.redraw();
			};
			const created = createMemberPanel(kind, {
				app: this.app,
				plugin: this.plugin,
				gridLines: () => this.gridLines,
				changed: () => store(true),
				save: () => store(false),
				redraw: () => this.redraw(),
			});
			const saved = this.layout.panels.find((p) => p.id === kind)?.state ?? {};
			created.setState(Object.keys(saved).length > 0 ? saved : initialMemberPanelState(kind));
			this.panels.set(kind, created);
			panel = created;
		}
		panel.draw(panelShell(parent, panel.title), ctx, scope);
	}

	/** 月の前・次・選択・今月への移動 */
	private monthNav(settings: HTMLElement, month: string, thisMonth: string): void {
		const nav = settings.createDiv({ cls: 'pm-filter-field' });
		nav.createSpan({ cls: 'pm-filter-label', text: '月' });
		const move = (m: string) => this.setOptions({ ...this.options, month: m });
		const prev = nav.createEl('button', { text: '◀' });
		prev.setAttr('aria-label', '前の月');
		prev.addEventListener('click', () => move(addMonths(month, -1)));
		const input = nav.createEl('input', { type: 'month', value: month });
		input.setAttr('aria-label', '月を選ぶ');
		input.addEventListener('change', () => {
			if (/^\d{4}-\d{2}$/.test(input.value)) move(input.value);
		});
		const next = nav.createEl('button', { text: '▶' });
		next.setAttr('aria-label', '次の月');
		next.addEventListener('click', () => move(addMonths(month, 1)));
		nav.createEl('button', { text: '今月' }).addEventListener('click', () => move(thisMonth));
	}
}
