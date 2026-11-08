import { Notice } from 'obsidian';
import { errorMessage } from '../errors';

/** 失敗をコンソールに記録し、文と誤りの内容を Notice で知らせる（設計書 4.13） */
export function notifyError(e: unknown, message?: string): void {
	console.error(`[project-manager] ${message ?? '処理に失敗しました'}`, e);
	new Notice(message ? `${message}\n${errorMessage(e)}` : errorMessage(e));
}
