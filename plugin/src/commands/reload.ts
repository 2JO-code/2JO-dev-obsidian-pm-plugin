import { Notice } from 'obsidian';
import { checkHealth } from '../health/check';
import { findStrayFiles } from '../health/strayFiles';
import type ProjectManagerPlugin from '../main';
import type { NoteProblem } from '../store/buildNote';

/** 再読み込みのコマンドとリボンのボタンを登録する */
export function registerReload(plugin: ProjectManagerPlugin): void {
	plugin.addCommand({ id: 'reload-data', name: 'データを再読み込み', callback: () => void reloadData(plugin) });
	plugin.addRibbonIcon('refresh-cw', 'プロジェクト管理のデータを再読み込み', () => void reloadData(plugin));
}

/** 共有設定と索引を読み直し、件数とかかった時間を通知する */
export async function reloadData(plugin: ProjectManagerPlugin): Promise<void> {
	const started = performance.now();
	await plugin.config.load();
	await plugin.store.rebuild();
	const problems = healthProblems(plugin).length;
	const seconds = ((performance.now() - started) / 1000).toFixed(1);
	new Notice(`データを再読み込みしました（ノート ${plugin.store.index.size} 件、警告 ${problems} 件、${seconds} 秒）`);
}

/** 健全性チェックの結果（設計書 8章） */
export function healthProblems(plugin: ProjectManagerPlugin): NoteProblem[] {
	const paths = plugin.app.vault.getMarkdownFiles().map((f) => f.path);
	return [
		...plugin.config.problems,
		...checkHealth(plugin.store.index, plugin.config.statuses),
		...findStrayFiles(paths, plugin.settings.folders),
	];
}
