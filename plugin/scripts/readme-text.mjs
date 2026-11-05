// 使い方の正本（docs/vault/README.md）を、main.js に入れるための TS ファイルに変換する（設計書 9章）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, '..', 'docs', 'vault', 'README.md');
const dest = path.join(root, 'src', 'generated', 'readmeText.ts');

const text = readFileSync(source, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const out = `// 自動生成（scripts/readme-text.mjs）。直接編集せず docs/vault/README.md を直す
export const README_TEXT = ${JSON.stringify(text)};
`;
mkdirSync(path.dirname(dest), { recursive: true });
writeFileSync(dest, out);
console.log(`[readme] ${path.relative(root, dest)} を作りました`);
