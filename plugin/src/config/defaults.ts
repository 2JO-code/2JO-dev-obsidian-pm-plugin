import type { Calendar, StatusCategory, StatusDef, StatusSets } from '../model';

const def = (name: string, category: StatusCategory): StatusDef => ({ name, category, aliases: [] });

/** ステータスの初期セット（要件3.6） */
export function defaultStatusSets(): StatusSets {
	return {
		task: [
			def('未着手', 'not_started'),
			def('進行中', 'in_progress'),
			def('レビュー待ち', 'in_progress'),
			def('差し戻し', 'in_progress'),
			def('保留', 'stopped'),
			def('中止', 'stopped'),
			def('完了', 'done'),
		],
		project: [
			def('提案中', 'not_started'),
			def('受注', 'not_started'),
			def('進行中', 'in_progress'),
			def('保留', 'stopped'),
			def('失注・中止', 'stopped'),
			def('クローズ', 'done'),
		],
	};
}

/** 会社カレンダーの初期値。休日は設定画面で登録する */
export function defaultCalendar(): Calendar {
	return { weekendsOff: true, holidays: [] };
}
