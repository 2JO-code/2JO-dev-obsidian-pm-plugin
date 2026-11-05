/**
 * UUID v7（RFC 9562）を生成する（設計書 10章）
 * @param now 作成時刻（ミリ秒）
 * @param random 10バイトの乱数を返す関数
 */
export function uuid7(
	now: number = Date.now(),
	random: () => Uint8Array = () => crypto.getRandomValues(new Uint8Array(10)),
): string {
	const bytes = new Uint8Array(16);
	// 0〜5バイト目：時刻（48ビット、ビッグエンディアン）
	let ms = Math.floor(now);
	for (let i = 5; i >= 0; i--) {
		bytes[i] = ms % 256;
		ms = Math.floor(ms / 256);
	}
	bytes.set(random().subarray(0, 10), 6);
	// 6バイト目の上位4ビット：バージョン 7
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
	// 8バイト目の上位2ビット：バリアント 0b10
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuid7(value: string): boolean {
	return UUID7_PATTERN.test(value);
}
