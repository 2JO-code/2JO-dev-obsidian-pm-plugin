// ビルド結果を開発用Vaultのプラグインフォルダへコピーする。
// Vaultの場所は環境変数 OBSIDIAN_VAULT（plugin/ からの相対パスか絶対パス）、
// 未指定ならリポジトリと同じ階層の dev-projectmanager-plugin-vault。
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = ['main.js', 'manifest.json', 'styles.css'];

export function deploy() {
	const vault = path.resolve(
		root,
		process.env.OBSIDIAN_VAULT ?? '../../dev-projectmanager-plugin-vault',
	);
	if (!existsSync(path.join(vault, '.obsidian'))) {
		console.warn(`[deploy] Vaultが見つからないためスキップ: ${vault}`);
		return;
	}
	const { id } = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
	const dest = path.join(vault, '.obsidian', 'plugins', id);
	mkdirSync(dest, { recursive: true });
	for (const name of ARTIFACTS) {
		copyFileSync(path.join(root, name), path.join(dest, name));
	}
	// Hot Reload プラグインはこのファイルがあるプラグインを監視して自動で再読み込みする
	const marker = path.join(dest, '.hotreload');
	if (!existsSync(marker)) writeFileSync(marker, '');
	console.log(`[deploy] ${dest} へコピーしました`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	deploy();
}
