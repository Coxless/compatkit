> **SDD artifact: plan.md** — `compat` MVPの技術設計。要求仕様は[spec.md](./spec.md)、実行タスクは[tasks.md](./tasks.md)を参照。本ドキュメントの節番号はspec.mdの節番号と対応させている。

# compat — Technical Plan

## 1. Technical Context

| 項目 | 選択 |
|---|---|
| Language | TypeScript |
| npm公開パッケージ名 / CLIコマンド名 | `compatkit` / `compat`（spec.md Section 1 Naming decision） |
| Dev/build runtime（compat自身） | **Bun 1.4.0**（`bun install` / `bun test` / `bun run`。詳細は1.1参照） |
| Published CLIの実行runtime | Node.js互換を維持（`npx compat test`。詳細は1.1参照） |
| Node.js下限 | `>=22.12.0`（commander@15の要求。Node 20は2026年4月にEOL） |
| Toolchain pin | `mise.toml` で bun / node を固定（開発環境の再現性） |
| 公開ビルド | **`tsc`**（`tsconfig.build.json`。Phase 1で確定 — 下記Section 7） |
| CLI引数パーサー | **commander@15**（Phase 1で確定 — 下記Section 7） |
| Module形式 | ESM（`"type": "module"`, `module: nodenext`） |
| lint / format | **Biome 2**（`biome.json`。1ツールでlint+format） |
| Matrix環境のpackage manager（spec.md Section 15） | npm のみ first-class support（**compat自身の開発toolchainとは別物**。1.1参照） |
| Config format | YAML（`compat.yml`） |
| Target framework (MVP) | Next.js のみ |
| Distribution | `npx compat test` として実行できるexecutable CLI |
| Test framework | Bunの組み込みtest runner（`bun test`） |

### 1.1 Bunの適用範囲（重要・混同注意）

`compat`は2つの異なる文脈で「Node.js/npm」を扱う。Bun導入はこのうち**(a)のみ**に適用し、**(b)は変更しない**。

**(a) compat自身の開発ツールチェーン → Bun**

- 依存管理: `bun install`（`bun.lock`をrepoにcommit）
- テスト実行: `bun test`
- ローカル実行: `bun run src/cli.ts`
- ビルド: 公開パッケージは`npx compat test`で誰でも実行できる必要がある（spec.md Section 1, 12, 28のUX要件）。Bun専用APIに依存しない、Node.js互換なJSへcompileして公開する。**Phase 1で`tsc`に確定**（Section 7参照）。**エンドユーザーにBunのインストールを要求しない。**
- 上記を担保する仕組み: ビルド用tsconfigは`types: ["node"]`としてBunの型を排除し、Bun専用APIへの依存を型レベルで防ぐ。加えて`verify:node`（`node dist/cli.js test`）を`bun run check`の最終ステップに置き、成果物が素のNodeで動くことを毎回確認する。

**(b) compatがテストするMatrix環境（一時fixture環境）のpackage manager → npm のまま変更しない**

- spec.md Section 15「npmをfirst-class supportする」はテスト対象のNext.js fixture環境の話であり、compat自身の開発言語/ツールとは無関係。
- `environment/builder.ts`, `execution/executor.ts`等が一時環境内で呼び出すpackage managerは引き続き`npm`（`npm install`, `npm pack`等）。
- 将来pnpm/yarn/bunをMatrix環境側でサポートする場合は別途spec.md改訂が必要（現状はSection 15 Futureに記載のみ、MVP非対応）。

## 2. Non-negotiable invariants（Constitution）

実装のどのフェーズでも破ってはならない設計原則。spec.mdの該当節を根拠として保持する。

1. **現在のプロジェクトを直接変更しない** — `node_modules` / lockfile / `package.json`を書き換えない（spec.md Section 6, 8, 14）。
2. **compat自身はビルドを実行しない** — 対象パッケージのビルドは`prepack`に委譲する。`npm pack`の失敗として扱う（spec.md Section 7, 18）。
3. **Environment cache（next/react/react-dom）と対象パッケージinstallは完全分離** — Environment cacheは対象パッケージのtarballを一切含まず、対象パッケージのinstallはcacheのhit/missに関わらず毎回実行する。`environment/cache.ts`と`package/artifact-cache.ts`は独立モジュール・独立cache keyとする（spec.md Section 9 Hard rule）。
4. **fixtureのpackage.jsonにnext/react/react-domを書かない** — テンプレートとして扱い、Matrix値はEnvironment builderが実行時に注入する（spec.md Section 8, 14）。
5. **exact versionのみcache対象、range指定は常にcache miss** — 正しさを速さより優先する（spec.md Section 5.2, 9, 21）。
6. **exit codeは0/1/2のみ** — failureType（infra/test）はCLI表示とResult aggregatorの内部データに留め、exit codeを細分化しない（spec.md Section 11）。
7. **compat.ymlのtests[].runはサニタイズしない** — 信頼できる設定ファイルのみ実行する前提をREADMEに明記する（spec.md Section 17）。

## 3. Project structure

凡例: ✅ = Phase 1 で作成済み / 無印 = 後続Phaseで作成

```text
mise.toml                       # ✅ bun / node のversion pin
package.json                    # ✅ name: compatkit, bin: { compat: ./dist/cli.js }
bun.lock                        # ✅ commitする
tsconfig.json                   # ✅ 型チェック用（noEmit, types: ["bun"]）
tsconfig.build.json             # ✅ 公開ビルド用（rootDir: src → outDir: dist, types: ["node"]）
biome.json                      # ✅ lint + format
README.md                       # ✅ prepack前提とセキュリティ警告を明記（spec.md Section 7, 17）

src/
├── cli.ts                      # ✅ entrypoint, command parsing
├── config/
│   ├── loader.ts                # YAML parse
│   ├── schema.ts                # zod等によるschema定義
│   └── validator.ts             # duplicate name検出, exact/range判定
├── matrix/
│   ├── types.ts
│   └── planner.ts                # Matrix定義 → 実行単位への変換
├── package/
│   ├── packager.ts               # npm pack wrapper
│   └── artifact-cache.ts         # 将来のtarball再利用（独立cache key）
├── environment/
│   ├── manager.ts                # environment key生成, cache lookup
│   ├── builder.ts                # fixture materialization, package.json生成
│   └── cache.ts                  # 独立cache key（対象パッケージを含まない）
├── execution/
│   ├── executor.ts                # shell command実行（child_process, shell: true）
│   ├── matrix-runner.ts           # sequential matrix loop（将来parallel化）
│   └── process.ts
├── result/
│   ├── types.ts                   # failureType: "infra" | "test"
│   ├── aggregator.ts
│   └── formatter.ts               # CLI text output（将来JSON output）
├── errors.ts                       # ✅ exit code定数（0/1/2）とCompatError階層
└── version.ts                      # ✅ CLIが報告するversion（package.jsonと同期）

compat-fixture/                     # ユーザー提供の最小Next.jsアプリ（テンプレート）
compat.yml                          # ユーザー提供の設定
```

依存境界（重要）:

- `environment/cache.ts` は `package/artifact-cache.ts` を import しない。逆も同様。
- `execution/matrix-runner.ts` は installer 呼び出しを environment cache の hit/miss 分岐の**外側**に置く（Section 2-3の不変条件を構造的に保証するため）。

## 4. Execution flow（spec.md Section 6, 20対応）

```text
compat.yml
   │
   ▼
Config Loader/Validator ── exact/range判定
   │
   ▼
Matrix Planner ── 実行単位 + unique id 生成
   │
   ▼
Matrix Runner（sequential, concurrency=1 デフォルト）
   │
   ├─▶ Packager: npm pack（prepackでbuild）
   │
   ├─▶ Environment Manager
   │      ├─ cache lookup（next/react/react-domのみ, exact versionのみ）
   │      └─ miss時: fixture materialization → package.json生成 → npm install
   │
   ├─▶ Installer: packed tarball install
   │      npm install ./pkg.tgz --no-save --legacy-peer-deps
   │      （cache hit/missに関わらず毎回実行）
   │
   ├─▶ Executor: tests[]を順次実行、失敗時は残りskip
   │
   └─▶ 結果をResult Aggregatorへ集約 → 一時環境cleanup
   │
   ▼
Result Formatter（CLI出力） → exit code決定
```

## 5. Key design decisions

### 5.1 Package artifact strategy（spec.md Section 7）
`npm pack`のみ使用。ビルド制御は持たない。将来のartifact cacheはsource fingerprintベースで独立実装する。

### 5.2 Temporary environment（spec.md Section 8）
OS temp directory配下（`/tmp/compat/<run-id>/`等）にfixtureをmaterializeし、Matrix値を注入したpackage.jsonを生成する。`--keep-temp`で保持可能。

### 5.3 Caching（spec.md Section 9, 21）
Layer分離: package-manager cache → Matrix dependency environment → artifact(.tgz) → test/build cache。MVPでは全layerの完全実装は必須ではないが、後付けしやすいinterfaceを最初から用意する（`environment/cache.ts`, `package/artifact-cache.ts`を独立moduleとして先に用意）。

### 5.4 Parallel execution（spec.md Section 10）
MVPは`concurrency: 1`固定でsequential実行。`matrix-runner.ts`と`process.ts`を分離し、将来Promise.all等でparallel化できる形にする。

### 5.5 Node.js version（spec.md Section 16）
MVPではNode version matrixを持たず、CLI実行中のNode.jsをそのまま使う。将来`node`フィールド追加を見据え、environment keyにNode versionを含められる設計にしておく。

### 5.6 Package manager（spec.md Section 15）
MVPはnpmのみ。将来pnpm/yarn/bun対応を見据え、installer/packagerをpackage manager抽象の背後に置く（ただしMVPで抽象化しすぎない — YAGNI）。

## 6. Testing strategy（spec.mdのSection 10 Integration testsに対応）

1. config parsing / invalid config / duplicate name
2. package packing
3. temp environment lifecycle
4. install（peer dependency解決がpinned versionを壊さないこと）
5. command runner success/failure
6. Matrix aggregation
7. final exit code
8. end-to-end using fixture

単体テストは各moduleごとに配置し、E2Eはfixtureを使った実際の`compat test`実行で検証する。

## 7. Open questions

### 解決済み（Phase 1で確定）

- **公開ビルドの生成方法 → `tsc`**（`tsconfig.build.json`, `rootDir: src` / `outDir: dist`）。
  バンドラ固有の挙動差を持ち込まずNode互換出力が予測可能で、型チェックと同一ツールで完結するため。
  `bun build --target=node` は単一ファイル化の利点があるが、Bunへの結合点が増え、
  「エンドユーザーにBunを要求しない」（1.1）の検証が間接的になるため見送った。
  ビルド用tsconfigは `types: ["node"]` としてBunの型を持ち込まず、Bun専用APIへの依存を型レベルで防ぐ。
- **Node.js互換性の検証方法 → ビルド成果物をNodeで実行する**。
  `verify:node` script（`node dist/cli.js test`）を `bun run check` の最後に置き、
  `mise.toml` でpinしたNode 24で実行する。さらに `npm pack` → repo外での install → `npx compat test`
  までを手動検証手順とする（tasks.md Phase 1 のDefinition of Done）。
- **CLI引数パーサー → commander@15**。依存ゼロで `--help` / `--version` を自動生成でき、
  サブコマンド `test` を素直に表現できる。CLI表面が小さいためyargsは過剰と判断した。
  **注意点**: commanderは引数エラーを exit code 1 で終了させるが、spec.md Section 11 はCLI errorに 2 を
  要求する。`exitOverride()` で終了を奪い、`CommanderError.code` を見て
  `--help` / `--version` は 0、それ以外は 2 にマップしている（`src/cli.ts`）。
- **lint/format → Biome 2**（tasks.md Phase 1 の選択肢より）。1ツール・1設定で完結する。

### 実装時に判明した制約（Phase 1・後続Phaseも従うこと）

- **`tsconfig.build.json` には `rootDir: "src"` の明示が必須**。TypeScript 7 は rootDir 未指定を
  エラー（TS5011）にする。未指定だと出力が `dist/src/` になり `bin` のパスと食い違う。
- **相対importは `.js` 拡張子付きで書く**（例: `import { ... } from "./errors.js"`、実体は `.ts`）。
  `module: nodenext` の要求であり、Bun / tsc の双方が解決できる。
  **Phase 2以降もこのimport規約を踏襲する。**
- **CLIのversionは `src/version.ts` の定数で保持し、`package.json` を import しない**。
  `outDir: dist` 構成では `package.json` への相対パスがビルド前後で変わり壊れやすいため。
  値は `package.json` の `version` と手動で同期させる（将来ビルド時生成に切り替え可）。
- **`package.json` に `prepack: "bun run build"` を置く**。spec.md Section 7 が対象パッケージに
  課す「ビルドは`prepack`で完結させる」規約を compat 自身も満たす（dogfooding）。

### 未解決

- YAML parserライブラリ（`yaml` / js-yaml等）とschema validationライブラリ（zod等）の選定（Phase 2）
