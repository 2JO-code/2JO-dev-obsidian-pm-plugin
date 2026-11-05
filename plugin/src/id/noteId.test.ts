import { describe, expect, it } from 'vitest';
import { newNoteId, parseNoteId, worklogId } from './noteId';

const UUID = '0192f3a0-1234-7abc-8def-0123456789ab';

describe('newNoteId', () => {
	it('種類ごとの接頭辞が付く', () => {
		const none = () => false;
		expect(newNoteId('project', none)).toMatch(/^PJT-/);
		expect(newNoteId('epic', none)).toMatch(/^EPIC-/);
		expect(newNoteId('task', none)).toMatch(/^TASK-/);
		expect(newNoteId('user', none)).toMatch(/^USER-/);
	});

	it('すでにあるIDは避けて作り直す', () => {
		const ids = ['aaaa', 'bbbb'];
		const id = newNoteId('task', (candidate) => candidate === 'TASK-aaaa', () => ids.shift() ?? '');
		expect(id).toBe('TASK-bbbb');
	});

	it('何度作っても重複する場合はエラーにする', () => {
		expect(() => newNoteId('task', () => true)).toThrow();
	});
});

describe('worklogId', () => {
	it('メンバーIDに _YYYY-MM を付ける', () => {
		expect(worklogId(`USER-${UUID}`, '2026-11')).toBe(`USER-${UUID}_2026-11`);
	});
});

describe('parseNoteId', () => {
	it('種類を判定する', () => {
		expect(parseNoteId(`PJT-${UUID}`)).toEqual({ type: 'project', uuid: UUID });
		expect(parseNoteId(`EPIC-${UUID}`)).toEqual({ type: 'epic', uuid: UUID });
		expect(parseNoteId(`TASK-${UUID}`)).toEqual({ type: 'task', uuid: UUID });
		expect(parseNoteId(`USER-${UUID}`)).toEqual({ type: 'user', uuid: UUID });
	});

	it('作業ログのIDからメンバーと月を取り出す', () => {
		expect(parseNoteId(`USER-${UUID}_2026-11`)).toEqual({ type: 'worklog', member: `USER-${UUID}`, month: '2026-11' });
	});

	it('形式に合わないものは null', () => {
		expect(parseNoteId('ようこそ')).toBeNull();
		expect(parseNoteId(`DOC-${UUID}`)).toBeNull();
		expect(parseNoteId(`TASK-${UUID.replace('-7', '-4')}`)).toBeNull();
		expect(parseNoteId(`TASK-${UUID}_2026-11`)).toBeNull();
		expect(parseNoteId(`USER-${UUID}_2026-13`)).toBeNull();
	});
});
