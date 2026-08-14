# escape-game

旧深山病院を舞台にした、スマートフォン縦持ち向けのホラー脱出ゲームです。

現在は企画資料 v1.2 に基づく第1脱出「207号室」を実装しています。

## 遊び方

- 画面内の気になる場所をタップして調べます。
- 左右の矢印、または画面スワイプで視点を変更します。
- 手に入れたアイテムを選択してから、使いたい場所をタップします。
- 進行状況はブラウザの `localStorage` に自動保存されます。
- 音を有効にすると、効果音と室内の機械音が再生されます。

## 公開

GitHub Pages でそのまま配信できる静的構成です。`index.html` を起点に、相対パスだけを使用しています。

## 構成

```text
index.html
style.css
js/
  audio.js
  game.js
data/
  scenario.json
  room.json
  items.json
  documents.json
  flags.json
  hints.json
```

## セーブデータ

- `eg_save`: 現在のプレイ状況
- `eg_unlocked`: 周回をまたいで維持する解禁フラグ
- `eg_meta`: プレイ統計

「はじめから」は `eg_save` だけを初期化します。データ管理画面の「全データを削除」は3種類すべてを削除します。
