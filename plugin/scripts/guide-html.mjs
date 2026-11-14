// 使い方の正本（docs/vault/guide.html）を、main.js に入れるための TS ファイルに変換する（設計書 9.14）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, '..', 'docs', 'vault', 'guide.html');
const dest = path.join(root, 'src', 'generated', 'guideHtml.ts');

const text = readFileSync(source, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const out = `// 自動生成（scripts/guide-html.mjs）。直接編集せず docs/vault/guide.html を直す
export const GUIDE_HTML = ${JSON.stringify(text)};
`;
mkdirSync(path.dirname(dest), { recursive: true });
writeFileSync(dest, out);
console.log(`[guide] ${path.relative(root, dest)} を作りました`);
