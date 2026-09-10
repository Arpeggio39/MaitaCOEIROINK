# ローカル口パク動画の検証

2026-09-10、macOS上のElectronと実COEIROINKエンジンで確認。
既存プロジェクトを変更しない一時ユーザープロファイルを使用した。

- 入力: 「こんにちは、琵音マイタです。今日は、ナレーションに合わせて口を動かすテストをしています。」
- エディターの全文音声生成 → Live2Dプレビュー → MP4保存まで成功。
- 音声ファイル選択UIを削除。出力形式はMP4固定。
- ffprobeで全フレームをデコード。1280×720、約5.77秒、173フレーム、H.264 + AAC。
  Canvasのキャプチャ設定は30 fps。MediaRecorder出力は可変フレーム間隔。
- Chromiumの動画デコーダーで有限のduration、解像度、途中へのシーク成功を確認。
- プレビュー停止、書き出し中止、画面の再表示を確認。
- `npm test`: 75件成功。無音/発声/休止、逆相ステレオ、口の感度上限を含む。
- `git diff --check` 成功。

サンプル: `local-output/maita-character-demo.mp4`（ローカル生成物、Git管理外）。
出力はグリーンバックMP4。アルファ付き動画、母音別の口形、Windows実機での動作は
今回の確認対象に含まれない。

## 発話連動の会話モーション

同日の追加検証:
- 音声の強弱と休止から動作予定を生成。単純な一定周期の首振りを置き換えた。
- モデルの実可動範囲を取得し、出力を範囲内に制限。
- 胴体・首の入力を物理計算の前に渡し、肩・腕・服・髪への伝播を有効化。
- 視線に遅れて首が追従し、強調時のうなずき、左右の重心移動、間に寄せた不規則なまばたきを追加。
- 動作予定は音声から得たseedで再現し、60 Hzで計算。表示フレームレートによる乱数の違いを排除。
- 読み上げ例の全文で約18.53秒のMP4を保存し、556映像フレームとAAC音声をデコード確認。
  複数時点の動画フレームで姿勢・まばたき・口パクを確認。
- プレビュー、書き出し中止と再表示を再確認。
- `npm test`: 78件成功。無音時に発話ジェスチャーを作らないこと、音声による再現性、
  パラメータの上限と連続性、まばたきの開閉、発話と休止の姿勢差を含む。
- サンプル: `local-output/maita-natural-motion.mp4`。

モデルの既存リグを用いた音声駆動の手続き的モーションであり、文章の意味に合わせた手振りや
実際の人間と同等の動作を保証するものではない。

## キャラクターに合わせた動画サイズ

- 表示サイズスライダーを削除。
- 透明背景で初期描画したピクセルのアルファ範囲から、動画サイズと比率を自動計算。
- 全身の高さを基準に、横5.5%・縦3%ずつの動作余白を追加。MP4用に偶数寸法へ調整。
- このモデルでは356×702の縦長MP4になった。
- 通常の会話モーションを全編デコードして輪郭を計測。
  最小余白は左32、上20、右30、下22ピクセルで、全身の欠けなし。
- 動作量1.5の最大設定でも全編の輪郭が動画端に達しないことを確認。
- 音声生成、MP4保存、停止・再表示を再確認。`npm test` は80件成功。
- サンプル: `local-output/maita-fitted.mp4`。

## 音声に動画を付けるチェックオプション

- 書き出しメニューの音声3択の下にチェックを配置し、ON時は枠全体をピンクにした。
- ONで全文1ファイル、選択範囲、区切りごとの3経路を実COEIROINKで検証。
  同じ保存済み音声からMP4を生成し、音声と同じフォルダーに保存できた。
- OFFではWAVのみが増え、MP4が作成されないことを確認。
- 生成した4本のMP4のコーデックと再生時間をffprobeで確認。
- 動画失敗時はWAV保存済みであることを表示する。
- 82件のテストとgit diff --checkに成功。

## 選択と実行の分離・プレビュー非表示

- 3択は選択のみ、右下の「出力する」で開始。選択だけではファイルが増えないことをElectron E2Eで確認。
- 音声のみ・動画付きの共通進捗モーダルを表示。動画フレームは透明な背景処理用iframeにし、区切りごとのダイアログ開閉を廃止。
- 合成中は不定進捗、動画中は録画時間に基づいたメーター。録画中のスピーカー再生も抑制。
- 実COEIROINKで全文・選択中・区切りごとを出力し、WAV 4件＋MP4 4件、OFFでWAVのみ追加を確認。renderer例外なし。
- ffprobeでMP4全4件がH.264/AAC・356×702。約0.9〜1.9秒で27〜57フレーム、約30fpsを確認。
- npm test: 82件成功。

## Parallel export and offline encoding validation

- Audio preparation: two bounded jobs, overlapping ordered publication. Shared Worker handles WAV concatenation and lip/motion analysis.
- GPU concurrency is estimated from free VRAM/RAM. NVENC session exhaustion reduces admission and retries. Tests cover six concurrent output lanes, two synthesis slots, failure draining and capacity reduction.
- Windows process affinity selects at most four logical CPUs. Intel/AMD Windows and NVIDIA hardware remain unverified on this Mac. External COEIROINK process settings are unchanged.
- Mac CPU fallback: exactly 30 seconds of existing WAV converted to MP4 in 4.705 seconds, including model loading, analysis, encoding and saving; excludes synthesis.
- ffprobe: H.264/AAC, 356x702, 30.000 seconds, 900 frames. Extracted frame visually checked after correcting OpenGL row orientation with vflip.
- Real Electron/COEIROINK tests passed for combined, selected and segmented WAV+MP4, and WAV-only export.
- npm test: 88 tests passed. Unsigned macOS application packaging passed with the FFmpeg binary unpacked.
