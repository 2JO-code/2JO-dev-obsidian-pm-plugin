import type { NoteId, NoteType } from '../model';
import { isIsoDate, parseLinkId } from '../parse/values';

/** frontmatter の値をモデルの型に変換する。変換できない値の理由は problems へ（設計書 3.4） */
export class Coercer {
	readonly problems: string[] = [];

	constructor(private readonly fm: Record<string, unknown>) {}

	has(key: string): boolean {
		return !isEmpty(this.fm[key]);
	}

	/** 文字列。warnNumber なら数値で読まれたことを警告する（設計書 3.4） */
	string(key: string, warnNumber = false): string | undefined {
		const v = this.fm[key];
		if (isEmpty(v)) return undefined;
		if (typeof v === 'string') return v.trim();
		if (typeof v === 'number' || typeof v === 'boolean') {
			if (warnNumber && typeof v === 'number') {
				this.problems.push(`${key} が数値として読まれています（${v}）。元の表記を入力補助フォームで入れ直してください`);
			}
			return String(v);
		}
		this.problems.push(`${key} が文字列ではありません`);
		return undefined;
	}

	strings(key: string): string[] {
		const v = this.fm[key];
		if (isEmpty(v)) return [];
		const list = Array.isArray(v) ? v : [v];
		const result: string[] = [];
		for (const item of list) {
			if (typeof item === 'string' || typeof item === 'number') {
				if (String(item).trim() !== '') result.push(String(item).trim());
			} else if (!isEmpty(item)) {
				this.problems.push(`${key} に文字列でない値があります`);
			}
		}
		return result;
	}

	number(key: string, options: { step?: number; min?: number } = {}): number | undefined {
		const v = this.fm[key];
		if (isEmpty(v)) return undefined;
		const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
		const { step, min = 0 } = options;
		if (!Number.isFinite(n) || n < min || (step !== undefined && !Number.isInteger(n / step))) {
			const rule = step !== undefined ? `${min}以上で${step}刻みの数値` : `${min}以上の数値`;
			this.problems.push(`${key} が${rule}ではありません: ${String(v)}`);
			return undefined;
		}
		return n;
	}

	boolean(key: string): boolean | undefined {
		const v = this.fm[key];
		if (isEmpty(v)) return undefined;
		if (typeof v === 'boolean') return v;
		this.problems.push(`${key} がチェックボックス（true / false）ではありません`);
		return undefined;
	}

	date(key: string): string | undefined {
		const v = this.string(key);
		if (v === undefined) return undefined;
		if (isIsoDate(v)) return v;
		this.problems.push(`${key} が YYYY-MM-DD の日付ではありません: ${v}`);
		return undefined;
	}

	link(key: string, type: NoteType): NoteId | undefined {
		const v = this.fm[key];
		if (isEmpty(v)) return undefined;
		const id = typeof v === 'string' ? parseLinkId(v, type) : null;
		if (id) return id;
		this.problems.push(`${key} が${TYPE_LABEL[type]}へのリンクではありません: ${String(v)}`);
		return undefined;
	}

	links(key: string, type: NoteType): NoteId[] {
		const v = this.fm[key];
		if (isEmpty(v)) return [];
		const ids: NoteId[] = [];
		for (const item of Array.isArray(v) ? v : [v]) {
			if (isEmpty(item)) continue;
			const id = typeof item === 'string' ? parseLinkId(item, type) : null;
			if (id) ids.push(id);
			else this.problems.push(`${key} に${TYPE_LABEL[type]}へのリンクでない値があります: ${String(item)}`);
		}
		return ids;
	}
}

export const TYPE_LABEL: Record<NoteType, string> = {
	project: 'プロジェクト',
	epic: 'エピック',
	task: 'タスク',
	user: 'メンバー',
	worklog: '作業ログ',
};

function isEmpty(v: unknown): boolean {
	return v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
}
