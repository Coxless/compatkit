> **SDD artifact: plan.md** — `compat` MVPの技術設計。要求仕様は[spec.md](./spec.md)、実行タスクは[tasks.md](./tasks.md)を参照。本ドキュメントの節番号はspec.mdの節番号と対応させている。

# compat — Technical Plan

## 1. Technical Context

| 項目 | 選択 |
|---|---|
| Language | TypeScript |
| Runtime | Node.js（CLI実行中のNode.jsをそのまま利用。Section 16参照） |
| Package manager (MVP) | npm のみ first-class support（Section 15） |
| Config format | YAML（`compat.yml`） |
| Target framework (MVP) | Next.js のみ |
| Distribution | `npx compat test` として実行できるexecutable CLI |
| Test framework | 未確定。Phase 1で選定（Vitest等、CLI/Node向けで高速なもの） |

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

```text
src/
├── cli.ts                      # entrypoint, command parsing
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
└── errors.ts

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

## 7. Open questions（実装中に確定させる）

- テストフレームワークの選定（Phase 1）
- YAML parserライブラリ（js-yaml等）とschema validationライブラリ（zod等）の選定（Phase 2）
- CLI引数パーサー（commander / yargs等）の選定（Phase 1）
