// player-info-resolver のセッションパラメータ
export interface ResolverSessionParameters {
	type: "start";
	parameters: {
		limitSeconds: number;
	};
}
