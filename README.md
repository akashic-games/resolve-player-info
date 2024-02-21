<p align="center">
<img src="https://github.com/akashic-games/resolve-player-info/blob/master/img/akashic.png"/>
</p>

# resolve-player-info

ニコニコ生放送 (ニコ生ゲーム) や ゲームアツマールにおいて、
プレイヤーのユーザ情報を取得するための Akashic Engine 向けライブラリです。

利用には Akashic Engine v3 以降が必要です。

## インストール

`akashic install` コマンドでインストールしてください。

```sh
akashic install @akashic-extension/resolve-player-info
```

インストール後にテキストエディタで game.json を開いて、次のような `environment.external.coeLimited` プロパティがなければ作成してください。
値は `"0"` としてください。(v2.1.2 以降の `akashic-cli` では、 `akashic install` 時に自動的に作成されます。)

```json
{
  ...,
  "environment": {
    "external": {
      "coeLimited": "0"
    }
  }
}
```

## 利用方法

スクリプトアセット内で、 `require()` で関数 `resolvePlayerInfo()` を取得します。

```javascript
var resolvePlayerInfo = require("@akashic-extension/resolve-player-info").resolvePlayerInfo;
```

TypeScript の場合は `import` を利用してください。

```typescript
import { resolvePlayerInfo } from "@akashic-extension/resolve-player-info");
```

取得した `resolvePlayerInfo()` を呼び出すと、各プレイヤーのユーザ名などの情報が `g.game.onPlayerInfo` で通知されます。
また以降そのプレイヤーが生成したイベント (画面押下の `g.PointDownEvent` など) には、 `player.name` プロパティにユーザ名が含まれるようになります。

```javascript
var nameTable = {};
g.game.onPlayerInfo.add(function (ev) {
  // ev.player.id にプレイヤーIDが、ev.player.name にそのプレイヤーの名前が含まれます。
  // ここで取得しなくても、以降そのプレイヤーが生成したイベントはすべて .player.name で名前を参照できます。
  nameTable[ev.player.id] = ev.player.name;
});

resolvePlayerInfo({ raises: true });
```

`resolvePlayerInfo()` は、ローカルイベント (ローカルエンティティの操作などを契機とするイベント) の処理内でのみ利用してください。

ニコニコ生放送 (ニコ生ゲーム) では、ユーザ名の利用許諾を求めるダイアログが表示されます。
許諾された場合にはユーザ名が、されなかった場合はランダムに生成されたダミーの名前 (「ゲスト123」など) が通知されます。

詳細な利用方法は [「ユーザ名を使う」](https://akashic-games.github.io/shin-ichiba/player-info.html) を参照してください。

## 仕様

```javascript
resolvePlayerInfo(opts, callback);
```

第一引数 `opts` はオプションです。次のプロパティを指定できます。

|プロパティ名|デフォルト値|内容|
|:---:|:---:|:---|
|`raises`|`false`|`true` の時、取得完了時に `g.PlayerInfoEvent` を送信します。<br> 送信された`g.PlayerInfoEvent` は `g.game.onPlayerInfo` で全員に通知されます。|
|`limitSeconds`|`15`|名前の利用許諾ダイアログを表示する場合に、自動的に拒否とみなしてダイアログを閉じるまでの時間。単位は秒です。|

第二引数 `callback` には、関数を指定できます。指定した場合、名前取得の完了時に `callback(err, playerInfo)` の形で引数 2 つで呼び出されます。

|引数|内容|
|:---:|:---|
|`err`|第一引数。成功した場合、 `null` 。なんらかのエラーが発生した場合、それが渡されます。|
|`playerInfo`|第二引数。取得したプレイヤー情報。<br>`err` が `null` の時のみ与えられます。|

プレイヤー情報 `playerInfo` は、次のプロパティを含みます。

|プロパティ名|型|内容|
|:---:|:---:|:---|
|`name`|`string`|ユーザ名。|
|`userData.accepted`|`boolean`|名前利用を許諾したか。 `false` の場合、 `name` はランダムに生成された名前です (e.g. 「ゲスト123」)。|
|`userData.premium`|`boolean`|ユーザーがニコニコプレミアム会員かどうか。|
|`userData.unnamed`|`boolean` またはなし|名前のない (非プレイヤー) インスタンスの時、 `true` 。<br>サーバサイドなどの特殊なインスタンスの場合にのみ `true` になります。<br>このプレイヤーは自発的に操作を行うことはありません。<br> `raises` オプションが真の場合でも、このプレイヤーが `g.PlayerInfoEvent` で通知されることはありません。|

## 制限

* `resolvePlayerInfo()` は、ローカルイベント (ローカルエンティティの操作などを契機とするイベント) の処理内でのみ利用してください。
  これに反する場合、早回しで最新フレームに追いつくような局面でもダイアログが表示されてしまうなど、いくつかの動作に支障があります。
* このライブラリはダイアログを表示することがあります。UI 表示の都合上、ゲーム画面の高さは幅の 0.4 倍以上でなければなりません。
  (ニコ生ゲームの推奨解像度は 16:9 (高さが幅の 0.56 倍) で、これを満たします)
* `resolvePlayerInfo()` の呼び出し後、 `limitSeconds` 秒経過するまで
  (または呼び出した全員分の `game.onPlayerInfo` が通知されるまで) はシーン切り替えを行わないでください。

## 開発

### ビルド方法

TypeScript で書かれています。ビルドには Node.js が必要です。以下のコマンドでビルドしてください。

```sh
npm install
npm run build
```

## ライセンス
本リポジトリは MIT License の元で公開されています。
詳しくは [LICENSE](https://github.com/akashic-games/resolve-player-info/blob/master/LICENSE) をご覧ください。

ただし、画像ファイルおよび音声ファイルは
[CC BY 2.1 JP](https://creativecommons.org/licenses/by/2.1/jp/) の元で公開されています。

