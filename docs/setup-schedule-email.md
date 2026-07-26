# 担当表・授業報告メール設定

ブラウザにメールアドレスやtokenは保存しません。GitHub Pagesで実際に送るPDFを作成して全ページをプレビューし、確認後に同じPDFをSupabase Edge Functionへ渡します。Edge Functionは保存済みデータから本文とWordを作り、PDFとWordの2件を、画面で選択した先生本人を除く全員へGAS経由で送ります。実際の送信元と返信先は、常にGASをデプロイした管理用Google/Gmailアカウントです。

- 担当表: 確定済みアーカイブからHTML表とWord担当表を作り、画面で確認したPDF担当表も同時に送る。
- 授業報告: 保存済み授業記録から短い挨拶文とWord授業記録を作り、画面で確認したPDF授業記録も同時に送る。授業記録画面の「メール送信」から確認して送る。

## 1. Google Apps Script

1. 送信に使うGoogleアカウントで新しいApps Scriptを作る。
2. `integrations/wawon-schedule-mail-webhook.gs` を貼り付ける。
3. 全先生のメールアドレスを配列にして、`setupWawonMailWebhook(['先生1@example.com', '先生2@example.com'])` を一度実行する。
4. 実行ログのtokenを安全な場所に控える。
5. Webアプリとしてデプロイし、実行ユーザーを自分、アクセスを全員にする。

GAS側は、登録した全員のうち「画面で選択した先生本人だけを除いた組み合わせ」以外を拒否します。画面の先生名は連絡者または授業担当者の表示と配信除外にだけ使い、送信元アカウントは切り替えません。

Apps Scriptを更新した場合は、既存のWebアプリを「新しいバージョン」で再デプロイしてください。エディタへ貼り付けただけでは、公開中のWebアプリへPDF・Wordの2件添付は反映されません。

## 2. Supabase

1. `supabase/migrations/20260720_rotation_state_revisions.sql` を適用する。
2. `supabase/migrations/20260720_schedule_email_dispatches.sql` を適用する。
3. `supabase/migrations/20260720_lesson_report_email_dispatches.sql` を適用する。
4. `supabase/functions/send-schedule-email` と `supabase/functions/send-lesson-report-email` をデプロイする。
5. Edge Function secretを設定する。

```powershell
supabase secrets set MAIL_WEBHOOK_URL="GAS Web App URL"
supabase secrets set MAIL_WEBHOOK_TOKEN="GAS token"
supabase secrets set SCHEDULE_MAIL_RECIPIENTS_JSON='{"岡崎":"先生1@example.com","岡本":"先生2@example.com","柴田":"先生3@example.com","今村":"先生4@example.com","門馬":"先生5@example.com","蔦尾":"先生6@example.com","相良":"先生7@example.com","裴":"先生8@example.com"}'
supabase functions deploy send-schedule-email
supabase functions deploy send-lesson-report-email
```

授業報告を送れるのは、その記録の担当者本人を選択している時だけです。単元・授業内容・申し送りを入力し、共有データへの保存が完了してから「メール送信」を押します。送信に必要なGASトークンと宛先表はSupabase Edge Functionのsecretに保持し、ブラウザでは入力させません。

## 安全条件

- 月が確定済みで、確定時のMarkdownアーカイブが存在すること。
- 配信先と本文はブラウザから自由指定できず、画面で選択中の先生本人だけを除くこと。
- 管理キーはGitHub PagesやlocalStorageへ保存せず、送信するブラウザのsessionStorageだけに置くこと。
- `schedule_email_dispatches` により、同じ月は一度だけ送信すること。
- `lesson_report_email_dispatches` により、同じ保存版の授業報告は一度だけ送信すること。内容を直して保存すると、新しい`updatedAt`の修正版として再送できること。
- Edge Function 側の送信予約に加え、GAS 側も送信内容のハッシュを保存して二重送信を防ぐこと。
- HTML本文とWord添付はブラウザから受け取らず、Edge Functionが確定済みアーカイブまたは保存済み授業記録から生成すること。
- PDFはブラウザの確認画面で生成し、全ページ、ファイル名、ページ数、容量を表示すること。確認したPDFと送信するPDFは同じbase64データを使うこと。
- Edge Functionは対象月・授業記録・送信者に加えて、PDFのファイル名、容量、ヘッダー、終端を検証すること。
- GASは同じ名前のPDFとWordを各1件だけ受け付け、拡張子、MIME type、容量、ファイルヘッダーを検証すること。
- 送信失敗時だけ再試行できること。
