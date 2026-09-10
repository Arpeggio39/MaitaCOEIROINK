# OpenMaita

COEIROINK で琵音マイタのナレーションを作るための Windows アプリ **OpenMaita** です。

マイタの音声パックも、同じダウンロードページから配布しています。

## ダウンロード

| 項目 | 入手先 |
|------|--------|
| COEIROINK 本体 | [https://coeiroink.com/download](https://coeiroink.com/download) |
| OpenMaita アプリ（Windows） | [ダウンロードページ](https://github.com/Arpeggio39/MaitaCOEIROINK/releases) の `OpenMaita-Setup-{version}.exe` |
| 琵音マイタ 音声パック | 同上の `bionmaita-1.0.0.zip`（常に固定） |

最新の音声パックは [ダウンロードページ](https://github.com/Arpeggio39/MaitaCOEIROINK/releases) の **OpenMaita x.y.z** から取得できます（アプリと同じページにあります）。

<img src="./docs/images/github-release-openmaita.png" alt="ダウンロードページから OpenMaita と音声パックを取得" width="800">

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

[ダウンロードページ](https://github.com/Arpeggio39/MaitaCOEIROINK/releases) から **`bionmaita-1.0.0.zip`** をダウンロードします。アプリと同じページにあります。

<img src="./docs/images/github-release-openmaita.png" alt="ダウンロードページから OpenMaita と音声パックを取得" width="800">

ZIP を解凍すると、中に **`bionmaita-1.0.0`** フォルダーが入っています。

### ④ speaker_info フォルダーにコピー

次に、② で開いておいた COEIROINK インストールフォルダー内の **`speaker_info` フォルダー** を開いてください。

<img src="./docs/images/image2.png" alt="speaker_info フォルダーを開く" width="800">

先ほど GitHub からダウンロードして解凍した **`bionmaita-1.0.0`** フォルダーを、**`speaker_info` フォルダー内** に移動してください。

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

[ダウンロードページ](https://github.com/Arpeggio39/MaitaCOEIROINK/releases) から **`bionmaita-1.0.0.zip`** をダウンロードして展開してください。アプリと同じページにあります。

ZIP を解凍すると、中に **`bionmaita-1.0.0`** フォルダーが入っています。

### ⑤ speaker_info にコピー

次に、Finder サイドバーにある **アプリケーション** にある COEIROINKv2.app で、2 本指クリックしてメニューにある「パッケージの内容を表示」し、**`Contents/MacOS/speaker_info`** に **`bionmaita-1.0.0`** フォルダーを移行する。

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

OpenMaita アプリは **`package.json` の version** で管理します。音声パックは **常に `1.0.0` 固定** です。

- **原則として Release は 0.1 刻み**（例: `1.0.0` → `1.1.0` → `1.2.0`）で上げます
- 同じバージョンの Release が既にある状態で main に push すると、CI が自動で minor を 1 つ上げてからビルドします
- `bionmaita/**` だけを変更した場合、アプリの Release 処理（exe ビルド）は起動しません
- 音声パックの ZIP は、同じ `v*` タグの OpenMaita Release にアップロードされます
- exe を公開したときに、その Release が GitHub の **Latest** に設定されます（自動更新の検知に必要）
- アプリの Release には、毎回 **`bionmaita-1.0.0.zip`** も同梱されます

### 音声パックの配布形式

- リポジトリ内のフォルダ名は **`bionmaita/`**（バージョン番号なし）
- 配布バージョンは **`1.0.0` 固定**（`scripts/voice-pack-version.cjs`）
- CI が Release 用 ZIP を **`bionmaita-1.0.0.zip`** として公開（中身のルートフォルダ名は `bionmaita-1.0.0/`）
- モデル重み（`.pth`）は Git LFS 管理

### ローカル開発

```bash
npm install
npm start
```

### Release

| 対象 | トリガー | タグ例 |
|------|----------|--------|
| OpenMaita アプリ（exe） | main への push（`bionmaita/**` 以外） | `v1.0.0` → 次回 `v1.1.0`（Release名: `OpenMaita 1.1.0`、exe と `bionmaita-1.0.0.zip` を同時公開） |
| bionmaita 音声パック | `bionmaita/**` の変更を main に push、または Actions から手動実行 | 現在の `v*` Release に `bionmaita-1.0.0.zip` を追加・上書き |

音声パックを手動リリースする場合は、GitHub Actions の **Release Voice Pack** ワークフローから実行します。既定では `bump: minor`（0.1 刻み）が選ばれます。同じバージョンの ZIP だけ差し替える場合は `bump: none` を選び、`force` で上書きアップロードできます。例外的に `patch` / `major` も選べます。

Git LFS を使う場合は、初回 push 前に `git lfs install` を実行してください。

## ローカルの口パク動画

処理設定は不要です。音声準備は最大2件を先行処理し、動画出力と重ねます。WAV結合・口パク解析・動作計画は共有Workerで処理します。

WindowsのIntel／AMD CPUでは、OpenMaitaと子プロセスを最大4論理CPUへ制限します（物理4コア以内の保守的な制限）。CPUエンコードは最大3スレッド、解析Workerは1つです。外部起動のCOEIROINKのコア制限や推論デバイスは変更しません。現行のローカルAPIにコア数を指定する機能はありません。

NVIDIA NVENCを短いエンコードで検出し、利用できれば区切りごとの動画を並列生成します。空きVRAMの75%／1枠512MiBと空きRAMの75%／1枠256MiBから枠数を推定し、ドライバーのセッション不足時は縮小して再試行します。固定4件の上限はありません。資源量はバッチごとに確認します。容量を取得できない場合は1枠です。この方式は最大スループットを保証する自動ベンチマークではありません。

NVENCが使えない場合は同梱FFmpegのlibx264へ切り替えます。QSV・AMF・VideoToolboxは使用しません。Macは開発用CPUフォールバックで、OSによる4コア制限はWindowsが対象です。動画はフレーム単位で生成するため、音声を実時間で再生して録画する待ち時間はありません。

FFmpegは `ffmpeg-static` の実行ファイルを `app.asar.unpacked` に同梱します。ライセンスとREADMEは `ffmpeg-notices` に同梱します。

右上の書き出しメニューで **「マイタLive2Dモデルの動画も書き出す」** をONにすると、
音声と一緒にキャラクター動画を保存します。ONのオプションはピンクの枠で表示します。

1. 通常どおり文章と声・韻律を編集し、右上の書き出しメニューを開きます。
2. 動画も必要な場合はチェックをONにします。
3. 「全文を1つ」「選択中」「全文章を区切りごと」のいずれかを選びます。
4. 右下の「出力する」を押すと、進捗メーターの画面に切り替わって出力を開始します。動画プレビューは表示しません。
5. 音声と同じフォルダーへMP4も保存します。区切りごとの場合は、それぞれの音声に動画が付きます。
   動画は保存した音声をそのまま使って作成します。既存のMP4がある場合は連番で保存します。

チェックがOFFの場合は音声だけを書き出します。動画の生成に失敗した場合も、保存済みのWAVは残ります。
モデルと描画ライブラリは同梱され、起動後のCDN接続は不要です。

出力は **キャラクターの全身に合わせた縦長サイズ / 約30 fps、グリーンバック・音声付きMP4（H.264 + AAC）** です。
編集ソフトのクロマキーで緑色を抜いて合成してください。保存形式はMP4固定です。動画のサイズとアスペクト比は、描画されたキャラクターの範囲に動作分の小さな余白を加えて自動決定します。
口は音量に合わせて滑らかに開閉します。母音別の口形認識は行いません。
このローカル試作版は10分以内の音声に対応し、動画作成には音声と同じ長さの時間がかかります。
作成中は画面を開いたままにしてください。「停止」や画面を閉じる操作で中止できます。

描画依存の情報は [renderer/vendor/README.md](renderer/vendor/README.md)、
モデルの情報は [renderer/models/maita/README.md](renderer/models/maita/README.md) を参照してください。

会話モーションは音声の強弱と間から、話し始めの姿勢変化、強調のうなずき、
重心移動、視線の移動と首の追従、休止時のまばたきと呼吸を組み立てます。
体の動きをモデルの物理計算へ渡し、肩・腕・服・髪の遅れも反映します。
同じ音声では同じ動作の予定を使います。
既存モデルの可動範囲を使うため、新たな手振りポーズや文章の意味を理解した身振りは生成しません。
