# OpenMaita

琵音マイタ専用の COEIROINK API ラッパー **OpenMaita**（Electron）です。

COEIROINK エンジンと連携して、マイタのナレーション制作を行います。本リポジトリでは、アプリ本体に加えて **bionmaita 音声パック** も GitHub Releases から配布しています。

## ダウンロード

| 項目 | 入手先 |
|------|--------|
| COEIROINK 本体 | [https://coeiroink.com/download](https://coeiroink.com/download) |
| OpenMaita アプリ（Windows） | [GitHub Releases（`v*`）](https://github.com/Arpeggio39/MaitaCOEIROINK/releases) の `OpenMaita-Setup-{version}.exe` |
| 琵音マイタ 音声パック | 同上の Release の `bionmaita-{version}.zip` |

最新の音声パックは [Releases ページ](https://github.com/Arpeggio39/MaitaCOEIROINK/releases) の **`OpenMaita x.y.z`** から `bionmaita-{version}.zip` をダウンロードしてください（アプリ exe と同じ Release に含まれます）。

<img src="./docs/images/github-release-openmaita.png" alt="GitHub Releases から OpenMaita と音声パックをダウンロード" width="800">

---

# COEIROINKで琵音マイタに歌ってもらおう

開発者：にっしー  
声：六素先輩

## COEIROINKとは？

人間（六素先輩）の声をAIが学習し、まるで本人が喋っているかのような流暢さでAIに歌ってもらうことができるソフトウェアです！

> ⚠️ 自由に日本語を喋ってもらうことは可能ですが...もちろん悪用ダメゼッタイ...☠️

あくまでナレーション特化なので、UTAUのマイタとは声の雰囲気が異なります...👀

## COEIROINKソフトウェアのダウンロード

[https://coeiroink.com/download](https://coeiroink.com/download)

Windows PC で **NVIDIA のグラボ** を積んでいる場合は **GPU 版** をインストールしましょう。

（COEIROINK は内部で **深層学習という AI 技術** をがっつり使っています！なので NVIDIA グラボがあると処理時間が大幅に短縮されます！）

Mac で M シリーズチップを使っている場合は Apple Silicon 版をインストールしましょう。Intel 版より処理が速いです。

では、インストールしていきましょう。

※ この解説作成時に用いたにっしーの PC 環境は以下の通りです。

- Windows：Windows 11 25H2
- Mac：macOS Tahoe 26.1

## Windowsでインストールする

（MacOS での手順は後半にあります）

### ① 解凍したフォルダーにある exe 実行

<img src="./docs/images/image9.png" alt="COEIROINK インストーラー（1）" width="800">

<img src="./docs/images/image5.png" alt="COEIROINK インストーラー（2）" width="800">

### ② 同じフォルダーに追加でダウンロードされた黄色のフォルダーを開いておいてください。後で使います

<img src="./docs/images/image8.png" alt="追加ダウンロードされた黄色フォルダー" width="800">

### ③ 琵音マイタ 音声パックをダウンロード

[GitHub Releases](https://github.com/Arpeggio39/MaitaCOEIROINK/releases) から **`bionmaita-{version}.zip`** をダウンロードします（例: `bionmaita-0.1.1.zip`）。OpenMaita アプリと同じ Release（`v*`）に含まれています。

<img src="./docs/images/github-release-openmaita.png" alt="GitHub Releases から OpenMaita と音声パックをダウンロード" width="800">

ZIP を解凍すると、中に **`bionmaita-{version}`** フォルダーが入っています（例: `bionmaita-0.1.1/`）。

### ④ speaker_info フォルダーにコピー

次に、② で開いておいた COEIROINK インストールフォルダー内の **`speaker_info` フォルダー** を開いてください。

<img src="./docs/images/image2.png" alt="speaker_info フォルダーを開く" width="800">

先ほど GitHub からダウンロードして解凍した **`bionmaita-{version}`** フォルダーを、**`speaker_info` フォルダー内** に移動してください。

ちなみに、元から「つくよみちゃん」というモデルもありますが、これは残してても消しても大丈夫です。

<img src="./docs/images/image4.png" alt="bionmaita-1.0.0 を speaker_info に配置" width="800">

これでマイタのモデルをインストールできました！。

### ⑤ COEIROINK を起動

1 つ戻ったところにある exe を実行しましょう。

> COEIROINKv2.exe はこのフォルダーの外に移動してはいけません

<img src="./docs/images/image16.png" alt="COEIROINK フォルダー内の exe" width="800">

<img src="./docs/images/image17.png" alt="COEIROINK 起動画面" width="800">

起動できました！！

中央上にあるツクヨミちゃんのアイコンを押すと、マイタに切り替えられます。

<img src="./docs/images/image11.png" alt="キャラクター切り替え" width="800">

切り替わりました！これで準備完了です！マイタでナレーションをどんどん作りましょう！

<img src="./docs/images/image7.png" alt="マイタ選択後の画面" width="800">

## Macでインストールする

### ① COEIROINK の HP からダウンロードした zip ファイルを解凍する

### ② .app ファイルを（Finder サイドバーにある）アプリケーションフォルダーに移動する（←必ずする！）

### ③ LaunchPad から起動する

<img src="./docs/images/image15.png" alt="LaunchPad から COEIROINK を起動" width="800">

…🤨🤨🤨🤨🤨

設定 → プライバシーとセキュリティ → お使いの Mac ～ のところで「このまま開く」を押しましょう。

<img src="./docs/images/image6.png" alt="セキュリティ警告と「このまま開く」" width="800">

そうすると...

<img src="./docs/images/image10.png" alt="「開く」ボタン" width="800">

開けました！！

<img src="./docs/images/image12.png" alt="COEIROINK 起動" width="800">

### ④ 琵音マイタ 音声パックをダウンロード

[GitHub Releases](https://github.com/Arpeggio39/MaitaCOEIROINK/releases) から **`bionmaita-{version}.zip`** をダウンロードして展開してください（例: `bionmaita-0.1.1.zip`）。OpenMaita アプリと同じ Release（`v*`）に含まれています。

ZIP を解凍すると、中に **`bionmaita-{version}`** フォルダーが入っています（例: `bionmaita-0.1.1/`）。

### ⑤ speaker_info にコピー

次に、Finder サイドバーにある **アプリケーション** にある COEIROINKv2.app で、2 本指クリックしてメニューにある「パッケージの内容を表示」し、**`Contents/MacOS/speaker_info`** に **`bionmaita-{version}`** フォルダーを移行する。

<img src="./docs/images/image14.png" alt="COEIROINK.app のパッケージ内容を表示" width="800">

<img src="./docs/images/image3.png" alt="speaker_info に bionmaita-1.0.0 を配置" width="800">

では、早速 COEIROINK を起動しましょう！

中央上にあるツクヨミちゃんのアイコンを押すと、マイタに切り替えられます。

<img src="./docs/images/image13.png" alt="キャラクター切り替え（Mac）" width="800">

切り替わりました！これで準備完了です！マイタでナレーションをどんどん作りましょう！

<img src="./docs/images/image1.png" alt="マイタ選択後の画面（Mac）" width="800">

---

## 開発者向け

### バージョン管理

OpenMaita アプリと音声パックは、**`package.json` の version** で統一管理します。

- `bionmaita/**` だけを変更した場合、アプリの Release 処理（exe ビルド）は起動しません
- 音声パックの ZIP は、同じ `v*` タグの OpenMaita Release にアップロードされます
- exe を公開したときに、その Release が GitHub の **Latest** に設定されます（自動更新の検知に必要）

### 音声パックの配布形式

- リポジトリ内のフォルダ名は **`bionmaita/`**（バージョン番号なし）
- バージョンは **`package.json`** と同じ値を使用
- CI が Release 用 ZIP を **`bionmaita-{version}.zip`** として公開（中身のルートフォルダ名は `bionmaita-{version}/`）
- モデル重み（`.pth`）は Git LFS 管理

### ローカル開発

```bash
npm install
npm start
```

### Release

| 対象 | トリガー | タグ例 |
|------|----------|--------|
| OpenMaita アプリ（exe） | `package.json` の version を更新して main に push | `v0.1.1`（Release名: `OpenMaita 0.1.1`） |
| bionmaita 音声パック | `bionmaita/**` の変更を main に push、または Actions から手動実行 | 同上の `v*` Release に ZIP を追加 |

音声パックのバージョンを上げる場合は、GitHub Actions の **Release Voice Pack** ワークフローから `bump: patch / minor / major` を選ぶと `package.json` が更新されます。音声パックだけ差し替える場合は `bump: none` で現在のバージョンの Release に上書きアップロードできます。

Git LFS を使う場合は、初回 push 前に `git lfs install` を実行してください。
