import { ItemView } from 'obsidian';
import { GUIDE_HTML } from '../generated/guideHtml';
import type ProjectManagerPlugin from '../main';
import { activeSectionIndex, GUIDE_THEME_STYLE_ID, guideThemeCss, withGuideTheme } from './guideTheme';
import { openView } from './openView';
import { GUIDE_VIEW_TYPE } from './viewTypes';

/** 使い方のビューと、開くコマンドを登録する（設計書 9.14） */
export function registerGuideView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(GUIDE_VIEW_TYPE, (leaf) => new GuideView(leaf));
	// ID は前の「使い方のノートを開く」のまま（ベストプラクティス 7章）
	plugin.addCommand({ id: 'open-readme', name: '使い方を開く', callback: () => void openGuide(plugin) });
}

/** 使い方のビューを開く */
export async function openGuide(plugin: ProjectManagerPlugin): Promise<void> {
	await openView(plugin.app, GUIDE_VIEW_TYPE);
}

/** 使い方の HTML を iframe に出すビュー（設計書 9.14） */
export class GuideView extends ItemView {
	private frame: HTMLIFrameElement | null = null;

	getViewType(): string {
		return GUIDE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '使い方';
	}

	getIcon(): string {
		return 'help-circle';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('pm-guide');
		// スクリプトは動かさず、中の文書はこちらから触れるようにする（設計書 9.14）
		const frame = this.contentEl.createEl('iframe', { cls: 'pm-guide-frame', attr: { sandbox: 'allow-same-origin', title: '使い方' } });
		frame.srcdoc = withGuideTheme(GUIDE_HTML, this.themeCss());
		this.frame = frame;
		this.registerDomEvent(frame, 'load', () => this.wireFrame(frame));
		this.registerEvent(this.app.workspace.on('css-change', () => this.applyTheme()));
	}

	async onClose(): Promise<void> {
		this.frame = null;
	}

	/** Obsidian の今の色・文字から、使い方の変数を上書きする CSS を作る */
	private themeCss(): string {
		const body = this.containerEl.doc.body;
		const style = this.containerEl.win.getComputedStyle(body);
		return guideThemeCss((name) => style.getPropertyValue(name), body.hasClass('theme-dark'));
	}

	/** テーマが変わったら、中の文書の style を書き換える */
	private applyTheme(): void {
		const style = this.frame?.contentDocument?.getElementById(GUIDE_THEME_STYLE_ID);
		if (style) style.textContent = this.themeCss();
	}

	/** 中の文書の、ページ内のリンクと目次の色付けをつなぐ */
	private wireFrame(frame: HTMLIFrameElement): void {
		const doc = frame.contentDocument;
		const win = frame.contentWindow;
		if (!doc || !win) return;
		// ページ内のリンクは自分でスクロールする（iframe の外のページへ移らないように。設計書 9.14）
		for (const link of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))) {
			this.registerDomEvent(link, 'click', (evt) => {
				evt.preventDefault();
				const id = link.getAttribute('href')?.slice(1);
				if (id) doc.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			});
		}
		const tocLinks = Array.from(doc.querySelectorAll<HTMLAnchorElement>('nav.toc a'));
		const sections = tocLinks.map((link) => doc.getElementById(link.getAttribute('href')?.slice(1) ?? ''));
		const markToc = () => {
			const tops = sections.map((section) => section?.offsetTop ?? Number.POSITIVE_INFINITY);
			const active = activeSectionIndex(tops, win.scrollY, win.innerHeight, doc.documentElement.scrollHeight);
			tocLinks.forEach((link, i) => link.classList.toggle('on', i === active));
		};
		this.registerDomEvent(win, 'scroll', markToc, { passive: true });
		this.registerDomEvent(win, 'resize', markToc);
		markToc();
	}
}
