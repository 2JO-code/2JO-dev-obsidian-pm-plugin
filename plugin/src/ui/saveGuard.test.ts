import { describe, expect, it } from 'vitest';
import { SaveGuard } from './saveGuard';

describe('SaveGuard', () => {
	it('work の間だけ保存中になり、結果を返す', async () => {
		const guard = new SaveGuard();
		let during = false;
		const result = await guard.run(async () => {
			during = guard.busy;
			return 3;
		});
		expect(during).toBe(true);
		expect(result).toBe(3);
		expect(guard.busy).toBe(false);
	});

	it('失敗しても印を戻し、誤りはそのまま投げる', async () => {
		const guard = new SaveGuard();
		await expect(guard.run(() => Promise.reject(new Error('失敗')))).rejects.toThrow('失敗');
		expect(guard.busy).toBe(false);
	});
});
