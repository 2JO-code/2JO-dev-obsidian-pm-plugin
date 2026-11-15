import type { App } from 'obsidian';
import { endConfirmText, type EndChange } from '../forms/taskEnd';
import type { IsoDate } from '../model';
import { confirm } from './confirmModal';

/** 終了日の新しい値を決める。完了系にするときは今日にするか聞く。undefined は変えない */
export async function resolveTaskEnd(app: App, change: EndChange, title: string): Promise<IsoDate | undefined> {
	if (change.kind === 'keep') return undefined;
	const ok = await confirm(app, { ...endConfirmText(change, title), confirmText: '今日にする', cancelText: '変えない' });
	return ok ? change.today : undefined;
}
