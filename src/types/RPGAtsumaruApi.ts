export interface SelfInformation {
	id: number;
	name: string;
	isPremium: boolean;
	profile: string;
	twitterId: string;
	url: string;
}

// ここで利用するゲームアツマールAPIのみを型として定義
export interface RPGAtsumaruApi {
	// https://atsumaru.github.io/api-references/apis/user
	user: {
		getSelfInformation: () => Promise<SelfInformation>;
	};
}

export interface WindowWithRPGAtsumaru extends Window {
	RPGAtsumaru: RPGAtsumaruApi;
}
