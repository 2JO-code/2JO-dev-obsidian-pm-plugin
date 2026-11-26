import { describe, expect, it } from 'vitest';
import { linkPath, linkRoute } from './linkPath';

describe('linkPath', () => {
	const route = [
		[0, 50],
		[20, 50],
		[20, 0],
		[100, 0],
	] as const;

	it('直角：点を直線で結ぶ', () => {
		expect(linkPath(route, 'square')).toBe('M0,50 L20,50 L20,0 L100,0');
	});

	it('曲線：折れ目を丸める。半径は前後の線の長さの半分まで', () => {
		expect(linkPath(route, 'curve')).toBe('M0,50 L12,50 Q20,50 20,42 L20,8 Q20,0 28,0 L100,0');
		expect(linkPath([[0, 0], [4, 0], [4, 30], [40, 30]], 'curve')).toBe('M0,0 L2,0 Q4,0 4,2 L4,22 Q4,30 12,30 L40,30');
	});

	it('一直線に並ぶ点・重なる点は除く', () => {
		expect(linkPath([[0, 10], [5, 10], [5, 10], [10, 10]], 'curve')).toBe('M0,10 L10,10');
	});

	it('点が無ければ空', () => {
		expect(linkPath([], 'square')).toBe('');
	});
});

describe('linkRoute', () => {
	// 幅 100 のカードを 32 おきに並べる
	const card = (left: number, y = 50) => ({ left, right: left + 100, y });

	it('間にカードが無ければ、後続の手前 22px で折る', () => {
		const a = card(0);
		const b = card(200, 150);
		expect(linkRoute(a, b, [a, b], 10)).toEqual([
			[100, 50],
			[178, 50],
			[178, 150],
			[200, 150],
		]);
	});

	it('すき間が狭ければ真ん中で折る', () => {
		const a = card(0);
		const b = card(120, 150);
		expect(linkRoute(a, b, [a, b], 10)).toEqual([
			[100, 50],
			[110, 50],
			[110, 150],
			[120, 150],
		]);
	});

	it('間にカードがあれば、すき間を縦に通って通り道を横に進む', () => {
		const a = card(0);
		const mid = card(132);
		const b = card(264, 150);
		expect(linkRoute(a, b, [a, mid, b], 10)).toEqual([
			[100, 50],
			[106, 50],
			[106, 10],
			[242, 10],
			[242, 150],
			[264, 150],
		]);
	});

	it('後続の手前のすき間が狭ければ、カードから 4px 離して通す', () => {
		const a = card(0);
		const mid = card(132);
		const b = card(252, 150);
		expect(linkRoute(a, b, [a, mid, b], 10)[4]).toEqual([236, 150]);
	});

	it('先行が右（順番違い）なら左の端から右の端へ', () => {
		const a = card(200);
		const b = card(0, 150);
		expect(linkRoute(a, b, [a, b], 10)).toEqual([
			[200, 50],
			[122, 50],
			[122, 150],
			[100, 150],
		]);
	});

	it('同じ段なら右のすき間へ出て戻る', () => {
		const a = card(0);
		const b = card(0, 150);
		expect(linkRoute(a, b, [a, b], 10)).toEqual([
			[100, 50],
			[122, 50],
			[122, 150],
			[100, 150],
		]);
	});
});
