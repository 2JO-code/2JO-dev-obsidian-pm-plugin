import { describe, expect, it } from 'vitest';
import { isUuid7, uuid7 } from './uuid7';

const zeros = () => new Uint8Array(10);
const ones = () => new Uint8Array(10).fill(0xff);

describe('uuid7', () => {
	it('UUID v7 の形式になる', () => {
		for (let i = 0; i < 100; i++) expect(isUuid7(uuid7())).toBe(true);
	});

	it('先頭48ビットに作成時刻が入る', () => {
		const ms = Date.UTC(2026, 9, 31, 12, 0, 0);
		const hex = uuid7(ms, zeros).replace(/-/g, '').slice(0, 12);
		expect(parseInt(hex, 16)).toBe(ms);
	});

	it('乱数部分に関係なくバージョンとバリアントのビットが固定される', () => {
		expect(uuid7(0, zeros)).toBe('00000000-0000-7000-8000-000000000000');
		expect(uuid7(0, ones)).toBe('00000000-0000-7fff-bfff-ffffffffffff');
	});

	it('作成時刻が後のものほど文字列として後ろに並ぶ', () => {
		const earlier = uuid7(Date.UTC(2026, 0, 1), ones);
		const later = uuid7(Date.UTC(2026, 0, 1) + 1, zeros);
		expect(earlier < later).toBe(true);
	});
});

describe('isUuid7', () => {
	it('v4 や大文字、区切りなしは受け付けない', () => {
		expect(isUuid7('0192f3a0-0000-4000-8000-000000000000')).toBe(false);
		expect(isUuid7('0192F3A0-0000-7000-8000-000000000000')).toBe(false);
		expect(isUuid7('0192f3a0000070008000000000000000')).toBe(false);
	});
});
