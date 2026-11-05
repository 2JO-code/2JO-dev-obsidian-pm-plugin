import { Notice, type App, type TFile } from 'obsidian';
import { moveInOrder, renumberEpics, renumberTasks, type Numbered } from '../calc/wbsOrder';
import type { NoteId } from '../model';
import type { VaultStore } from '../store/vaultStore';
import { writeFrontmatter } from '../write/frontmatterFile';

/** ドラッグ中の行を渡す種類（ほかのドラッグと区別する） */
const DRAG_TYPE = 'application/x-pm-wbs';

/** 入れ替えられる行のまとまり。同じまとまりの中でだけ動かせる */
export interface WbsDragGroup {
	kind: 'epic' | 'task';
	/** まとまりを見分けるキー（`wbsKey`） */
	key: string;
	/** 絞り込まない全体の、今の並び */
	order: Numbered[];
}

/** WBS・ガント・プロジェクト状況の行のドラッグで番号を入れ替える（設計書 9.7・11.17） */
export class WbsDrag {
	/** ドラッグ中の行。dragover では中身を読めないので、ここで持つ */
	private dragging: { group: string; id: NoteId; title: string } | undefined;

	constructor(
		private readonly app: App,
		private readonly store: () => VaultStore,
	) {}

	/**
	 * 行をドラッグでき、同じまとまりの行を落とせるようにする
	 * @param handle つかむ要素。省略すると行全体（ガントは棒の欄をつかませない）
	 */
	attach(tr: HTMLElement, group: WbsDragGroup, id: NoteId, title: string, handle: HTMLElement = tr): void {
		handle.draggable = true;
		handle.setAttr('aria-description', 'ドラッグして番号を入れ替え');
		handle.addEventListener('dragstart', (e) => {
			this.dragging = { group: group.key, id, title };
			e.dataTransfer?.setData(DRAG_TYPE, id);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
			tr.addClass('is-dragging');
		});
		handle.addEventListener('dragend', () => {
			this.dragging = undefined;
			tr.removeClass('is-dragging');
		});

		const clear = () => tr.removeClass('is-drop-before', 'is-drop-after');
		const accepts = () => this.dragging?.group === group.key && this.dragging.id !== id;
		const isAfter = (e: DragEvent) => {
			const rect = tr.getBoundingClientRect();
			return e.clientY > rect.top + rect.height / 2;
		};
		tr.addEventListener('dragover', (e) => {
			if (!accepts()) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
			const after = isAfter(e);
			tr.toggleClass('is-drop-after', after);
			tr.toggleClass('is-drop-before', !after);
		});
		tr.addEventListener('dragleave', (e) => {
			// 行の中の要素へ移っただけのときは外さない
			if (!(e.relatedTarget instanceof Node && tr.contains(e.relatedTarget))) clear();
		});
		tr.addEventListener('drop', (e) => {
			clear();
			const dragged = this.dragging;
			if (!dragged || !accepts()) return;
			e.preventDefault();
			void this.move(group, dragged, id, isAfter(e), title);
		});
	}

	/** 並べ替えた順に番号を振り直し、変わるノートだけ書き込む。描き直しは索引の更新で行われる */
	private async move(group: WbsDragGroup, dragged: { id: NoteId; title: string }, target: NoteId, after: boolean, targetTitle: string): Promise<void> {
		const ids = moveInOrder(
			group.order.map((n) => n.id),
			dragged.id,
			target,
			after,
		);
		if (!ids) return;
		const byId = new Map(group.order.map((n) => [n.id, n]));
		const order = ids.flatMap((id) => byId.get(id) ?? []);
		const changes = group.kind === 'epic' ? renumberEpics(order) : renumberTasks(order);
		const store = this.store();
		// 書く前にすべてのファイルを確かめる（途中で止まって番号が重ならないように）
		const targets: { file: TFile; wbs: string }[] = [];
		for (const c of changes) {
			const path = store.index.get(c.id)?.path;
			const file = path ? this.app.vault.getFileByPath(path) : null;
			if (!file) {
				new Notice('番号を書き換えるノートが見つかりません。警告一覧を確認してください');
				return;
			}
			targets.push({ file, wbs: c.wbs });
		}
		let failed = 0;
		try {
			// 並行に書き、描き直しは全部読み直してから1回だけ（設計書 3.3）
			await store.writeMany(
				targets.map((t) => t.file.path),
				async () => {
					const results = await Promise.allSettled(targets.map(({ file, wbs }) => writeFrontmatter(this.app, file, group.kind, { wbs })));
					const errors = results.flatMap((r) => (r.status === 'rejected' ? [r.reason as unknown] : []));
					failed = errors.length;
					if (failed > 0) throw new AggregateError(errors, 'WBS番号の書き込みに失敗しました');
				},
			);
			const where = after ? '後ろ' : '前';
			new Notice(`「${dragged.title}」を「${targetTitle}」の${where}へ移しました（番号を ${changes.length} 件書き換え）`);
		} catch (e) {
			console.error('[project-manager] WBS番号の書き込みに失敗しました', e);
			new Notice(`WBS番号を ${changes.length} 件中 ${failed || changes.length} 件書き込めませんでした。ノートのプロパティ（YAML）が壊れていないか確かめてください`);
		}
	}
}
