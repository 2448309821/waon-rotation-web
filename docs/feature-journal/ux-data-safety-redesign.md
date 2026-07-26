# Wawon UI・データ安全性改善

## Goal
- User-facing outcome: 既存機能と共有データを失わず、授業記録を前後の授業へ直接移動できる、デスクトップとスマホで一貫した操作画面にする。
- Non-goals: 確認前の GitHub Pages 公開、既存データの削除、メール送信先や秘密情報のフロントエンド保存。
- Constraints: 現在の Supabase 共有データを基準にし、各段階をローカルで検証してから次へ進む。

## Current Behavior
- What works now: ブラウザの localStorage と Supabase の `rotation_states/shared` に全状態を保存し、複数端末で同期する。管理画面からJSONバックアップ、復元プレビュー、端末内履歴の復元を利用できる。授業記録画面では月移動、同じクラスの前回・次回移動、前回記録の参照、担当者本人から他の先生全員へのWord付き報告メール確認を行える。担当表画面には、確定済みの担当表をWord付きで送る専用ボタンがある。
- How to use it: デスクトップは担当表右上の「担当表をメール送信」、スマホは担当表上部の「担当表送信」から確認画面を開く。バックアップはデスクトップの「管理設定」末尾、スマホの「その他 > 管理設定 > バックアップ」から操作する。授業記録は画面上部の月矢印と前回・次回ボタンで直接移動する。
- Important edge cases: 過去の担当表から再計算できない授業でも、保存済み授業記録のメタデータから一覧へ復元する。メールは選択中の先生のアカウントからは送らず、常にGASをデプロイした管理用Gmailを送信元・返信先にする。Supabase版履歴はSQL migration適用後に有効になる。

## How It Works
- Entry points: `web/src/App.jsx`, `web/src/supabase.js`, `supabase/schema.sql`。
- State/data flow: React stateをlocalStorageへ保存し、700msのデバウンス後にSupabaseの共有行へupsertする。
- UI or API behavior: Realtime更新を受けると共有行をReact stateへ反映する。
- Integration points: Supabase Database/Realtime、将来のメール用Worker + GAS。

## Changed Files
| File | Role |
| --- | --- |
| `.gitignore` | 個人情報を含む可能性があるバックアップをGit管理から除外する。 |
| `docs/feature-journal/ux-data-safety-redesign.md` | 改善内容、検証結果、未解決事項を記録する。 |
| `web/src/stateBackup.js` | バックアップ形式、集計、JSON読込、最大20件の端末内履歴を管理する。 |
| `web/src/App.jsx` | バックアップ、跨月記録、再編ナビ、未保存入力を守るRealtime統合、メール確認UIを接続する。 |
| `web/src/styles.css` | デスクトップとスマホの新しい画面構成、記録ナビ、バックアップ、メールUIを整える。 |
| `.interface-design/system.md` | 画面構造、密度、色、レスポンシブ方針を固定する。 |
| `supabase/schema.sql` | 共有状態更新前のサーバー版履歴を定義する。 |
| `supabase/migrations/20260720_rotation_state_revisions.sql` | 既存Supabaseへ適用する履歴テーブルとtriggerのmigration。 |
| `supabase/migrations/20260720_schedule_email_dispatches.sql` | 担当表メールの送信予約と送信済み状態を保持する。 |
| `supabase/migrations/20260720_lesson_report_email_dispatches.sql` | 授業報告メールを保存版単位で一度だけ送るための送信状態を保持する。 |
| `supabase/functions/send-schedule-email/index.ts` | 確定済み表だけを固定配信先へ送るEdge Function。 |
| `supabase/functions/send-lesson-report-email/index.ts` | 保存済み授業記録を検証し、担当者以外へ報告メールを送るEdge Function。 |
| `supabase/functions/send-lesson-report-email/lesson-report-mail-format.ts` | 自然な日本語本文とMeiryo 12ptのWord授業記録をサーバー側で生成する。 |
| `integrations/wawon-schedule-mail-webhook.gs` | GASからメールを送り、内容指紋で二重送信を防ぐ。 |
| `docs/setup-schedule-email.md` | メール経路と秘密情報の設定手順。 |

## Iterations
### 2026-07-20 - 改造前の安全基線
- Change: バックアップ格納先をGit対象外にし、実装記録を開始した。
- Reason: UIや同期処理を変更する前に、現在の共有状態を復元可能な形で保存するため。
- Evidence: `backups/pre-redesign-20260720-010158/rotation_states-shared.json` を再解析し、SHA-256 `6E92FB371739AD332ED939F748C1C1B0C5C5B3DDE5E857AE52BA2B6983BEED8E` が一致した。
- Result: 98,879 bytes、トップレベル23項目、授業記録3か月32件、伝言5件、確定表2件を保存した。基準コミットは `348b548f781fd43508da3323c740b1df2e521c14`。
- Next: アプリ内のローカル履歴と手動バックアップ・復元を実装する。

### 2026-07-20 - バックアップ・復元UI
- Change: 最大20件の端末内履歴、JSONダウンロード、複数形式のJSON読込、復元プレビュー、復元前スナップショットを追加した。
- Reason: 単一JSON行の誤上書きが起きても、管理者が内容件数を確認して元へ戻せるようにするため。
- Evidence: バックアップ関数のNodeテスト、Vite production build、実データ32件を表示するデスクトップ/390px幅のブラウザ確認に成功した。
- Result: アプリ側の保護はローカルで動作する。サーバー版履歴migrationは未適用のため、まだ本番DBには存在しない。
- Next: 授業記録の跨月ナビゲーションとスマホ共通ヘッダーの圧縮へ進む。

### 2026-07-20 - 授業記録の跨月タイムライン
- Change: 記録画面へ月移動、同じクラスの前回・次回、保存済み前回記録の読取専用参照を追加した。
- Reason: 前月の報告を確認するためにホームへ戻って月を変える往復をなくすため。
- Evidence: 2026年7月の「きく」から前回候補6/27、保存済み参照6/20を表示し、デスクトップと390px幅で横スクロールが発生しないことを確認した。
- Result: 現在の記録を編集中でも、同一画面で過去内容を参照できる。スマホの重複していた上部出力ボタンも整理した。
- Next: 主ナビゲーションを業務単位に再編する。

### 2026-07-20 - デスクトップ6組・スマホ5入口
- Change: デスクトップのサイドバーを6つの主項目にし、出席統計と各回設定をサブタブへ移した。スマホ下部を5項目にし、統計・伝言板・管理・表示設定を「その他」へまとめた。
- Reason: 機能を減らさず、主操作の選択肢を減らしてスマホ下部の窮屈さを解消するため。
- Evidence: デスクトップのサイドバー6件、スマホ下部5件、390px viewportのscrollWidth 390pxをブラウザで確認した。
- Result: デスクトップとスマホで同じ機能IDを使い、表示モードを切り替えても同じ業務画面を保ちやすくなった。
- Next: メール通知の安全な送信経路と送信確認UIを実装する。

### 2026-07-20 - 同期競合保護と担当表メール
- Change: Realtime受信時に未保存の端末入力を三方向統合して残すようにし、確定担当表のメール確認パネル、Edge Function、GAS Webhook、送信履歴migrationを追加した。
- Reason: 別タブや別端末の更新で選択直後の`auto`設定が古い値へ戻る問題を減らし、秘密tokenや送信先をGitHub Pagesへ置かずに担当表を通知するため。
- Evidence: Edge Functionをesbuildで構文検証し、GASを`node --check`で検証した。デスクトップと390x844でメール本文・固定配信先・送信前確認ボタンを表示し、スマホ本文幅365px/scrollWidth 365px、ページ幅390px/scrollWidth 390pxを確認した。
- Result: ローカルUIと送信コードは完成した。Supabase Function、DB migration、GAS Web App、secretはまだ本番へ適用していないため、実メール送信は未開通。
- Next: 管理接続可能な環境でmigrationとFunction/GASを設定し、テスト用配信先で一回だけ送信されることを確認する。

### 2026-07-20 - スマホ初期表示の軽量化
- Change: PDF生成専用の`html2canvas`と`jsPDF`を初期bundleから外し、PDF出力を押した時だけ読み込むようにした。
- Reason: 普段の出席入力や記録閲覧では使わない約600KBの処理を、スマホの初期表示時に読み込ませないため。
- Evidence: production buildのメインJSが1,055.54KBから462.62KBへ減少し、PDF用コードは201.42KBと390.26KBの遅延chunkへ分離した。
- Result: 通常操作の初期転送量と解析量を減らし、PDF機能はそのまま維持した。
- Next: 実機回線で初回表示とPDF初回出力の体感差を確認する。

### 2026-07-20 - 送信者を除くメール配信
- Change: 固定メーリングリスト方式をやめ、選択中の先生を送信者として、登録された全先生から本人だけを除いて送る方式へ変更した。メール操作は管理者以外にも表示する。
- Reason: 裴が送る時はほかの7名へ、別の先生が送る時は裴を含むほかの7名へ送る運用に合わせるため。
- Evidence: 裴で開いた確認画面に、送信者「裴」、配信先「岡崎、岡本、柴田、今村、門馬、蔦尾、相良（7名）」を表示した。390px幅でpanel clientWidth/scrollWidthがともに365px、ページscrollWidthが390pxであることを確認した。
- Result: 実メールアドレスはブラウザへ渡さずSupabase secretに保持し、GASも「登録全員－送信者」の組み合わせだけを受け付ける。
- Next: Git対象外の`.private/wawon-mail-recipients.json`を使ってSupabase/GASのsecretを設定する。

### 2026-07-20 - メール表の崩れ防止とWord添付
- Change: Markdown表をそのままメール本文へ入れる方式をやめ、Edge FunctionでインラインCSS付きHTML表を生成するようにした。同じ確定アーカイブからMeiryo 12ptのWord（`.docx`）担当表を生成し、GASで1件添付する。
- Reason: QQメールではMarkdownの空セルと列幅が保持されず、担当日とクラスが別の列に見えたため。本文で素早く確認でき、必要ならWordでも正確に確認できる形にする。
- Evidence: HTML表の全セルに罫線・背景・配置を明示し、390pxでbody scrollWidth 390px、表幅328pxを確認した。DOCXは33,397 bytes、10行5列として`python-docx`で再読込した。修正版テストを`q2448309821@gmail.com`から本人のQQへ1通送り、Word添付ありをGmail送信済みで確認した。
- Result: 本文と添付はブラウザ入力ではなく、Supabase上の確定アーカイブ1件から同時生成されるため内容が一致する。
- Next: GAS Web AppとEdge Functionを再デプロイし、QQメールの実受信画面と添付Wordを確認する。

### 2026-07-20 - 担当外の日の出席状態をメールへ反映
- Change: 担当クラスがないセルにも、現在の担当表と同じ優先順位で`会議`、`○`、`△`、`×`を入れるようにした。過去の確定アーカイブに状態が入っていない場合も、送信時に対象月の出席データから補完する。
- Reason: クラス名だけの表では、代替候補や会議参加者を受信者が判断できなかったため。
- Evidence: 2026年7月データで`柴田 7/4=会議`、`今村 7/11=△`、`今村・蔦尾 7/25=○`を確認した。390px幅で横overflowなし、DOCXは10行5列で4種類すべてを`python-docx`再読込で確認した。状態付き本文と33,437 bytesのWordを本人のQQへ送り、Gmail送信済みID `19f7b9e82a6e1b60`で添付ありを確認した。
- Result: メール本文、添付Word、画面からの各種担当表出力で、担当クラスと先生の状態を同じセル規則で確認できる。
- Next: QQメール実受信画面で状態記号とWord添付の見え方を確認する。

### 2026-07-20 - 授業報告メールの最小本文テスト
- Change: 最初の三項目列挙形式を、挨拶と紹介を含む自然な短文へ変更した。日付、クラス、担当者は「7月11日のさくらクラスの授業報告」「担当は裴です」と本文中に含め、詳細はWord添付だけで共有する。
- Reason: 情報を満たすだけの入力フォーム風本文ではなく、先生方へ送る実際の連絡メールとして自然に読める必要があるため。
- Evidence: Supabaseの7月11日さくら記録からMeiryo 12pt、5行3列のWordを再生成した。初版のセル幅単位誤りで左側が切れる問題を修正し、Word COMでPDF化した1ページ画像で罫線と全内容がページ内に収まることを確認した。修正版38,149 bytesを本人のQQへ送り、Gmail送信済みID `19f7bf154d7eed25`で自然文本文と添付ありを確認した。
- Result: 本文は挨拶、授業報告の紹介、担当者、添付確認、結びの順になり、Wordも途中で切れず1ページに収まる。
- Next: QQで受信表示を確認後、この形式を授業記録画面の送信機能へ組み込む。

### 2026-07-20 - 授業記録画面からの報告メール送信
- Change: デスクトップの授業記録ヘッダーとスマホの下部操作欄に「メール送信」を追加した。送信前ダイアログで授業、送信者、送信先、件名、Word添付名、自然文本文を確認し、保存済みの担当者本人だけが送れるようにした。
- Reason: Wordを手動で書き出してメールソフトを開き、宛先と本文を毎回作る操作をなくすため。誤送信を防ぎつつ、先生方には同じ短い連絡形式で共有する必要があるため。
- Evidence: 2026年7月11日さくらの実データをEdge Function用生成器へ渡し、件名、挨拶文、担当者「裴」、出席4名を確認した。生成Wordは11,388 bytes、5行3列、全runがMeiryo 12ptで、Word COMのPDF変換でも1ページ内に全内容とフッターが収まった。Edge Functionのesbuild、GASの`node --check`、Vite production buildに成功した。
- Result: ローカル実装では、送信者以外の7名へサーバー生成のWord付き授業報告を送る確認操作が完成した。同じ`updatedAt`の保存版は二重送信せず、編集・保存後の修正版は再送できる。
- Next: 新しいmigration、Edge Function、GASを本番へデプロイしてから、テスト用記録を一度送信する。

### 2026-07-20 - 担当表メール送信入口の明確化
- Change: 担当表の曖昧な「メール通知」を、デスクトップでは主ボタン「担当表をメール送信」、スマホでは先頭の「担当表送信」へ変更した。確認画面を開くたびに古い送信結果を消し、送信成功後はボタンを「送信済み」にして再押下を防ぐ。
- Reason: 授業報告メールとは別に、月の担当表を送る操作がどこにあるか一目で分かる必要があるため。
- Evidence: Vite production build成功、ローカルURLがHTTP 200、生成bundleにデスクトップとスマホの両ラベルが含まれることを確認した。
- Result: 担当表画面から、確定月の送信確認へ迷わず進める。既存の送信者除外、HTML表、Word添付の処理はそのまま利用する。
- Next: 本番用Edge FunctionとGASをデプロイ後、確定月で一度送信確認する。

### 2026-07-20 - 送信元Gmailの統一
- Change: 確認画面の「送信者」を、担当表では「連絡者」、授業報告では「担当者」に変更し、別欄で送信元を「Wawon管理用Gmail」と表示した。GASの表示名を常に`Wawon Rotation`とし、選択中の先生をReply-Toへ設定しないようにした。
- Reason: 先生名は配信対象から本人を除くための業務情報であり、メールアカウントを切り替える設定ではない。全メールを管理者のGoogle/Gmailアカウントへ統一するため。
- Evidence: Edge FunctionからGASへは`excludedEmail`として本人のアドレスを渡し、GASでは配信先検証にだけ使用する。送信処理には個別の`replyTo`を設定しない。Vite build、担当表・授業報告Edge Functionのesbuild、GAS構文検証、ローカルHTTP 200確認に成功した。
- Result: 誰が画面を操作しても、送信元と返信先はGASをデプロイした同じ管理用Gmailになる。本人を除く配信規則と本文中の担当者表示は維持する。
- Next: GASを先に新しいバージョンで再デプロイし、その後Edge Functionを更新する。

### 2026-07-24 - 送信用キー入力を廃止
- Change: 担当表メールと授業報告メールの送信時に、ブラウザで「メール送信用キー」を入力させる処理を削除した。Edge Function側も`x-wawon-mail-key`検証と`SCHEDULE_MAIL_TRIGGER_KEY`必須条件を外した。
- Reason: ユーザーが期待しているのは「送信ボタンだけで管理用Gmail/GASから送る」操作であり、手入力キーは運用上わかりにくかったため。
- Evidence: 送信に必要なGAS URL、GAS token、宛先表はSupabase Edge Functionのsecret側に残し、ブラウザには表示しない。
- Result: 送信前には通常の確認ダイアログだけを出し、メール用のT/key入力は不要になった。
- Next: Vite build、両Edge Functionのbundle、GAS構文チェックを再実行し、本番へ反映する。

### 2026-07-24 - 実PDFプレビューとPDF・Word同時添付
- Change: 担当表と授業報告の確認画面で、実際に送信するPDFをブラウザ内で生成し、全ページ、ファイル名、ページ数、容量を表示するようにした。確認後は同じPDFデータをEdge Functionへ渡し、Edge Functionが保存済みデータから作るWordと合わせて2件添付する。
- Reason: Wordだけでは受信時の見た目を送信前に確信できず、PDFだけでは受信者が編集できないため。見たままのPDFと編集可能なWordの両方を、一回の確認と送信で渡す必要があった。
- Evidence: 2026年7月担当表で`会議`、`○`、`△`、`×`を含む1ページPDFを表示し、添付欄に同名のPDF・DOCX 2件を確認した。7月11日さくら授業記録でも実PDFとDOCX名を表示した。390x844でbody幅390px、横overflowなし。Node 24のTypeScript実行で、両メール生成器がPDFと`PK`ヘッダーを持つDOCXを各1件返すことを確認した。Vite production buildとGAS構文検証に成功した。
- Result: 送信者は実ファイルのPDFを見てから確認チェックを入れ、同じ内容のPDFとWordを7名へ送れる。担当表と授業報告で同じ操作になった。
- Next: GAS Web Appを新しいバージョンで再デプロイし、2つのEdge Functionを更新後、本人のQQ宛てテストで2件添付を確認する。

### 2026-07-24 - 授業記録の記号重複防止と不要な改ページの解消
- Change: 授業内容と申し送りの各行について、既存の番号・丸数字・括弧番号・中黒・丸・米印・ハイフンを判定する共通整形処理を追加した。記号がない行だけ授業内容には連番、申し送りには丸を補う。PDFは実際の内容高を測って上部余白と固定行高を段階的に縮め、Wordも内容量が多い時だけ余白・行間・セル高さをコンパクトにする。
- Reason: 自分で`1.`や`２．`、`・`を書いた行に別の記号が重なっていた。また、内容は1ページに収まるのに、固定の上部空白とセル高さによって2ページになる記録があったため。
- Evidence: 記号判定テストで`1.`、`②`、`（4）`、`・`、`●`、`※`、`-`をそのまま保持し、記号なしの行だけ補完することを確認した。2026年7月11日きくのプレビューでは`1.`と`２．`が重複せず表示された。7月11日さくらの実データを出力し、PDFはA4 1ページ、WordはWord COMで1ページ、重複記号0件、フッター保持を確認した。
- Result: 入力者が自分で付けた番号や記号を尊重し、付け忘れた行だけ自動で整える。中程度の記録は文字サイズを落とさず1ページへ収まり、本当に長い記録だけ複数ページになる。
- Next: ローカル画面で利用者確認後、メール送信用Edge FunctionとWeb本体を同じ更新として本番へ反映する。

### 2026-07-27 - 全利用者向け担当表ダウンロード
- Change: 管理者だけに表示していた担当表のWord保存を全利用者へ開放し、同じ担当表をPDFとPNG画像でも保存できるようにした。デスクトップは3形式をまとめて表示し、スマホは場所を取りすぎないよう初期状態を閉じた二級メニューにした。
- Reason: 先生方が自分で担当表を保管、印刷、共有できるようにし、管理者へファイル送付を頼む手間を減らすため。
- Evidence: 管理者と岡崎の両方でWord・PDF・PNGボタンを確認した。岡崎でPDFを実際に保存し、225,621 bytesのファイル生成を確認した。管理者では29,682 bytesのWord、225,910 bytesのPDF、211,349 bytesのPNGを保存し、PNG画像で担当クラス、`会議`、`○`、`△`、`×`が読み取れることを目視確認した。390x844相当ではメニューが初期状態で閉じ、展開後に3ボタンが表示された。
- Result: 編集・確定などの管理操作は保護したまま、全先生が必要な形式で担当表を持ち出せる。
- Next: ローカル利用者確認後、明示的な承認を受けてWeb本体と記録を本番へ反映する。

## Verification
| Check | Result | Notes |
| --- | --- | --- |
| Supabase共有行バックアップ | pass | JSON再解析とSHA-256照合に成功。 |
| `node --input-type=module` backup utility test | pass | JSON解析、Supabase形式、20件上限、並び順を確認。 |
| `npm run build` | pass | Vite 5.4.21、460 modules transformed。既存のchunk size warningのみ。 |
| デスクトップUI確認 | pass | 32件・5件・2件の集計、履歴1件、操作ボタンを確認。 |
| スマホ390x844確認 | pass | 管理のバックアップ二級メニューと縦積みレイアウトを確認。 |
| 授業記録の跨月UI | pass | デスクトップ/スマホで月移動、前回・次回、前回参照を確認。 |
| ナビゲーション再編 | pass | デスクトップ6件、スマホ5件、サブ入口、横方向非overflowを確認。 |
| Edge Function / GAS 構文 | pass | esbuild bundleと`node --check`に成功。 |
| 担当表メール確認UI | pass | デスクトップと390x844で固定配信先、件名、本文、確認操作を確認。実送信は未実施。 |
| Realtime未保存入力保護 | code pass | 三方向統合を実装しbuild成功。共有データを変えるブラウザ競合試験は未実施。 |
| 初期bundle軽量化 | pass | メインJS 1,055.54KB → 462.62KB。PDF依存を遅延読込へ分離。 |
| 動的メール配信先 | pass | 裴を除く7名をデスクトップ/390px画面に表示。実送信は未実施。 |
| HTML表・Word添付生成 | pass | 確定MarkdownをHTML本文とDOCXへ同時変換。390pxで横overflowなし、DOCX再読込成功。本人宛て修正版テスト1通で添付を確認。 |
| メール・Wordの状態表示 | pass | `会議`、`○`、`△`、`×`を含む2026年7月表を生成。390px表示とDOCX 10行5列の再読込で確認。 |
| 授業報告メール形式 | pass | 自然な挨拶文に日付・クラス・担当者を含め、修正版38,149 bytesのWordを本人のQQへ送信。Word COMによる1ページPDF画像で非切断を確認。 |
| 授業報告メールボタン | code pass | デスクトップ/スマホの送信入口、確認ダイアログ、担当者・保存状態チェックを実装。Vite build成功。ブラウザ自動確認はローカルURL制限で未実施。 |
| サーバー版授業報告Word | pass | 7/11さくらの実データから11,388 bytes、Meiryo 12pt、5行3列、1ページのWordを生成し、Edge Function bundleも成功。 |
| 担当表メール送信ボタン | pass | デスクトップ/スマホの専用ラベルと主操作スタイルをbuildで確認。ローカルURLはHTTP 200。 |
| 管理用Gmailへの送信元統一 | pass | 個別Reply-Toを廃止し、GAS表示名を固定。Vite、両Edge Function、GAS構文、ローカルHTTPを確認。 |
| 送信用キー入力廃止 | pass | Vite build、両Edge Function bundle、GAS構文チェックに成功。ブラウザの`prompt`と`x-wawon-mail-key`参照は削除済み。 |
| 実PDFプレビュー・2件添付 | local pass | 担当表と7/11さくら授業記録で実PDF表示、PDF・DOCX名、390x844非overflowを確認。メール生成器はPDF・DOCX各1件を生成。実送信は未実施。 |
| 授業記録の記号・改ページ | local pass | 既存記号を保持して重複0件。7/11さくらのPDFとWordを各1ページで確認し、Wordフッターも保持。 |
| 全利用者向け担当表保存 | local pass | 管理者・一般利用者でWord/PDF/PNG入口を確認し、3形式の実ファイル生成とPNGの表示内容を確認。スマホは初期状態を閉じた二級メニュー。 |

## Known Issues
- Supabase側にはまだサーバー版履歴がない。
- メール用migration、授業報告Edge Function、更新版GASはまだ本番へ適用していないため、ローカル画面の最終送信はまだ開通していない。
- 現在のRLSは匿名読み書きを許可しており、名前選択は認証ではない。
- migrationをSupabaseへ適用する管理接続情報は、この作業環境には設定されていない。
- LibreOfficeの`bootstrap.ini`が破損しているため、DOCXのLibreOffice画像レンダリングは実行不可。DOCXはZIP/XMLと`python-docx`再読込で構造検証した。

## Next Steps
- Supabase migrationを管理接続可能な環境で適用し、サーバー版履歴を有効化する。
- GAS Web App、Edge Function、secretを設定し、テスト用配信先で重複送信防止を確認する。
- 匿名共有のまま運用する範囲を決め、必要なら管理操作だけ認証を追加する。
