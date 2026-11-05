import type { IsoDate, StatusCategory, StatusSets } from '../model';

/** 設定変更の影響。none：なし／notice：保存後に通知／confirm：保存前に確認（設計書 5.5） */
export type ImpactLevel = 'none' | 'notice' | 'confirm';

export interface Impact {
	level: ImpactLevel;
	title: string;
	details: string[];
}

/** 影響を受けるノートの件数。分からなければ null */
export interface UsageCounter {
	/** そのステータス名（旧名を含む）を持つノートの数 */
	countStatus(set: keyof StatusSets, names: string[]): number | null;
	/** その日に予定・実績が入っている作業ログの行数 */
	countWorklogEntriesOn(date: IsoDate): number | null;
}

export const NO_USAGE: UsageCounter = {
	countStatus: () => null,
	countWorklogEntriesOn: () => null,
};

export type StatusChange =
	| { kind: 'add'; name: string }
	| { kind: 'rename'; from: string; to: string; aliases: string[] }
	| { kind: 'remove'; name: string; aliases: string[] }
	| { kind: 'category'; name: string; aliases: string[]; from: StatusCategory; to: StatusCategory }
	| { kind: 'move'; firstBefore: string; firstAfter: string };

export type CalendarChange =
	| { kind: 'addHoliday'; date: IsoDate }
	| { kind: 'removeHoliday'; date: IsoDate }
	| { kind: 'weekends'; weekendsOff: boolean };

const SHARED_NOTE = 'この設定は全員で共有されます。SVNでコミットすると、他のメンバーの集計にも反映されます。';

const SET_LABEL: Record<keyof StatusSets, string> = {
	task: 'タスク・エピック',
	project: 'プロジェクト',
};

function noteCount(count: number | null, label: string): string[] {
	return count === null ? [] : [`${label}：${count}件`];
}

/** 分類が変わったときに、集計がどう変わるかの説明 */
function categoryEffects(from: StatusCategory, to: StatusCategory): string[] {
	const effects: string[] = [];
	if (to === 'done') effects.push('完了として数えられ、進捗率が上がります。期限超過の警告は出なくなります。');
	if (from === 'done') effects.push('完了として数えられなくなり、進捗率が下がります。期限を過ぎていれば期限超過の警告が出ます。');
	if (to === 'stopped') effects.push('進捗率の計算（分母）から外れます。');
	if (from === 'stopped') effects.push('進捗率の計算（分母）に入るようになります。');
	return effects;
}

export function statusChangeImpact(set: keyof StatusSets, change: StatusChange, usage: UsageCounter): Impact {
	const scope = `${SET_LABEL[set]}のステータス`;
	switch (change.kind) {
		case 'add':
			return { level: 'none', title: '', details: [] };

		case 'move':
			if (change.firstBefore === change.firstAfter) return { level: 'none', title: '', details: [] };
			return {
				level: 'notice',
				title: '初期値が変わりました',
				details: [`新しく作る${SET_LABEL[set]}の初期ステータスが「${change.firstBefore}」から「${change.firstAfter}」に変わります。`],
			};

		case 'rename':
			return {
				level: 'notice',
				title: `「${change.from}」を「${change.to}」に変更しました`,
				details: [
					`「${change.from}」と書かれたノートは書き換えず、そのまま「${change.to}」として集計・表示します。`,
					...noteCount(usage.countStatus(set, [change.from, ...change.aliases]), `「${change.from}」のノート`),
				],
			};

		case 'remove': {
			const names = [change.name, ...change.aliases];
			return {
				level: 'confirm',
				title: `${scope}「${change.name}」を削除しますか？`,
				details: [
					...noteCount(usage.countStatus(set, names), '影響するノート'),
					`「${names.join('」「')}」と書かれたノートは、どのステータスにも当てはまらなくなります。進捗の集計から外れ、健全性チェックで警告になります。`,
					'使わなくなっただけなら、削除せずに残しておくことをおすすめします。',
					SHARED_NOTE,
				],
			};
		}

		case 'category': {
			const effects = categoryEffects(change.from, change.to);
			const count = noteCount(usage.countStatus(set, [change.name, ...change.aliases]), '影響するノート');
			if (effects.length === 0) {
				// 未着手系 ⇔ 進行中系
				return {
					level: 'notice',
					title: `「${change.name}」の分類を変更しました`,
					details: ['進捗率は変わりません。ダッシュボードなどでの区分けが変わります。', ...count],
				};
			}
			return {
				level: 'confirm',
				title: `${scope}「${change.name}」の分類を変更しますか？`,
				details: [...count, ...effects, SHARED_NOTE],
			};
		}
	}
}

export function calendarChangeImpact(change: CalendarChange, usage: UsageCounter): Impact {
	switch (change.kind) {
		case 'addHoliday': {
			const count = usage.countWorklogEntriesOn(change.date);
			const details = [
				`${change.date} は稼働日として数えられなくなります。負荷率の基準時間と、依存関係から計算する日程が変わります。`,
			];
			if (count !== null && count > 0) {
				details.unshift(`この日に予定・実績が入っている作業ログが${count}件あり、「休日稼働」として警告されるようになります。`);
			}
			details.push(SHARED_NOTE);
			// 作業ログがある日だけ確認する
			return {
				level: count !== null && count > 0 ? 'confirm' : 'notice',
				title: count !== null && count > 0 ? `${change.date} を休日にしますか？` : `${change.date} を休日にしました`,
				details,
			};
		}

		case 'removeHoliday':
			return {
				level: 'notice',
				title: `${change.date} を休日から外しました`,
				details: [`${change.date} は稼働日として数えられるようになります。負荷率の基準時間と、依存関係から計算する日程が変わります。`],
			};

		case 'weekends':
			return {
				level: 'confirm',
				title: change.weekendsOff ? '土日を休日にしますか？' : '土日を稼働日にしますか？',
				details: [
					'すべての期間の土日の扱いが変わります。負荷率の基準時間と、依存関係から計算する日程が大きく変わります。',
					change.weekendsOff
						? '土日に入っている予定・実績は「休日稼働」として警告されるようになります。'
						: '土日も稼働日として数えるため、負荷率が下がって見えるようになります。',
					SHARED_NOTE,
				],
			};
	}
}
