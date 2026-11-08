import type ProjectManagerPlugin from '../main';
import { README_TEXT } from '../generated/readmeText';
import { openNote } from '../views/openNote';
import { readmeContent, readmeNeedsWrite } from './readmeContent';
import { notifyError } from '../ui/notify';

/** 使い方のノート（Vault の直下。中身はプラグインに入れて配る。設計書 9章） */
export const README_PATH = 'README.md';

/** 使い方のノートを開くコマンドを登録する */
export function registerReadme(plugin: ProjectManagerPlugin): void {
	plugin.addCommand({ id: 'open-readme', name: '使い方を開く', callback: () => void openReadme(plugin) });
}

/** 使い方のノートを無ければ作り、古ければプラグインの版に直してから開く */
export async function openReadme(plugin: ProjectManagerPlugin): Promise<void> {
	const { vault } = plugin.app;
	const content = readmeContent(README_TEXT);
	try {
		const file = vault.getFileByPath(README_PATH);
		if (!file) await vault.create(README_PATH, content);
		else if (readmeNeedsWrite(await vault.read(file), content)) await vault.process(file, () => content);
	} catch (e) {
		notifyError(e, `使い方のノート（${README_PATH}）を作れませんでした`);
		return;
	}
	await openNote(plugin, README_PATH);
}
