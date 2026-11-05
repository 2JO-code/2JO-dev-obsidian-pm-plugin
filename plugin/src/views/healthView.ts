import type { CalcContext } from '../calc/context';
import { openHolidayEditor } from '../commands/editHolidays';
import { openAllocationEditor, openMilestoneEditor } from '../commands/editProjectTables';
import { formOpenerOf } from '../commands/editTask';
import { openWorklogEditor } from '../commands/editWorklog';
import { healthProblems, reloadData } from '../commands/reload';
import { labelOf } from '../health/labels';
import type ProjectManagerPlugin from '../main';
import type { NoteProblem, ProblemFix } from '../store/buildNote';
import { actionButtons, rowButton } from './actions';
import { PmView } from './baseView';
import { noteLink, openNote } from './openNote';
import { openView } from './openView';

export const HEALTH_VIEW_TYPE = 'pm-health';

/** 警告一覧のビューと、開くコマンドを登録する */
export function registerHealthView(plugin: ProjectManagerPlugin): void {
	plugin.registerView(HEALTH_VIEW_TYPE, (leaf) => new HealthView(leaf, plugin));
	plugin.addCommand({
		id: 'open-health',
		name: '警告一覧を開く',
		callback: () => void openView(plugin.app, HEALTH_VIEW_TYPE),
	});
}

/** 警告一覧。ファイルごとにまとめて表示し、クリックで直す画面かノートを開く（設計書 8章） */
export class HealthView extends PmView {
	getViewType(): string {
		return HEALTH_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '警告一覧';
	}

	getIcon(): string {
		return 'alert-triangle';
	}

	protected getDescription(): string {
		return 'ノートの書き方の誤り（読めないプロパティなど）。クリックで入力補助フォームや表の編集画面を開いて直します（画面が無いものはノートを開きます）';
	}

	protected draw(el: HTMLElement, ctx: CalcContext): void {
		el.addClass('pm-health');
		const { summary, actions, body } = this.shell(el);
		const problems = healthProblems(this.plugin);
		summary.setText(problems.length === 0 ? '警告はありません' : `警告 ${problems.length} 件（ノート ${this.plugin.store.index.size} 件）`);
		actionButtons(actions, [{ text: '再読み込み', onClick: () => void reloadData(this.plugin) }]);

		for (const [path, items] of groupByPath(problems)) {
			const group = body.createDiv({ cls: 'pm-health-group' });
			const isConfig = this.plugin.config.isConfigPath(path);
			const label = labelOf(path, this.plugin.store.index);
			const title = group.createDiv({ cls: 'pm-health-file' });
			title.createSpan({ cls: 'pm-mark is-plain pm-health-type', text: isConfig ? '共有設定' : (label.typeLabel ?? 'ファイル') });
			title.createSpan({ text: label.title });
			group.createDiv({ cls: 'pm-health-path', text: path });
			if (isConfig) {
				group.createDiv({ cls: 'pm-health-hint', text: '設定画面のステータス・会社カレンダーから直してください' });
			} else {
				title.addClass('pm-action-link');
				noteLink(this.plugin, title, path);
			}

			const list = group.createEl('ul');
			for (const p of items) {
				const item = list.createEl('li');
				const message = item.createSpan();
				if (p.line !== undefined) message.createSpan({ cls: 'pm-health-line', text: `${p.line + 1}行目` });
				message.createSpan({ text: p.message });
				if (isConfig) continue;
				// 直す画面があればそれを開き、横にノートを開くボタンを置く（設計書 8章）
				const fix = this.fixer(p, ctx);
				message.addClass('pm-action-link');
				if (fix) {
					message.setAttr('aria-label', FIX_LABEL[fix.kind]);
					message.addEventListener('click', fix.open);
					rowButton(item, 'ノート', () => void openNote(this.plugin, path, p.line !== undefined ? { line: p.line } : {}));
				} else {
					noteLink(this.plugin, message, path, p.line);
				}
			}
		}
	}

	/** 問題を直す画面を開く関数。画面が無ければ undefined */
	private fixer(p: NoteProblem, ctx: CalcContext): { kind: ProblemFix; open: () => void } | undefined {
		const file = p.fix ? this.plugin.app.vault.getFileByPath(p.path) : null;
		if (!p.fix || !file) return undefined;
		const { plugin } = this;
		const id = file.basename;
		const kind = p.fix;
		switch (kind) {
			case 'form': {
				const openForm = formOpenerOf(file);
				return openForm ? { kind, open: () => openForm(plugin, file) } : undefined;
			}
			case 'milestones':
				return { kind, open: () => void openMilestoneEditor(plugin, id, file.path) };
			case 'allocations':
				return { kind, open: () => void openAllocationEditor(plugin, id, file.path, ctx.summary) };
			case 'holidays':
				return { kind, open: () => void openHolidayEditor(plugin, file.path) };
			case 'worklog':
				return { kind, open: () => void openWorklogEditor(plugin, file.path) };
		}
	}
}

/** マウスを乗せたときの説明 */
const FIX_LABEL: Record<ProblemFix, string> = {
	form: '入力補助フォームで直す',
	milestones: 'マイルストーンの編集画面で直す',
	allocations: '工数配分の編集画面で直す',
	holidays: '個人休日の編集画面で直す',
	worklog: '作業ログの編集画面で直す',
};

function groupByPath(problems: NoteProblem[]): Map<string, NoteProblem[]> {
	const groups = new Map<string, NoteProblem[]>();
	for (const p of [...problems].sort((a, b) => a.path.localeCompare(b.path) || (a.line ?? -1) - (b.line ?? -1))) {
		const list = groups.get(p.path) ?? [];
		list.push(p);
		groups.set(p.path, list);
	}
	return groups;
}
