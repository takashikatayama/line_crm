# 引き継ぎメモ — LINE CRM プロトタイプ（10時間版）

片山さんへ。今回のテスト用プロトタイプの内容と現状のまとめです。詳しい仕様・
今後のロードマップは `readme.md`（§2.1 が今回のスコープ）を参照してください。

## これは何か

OSM Hair Water の LINE公式アカウントを webhook で受信し、友だち追加・メッセージ
をローカルDB（SQLite）に蓄積し、簡易ダッシュボードとお客様一覧（閲覧のみ）で
見られるようにしたテスト用プロトタイプです。本番用ではありません。

## 現状（2026-07-15 時点）

- サーバー起動・DB作成・API（空データ）の動作確認済み（ローカルのみ、smoke test）。
- 実際のLINEアカウントとの疎通（ngrok + webhook URL設定）はまだ未実施 —
  `TEST_PLAN.md` フェーズ3を参照。これを行わないと「誰かがLINEを友だち追加/
  メッセージ送信 → ダッシュボードに反映される」というデモはできません。

## 動かし方

```bash
npm install
cp .env.example .env   # LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN を設定
npm start              # http://localhost:3000
```

- ダッシュボード: `http://localhost:3000/`（友だち数・新規30日・メッセージ数
  ＋お客様一覧＋メッセージログ、10秒ごとに自動更新）
- Webhook: `POST /webhook`（LINE Developers Console の Webhook URL に設定）
- データは `data.db`（SQLite、gitignore 済み・引き継ぎ時は別途共有要）

## 今回含めていないもの

カルテ編集・カスタム項目・検索/絞込/CSV・チャット（人力/AI）・流入元計測・
認証・本番デプロイ。これらは `readme.md` §7 の本来の Phase 1 ステップで対応
予定（今回はテストのため意図的に省略）。

## FAQ自動応答（追加実装）

キーワードに一致した場合、`faqs.json` の定型文を自動返信するようにしました
（AIではなくルールベース）。`faqs.json` を編集すれば返信内容を変更できます
（現在はサンプル文言）。一致しない場合は自動返信なし（サイレントにDB保存の
み）。AIによる自動応答は Phase 3 スコープのため今回は含めていません。

## 次にやること

1. `TEST_PLAN.md` フェーズ3（ngrok + LINE Console の Webhook URL設定）を実行し、
   実際にLINEアカウントで動作確認する。
2. 実績時間を10時間の見積もりと突き合わせて振り返る。
3. 振り返り結果をもとに、本来の Phase 1（`readme.md` §7、Postgres・認証込み）
   に着手するか判断する。
