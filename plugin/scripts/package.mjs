// ビルド結果を配布用のフォルダと zip にまとめる。
// 出力：release/<id>/（3ファイル）と release/<id>-<version>.zip（中は <id>/ フォルダ）。
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = ['main.js', 'manifest.json', 'styles.css'];

const { id, version } = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const releaseDir = path.join(root, 'release');
const pluginDir = path.join(releaseDir, id);
const zipPath = path.join(releaseDir, `${id}-${version}.zip`);

rmSync(pluginDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(pluginDir, { recursive: true });
for (const name of ARTIFACTS) {
	const src = path.join(root, name);
	if (!existsSync(src)) throw new Error(`[package] ${name} がありません。先に npm run build を実行してください`);
	copyFileSync(src, path.join(pluginDir, name));
}

// Windows 標準の tar（bsdtar）で zip を作る。Compress-Archive は区切りが \ になるため使わない
if (process.platform === 'win32') {
	const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
	execFileSync(tar, ['-a', '-c', '-f', zipPath, id], { cwd: releaseDir, stdio: 'inherit' });
} else {
	execFileSync('zip', ['-r', zipPath, id], { cwd: releaseDir, stdio: 'inherit' });
}
console.log(`[package] ${path.relative(root, pluginDir)}\\ と ${path.relative(root, zipPath)} を作りました`);
