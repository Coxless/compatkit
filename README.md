# compatkit

> **現在の Next.js プロジェクトを壊さず、YAML で定義した Next.js / React の互換性 Matrix を、一時環境で高速にテストする CLI。**

Next.js 向け NPM パッケージの作者が、`next@14` / `next@15` / `next@16` といった複数の組み合わせに対して、
publish 相当の tarball を1つの fixture アプリだけで検証するためのツールです。

> **Status: 開発中（Phase 1: project bootstrap 完了）**
> CLI の骨組みのみが動作します。互換性テストの実行本体は未実装です。

## パッケージ名とコマンド名

npm の `compat` は既存パッケージが取得済みのため、**公開パッケージ名は `compatkit`**、
**CLI コマンド名は `compat`** としています。

```bash
# 直接実行
npx compatkit test

# インストールして実行
npm install --save-dev compatkit
npx compat test
```

## 前提条件

### ビルドは `prepack` で完結させてください

`compatkit` は対象パッケージのビルドコマンドを実行しません。`npm pack` が呼び出す npm 標準の
`prepack` スクリプトにビルドを委譲します。対象パッケージの `package.json` を次のように構成してください。

```json
{
  "scripts": {
    "prepack": "npm run build"
  }
}
```

ビルド成果物（`dist/` 等）の有無や鮮度は検証しません。`prepack` が失敗した場合は
`npm pack` の失敗として報告されます。

### Node.js

Node.js **22.12.0 以上**が必要です。Bun のインストールは不要です。

## セキュリティ

> ⚠️ `compat.yml` の `tests[].run` に書かれたコマンドは、あなたのローカル環境でそのまま実行されます。
> **信頼できないプロジェクトの設定ファイルを実行しないでください。**

MVP ではシェルコマンドのサニタイズは行いません。

## 開発

compat 自身の開発ツールチェーンは Bun です（**利用者に Bun は要求しません**）。
ランタイムは [mise](https://mise.jdx.dev/) で固定しています。

```bash
mise install     # bun + node をインストール
bun install      # 依存を導入
bun run check    # typecheck → lint → test → build → Node 互換性検証
```

| コマンド | 内容 |
| --- | --- |
| `bun run dev` | `src/cli.ts` を直接実行 |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | Biome によるチェック |
| `bun run format` | Biome によるフォーマット |
| `bun test` | テスト実行 |
| `bun run build` | `dist/` へ Node 互換 JS を出力 |
| `bun run verify:node` | ビルド成果物を Node で実行して互換性を確認 |

設計ドキュメントは [specs/001-compat-mvp/](./specs/001-compat-mvp/) を参照してください。

## License

MIT
