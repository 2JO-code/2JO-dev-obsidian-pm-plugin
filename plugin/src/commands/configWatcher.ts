import type { TAbstractFile } from 'obsidian';
import type ProjectManagerPlugin from '../main';

/** 共有設定ファイルが変わったら読み直す（設計書 5.3） */
export function registerConfigWatcher(plugin: ProjectManagerPlugin): void {
	const { config } = plugin;
	const reloadIfConfig = (file: TAbstractFile, oldPath?: string) => {
		if (config.isConfigPath(file.path) || (oldPath && config.isConfigPath(oldPath))) void config.load();
	};
	const { vault } = plugin.app;
	plugin.registerEvent(vault.on('create', reloadIfConfig));
	plugin.registerEvent(vault.on('modify', reloadIfConfig));
	plugin.registerEvent(vault.on('delete', reloadIfConfig));
	plugin.registerEvent(vault.on('rename', reloadIfConfig));
}
