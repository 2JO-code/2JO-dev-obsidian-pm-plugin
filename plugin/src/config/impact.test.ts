import { describe, expect, it } from 'vitest';
import { calendarChangeImpact, NO_USAGE, type StatusChange, statusChangeImpact, type UsageCounter } from './impact';

const usage = (statusCount: number, worklogCount: number): UsageCounter => ({
	countStatus: () => statusCount,
	countWorklogEntriesOn: () => worklogCount,
});

describe('statusChangeImpact', () => {
	it('追加は何も表示しない', () => {
		expect(statusChangeImpact('task', { kind: 'add', name: 'A' }, NO_USAGE).level).toBe('none');
	});

	it('並べ替えは先頭（初期値）が変わったときだけ通知する', () => {
		expect(statusChangeImpact('task', { kind: 'move', firstBefore: 'A', firstAfter: 'A' }, NO_USAGE).level).toBe('none');
		const impact = statusChangeImpact('task', { kind: 'move', firstBefore: 'A', firstAfter: 'B' }, NO_USAGE);
		expect(impact.level).toBe('notice');
		expect(impact.details[0]).toMatch(/「A」から「B」/);
	});

	it('名前の変更は通知。件数がわかれば表示する', () => {
		const change: StatusChange = { kind: 'rename', from: 'A', to: 'B', aliases: [] };
		expect(statusChangeImpact('task', change, NO_USAGE).details).toHaveLength(1);
		const impact = statusChangeImpact('task', change, usage(3, 0));
		expect(impact.level).toBe('notice');
		expect(impact.details).toContain('「A」のノート：3件');
	});

	it('削除は確認し、旧名も対象であることと件数を示す', () => {
		const impact = statusChangeImpact('task', { kind: 'remove', name: 'A', aliases: ['旧A'] }, usage(5, 0));
		expect(impact.level).toBe('confirm');
		expect(impact.details[0]).toBe('影響するノート：5件');
		expect(impact.details.join()).toMatch(/「A」「旧A」/);
	});

	it('進捗率が変わる分類の変更は確認する', () => {
		const toDone = statusChangeImpact(
			'task',
			{ kind: 'category', name: 'A', aliases: [], from: 'in_progress', to: 'done' },
			NO_USAGE,
		);
		expect(toDone.level).toBe('confirm');
		expect(toDone.details.join()).toMatch(/進捗率が上がります/);

		const fromStopped = statusChangeImpact(
			'task',
			{ kind: 'category', name: 'A', aliases: [], from: 'stopped', to: 'done' },
			NO_USAGE,
		);
		expect(fromStopped.details.join()).toMatch(/分母）に入る/);
	});

	it('未着手系と進行中系の入れ替えは通知だけ', () => {
		const impact = statusChangeImpact(
			'task',
			{ kind: 'category', name: 'A', aliases: [], from: 'not_started', to: 'in_progress' },
			NO_USAGE,
		);
		expect(impact.level).toBe('notice');
	});
});

describe('calendarChangeImpact', () => {
	it('作業ログが入っている日を休日にするときは確認する', () => {
		const impact = calendarChangeImpact({ kind: 'addHoliday', date: '2026-11-03' }, usage(0, 2));
		expect(impact.level).toBe('confirm');
		expect(impact.details[0]).toMatch(/2件/);
	});

	it('作業ログが無い（または件数が不明な）日を休日にするときは通知だけ', () => {
		expect(calendarChangeImpact({ kind: 'addHoliday', date: '2026-11-03' }, usage(0, 0)).level).toBe('notice');
		expect(calendarChangeImpact({ kind: 'addHoliday', date: '2026-11-03' }, NO_USAGE).level).toBe('notice');
	});

	it('休日を外すときは通知、土日の扱いを変えるときは確認する', () => {
		expect(calendarChangeImpact({ kind: 'removeHoliday', date: '2026-11-03' }, NO_USAGE).level).toBe('notice');
		expect(calendarChangeImpact({ kind: 'weekends', weekendsOff: false }, NO_USAGE).level).toBe('confirm');
	});
});
