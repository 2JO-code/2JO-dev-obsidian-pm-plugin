import { Notice } from 'obsidian';
import {
	ARCHIVE_KIND_LABELS,
	archivableProjects,
	archivePlan,
	restorableProjects,
	restorePlan,
	type ArchivePlan,
} from '../calc/archive';
import { compareNumeric } from '../calc/compare';
import type { CalcContext } from '../calc/context';
import { moveNotes } from '../commands/archiveMove';
import type ProjectManagerPlugin from '../main';
import type { NoteId, Project } from '../model';
import { oneOf, field } from '../parse/values';
import { projectLabel } from '../settings';
import { confirm } from '../ui/confirmModal';
import { notifyError } from '../ui/notify';
import { tableHeader } from '../ui/table';
import { actionButtons } from './actions';
import { kindMark } from './badges';
import { PmView } from './baseView';
import { singleSelect } from './filterBar';
import { openView } from './openView';
import { ARCHIVE_VIEW_TYPE } from './viewTypes';

/** アーカイブの画面のビューと、開くコマンドを登録する */
export function registerArchiveView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(ARCHIVE_VIEW_TYPE, (leaf) => new ArchiveView(leaf, plugin));
	plugin.addCommand({
		id: 'open-archive-list',
		name: 'アーカイブの画面を開く',
		callback: () => void openView(plugin.app, ARCHIVE_VIEW_TYPE),
	});
}

type ArchiveMode = 'archive' | 'restore';
const MODES: readonly ArchiveMode[] = ['archive', 'restore'];

/** 操作ごとの文言 */
const TEXT: Record<ArchiveMode, { label: string; projects: string; empty: string; button: string; done: string; already: string }> = {
	archive: {
		label: 'アーカイブへ移動',
		projects: 'クローズ済みのプロジェクト',
		empty: 'アーカイブできるプロジェクトはありません（ステータスが完了系＝クローズ済みで、アーカイブフォルダの外にファイルが残っているもの）',
		button: 'アーカイブへ移動',
		done: 'アーカイブへ動かしました',
		already: 'アーカイブ済み',
	},
	restore: {
		label: 'アーカイブから戻す',
		projects: 'アーカイブしたプロジェクト',
		empty: '戻せるプロジェクトはありません（アーカイブフォルダの中にファイルがあるもの）',
		button: '元の場所へ戻す',
		done: '元の場所へ戻しました',
		already: '戻し済み',
	},
};

/** アーカイブへの移動と、アーカイブから戻す画面（要件4.9、設計書 9.9） */
export class ArchiveView extends PmView {
	private mode: ArchiveMode = 'archive';
	private projectId: NoteId | undefined;
	/** 移動中は次の操作を受け付けない */
	private moving = false;

	getViewType(): string {
		return ARCHIVE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'アーカイブ';
	}

	getIcon(): string {
		return 'archive';
	}

	protected getDescription(): string {
		return 'クローズしたプロジェクトのファイルを、アーカイブフォルダへ動かします。アーカイブから元の場所へ戻すこともできます';
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), mode: this.mode, ...(this.projectId ? { project: this.projectId } : {}) };
	}

	protected readState(state: unknown): void {
		const raw = field(state, 'project');
		this.projectId = typeof raw === 'string' ? raw : undefined;
		this.mode = oneOf(field(state, 'mode'), MODES) ?? 'archive';
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-archive');
		const mode = this.mode;
		const text = TEXT[mode];
		const display = this.plugin.personal.projectDisplayName;
		const archive = this.plugin.settings.folders.archive;
		const { summary, filters, actions, notes, body } = this.shell(el, { grid: true });

		singleSelect(
			filters,
			'操作',
			mode,
			MODES.map((m) => ({ value: m, label: TEXT[m].label })),
			(m) => this.change({ mode: m }),
		);

		const listed = mode === 'archive' ? archivableProjects(ctx.index, archive, ctx.statuses) : restorableProjects(ctx.index, archive);
		const projects = listed.sort((a, b) => compareNumeric(projectLabel(a, display), projectLabel(b, display)));
		const project = projects.find((p) => p.id === this.projectId) ?? projects[0];
		if (!project) {
			body.createDiv({ cls: 'pm-view-empty', text: text.empty });
			return;
		}
		singleSelect(
			filters,
			text.projects,
			project.id,
			projects.map((p) => ({ value: p.id, label: projectLabel(p, display) })),
			(id) => this.change({ project: id }),
		);

		const plan = mode === 'archive' ? archivePlan(ctx.index, project, archive, ctx.statuses) : restorePlan(ctx.index, project, archive);
		const movable = plan.items.filter((i) => !i.clash).length;
		summary.setText(`動かすファイル ${movable} 件${plan.alreadyDone > 0 ? `（${text.already} ${plan.alreadyDone} 件）` : ''}`);
		if (movable > 0) {
			actionButtons(actions, [{ text: `${text.button}（${movable} 件）`, onClick: () => void this.run(project, plan) }]);
		}
		const noted = plan.items.filter((i) => i.notes.length > 0).length;
		if (noted > 0) notes.createDiv({ cls: 'pm-text-warning', text: `注意のあるファイルが ${noted} 件あります。動かす前に確かめてください` });
		body.createDiv({
			cls: 'pm-note',
			text: '作業ログは複数のプロジェクトにまたがるので動かしません。アーカイブしたノートも、プロジェクト状況などで「アーカイブも表示」にすると見られます',
		});
		this.drawTable(body, plan);
	}

	/** 操作かプロジェクトを変えて描き直す */
	private change(next: { mode?: ArchiveMode; project?: NoteId }): void {
		if (next.mode) this.mode = next.mode;
		if (next.project) this.projectId = next.project;
		this.saveState();
		this.redraw();
	}

	/** 確かめてからファイルを動かし、結果を知らせる */
	private async run(project: Project, plan: ArchivePlan): Promise<void> {
		if (this.moving) return;
		const text = TEXT[this.mode];
		const items = plan.items.filter((i) => !i.clash);
		const archive = this.plugin.settings.folders.archive;
		const name = projectLabel(project, this.plugin.personal.projectDisplayName);
		const clashes = plan.items.length - items.length;
		const ok = await confirm(this.app, {
			title: `${text.label}：${name}`,
			details: [
				this.mode === 'archive' ? `${items.length} 件のファイルを ${archive}/ の下へ動かします` : `${items.length} 件のファイルを元の場所へ戻します`,
				...(clashes > 0 ? [`移動先に同じ名前のファイルがある ${clashes} 件は動かしません`] : []),
				'全員の画面に反映されます。作業ログは動かしません',
			],
			confirmText: text.button,
		});
		if (!ok) return;
		this.moving = true;
		try {
			const result = await moveNotes(this.app, items);
			const skipped = result.skipped > 0 ? `。見つからない・同じ名前があるため ${result.skipped} 件は動かしていません` : '';
			if (result.error !== undefined) {
				notifyError(result.error, `途中で止まりました（${result.moved} 件は動かしました）。もう一度押すと残りを動かします${skipped}`);
			} else {
				new Notice(`${result.moved} 件を${text.done}${skipped}`);
			}
		} finally {
			this.moving = false;
		}
	}

	private drawTable(parent: HTMLElement, plan: ArchivePlan): void {
		const table = parent.createEl('table', { cls: 'pm-table' });
		tableHeader(table, ['種類', 'タイトル', '今の場所', '移動先', '注意']);
		const tbody = table.createEl('tbody');
		for (const item of plan.items) {
			const row = tbody.createEl('tr');
			kindMark(row.createEl('td', { text: ARCHIVE_KIND_LABELS[item.kind] }), item.kind);
			row.createEl('td', { text: item.title });
			row.createEl('td', { text: item.from });
			row.createEl('td', { text: item.to });
			row.createEl('td', { cls: 'pm-text-warning', text: item.notes.join('・') });
		}
	}
}
