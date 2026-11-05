import { type App, type CachedMetadata, debounce, type EventRef, Events, TFile } from 'obsidian';
import { isStrayPath } from '../health/strayFiles';
import { parseNoteId } from '../id';
import type { SubtaskCount } from '../model';
import type { PluginSettings } from '../settings';
import { buildNote, type NoteRecord } from './buildNote';
import { VaultIndex } from './vaultIndex';

/** 一度に読むファイル数（設計書 3.2） */
const BATCH_SIZE = 200;
/** 変更の通知をまとめる間隔（ミリ秒。設計書 3.3） */
const NOTIFY_DELAY = 300;
/** まとめて書く間、描き直しを止める上限（ミリ秒。書き終えてから数える。設計書 3.3） */
const HOLD_LIMIT = 2000;
/** 書いている最中の上限（ミリ秒） */
const HOLD_LIMIT_WRITING = 10000;

/** Vault を読んで索引を作り、変更に合わせて更新する。変更があると 'updated' を出す（設計書 3章） */
export class VaultStore extends Events {
	readonly index = new VaultIndex();
	/** 最初の読み込みが終わったか */
	ready = false;
	private building: Promise<void> | null = null;
	/** 作り直し中に変わったファイル。最後に読み直す（設計書 3.2） */
	private readonly changedWhileBuilding = new Set<string>();
	private readonly notify = debounce(() => this.trigger('updated'), NOTIFY_DELAY);
	/** まとめて書いたファイルのうち、まだ読み直していないもの（設計書 3.3） */
	private readonly waiting = new Set<string>();
	/** 描き直しを止めている間の、上限のタイマー */
	private holdTimer: number | undefined;

	constructor(
		private readonly app: App,
		private readonly getSettings: () => PluginSettings,
	) {
		super();
	}

	/** 戻り値は registerEvent に渡す */
	onUpdated(callback: () => void): EventRef {
		return this.on('updated', callback);
	}

	/**
	 * 複数のノートをまとめて書く。書いたファイルをすべて読み直すまで描き直しを止め、最後に1回だけ知らせる（設計書 3.3）
	 * @param paths 書き換えるファイル（中身が変わるものだけ）
	 */
	async writeMany(paths: readonly string[], write: () => Promise<void>): Promise<void> {
		for (const path of paths) this.waiting.add(path);
		this.startHold(HOLD_LIMIT_WRITING);
		try {
			await write();
		} catch (e) {
			this.release();
			throw e;
		}
		// 読み直しの知らせは書き込みより後に届くので、もう少し待つ
		if (this.holdTimer !== undefined) this.startHold(HOLD_LIMIT);
	}

	private startHold(limit: number): void {
		window.clearTimeout(this.holdTimer);
		this.holdTimer = window.setTimeout(() => this.release(), limit);
	}

	/** 描き直しの停止をやめて知らせる */
	private release(): void {
		window.clearTimeout(this.holdTimer);
		this.holdTimer = undefined;
		this.waiting.clear();
		this.notify();
	}

	/** 変わったことを知らせる。まとめて書いている間は、全部読み直すまで待つ */
	private changed(path?: string): void {
		if (path !== undefined) this.waiting.delete(path);
		if (this.holdTimer === undefined) this.notify();
		else if (this.waiting.size === 0) this.release();
	}

	/** 索引を作り直す（起動時・手動の再読み込み） */
	rebuild(): Promise<void> {
		this.building ??= this.doRebuild().finally(() => (this.building = null));
		return this.building;
	}

	private async doRebuild(): Promise<void> {
		const files = this.app.vault.getMarkdownFiles().filter((f) => parseNoteId(f.basename));
		const next = new VaultIndex();
		for (let i = 0; i < files.length; i += BATCH_SIZE) {
			await Promise.all(files.slice(i, i + BATCH_SIZE).map(async (file) => this.addTo(next, file)));
			await sleep(0);
		}
		this.index.clear();
		for (const record of next.records()) this.index.set(record);
		await this.rereadChanged();
		this.ready = true;
		this.trigger('updated');
	}

	/** 作り直しの間に変わったファイルを、今の内容で読み直す（無くなっていれば消す） */
	private async rereadChanged(): Promise<void> {
		const paths = [...this.changedWhileBuilding];
		this.changedWhileBuilding.clear();
		for (const path of paths) {
			const file = this.app.vault.getFileByPath(path);
			this.index.delete(path);
			if (file && file.extension === 'md' && parseNoteId(file.basename)) await this.addTo(this.index, file);
		}
	}

	/** 作り直し中なら、変わったファイルを覚えておく */
	private remember(...paths: string[]): void {
		if (this.building) for (const path of paths) this.changedWhileBuilding.add(path);
	}

	/** 変更を受けるイベントを作る。戻り値は registerEvent に渡す（設計書 3.3） */
	watch(): EventRef[] {
		const { vault, metadataCache } = this.app;
		return [
			metadataCache.on('changed', (file, data, cache) => {
				if (!parseNoteId(file.basename)) return;
				this.remember(file.path);
				void this.update(file, data, cache);
			}),
			// ID の形でないファイルは索引に入れないが、警告一覧のために知らせる（設計書 8章）
			vault.on('create', (file) => {
				if (this.isStray(file.path)) this.changed();
			}),
			vault.on('delete', (file) => {
				this.remember(file.path);
				if (this.index.getRecord(file.path)) {
					this.index.delete(file.path);
					this.changed();
				} else if (this.isStray(file.path)) {
					this.changed();
				}
			}),
			vault.on('rename', (file, oldPath) => {
				this.remember(oldPath, file.path);
				const wasIndexed = this.index.getRecord(oldPath) !== undefined;
				this.index.delete(oldPath);
				if (file instanceof TFile && file.extension === 'md' && parseNoteId(file.basename)) {
					void this.update(file);
				} else if (wasIndexed || this.isStray(oldPath) || this.isStray(file.path)) {
					this.changed();
				}
			}),
		];
	}

	/** タイトルが変わったノートを受け取る（設計書 4.2） */
	onTitleChanged(callback: (file: TFile, oldTitle: string) => void): EventRef {
		return this.on('title-changed', (...args: unknown[]) => {
			const [file, oldTitle] = args;
			if (file instanceof TFile && typeof oldTitle === 'string') callback(file, oldTitle);
		});
	}

	private async update(file: TFile, data?: string, cache?: CachedMetadata): Promise<void> {
		const oldTitle = titleOf(this.index.getRecord(file.path));
		await this.addTo(this.index, file, data, cache);
		const newTitle = titleOf(this.index.getRecord(file.path));
		if (this.ready && oldTitle !== undefined && newTitle !== undefined && newTitle !== oldTitle) {
			this.trigger('title-changed', file, oldTitle);
		}
		this.changed(file.path);
	}

	private async addTo(index: VaultIndex, file: TFile, data?: string, cache?: CachedMetadata): Promise<void> {
		const meta = cache ?? this.app.metadataCache.getFileCache(file);
		const parsed = parseNoteId(file.basename);
		// 本文はプロジェクト・メンバー・作業ログだけ読む（設計書 3.2）
		const needsContent = parsed?.type === 'project' || parsed?.type === 'user' || parsed?.type === 'worklog';
		const content = needsContent ? (data ?? (await this.app.vault.cachedRead(file))) : undefined;
		const record = buildNote({
			path: file.path,
			basename: file.basename,
			frontmatter: meta?.frontmatter,
			...(content !== undefined ? { content } : {}),
			subtasks: countSubtasks(meta),
			archived: this.isArchived(file.path),
		});
		if (record) index.set(record);
	}

	private isArchived(path: string): boolean {
		const archive = this.getSettings().folders.archive;
		return path.startsWith(`${archive}/`);
	}

	private isStray(path: string): boolean {
		return isStrayPath(path, this.getSettings().folders);
	}
}

function titleOf(record: NoteRecord | undefined): string | undefined {
	const note = record?.note;
	return note && 'title' in note ? note.title : record?.title;
}

/** チェックリストを数える。[x] [X] は完了、[ ] は未完了、他の記号は数えない */
function countSubtasks(meta: CachedMetadata | null | undefined): SubtaskCount {
	const count: SubtaskCount = { done: 0, total: 0 };
	for (const item of meta?.listItems ?? []) {
		if (item.task === ' ') count.total++;
		else if (item.task === 'x' || item.task === 'X') {
			count.total++;
			count.done++;
		}
	}
	return count;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}
