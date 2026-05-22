# habit-dots (つづけるドット) 仕様書 v1_0
## ゴール
習慣を登録し毎日できたらドットを付け、連続日数とカレンダーで継続を見える化するChrome拡張。
## 絶対制約
外部API・通信なし/chrome.storage.localのみ/権限storageのみ/MV3・TS・Vite/UIはpopup内で完結。
## 機能
習慣CRUD(名前/絵文字)/今日のチェックでドット付与+連続日数計算/月カレンダー表示/日付管理/起動時復元/i18n ja-en/無料は習慣3つ、Premium($3買い切り7日トライアル,Stripe Checkout)で無制限+ストリーク履歴。
## 完了条件
npm run build成功・dist生成・_locales ja/en・icons16/48/128・release/habit-dots.zip生成。
