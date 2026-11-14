import { Notice } from 'obsidian';
import { ARCHIVE_KIND_LABELS, archivableProjects, archivePlan, svnMoveCommands, type ArchiveGroup } from '../calc/archive';
import { compareNumeric } from '../calc/compare';
import type { CalcContext } from '../calc/context';
import type ProjectManagerPlugin from '../main';
import type { NoteId } from '../model';
import { projectLabel } from '../settings';
import { actionButtons } from './actions';
import { kindMark } from './badges';
import { PmView } from './baseView';
import { singleSelect } from './filterBar';
import { openView } from './openView';
import { tableHeader } from '../ui/table';
import { field } from '../parse/values';
import { ARCHIVE_VIEW_TYPE } from './viewTypes';
import { notifyError } from '../ui/notify';

/** アーカイブ対象の一覧のビューと、開くコマンドを登録する */
export function registerArchiveView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(ARCHIVE_VIEW_TYPE, (leaf) => new ArchiveView(leaf, plugin));
	plugin.addCommand({
		id: 'open-archive-list',
		name: 'アーカイブ対象の一覧を開く',
		callback: () => void openView(plugin.app, ARCHIVE_VIEW_TYPE),
	});
}

/** クリップボードに入れて知らせる */
async function copy(text: string, what: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		new Notice(`${what}をコピーしました`);
	} catch (e) {
		notifyError(e, 'コピーできませんでした');
	}
}

/**
 * アーカイブ対象の一覧（要件4.9、設計書 9.9）。
 * プラグインはファイルを動かさず、今の場所と移動先を出すだけ（移動は各自が TortoiseSVN で行う）
 */
export class ArchiveView extends PmView {
	private projectId: NoteId | undefined;

	getViewType(): string {
		return ARCHIVE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'アーカイブ対象';
	}

	getIcon(): string {
		return 'archive';
	}

	protected getDescription(): string {
		return 'クローズしたプロジェクトの、アーカイブフォルダへ動かすファイルの一覧（移動は TortoiseSVN で行います）';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), ...(this.projectId ? { project: this.projectId } : {}) };
	}

	protected readState(state: unknown): void {
		const raw = field(state, 'project');
		this.projectId = typeof raw === 'string' ? raw : undefined;
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-archive');
		const mode = this.plugin.personal.projectDisplayName;
		const archive = this.plugin.settings.folders.archive;
		const { summary, filters, actions, notes, body } = this.shell(el, { grid: true });

		const projects = archivableProjects(ctx.index, archive, ctx.statuses).sort((a, b) =>
			compareNumeric(projectLabel(a, mode), projectLabel(b, mode)),
		);
		if (projects.length === 0) {
			body.createDiv({
				cls: 'pm-view-empty',
				text: 'アーカイブできるプロジェクトはありません（ステータスが完了系＝クローズ済みで、アーカイブフォルダの外にファイルが残っているもの）',
			});
			return;
		}
		const project = projects.find((p) => p.id === this.projectId) ?? projects[0];
		if (!project) return;

		singleSelect(
			filters,
			'クローズ済みのプロジェクト',
			project.id,
			projects.map((p) => ({ value: p.id, label: projectLabel(p, mode) })),
			(id) => {
				this.projectId = id;
				this.saveState();
				this.redraw();
			},
		);

		const plan = archivePlan(ctx.index, project, archive, ctx.statuses);
		const noted = plan.items.filter((i) => i.notes.length > 0).length;
		summary.setText(`移動するファイル ${plan.items.length} 件${plan.alreadyArchived > 0 ? `（アーカイブ済み ${plan.alreadyArchived} 件）` : ''}`);
		actionButtons(actions, [
			{
				text: '移動のコマンドをコピー（svn move）',
				tooltip: 'svn のコマンドを使える人向け。Vault のフォルダで実行します',
				onClick: () => void copy(svnMoveCommands(plan.items), 'svn のコマンド'),
			},
		]);
		if (noted > 0) notes.createDiv({ cls: 'pm-text-warning', text: `注意のあるファイルが ${noted} 件あります。移動の前に確かめてください` });

		const help = body.createDiv({ cls: 'pm-section pm-archive-help' });
		help.createEl('h4', { text: '移動のしかた' });
		const steps = help.createEl('ol');
		for (const step of [
			'TortoiseSVN で移動します。先に SVN で「更新」して、ほかの人の変更を取り込みます',
			`移動先のフォルダ（${archive}/ の下）が無ければ、エクスプローラーで作り、右クリック →「TortoiseSVN」→「追加」します`,
			'下の一覧の「移動元」のフォルダを開き、一覧のファイルを選びます（ファイル名はノートのIDです。「ファイル名をコピー」で一覧をコピーできます）',
			'選んだファイルを右ボタンでドラッグして移動先のフォルダに落とし、出てくるメニューから SVN の「ここに移動」を選びます（左ボタンでの普通の移動だと履歴が途切れます）',
			'すべて動かしたら、Vault のフォルダで「SVN コミット」します。この一覧から消えれば完了です',
		]) {
			steps.createEl('li', { text: step });
		}
		help.createDiv({ cls: 'pm-note', text: '作業ログは複数のプロジェクトにまたがるので動かしません。アーカイブしたノートも、プロジェクト状況などで「アーカイブも表示」にすると見られます' });

		for (const group of plan.groups) this.drawGroup(body, group);
	}

	private drawGroup(parent: HTMLElement, group: ArchiveGroup): void {
		const section = parent.createDiv({ cls: 'pm-section' });
		const head = section.createDiv({ cls: 'pm-section-head' });
		head.createEl('h4', { text: `${group.fromFolder || '（Vault の直下）'} → ${group.toFolder}（${group.items.length} 件）` });
		const names = head.createEl('button', { text: 'ファイル名をコピー' });
		names.addEventListener('click', () => void copy(group.items.map((i) => i.from.split('/').pop() ?? i.from).join('\n'), 'ファイル名'));

		const table = section.createEl('table', { cls: 'pm-table' });
		tableHeader(table, ['種類', 'タイトル', 'ファイル名', '注意']);
		const tbody = table.createEl('tbody');
		for (const item of group.items) {
			const row = tbody.createEl('tr');
			kindMark(row.createEl('td', { text: ARCHIVE_KIND_LABELS[item.kind] }), item.kind);
			row.createEl('td', { text: item.title });
			row.createEl('td', { text: item.from.split('/').pop() ?? item.from });
			row.createEl('td', { cls: 'pm-text-warning', text: item.notes.join('・') });
		}
	}
}
