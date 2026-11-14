/** ビューの表示設定を各PCに覚える仕組みのうち、Obsidian に依存しない部分（設計書 9.1） */
import { isRecord } from '../parse/values';

/** プラグインが開いたときに状態に付ける印。印があれば渡した状態を使う */
export const OPENED_BY_PLUGIN = 'pmOpenedByPlugin';

/** 各PCに保存するときの名前（ビューの種類ごと） */
export function viewMemoryKey(viewType: string): string {
	return `project-manager:view:${viewType}`;
}

/**
 * ビューに当てはめる状態を決める。
 * - プラグインが開いたとき（印つき）は、このPCに覚えた状態に、渡された項目（印を除く）を重ねて使う
 * - それ以外（Obsidian が workspace.json から戻すときなど）は、このPCに覚えた状態があればそれを使う
 * @returns state 当てはめる状態。remember はこのPCに覚え直すべきか
 */
export function resolveViewState(incoming: unknown, stored: unknown): { state: unknown; remember: boolean } {
	if (isRecord(incoming) && incoming[OPENED_BY_PLUGIN] === true) {
		const passed = Object.fromEntries(Object.entries(incoming).filter(([key]) => key !== OPENED_BY_PLUGIN));
		return { state: { ...(isRecord(stored) ? stored : {}), ...passed }, remember: true };
	}
	if (isRecord(stored)) return { state: stored, remember: false };
	return { state: incoming, remember: false };
}
