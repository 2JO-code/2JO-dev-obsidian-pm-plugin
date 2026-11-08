import { MEMBER_DEFAULTS } from '../model';
import { parseHours } from '../parse/values';
import type { FrontmatterUpdate } from '../write/frontmatter';
import { keepFrames, text } from './formValues';

/** メンバーの入力補助フォームの値。本文の個人休日の表は変えない（設計書 4.5） */
export interface MemberForm {
	/** 氏名（title）。姓・名とは別に入力する */
	title: string;
	familyName: string;
	givenName: string;
	dailyHours: string;
	loadLimitPct: string;
	active: boolean;
}

/** 氏名・姓・名の入力の誤り（作成画面とフォームで共通。設計書 4.5） */
export function nameErrors(title: string, familyName: string, givenName: string): string[] {
	const errors: string[] = [];
	if (title === '') errors.push('氏名を入力してください');
	if (familyName === '') errors.push('姓を入力してください');
	if (givenName === '') errors.push('名を入力してください');
	return errors;
}

/** frontmatter からフォームの初期値を作る。空なら既定値（読み取りと同じ。設計書 3.4） */
export function memberFormFromFrontmatter(fm: Record<string, unknown>): MemberForm {
	const orDefault = (v: unknown, fallback: number) => text(v) || String(fallback);
	return {
		title: text(fm.title),
		familyName: text(fm.family_name),
		givenName: text(fm.given_name),
		dailyHours: orDefault(fm.daily_hours, MEMBER_DEFAULTS.dailyHours),
		loadLimitPct: orDefault(fm.load_limit_pct, MEMBER_DEFAULTS.loadLimitPct),
		active: typeof fm.active === 'boolean' ? fm.active : MEMBER_DEFAULTS.active,
	};
}

export interface MemberFormResult {
	/** 入力の誤り。空なら保存できる */
	errors: string[];
	/** 保存してよいが知らせておくこと */
	warnings: string[];
	update: FrontmatterUpdate;
}

/** フォームの値を確かめ、frontmatter の変更内容にする（設計書 4.5） */
export function memberFormToUpdate(form: MemberForm): MemberFormResult {
	const warnings: string[] = [];
	const title = form.title.trim();
	const familyName = form.familyName.trim();
	const givenName = form.givenName.trim();
	const errors = nameErrors(title, familyName, givenName);
	const dailyHours = parseHours(form.dailyHours);
	if (dailyHours === null || dailyHours <= 0 || dailyHours > 24) errors.push('1日の通常稼働時間は0より大きく24以下の、0.25刻みの数値で入力してください（例：8）');
	const limitText = form.loadLimitPct.trim();
	const loadLimitPct = /^\d+$/.test(limitText) ? Number(limitText) : null;
	if (loadLimitPct === null || loadLimitPct <= 0) errors.push('負荷許容率は1以上の整数で入力してください（例：120）');
	else if (loadLimitPct < 100) warnings.push('負荷許容率が100%より小さいため、負荷率が100%以下でも負荷警告になることがあります');

	const update: FrontmatterUpdate = {
		type: 'user',
		title,
		aliases: [title],
		family_name: familyName,
		given_name: givenName,
		daily_hours: dailyHours ?? undefined,
		load_limit_pct: loadLimitPct ?? undefined,
		active: form.active,
	};
	return { errors, warnings, update: keepFrames(update) };
}
