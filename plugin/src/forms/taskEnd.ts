import { dayOfWeek, monthDayText, WEEKDAYS } from '../calc/dates';
import { findStatus } from '../config/status';
import type { IsoDate, StatusDef } from '../model';

/** ステータスを変えたときの終了日の扱い（要件 4.7）。ask は今日にするかを利用者に聞く */
export type EndChange = { kind: 'keep' } | { kind: 'ask'; today: IsoDate; current?: IsoDate };

/** 完了系にするときは聞く。ほかは変えない（完了系から外しても終了日は残す） */
export function endChangeForStatus(
	from: string,
	to: string,
	end: IsoDate | undefined,
	statuses: readonly StatusDef[],
	today: IsoDate,
): EndChange {
	const isDone = (name: string) => findStatus(statuses, name)?.category === 'done';
	if (!isDone(to) || isDone(from) || end === today) return { kind: 'keep' };
	return { kind: 'ask', today, ...(end ? { current: end } : {}) };
}

/** 例：11/15(日) */
const dateText = (date: IsoDate) => `${monthDayText(date)}(${WEEKDAYS[dayOfWeek(date)] ?? ''})`;

/** 終了日を今日にするかの確認の文 */
export function endConfirmText(change: { today: IsoDate; current?: IsoDate }, title: string): { title: string; details: string[] } {
	return {
		title: '終了日を今日にしますか？',
		details: [
			`「${title}」を完了にします`,
			change.current ? `今の終了日は ${dateText(change.current)} です` : '終了日はまだ空です',
			`「今日にする」で終了日を ${dateText(change.today)} にします`,
			'「変えない」なら終了日はそのままです。あとでフォームで直せます',
		],
	};
}
