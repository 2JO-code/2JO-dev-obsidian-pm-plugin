import { Notice, type TFile } from 'obsidian';
import { parseNoteId } from '../id';
import type ProjectManagerPlugin from '../main';
import { syncAliases } from '../write/aliases';
import { writeFrontmatter } from '../write/frontmatterFile';

/** タイトルの変更から書き込むまでの待ち時間（ミリ秒。設計書 4.2） */
const DELAY = 1500;

/** タイトルが変わったら aliases をそろえる（設計書 4.2） */
export function registerAliasSync(plugin: ProjectManagerPlugin): void {
	const pending = new Map<string, number>();

	plugin.registerEvent(
		plugin.store.onTitleChanged((file) => {
			window.clearTimeout(pending.get(file.path));
			const timer = window.setTimeout(() => {
				pending.delete(file.path);
				void apply(plugin, file);
			}, DELAY);
			pending.set(file.path, timer);
		}),
	);
	plugin.register(() => pending.forEach((timer) => window.clearTimeout(timer)));
}

async function apply(plugin: ProjectManagerPlugin, file: TFile): Promise<void> {
	const parsed = parseNoteId(file.basename);
	if (!parsed || parsed.type === 'worklog') return;
	const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm || typeof fm.title !== 'string') return;
	const aliases = Array.isArray(fm.aliases) ? fm.aliases.filter((a): a is string => typeof a === 'string') : [];
	const next = syncAliases(fm.title, aliases);
	if (!next) return;
	try {
		await writeFrontmatter(plugin.app, file, parsed.type, { aliases: next });
	} catch (e) {
		new Notice(`別名（aliases）を更新できませんでした: ${e instanceof Error ? e.message : String(e)}`);
	}
}
