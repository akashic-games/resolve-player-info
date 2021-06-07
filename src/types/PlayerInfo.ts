export interface PlayerInfoUserData {
	/**
	 * 名前利用が許諾されたか。
	 * 偽の場合、PlayerInfo#name の値はダミーの文字列である。 (e.g. "ゲスト123")
	 */
	accepted: boolean;

	/**
	 * ニコニコ関連サービスにおいて、プレミアムであるか。
	 */
	premium: boolean;

	/**
	 * 名前を持たない特殊なインスタンスであるか。
	 * 通常ゲームに参加する (なんらかの操作を行う) プレイヤーは、この値が真になることはない。
	 */
	unnamed?: boolean;
}

export interface PlayerInfo {
	/**
	 * プレイヤー名。
	 * 名前がない場合、null 。
	 */
	name: string | null;

	/**
	 * 実行環境から得られた、プレイヤー名に紐づく情報。
	 */
	userData: PlayerInfoUserData;
}
