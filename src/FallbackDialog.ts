import { Converter } from "@akashic-extension/akashic-hover-plugin";
import * as HoverPluginRaw from "@akashic-extension/akashic-hover-plugin/lib/HoverPlugin";

// Ugh! HoverPlugin が Akashic Engine 向けに中途半端に CommonJS で (module.exports = HoverPlugin と)
// 定義されている関係で、 import すると TS の型と実体が合わない。無理やり解消する。
// (import * as ... すると、 JS 的には HoverPlugin の実体が手に入るが、TS 上では namespace と誤認される)
// さらにおそらく akashic-hover-plugin 側のバグで、型があっていないのでそれも無理やり合わせる。
// (コンストラクタ第二引数が間違っている。実装上は any キャストして正しく使っている)
const HoverPlugin = HoverPluginRaw as any as g.OperationPluginStatic;

function drawCircle(rendr: g.Renderer, centerX: number, centerY: number, radius: number, cssColor: string) {
	for (let y = (centerY - radius) | 0; y <= Math.ceil(centerY + radius); ++y) {
		const w = radius * Math.cos(Math.asin((centerY - y) / radius));
		rendr.fillRect(centerX - w, y, 2 * w, 1, cssColor);
	}
}

function makeSurface(w: number, h: number, drawer: (r: g.Renderer) => void): g.Surface {
	const s = g.game.resourceFactory.createSurface(Math.ceil(w), Math.ceil(h));
	const r = s.renderer();
	r.begin();
	drawer(r);
	r.end();
	return s;
}

interface Motion {
	duration: number;
	scale?: [number, number];
	opacity?: [number, number];
}

function animate(e: g.E, motions: Motion[]): g.Trigger<void> {
	const onEnd = new g.Trigger<void>();
	const frameTime = 1000 / g.game.fps;
	let step = 0;
	let time = 0;
	let mot = motions[0];
	let ended = false;
	function update(delta: number) {
		time += delta;
		if (time > mot.duration) {
			ended = (++step >= motions.length);
			if (ended) {
				time = mot.duration;
				e.scene.onUpdate.addOnce(onEnd.fire, onEnd);
			} else {
				time -= mot.duration;
				mot = motions[step];
			}
		}
		const r = Math.min(1, time / mot.duration);
		const { scale, opacity } = mot;
		if (scale)
			e.scaleX = e.scaleY = scale[0] + (scale[1] - scale[0]) * r;
		if (opacity)
			e.opacity = opacity[0] + (opacity[1] - opacity[0]) * r;
		e.modified();
		return ended;
	}
	update(0);
	e.onUpdate.add(() => update(frameTime));
	return onEnd;
}

export class FallbackDialog {
	static HOVER_PLUGIN_OPCODE = -1000; // TODO: 定数予約

	static isSupported(): boolean {
		// 縦横比 0.4 について: このダイアログは 16:9 の解像度で画面高さの約 65% (468px) を占有する。
		// すなわち画面高さが画面幅の約 37% 以下の場合画面に収まらない。余裕を見て 40% を下限とする。
		// (詳細な高さは下の dialogHeight の定義を参照せよ)
		return (typeof window !== "undefined") && (g.game.height / g.game.width >= 0.4) && HoverPlugin.isSupported();
	}

	onEnd: g.Trigger<void> = new g.Trigger<void>();
	protected scene: g.Scene;
	protected bgRect: g.FilledRect;
	protected dialogPane: g.Pane;
	protected buttonLabel: g.Label;
	protected isHoverPluginStarted: boolean = false;
	protected timer: g.TimerIdentifier | null = null;

	constructor(name: string) {
		if (!FallbackDialog.isSupported())
			return;
		const game = g.game;
		const gameWidth = game.width, gameHeight = game.height;
		const baseWidth = 1280;
		const ratio = gameWidth / baseWidth;
		const titleFontSize = Math.round(32 * ratio);
		const fontSize = Math.round(28 * ratio);
		const lineMarginRate = 0.3;
		const lineHeightRate = 1 + lineMarginRate;
		const titleTopMargin = 80 * ratio;
		const titleBotMargin = 32 * ratio;
		const buttonTopMargin = 42 * ratio;
		const buttonWidth = 360 * ratio;
		const buttonHeight = 82 * ratio;
		const buttonBotMargin = 72 * ratio;
		const colorBlue = "#4a8de1";
		const colorWhite = "#fff";
		const dialogWidth = 960 * ratio | 0;
		const dialogHeight = (
			titleTopMargin +
			(titleFontSize * lineHeightRate) * 2 +
			titleBotMargin +
			(fontSize + fontSize * lineHeightRate) + // 一行目のマージンは titleBotMargin に繰り込まれている
			buttonTopMargin +
			buttonHeight +
			buttonBotMargin
		) | 0;

		const font = new g.DynamicFont({
			game: g.game,
			fontFamily: g.FontFamily.SansSerif,
			size: titleFontSize,
			fontWeight: g.FontWeight.Bold,
			fontColor: "#252525"
		});

		const surfSize = Math.ceil(32 * ratio) & ~1; // 切り上げて偶数に丸める
		const surfHalf = surfSize / 2;
		const dialogBgSurf = makeSurface(surfSize, surfSize, r => drawCircle(r, surfHalf, surfHalf, surfHalf, colorWhite));
		const btnActiveBgSurf = makeSurface(surfSize, surfSize, r => drawCircle(r, surfHalf, surfHalf, surfHalf, colorBlue));
		const btnBgSurf = makeSurface(surfSize, surfSize, r => {
			drawCircle(r, surfHalf, surfHalf, surfHalf, colorBlue);
			drawCircle(r, surfHalf, surfHalf, 12 * ratio, colorWhite);
		});

		function makeLabel(param: Partial<g.LabelParameterObject> & { text: string, fontSize: number }): g.Label {
			return new g.Label({ scene, font, local: true, textAlign: g.TextAlign.Center, widthAutoAdjust: false, ...param });
		}

		const scene = this.scene = game.scene();
		const bg = this.bgRect = new g.FilledRect({
			scene,
			local: true,
			width: gameWidth,
			height: gameHeight,
			cssColor: "rgba(0, 0, 0, 0.5)",
			touchable: true  // 後ろの touch を奪って modal にする
		});

		const dialogPane = this.dialogPane = new g.Pane({
			scene,
			local: true,
			width: dialogWidth,
			height: dialogHeight,
			anchorX: 0.5,
			anchorY: 0.5,
			x: (game.width / 2) | 0,
			y: (game.height / 2) | 0,
			backgroundImage: dialogBgSurf,
			backgroundEffector: new g.NinePatchSurfaceEffector(game, dialogBgSurf.width / 2 - 1),
			parent: bg
		});

		const dialogTextX = (80 * ratio) | 0;
		const dialogTextWidth = (800 * ratio) | 0;

		let y = 0;
		y += titleTopMargin + (titleFontSize * lineMarginRate) | 0;
		dialogPane.append(makeLabel({
			x: dialogTextX,
			y,
			text: "このコンテンツは名前を利用します。",
			fontSize: titleFontSize,
			width: dialogTextWidth
		}));

		y += (titleFontSize * lineHeightRate) | 0;
		dialogPane.append(makeLabel({
			x: dialogTextX,
			y,
			text: `あなたは「${name}」です。`,
			fontSize: titleFontSize,
			width: dialogTextWidth
		}));

		y += titleFontSize + titleBotMargin | 0;
		dialogPane.append(makeLabel({
			x: dialogTextX,
			y,
			text: "ユーザ名で参加するには、",
			fontSize: fontSize,
			width: dialogTextWidth
		}));

		y += fontSize * lineHeightRate | 0;
		dialogPane.append(makeLabel({
			x: dialogTextX,
			y,
			text: "最新のニコニコ生放送アプリに更新してください。",
			fontSize: fontSize,
			width: dialogTextWidth
		}));

		y += fontSize + buttonTopMargin | 0;
		const buttonPane = new g.Pane({
			scene,
			local: true,
			width: buttonWidth,
			height: buttonHeight,
			x: dialogWidth / 2,
			y: y + buttonHeight / 2,  // anchorが中心なのでその分 y からオフセット
			anchorX: 0.5,
			anchorY: 0.5,
			backgroundImage: btnBgSurf,
			backgroundEffector: new g.NinePatchSurfaceEffector(game, btnBgSurf.width / 2 - 1),
			parent: scene,
			touchable: true
		});
		dialogPane.append(buttonPane);

		const buttonLabel = this.buttonLabel = makeLabel({
			x: 0,
			y: (buttonHeight - titleFontSize) / 2 - (5 * ratio),
			text: "OK (15)",
			fontSize: titleFontSize,
			width: buttonWidth,
			textColor: colorBlue
		});
		buttonPane.append(buttonLabel);

		const activateButton = () => {
			buttonPane.backgroundImage = btnActiveBgSurf;
			buttonPane.invalidate();
			buttonLabel.textColor = colorWhite;
			buttonLabel.invalidate();
		};
		const deactivateButton = () => {
			buttonPane.backgroundImage = btnBgSurf;
			buttonPane.invalidate();
			buttonLabel.textColor = colorBlue;
			buttonLabel.invalidate();
		};
		const h = Converter.asHoverable(buttonPane);
		let animating = false;
		h.hovered.add(() => {
			activateButton();
			if (animating)
				return;
			animating = true;
			animate(buttonPane, [
				{ duration: 16, scale: [1.0, 0.9] },
				{ duration: 16, scale: [0.9, 1.1] },
				{ duration: 33, scale: [1.1, 1.0] }
			]).add(() => animating = false);
		});
		h.unhovered.add(deactivateButton);
		buttonPane.onPointDown.add(activateButton);
		buttonPane.onPointUp.add(() => { this.end(); });

		if (!game.operationPluginManager.plugins[FallbackDialog.HOVER_PLUGIN_OPCODE])
			game.operationPluginManager.register(HoverPlugin, FallbackDialog.HOVER_PLUGIN_OPCODE);
	}

	start(remainingSeconds: number): void {
		const game = g.game;
		const scene = this.scene;
		if (game.scene() !== scene) { // ないはずの異常系だが一応確認
			return;
		}

		// エッジケース考慮: hoverプラグインは必ず停止したいので、シーンが変わった時点で止めてしまう。
		// (mouseover契機で無駄にエンティティ検索したくない)
		game.onSceneChange.add(this._disablePluginOnSceneChange, this);

		game.operationPluginManager.start(FallbackDialog.HOVER_PLUGIN_OPCODE);
		this.isHoverPluginStarted = true;

		animate(this.dialogPane, [
			{ duration: 100, scale: [0.5, 1.1], opacity: [0.5, 1.0] },
			{ duration: 100, scale: [1.1, 1.0], opacity: [1.0, 1.0] }
		]);
		scene.append(this.bgRect);
		scene.onUpdate.add(this._assureFrontmost, this);

		this.timer = scene.setInterval(() => {
			remainingSeconds -= 1;
			this.buttonLabel.text = `OK (${remainingSeconds})`;
			this.buttonLabel.invalidate();
			if (remainingSeconds <= 0) {
				this.end();
			}
		}, 1000);
	}

	end(): void {
		if (this.timer) {
			this.scene.clearInterval(this.timer);
			this.timer = null;
		}

		// 厳密には下のアニメーション終了後に解除する方がよいが、
		// 途中でシーンが破棄されるエッジケースを想定してこの時点で止める。
		this.scene.onUpdate.remove(this._assureFrontmost, this);
		if (this.isHoverPluginStarted) {
			g.game.operationPluginManager.stop(FallbackDialog.HOVER_PLUGIN_OPCODE);
			this.isHoverPluginStarted = false;
		}

		animate(this.dialogPane, [{ duration: 100, opacity: [1, 0], scale: [1, 0.8] }]);
		const t = animate(this.bgRect, [{ duration: 100, opacity: [1, 0] }]);
		t.add(() => {
			const onEnd = this.onEnd;
			this.onEnd = null;
			this.bgRect.destroy();
			this.bgRect = null;
			this.dialogPane = null;
			this.scene = null;
			onEnd.fire();
		});
	}

	protected _disablePluginOnSceneChange(scene: g.Scene): undefined | boolean {
		if (scene !== this.scene) {
			g.game.operationPluginManager.stop(FallbackDialog.HOVER_PLUGIN_OPCODE);
			return true;
		}
	}

	// フレーム終了時に確実に画面最前面に持ってくる
	protected _assureFrontmost(): void {
		g.game._pushPostTickTask(this._doAssureFrontmost, this);
	}

	protected _doAssureFrontmost(): void {
		const scene = this.scene;
		if (scene && g.game.scene() !== scene)
			return;
		if (scene.children[scene.children.length - 1] === this.bgRect)
			return;
		this.bgRect.remove();
		scene.append(this.bgRect);
	}
}
