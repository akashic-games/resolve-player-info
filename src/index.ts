import { COEEndMessage } from "@akashic-extension/coe-messages";
import { FallbackDialog } from "./FallbackDialog";

export interface PlayerInfoUserData {
	// 名前利用が許諾されたか。false の場合、名前利用が拒否された。nameに入っている文字列はダミー文字列 (使ってもいいがユーザ名ではない)
	accepted: boolean;
	premium: boolean;
	unnamed?: boolean;
}

export interface PlayerInfo {
	// ここでプレイヤー名が得られる。nullの場合、コンテンツ側でデフォルトのプレイヤー名を与える必要がある。
	name: string | null;
	userData: PlayerInfoUserData;
}

export interface ResolvePlayerInfoOptions {
	// true なら取得成功時 (Error なく accepted が真の時) に raiseEvent(new PlayerInfoEvent()) する。デフォルトは false
	raises?: boolean;
	// 名前利用の許諾を受け付ける制限時間(単位：秒)を指定。指定が無い場合は15秒
	limitSeconds?: number;
}

// ゲームアツマールAPI user.getSelfInformation が返すプレイヤー自身のユーザー情報
interface SelfInformation {
	id: number;
	name: string;
	isPremium: boolean;
	profile: string;
	twitterId: string;
	url: string;
}

// ここで利用するゲームアツマールAPIのみを型として定義
interface RPGAtsumaruApi {
	// https://atsumaru.github.io/api-references/apis/user
	user: {
		getSelfInformation: () => Promise<SelfInformation>;
	};
}

// player-info-resolver のセッションパラメータ
interface LocalSessionParameters {
	type: "start";
	parameters: {
		limitSeconds: number;
	};
}

interface WidowWithRPGAtsumaru extends Window {
	RPGAtsumaru: RPGAtsumaruApi;
}

declare var window: WidowWithRPGAtsumaru;

const DEFAULT_LIMIT_SECONDS = 15;

// resolvePlayerInfo関数が2重で実行されてしまうことを防ぐためのフラグ
let isCurrentResolvingPlayerInfo: boolean = false;

/**
 * ユーザー情報の取得と通知を行う
 * @param opts ユーザ情報取得時のオプション
 * @param callback 指定された場合、playerInfo が取得成功・失敗した時点の次の local/non-local tick で呼び出される
 */
export const resolvePlayerInfo = (
	opts: ResolvePlayerInfoOptions | null,
	callback?: (error: Error | null, playerInfo?: PlayerInfo) => void
): void => {
	if (isCurrentResolvingPlayerInfo) {
		if (callback) {
			callback(new Error("Last processing has not yet been completed."));
		}
		return;
	}
	const limitSeconds = opts && opts.limitSeconds ? opts.limitSeconds : DEFAULT_LIMIT_SECONDS;
	const cb = (info: PlayerInfo) => {
		if (callback) {
			callback(null, info);
		}
		if (opts && opts.raises && (!info.userData || !info.userData.unnamed)) {
			g.game.raiseEvent(new g.PlayerInfoEvent({ id: g.game.selfId, name: info.name, userData: info.userData }));
		}
	};
	const rpgAtsumaru: RPGAtsumaruApi = typeof window !== "undefined" ? window.RPGAtsumaru : undefined;
	if (rpgAtsumaru && rpgAtsumaru.user && rpgAtsumaru.user.getSelfInformation) {
		isCurrentResolvingPlayerInfo = true;
		rpgAtsumaru.user.getSelfInformation().then((data: SelfInformation) => {
			cb({
				name: data.name,
				userData: {
					accepted: true,
					premium: data.isPremium
				}
			});
			isCurrentResolvingPlayerInfo = false;
		}).catch((err: Error) => {
			if (callback) {
				callback(err);
			}
			isCurrentResolvingPlayerInfo = false;
		});
	} else if (
		g.game.external.coeLimited &&
		g.game.external.coeLimited.startLocalSession &&
		g.game.external.coeLimited.exitLocalSession
	) {
		isCurrentResolvingPlayerInfo = true;
		const sessionId = g.game.playId + "__player-info-resolver";
		const scene = g.game.scene();
		let timeoutId: g.TimerIdentifier | null = scene.setTimeout(() => {
			timeoutId = null;
			// NOTE: スキップ時は既に終了済みのローカルセッション自体が起動せず messageHandler() も呼ばれなるため、
			// ここで cb() を呼ばないとコンテンツ側がコールバックをいつまでも待ってしまう状態になってしまう
			cb({
				name: null,  // player-info-resolverが設定しているデフォルトの名前にすべきだが、ここでは取得できないのでnullとする
				userData: {
					accepted: false,
					premium: false
				}
			});
			// NOTE: リアルタイム視聴の場合、大半のケースではこちらのパスには到達しないはず (仮に到達しても同一セッションIDの COE#exitSession() が呼ばれるのみ)
			// 追っかけ再生またはタイムシフトによる視聴においては、 player-info-resolver の自発終了よりも先に以下の exitLocalSession() を呼ぶことで
			// 「スキップ中のセッション起動を抑止する」というプラットフォーム側の機能を有効にしている
			g.game.external.coeLimited.exitLocalSession(sessionId, { needsResult: true });
			isCurrentResolvingPlayerInfo = false;
		}, (limitSeconds + 1) * 1000); // NOTE: 読み込みなどを考慮して 1 秒のバッファを取る
		const sessionParameters: LocalSessionParameters = {
			type: "start",
			parameters: {
				limitSeconds
			}
		};
		g.game.external.coeLimited.startLocalSession({
			sessionId,
			applicationName: "player-info-resolver",
			localEvents: [[32, 0, ":akashic", sessionParameters]],
			messageHandler: (message: COEEndMessage) => {
				// TODO 引数からエラーを取得できるようになったら、異常系の処理も行う
				if (timeoutId === null) {
					return;
				}
				scene.clearTimeout(timeoutId);
				cb(message.result);
				isCurrentResolvingPlayerInfo = false;
			}
		});
	} else if (FallbackDialog.isSupported()) {
		const name = "ゲスト" + ((Math.random() * 1000) | 0);
		const dialog = new FallbackDialog(name);
		dialog.start(limitSeconds);
		dialog.onEnd.addOnce(() => {
			cb({ name, userData: { accepted: false, premium: false } });
			isCurrentResolvingPlayerInfo = false;
		});
	} else {
		cb({
			name: "",
			userData: {
				accepted: false,
				premium: false,
				unnamed: true
			}
		});
	}
};

