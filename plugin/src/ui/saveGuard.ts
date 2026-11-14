/** 保存中の2回目（Enter の連打など）を受け付けないための印（設計書 4.6） */
export class SaveGuard {
	private running = false;

	/** 保存中か。入力の確かめより先に見て、保存中なら何もしない */
	get busy(): boolean {
		return this.running;
	}

	/** work の間だけ保存中にする。失敗しても印は戻す（直してもう一度押せるように） */
	async run<T>(work: () => Promise<T>): Promise<T> {
		this.running = true;
		try {
			return await work();
		} finally {
			this.running = false;
		}
	}
}
