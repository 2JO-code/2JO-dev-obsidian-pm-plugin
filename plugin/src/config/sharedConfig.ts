import { type App, normalizePath, TFile } from 'obsidian';
import type { Calendar, StatusSets } from '../model';
import { defaultCalendar, defaultStatusSets } from './defaults';
import { parseCalendar, parseStatusSets, stringifyCalendar, stringifyStatusSets } from './parse';

export const DEFAULT_CONFIG_DIR = '_pm';
const STATUSES_FILE = 'statuses.json';
const CALENDAR_FILE = 'calendar.json';

/** 共有設定ファイルの問題（警告一覧に出す） */
export interface ConfigProblem {
	path: string;
	message: string;
}

/** 保存しようとしたら、読んだあとにファイルが変わっていたときの例外 */
class SharedConfigChangedError extends Error {}

/** Vault 内の共有設定を読み書きする（設計書 5.1〜5.3） */
export class SharedConfig {
	statuses: StatusSets = defaultStatusSets();
	calendar: Calendar = defaultCalendar();
	problems: ConfigProblem[] = [];
	private listeners = new Set<() => void>();
	/** 前回読んだファイルの場所と中身 */
	private loaded: string | undefined;
	/** 前回読んだファイルの中身（パスごと。無ければ null）。保存の前に比べる（設計書 5.6） */
	private texts = new Map<string, string | null>();

	constructor(
		private readonly app: App,
		private dir: string = DEFAULT_CONFIG_DIR,
	) {}

	get statusesPath(): string {
		return normalizePath(`${this.dir}/${STATUSES_FILE}`);
	}

	get calendarPath(): string {
		return normalizePath(`${this.dir}/${CALENDAR_FILE}`);
	}

	/** 設定フォルダを変える。呼び出し側で load() し直す */
	setDir(dir: string): void {
		this.dir = dir;
	}

	isConfigPath(path: string): boolean {
		return path === this.statusesPath || path === this.calendarPath;
	}

	/** 読み直したときに呼ばれる。戻り値で解除する */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** 読み直す。ファイルの中身が前回と同じなら何もしない（設計書 5.3） */
	async load(): Promise<void> {
		const statusesText = await this.readText(this.statusesPath);
		const calendarText = await this.readText(this.calendarPath);
		this.texts = new Map([
			[this.statusesPath, statusesText],
			[this.calendarPath, calendarText],
		]);
		const snapshot = JSON.stringify([this.statusesPath, statusesText, this.calendarPath, calendarText]);
		if (snapshot === this.loaded) return;
		this.loaded = snapshot;
		const statuses = statusesText === null ? { value: defaultStatusSets(), problems: [] } : parseStatusSets(statusesText);
		const calendar = calendarText === null ? { value: defaultCalendar(), problems: [] } : parseCalendar(calendarText);
		this.statuses = statuses.value;
		this.calendar = calendar.value;
		this.problems = [
			...statuses.problems.map((message) => ({ path: this.statusesPath, message })),
			...calendar.problems.map((message) => ({ path: this.calendarPath, message })),
		];
		for (const listener of this.listeners) listener();
	}

	async saveStatuses(statuses: StatusSets): Promise<void> {
		await this.save(this.statusesPath, stringifyStatusSets(statuses));
	}

	async saveCalendar(calendar: Calendar): Promise<void> {
		await this.save(this.calendarPath, stringifyCalendar(calendar));
	}

	/** 書いて読み直す。読んだあとにほかの人が変えていたら書かずに読み直し、例外で知らせる（設計書 5.6） */
	private async save(path: string, content: string): Promise<void> {
		try {
			await this.writeFile(path, content);
		} catch (e) {
			if (!(e instanceof SharedConfigChangedError)) throw e;
			await this.load();
			throw new Error('共有設定が、ほかの人に変えられていました。最新の内容を読み直したので、確かめてからもう一度変えてください');
		}
		await this.load();
	}

	/** ファイルの中身。無ければ null */
	private async readText(path: string): Promise<string | null> {
		const file = this.app.vault.getFileByPath(path);
		return file ? this.app.vault.read(file) : null;
	}

	private async writeFile(path: string, content: string): Promise<void> {
		const expected = this.texts.get(path) ?? null;
		const file = this.app.vault.getFileByPath(path);
		if (file instanceof TFile) {
			await this.app.vault.process(file, (current) => {
				if (current !== expected) throw new SharedConfigChangedError();
				return content;
			});
			return;
		}
		// 読んだときにあったファイルが消えていたら、書かずに知らせる
		if (expected !== null) throw new SharedConfigChangedError();
		if (!this.app.vault.getFolderByPath(this.dir)) await this.app.vault.createFolder(this.dir);
		await this.app.vault.create(path, content);
	}
}
