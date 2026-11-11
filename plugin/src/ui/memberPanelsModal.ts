import { type App, Modal, Setting } from 'obsidian';
import {
	defaultMemberDashboardLayout,
	MEMBER_PANEL_LABELS,
	type MemberDashboardLayout,
	type PanelLayoutStyle,
} from '../memberDashboardLayout';
import { moveSection } from '../settings';

const STYLE_LABELS: Record<PanelLayoutStyle, string> = { tabs: 'タブで切り替える', stack: '縦に並べる' };

/** メンバーダッシュボードの部品を選ぶ画面（設計書 9.12）。変えるたびに onChange を呼ぶ */
export class MemberPanelsModal extends Modal {
	constructor(
		app: App,
		private layout: MemberDashboardLayout,
		private readonly onChange: (layout: MemberDashboardLayout) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('部品を選ぶ');
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private update(layout: MemberDashboardLayout): void {
		this.layout = layout;
		this.onChange(layout);
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		const { layout } = this;
		contentEl.createEl('p', { cls: 'pm-note', text: 'このパソコンにだけ保存します。ほかの人には影響しません。' });

		new Setting(contentEl).setName('見せ方').addDropdown((dropdown) =>
			dropdown
				.addOptions(STYLE_LABELS)
				.setValue(layout.style)
				.onChange((value) => {
					const style = value === 'tabs' ? 'tabs' : 'stack';
					this.update({ ...layout, style });
				}),
		);

		new Setting(contentEl).setName('部品').setDesc('上から（タブなら左から）この順に出します').setHeading();
		const list = layout.panels;
		list.forEach((panel, i) => {
			new Setting(contentEl)
				.setName(MEMBER_PANEL_LABELS[panel.id])
				.addExtraButton((button) => {
					button.setIcon('arrow-up').setTooltip('上へ').onClick(() => this.update({ ...layout, panels: moveSection(list, i, -1) }));
					if (i === 0) button.setDisabled(true);
				})
				.addExtraButton((button) => {
					button.setIcon('arrow-down').setTooltip('下へ').onClick(() => this.update({ ...layout, panels: moveSection(list, i, 1) }));
					if (i === list.length - 1) button.setDisabled(true);
				})
				.addToggle((toggle) =>
					toggle
						.setTooltip('表示する')
						.setValue(panel.visible)
						.onChange((visible) => this.update({ ...layout, panels: list.map((p, j) => (j === i ? { ...p, visible } : p)) })),
				);
		});

		new Setting(contentEl).addButton((button) =>
			button.setButtonText('初期の並びに戻す').onClick(() => {
				// 部品の絞り込み・表示の設定は残す
				const initial = defaultMemberDashboardLayout();
				const panels = initial.panels.map((p) => ({ ...p, state: list.find((q) => q.id === p.id)?.state ?? {} }));
				this.update({ ...initial, panels });
			}),
		);
	}
}
