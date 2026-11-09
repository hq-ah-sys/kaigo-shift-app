<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/04c0cb07-b087-41da-8816-2550a7bade0f

## 🌐 GitHub Pages で公開・アクセスする手順

GitHub と同期した後、GitHub Pages でアプリを動かすには以下の設定を行ってください。

1. **GitHub リポジトリの設定を開く**:
   - リポジトリのページから **Settings** タブをクリックします。
2. **Pages 設定へ移動**:
   - 左側メニューの **Pages**（Code and automation 内）をクリックします。
3. **ビルド方式を GitHub Actions に変更**:
   - **Build and deployment** の **Source** を `Deploy from a branch` から **`GitHub Actions`** に変更します。
4. **自動デプロイの確認**:
   - リポジトリの **Actions** タブを開き、`Deploy to GitHub Pages` ワークフローが完了するのを待ちます（約1〜2分）。
   - 完了すると発行された公開 URL（例: `https://<ユーザー名>.github.io/<リポジトリ名>/`）からアプリにアクセスできるようになります。

---

## 💻 ローカルで動かす場合 (Local Development)

**前提条件:** Node.js 18+

1. 依存ライブラリのインストール:
   ```bash
   npm install
   ```
2. 開発サーバーの起動:
   ```bash
   npm run dev
   ```
3. ブラウザで `http://localhost:3000` を開きます。

---

## ❓「このページは存在しません」と表示される主な原因と対処法

1. **GitHub Pages の設定が「GitHub Actions」になっていない**
   - リポジトリの `Settings` → `Pages` で Source を **GitHub Actions** に設定してください。
2. **初回デプロイ処理中である**
   - GitHub に push してからデプロイが完了するまで1〜2分かかります。**Actions** タブで実行状況をご確認ください。
3. **URL の末尾にリポジトリ名が含まれていない**
   - GitHub Pages の URL は `https://<ユーザー名>.github.io/<リポジトリ名>/` です。

