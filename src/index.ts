import { COEEndMessage } from "@akashic-extension/coe-messages";
import { FallbackDialog } from "./FallbackDialog";
import { PlayerInfo, PlayerInfoUserData } from "./types/PlayerInfo";
import { WindowWithRPGAtsumaru } from "./types/RPGAtsumaruApi";
import { ResolverSessionParameters } from "./types/PlayerInfoResolver";
import { AtsumaruPlugin } from "./types/AtsumaruPlugin";

export { PlayerInfo, PlayerInfoUserData };

declare var window: WindowWithRPGAtsumaru;
const rpgAtsumaru = typeof window !== "undefined" ? window.RPGAtsumaru : undefined;

function createRandomName(): string {
	return "ゲスト" + ((Math.random() * 1000) | 0);
}

interface ResolverDecl {
	isSupported(): boolean;
	resolve(limitSeconds: number, callback: (error: Error | null, playerInfo?: PlayerInfo) => void): void;
}

const resolvers: ResolverDecl[] = [
	// window.RPGAtsumaru
	{
		isSupported: () => !!(rpgAtsumaru && rpgAtsumaru.user && rpgAtsumaru.user.getSelfInformation),
		resolve: (_limitSeconds, callback) => {
			rpgAtsumaru.user.getSelfInformation().then(
				selfInfo => {
					callback(null, {
						name: selfInfo.name,
						userData: {
							accepted: true,
							premium: selfInfo.isPremium
						}
					});
				},
				err => {
					callback(err, null);
				}
			);
		}
	},

	// coeLimited
	{
		isSupported: () => {
			const coeLimited = g.game.external.coeLimited;
			return !!(coeLimited && coeLimited.startLocalSession && coeLimited.exitLocalSession);
		},
		resolve: (limitSeconds, callback) => {
			const sessionId = g.game.playId + "__player-info-resolver";
			const scene = g.game.scene();

			let timeoutId: g.TimerIdentifier | null = scene.setTimeout(() => {
				timeoutId = null;
				// NOTE: スキップ時は既に終了済みのローカルセッション自体が起動せず messageHandler() も呼ばれなるため、
				// ここで callback() を呼ばないとコンテンツ側がコールバックをいつまでも待ってしまう状態になってしまう
				callback(null, {
					name: null,  // player-info-resolverが返す名前にしたいが、ここでは取得できないのでnullとする
					userData: { accepted: false, premium: false }
				});

				// NOTE: リアルタイム視聴の場合、大半のケースではこちらのパスには到達しないはず
				// (仮に到達しても同一セッションIDの COE#exitSession() が呼ばれるのみ)
				// 追っかけ再生またはタイムシフトによる視聴においては、
				// player-info-resolver の自発終了よりも先に以下の exitLocalSession() を呼ぶことで
				// 「スキップ中のセッション起動を抑止する」というプラットフォーム側の機能を有効にしている
				g.game.external.coeLimited.exitLocalSession(sessionId, { needsResult: true });
			}, (limitSeconds + 2) * 1000); // NOTE: 読み込みなどを考慮して 2 秒のバッファを取る

			g.game.external.coeLimited.startLocalSession({
				sessionId,
				applicationName: "player-info-resolver",
				localEvents: [
					[
						32,
						0,
						":akashic",
						{ type: "start", parameters: { limitSeconds } } as ResolverSessionParameters
					]
				],
				messageHandler: (message: COEEndMessage) => {
					if (timeoutId == null) { // 先にタイムアウト処理が実行されていたら何もしない
						return;
					}
					scene.clearTimeout(timeoutId);
					// TODO 引数からエラーを取得できるようになったら、異常系の処理も行う
					callback(null, message.result);
				}
			});
		}
	},

	// g.game.external.atsumaru
	{
		isSupported: () => {
			const atsumaru = g.game.external.atsumaru as AtsumaruPlugin | null;
			return !!(atsumaru && atsumaru.getSelfInformationProto);
		},
		resolve: (_limitSeconds, callback) => {
			(g.game.external.atsumaru! as AtsumaruPlugin).getSelfInformationProto!({
				callback: (errorMessage, result) => {
					if (errorMessage != null) {
						callback(new Error(errorMessage), null);
						return;
					}
					if (result && result.login) {
						callback(null, {
							name: result.name,
							userData: { accepted: true, premium: result.premium }
						});
					} else {
						callback(null, {
							name: createRandomName(),
							userData: { accepted: false, premium: false }
						});
					}
				}
			});
		}
	},

	// FallbackDialog
	{
		isSupported: FallbackDialog.isSupported,
		resolve: (limitSeconds, callback) => {
			const name = createRandomName();
			const dialog = new FallbackDialog(name);
			dialog.start(limitSeconds);
			dialog.onEnd.addOnce(() => {
				callback(null, { name, userData: { accepted: false, premium: false } });
			});
		}
	},

	// sentinel
	{
		isSupported: () => true,
		resolve: (_limitSeconds, callback) => {
			callback(null, {
				name: "",
				userData: {
					accepted: false,
					premium: false,
					unnamed: true
				}
			});
		}
	}
];

export interface ResolvePlayerInfoOptions {
	// true なら取得成功時 (Error なく accepted が真の時) に raiseEvent(new PlayerInfoEvent()) する。デフォルトは false
	raises?: boolean;
	// 名前利用の許諾を受け付ける制限時間(単位：秒)を指定。指定が無い場合は15秒
	limitSeconds?: number;
}

const DEFAULT_LIMIT_SECONDS = 15;

// resolvePlayerInfo関数が2重で実行されてしまうことを防ぐためのフラグ
let isResolving: boolean = false;

function find<T>(xs: T[], pred: (val: T) => boolean): T | undefined {
	for (let i = 0; i < xs.length; ++i) {
		if (pred(xs[i]))
			return xs[i];
	}
	return undefined;
}

/**
 * ユーザー情報の取得と通知を行う
 * @param opts ユーザ情報取得時のオプション
 * @param callback 指定された場合、playerInfo が取得成功・失敗した時点の次の local/non-local tick で呼び出される
 */
export const resolvePlayerInfo = (
	opts: ResolvePlayerInfoOptions | null,
	callback?: (error: Error | null, playerInfo?: PlayerInfo) => void
): void => {
	const cb = (err: Error | null, info?: PlayerInfo) => {
		isResolving = false;
		callback?.(err, info);
		if (!err) {
			const { name, userData } = info!;
			if (opts && opts.raises && (!userData || !userData.unnamed)) {
				g.game.raiseEvent(new g.PlayerInfoEvent({ id: g.game.selfId, name, userData }));
			}
		}
	};

	if (isResolving) {
		cb(new Error("Last processing has not yet been completed."), null);
		return;
	}

	const limitSeconds = opts && opts.limitSeconds ? opts.limitSeconds : DEFAULT_LIMIT_SECONDS;
	const resolver = find(resolvers, r => r.isSupported())!; // isSupported() が恒真の実装があるので non-null
	try {
		isResolving = true;
		resolver.resolve(limitSeconds, cb);
	} catch (e) {
		cb(e);
	}
};

