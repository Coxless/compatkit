> **SDD artifact: spec.md** — 本ドキュメントは`compat` MVPの要求仕様（what/why）。設計は[plan.md](./plan.md)、実行タスクは[tasks.md](./tasks.md)を参照。

# compat — MVP Concept

## 1. Product Overview

### Project name

仮称: `compat`

（Next.js専用ツールを想起させる名称を避け、将来的に他フレームワークへ拡張可能な汎用名とする。MVPのスコープはNext.jsに限定する。）

### One-line concept

> **現在のNext.jsプロジェクトを壊さず、YAMLで定義したNext.js / Reactの互換性Matrixを、一時環境で高速にテストするCLI。**

### Target user

主な対象は、Next.js向けNPMパッケージ／ライブラリの作者。

典型的な課題:

- Next.jsの複数メジャーバージョンをサポートしたい
- Reactの組み合わせも含めて検証したい
- `next@14`, `next@15`, `next@16` のような環境をローカルで試したい
- しかしNext.jsごとに検証用アプリを複製・管理したくない
- 現在の開発環境の`node_modules`やlockfileを壊したくない
- CIだけではなく、手元でも高速に互換性テストしたい

### Core UX

```bash
npx compat test
```

ユーザーが用意するものは、原則として以下だけ。

```text
my-package/
├── src/
├── compat-fixture/       # 1つだけ
├── package.json
└── compat.yml            # Matrixとテスト定義
```

`compat`がMatrixごとに一時的な依存環境を作り、現在のパッケージをpublish相当のtarballとしてinstallしてテストする。

> **Note:** プロジェクト固有の`tests/`ディレクトリ等は`compat`の実行フローと無関係。`compat`はfixture環境内でYAMLに定義されたcommandを実行するのみで、プロジェクト直下の既存テストを直接参照・実行する機構はMVPでは持たない。

---

## 2. Problem Statement

### Existing approaches

現在の互換性テストは、主に以下の方法で行われる。

#### A. GitHub Actions Matrix

```yaml
matrix:
  next: [14, 15, 16]
```

CI上で複数環境を作る方法。CIには適しているが、ローカルでは設定や待ち時間が大きくなりやすい。

#### B. package.jsonを書き換える

```bash
npm install next@14
npm test
npm install next@15
npm test
```

現在の開発環境を直接変更するため、lockfileや`node_modules`が変化し、開発環境を元に戻す手間が生じる。

#### C. Next.jsごとにexample/fixtureを作る

```text
examples/
├── next14/
├── next15/
└── next16/
```

再現性は高いが、Next.jsごとにアプリ・package.json・lockfileを管理する必要がある。

### Problem

本当に欲しいのは、

> **「複数のNext.js環境を管理すること」ではなく、「同じライブラリを複数のNext.js環境で検証すること」**

である。

`compat`は、環境そのものをユーザーに複数管理させるのではなく、**YAMLでテストマトリクスを宣言し、その環境をCLI側で一時的に生成する**。

---

## 3. Product Positioning

`compat`は、単なる「Next.jsバージョン切り替えツール」ではない。

### Core value

> **Local compatibility test runner for framework-targeting packages（MVPではNext.jsに特化）**

価値は次の4点。

1. **No project mutation** — ユーザーの現在の依存環境を直接変更しない
2. **One fixture** — Next.jsバージョンごとのアプリ複製が不要
3. **Explicit matrix** — テスト対象をYAMLで明示できる
4. **Fast repeat runs** — dependency/environment cacheで2回目以降を高速化する

### Differentiation

既存アプローチは大きく、

- dependency update testing
- CI matrix testing
- 複数fixtureの手動管理

に分かれる。

`compat`は、これらの間にある

> **「現在のプロジェクトを汚さず、ローカルで複数のNext.jsバージョンを素早く検証する」**

というUXに集中する。

---

## 4. MVP Goals

### Must Have

1. 現在のNPMパッケージプロジェクトから実行できる
2. `compat.yml`を読み込める
3. YAMLで複数のMatrix combinationを定義できる
4. Next.js / React / React DOMのバージョンをMatrixごとに指定できる
5. 1つの共通Next.js fixture applicationを使える
6. 現在のNPM packageを`npm pack`相当でtarball化できる（**compat自身はビルドを実行しない**。ビルドはユーザーの`prepack` scriptに委譲する。詳細はSection 7参照）
7. Matrixごとに独立した一時依存環境を構築できる
8. tarball化したNPM packageをtemporary environmentへinstallできる（peer dependency解決順序についてはSection 19 Installer参照）
9. YAMLで指定したtest commandをMatrixごとに実行できる
10. Matrix結果をCLIで表示できる
11. いずれかのMatrixが失敗した場合、exit code `1`を返す
12. configuration/CLI errorはexit code `2`を返す
13. 一時環境を自動cleanupする
14. 現在のプロジェクトの`package.json` / lockfile / `node_modules`を直接変更しない

### Performance-related Must Have

MVPでは速度を重要な要件として扱う。

1. package managerのcacheを利用する
2. 同じMatrixのenvironmentを可能な範囲で再利用できる設計にする（ただし対象パッケージのinstallは常に再実行する。Section 9参照）
3. 不要なnetwork downloadを避ける
4. Matrix実行部分を将来parallelizeできる設計にする
5. warm runを初回runより明確に高速化できるcache設計を持つ

MVP実装では、cache機構そのものの完全実装が難しい場合でも、**cacheを後付けしやすいarchitectureを最初から採用する**。

### Nice to Have

- Matrix並列実行
- dependency/environment cache
- `--matrix <name>`
- `--test <name>`
- `--verbose`
- `--keep-temp`
- JSON output

### Explicitly Out of Scope

MVPでは以下を実装しない。

- package.jsonからのMatrix自動生成
- Next.js対応バージョンの自動検出
- React/Next.js互換性ルールの自動解析
- npm registry metadataからの自動Matrix生成
- Docker必須設計
- Web UI
- GitHub API依存
- GitHub Actions専用機能
- 複数fixture applicationのユーザー管理
- monorepo全体管理
- snapshot/VRT専用機能
- Next.js以外のframework対応
- Node.js version切り替えの完全自動化
- package managerの複数実装
- 対象パッケージのビルド実行（`prepack`任せ。Section 7参照）
- プロジェクト固有の`tests/`ディレクトリとの連携

---

## 5. Configuration Design

設定ファイル:

```text
compat.yml
```

MVPでは、**Matrix combinationとtest commandを明示的に管理する**。

### 5.1 Example

```yaml
matrix:
  - name: next14-react18
    next: "14.2.0"
    react: "18.3.1"
    react-dom: "18.3.1"

  - name: next15-react19
    next: "15.5.0"
    react: "19.1.0"
    react-dom: "19.1.0"

  - name: next16-react19
    next: "16.0.0"
    react: "19.2.0"
    react-dom: "19.2.0"

tests:
  - name: build
    run: npm run build

  - name: unit
    run: npm test

  - name: e2e
    run: npm run test:e2e

execution:
  concurrency: 1
```

### 5.2 Matrix schema

```yaml
matrix:
  - name: string
    next: string
    react: string
    react-dom: string
```

Fields:

- `name`: 必須。一意のMatrix識別子。
- `next`: 必須。Next.jsのversion/range。MVPでは文字列としてpackage managerへ渡す。
- `react`: 必須。Reactのversion/range。
- `react-dom`: 必須。React DOMのversion/range。

MVPでは依存関係の妥当性を自動判定しない。ユーザーが有効な組み合わせを定義する。

**Version指定とcache鮮度の関係:**

- `^`, `~`, `>`, `<`, `x` 等のrange operatorを含まない**exact version**が指定された場合のみ、Environment cache（Section 9）の対象とする。
- range operatorが含まれる場合は、再現性を優先し**常にcache miss扱い**とする（CLI出力に `(range specified — cache disabled)` のように明示する）。
- 再現性とパフォーマンスの両方を重視する場合、exact versionの指定を推奨する旨をREADMEに明記する。

### 5.3 Tests schema

```yaml
tests:
  - name: build
    run: npm run build

  - name: unit
    run: npm test
```

Fields:

- `name`: 必須。一意のtest識別子。
- `run`: 必須。ローカルshellで実行するcommand。一時fixture環境のディレクトリをカレントディレクトリとして実行される。

TestsはMatrixごとに実行する。

例えばMatrix 3件 × Test 3件なら、最大9 test executionになる。

### 5.4 Execution schema

```yaml
execution:
  concurrency: 1
```

MVPでは`concurrency`のdefaultを`1`とする。

将来的に、例えば:

```yaml
execution:
  concurrency: 3
```

とすることでMatrixを3並列実行できるようにする。

ただし、**並列実行はMVPの必須機能ではない**。architectureはparallel executorを導入できる形にする。

---

## 6. Core Execution Model

最重要原則:

> **現在のプロジェクトを直接書き換えず、Matrixごとの一時実行環境だけを変更する。**

### 6.1 High-level flow

```text
Current project
      │
      ├─ read compat.yml
      │
      ├─ npm pack
      │     （prepack scriptにより対象パッケージのbuildが実行される。
      │      compat自身はbuildコマンドを実行しない — Section 7参照）
      │
      ├─ load/create cached environment
      │
      ├─ create temporary execution context
      │     （fixtureテンプレートにMatrix値のnext/react/react-domを注入
      │      — Section 8, 14参照）
      │
      ├─ install target dependencies
      │     （next/react/react-domをexact versionで先にinstall）
      │
      ├─ install packed NPM package
      │     （--no-save --legacy-peer-deps で既存のpin済みバージョンを保護
      │      — Section 19 Installer参照）
      │
      ├─ run configured tests
      │
      ├─ collect result
      │
      └─ cleanup runtime-only files
```

### 6.2 Important: one fixture, not one app per version

ユーザーが管理するNext.js appは1つだけ。

```text
my-package/
├── compat-fixture/
│   ├── app/
│   ├── public/
│   ├── package.json
│   └── ...
```

Next.js versionはfixtureごとに固定しない。

`compat`がMatrixに応じて、temporary environment内のNext.js / React / React DOMをinstallする。

これにより:

```text
❌ examples/next14/
❌ examples/next15/
❌ examples/next16/

✅ compat-fixture/  # 1つ
```

となる。

---

## 7. Package Artifact Strategy

### Principle

互換性テストでは、開発ツリーそのものではなく、**実際にpublishされるpackageに近いartifactをテストする**。

MVPでは`npm pack`を利用する。

```bash
npm pack
```

出力例:

```text
my-package-1.0.0.tgz
```

そのtarballをtemporary environmentへinstallする。

```bash
npm install ./my-package-1.0.0.tgz
```

### Build responsibility（重要）

`compat`自身はビルドコマンドを実行しない。ビルド成果物（`dist/`等）が最新であることは、npmの標準lifecycle hookである`prepack` scriptに委ねる。

```json
{
  "scripts": {
    "prepack": "npm run build"
  }
}
```

`npm pack`は実行時に`prepack`を自動的に呼び出すため、対象パッケージがこのscriptを正しく定義していれば、`compat`側で追加のビルド制御を実装する必要はない。

- READMEに「`prepack`でbuildが完結するように`package.json`を構成してください」という前提条件を明記する。
- `compat`はビルド成果物の有無や鮮度を検証しない（Non-goals）。

### Why packed artifact

これにより、以下を含めてpublish物の検証に近づけられる。

- build output
- `files` field
- `.npmignore`
- package metadata
- exported files

### Artifact caching

同一sourceから同一artifactを何度も作らないため、将来的にはsource fingerprintを利用する。

概念:

```text
source/package metadata
        ↓
 fingerprint
        ↓
 artifact cache
   ├─ hit  → reuse tarball
   └─ miss → npm pack
```

MVPでは必須ではないが、packaging layerを独立moduleにして実装する。

---

## 8. Temporary Environment Design

### Principle

Matrixごとに依存環境を分離する。

```text
cache/
├── env-next14-react18-<hash>/
├── env-next15-react19-<hash>/
└── env-next16-react19-<hash>/
```

runtime中には:

```text
node_modules/
.next/
package.json
fixture source
```

などが存在する。

### Fixture template and injected dependencies（重要）

`compat-fixture/package.json`は、**next/react/react-domの依存バージョンを一切記載しない「テンプレート」**として扱う。

- Fixtureのpackage.jsonにこれらのフィールドを記載してはいけない（記載してもMatrix値によって上書きされるため、記載自体がユーザーに誤解を与える）。
- Environment builder（Section 19）が、temporary environment生成時にMatrixの値（`next`, `react`, `react-dom`）と、対象パッケージのtarball参照（`file:`protocol）をこのテンプレートへ注入し、実行時のみ有効な`package.json`を生成する。
- 対象パッケージへの依存は次の形式で注入する:

```json
{
  "dependencies": {
    "my-package": "file:../artifact/my-package-1.0.0.tgz"
  }
}
```

### User project must remain untouched

以下は直接変更しない。

```text
current-project/node_modules
current-project/package-lock.json
current-project/pnpm-lock.yaml
current-project/yarn.lock
```

### Temp directory

MVPのruntime用temporary directoryはOSのtemporary directory配下を利用する。

例:

```text
/tmp/compat/<run-id>/
```

WindowsではOSのtemporary directory mechanismを利用する。

### Cleanup

通常終了時:

```text
remove runtime temporary files
```

`--keep-temp`指定時やdebug用途では保持可能とする。

cleanupできなかった場合はpathを表示する。

---

## 9. Dependency and Environment Caching

### Performance goal

このプロダクトでは、**毎回ゼロから`npm install`する設計を避ける**ことを重要視する。

### Cache layers

将来的に以下のcacheを分離する。

```text
Layer 1: Package-manager cache
    ↓
Layer 2: Matrix dependency environment
    ↓
Layer 3: Package artifact (.tgz)
    ↓
Layer 4: Test/build cache where framework safely permits
```

### Hard rule: environment cacheとartifact installの分離（重要）

正しさを保証するため、以下を設計上の不変条件とする。

1. **Environment cache（Layer 2）は`next`/`react`/`react-dom`の依存関係のみを対象とし、対象パッケージ（tarball）を一切含まない。**
2. **対象パッケージのinstall（Layer 3）は、Environment cacheのhit/missに関わらず毎回必ず実行する。**

この2点により、「warm runで古いソースコードのまま検証してしまう」というcache起因の誤判定を構造的に防ぐ。実装上も`environment/cache.ts`と`package/artifact-cache.ts`を完全に独立したモジュール・独立したcache keyとし、artifact installのコードパスがenvironment cacheのlookup結果によって分岐しないようにする。

### Package-manager cache

MVPではnpmを利用し、npmの既存cacheを活用する。

将来的にpnpmを第一級サポートする場合は、pnpm storeの共有も利用する。

### Matrix environment cache

例えば:

```text
next14 + react18 + react-dom18
```

の依存environmentが過去に作成済みなら、可能な範囲で再利用する。

Cache keyには少なくとも以下を考慮する。

```text
package manager
Next.js version（exact versionのみ。range指定は常にmiss扱い — Section 5.2参照）
React version
React DOM version
Node version (when supported)
lock/dependency state
```

### Important cache rule

cacheは**正しさより速さを優先して壊すものではない**。

依存関係を再利用できないと判断した場合は、安全側に倒して再構築する。

---

## 10. Parallel Execution Strategy

### MVP default

```yaml
execution:
  concurrency: 1
```

順次実行をdefaultにする。

理由:

- CPU/メモリ消費を抑える
- 初期実装を単純化できる
- ログが読みやすい
- environment cacheとの競合を減らせる

### Future

```yaml
execution:
  concurrency: 3
```

例えば:

```text
Next 14 ────────┐
Next 15 ────────┼──→ parallel
Next 16 ────────┘
```

Architecture上は、Matrix runnerとProcess executorを分離し、parallelismを後から追加できるようにする。

---

## 11. Test Execution Semantics

### Test order

YAMLの`tests`に記載された順番で実行する。

```yaml
tests:
  - name: build
    run: npm run build
  - name: unit
    run: npm test
```

### Failure behavior

1つのtestが失敗したら、そのMatrixの残りのtestはMVPではskipする。

ただし他のMatrixは続行する。

例:

```text
[next14-react18]
  build  ✓
  unit   ✓
  e2e    ✓

[next15-react19]
  build  ✗
  unit   skipped
  e2e    skipped

[next16-react19]
  build  ✓
  unit   ✓
  e2e    ✓
```

### Exit code

```text
0 = 全Matrix成功
1 = 1つ以上のMatrix/testが失敗
2 = configuration / CLI error
```

### Failure category labeling（重要）

MVPではexit codeの種類を増やさず0/1/2のままとする（CI連携のシンプルさを優先）。ただし、失敗の原因を利用者が区別できるよう、CLI出力上でカテゴリを明示する。

- `environment setup failed` のようなinfrastructure起因の失敗は `(infra)` ラベルを付与
- `build`/`unit`等のtest command失敗は `(test)` ラベルを付与

いずれもexit codeは`1`のまま変わらないが、Result aggregatorの内部データ構造には`failureType: "infra" | "test"`を保持し、将来的にexit codeの細分化やCIでのretry制御を追加しやすい形にしておく。

---

## 12. CLI Design

### Main command

```bash
npx compat test
```

### Config

```bash
compat test --config compat.yml
```

default:

```text
./compat.yml
```

### Matrix filter

Nice to Have:

```bash
compat test --matrix next15-react19
```

### Test filter

Nice to Have:

```bash
compat test --test build
```

### Verbose

```bash
compat test --verbose
```

### Keep temp

```bash
compat test --keep-temp
```

これは失敗時の調査に使う。

---

## 13. Result UX

### Goal

結果は、**どのNext.js環境で何が壊れたのかを一目で確認できる**こと。

例:

```text
compat v0.1.0

Configuration: compat.yml
Matrix: 3
Tests: 3

[next14-react18]
  ✓ build   4.8s
  ✓ unit    1.1s
  ✓ e2e     5.2s

[next15-react19]
  ✓ build   5.3s
  ✓ unit    1.0s
  ✓ e2e     5.0s

[next16-react19]
  ✗ build   5.7s   (test)

  Error:
  ...

Summary
-------
Passed: 2
Failed: 1

Compatibility test failed.
```

### Cache status

高速化を実装した段階では、cache hit/missを表示できるとデバッグしやすい。

例:

```text
[next15-react19]
  environment: cached
  package: cached

  ✓ build  1.2s
```

ただしMVPの初期版では、詳細cache表示はoptionalとする。

### Future JSON output

```bash
compat test --format json
```

CIや他ツールとの連携用に将来的に追加する。

---

## 14. Fixture Application

共通fixtureは最小構成にする。

```text
compat-fixture/
├── app/
│   ├── layout.tsx
│   └── page.tsx
├── public/
├── package.json    # next/react/react-domを含まないテンプレート — Section 8参照
└── next.config.ts
```

### Required fixture capability for MVP

最低限:

1. Next.js applicationとして起動できる
2. 対象NPM packageをimportできる
3. `next build`を実行できる

### Fixture package.json requirement（重要）

`compat-fixture/package.json`には`next`/`react`/`react-dom`のバージョンを**記載してはならない**。これらはEnvironment builderがMatrix値をもとにruntime生成する`package.json`へ注入する（Section 8）。Fixtureのpackage.jsonに固定バージョンを書くと、Matrix値との優先順位が曖昧になり事故の原因になる。

### Optional fixture capability

必要に応じて:

- Client Component
- Server Component
- browser E2E
- API route

を追加できる。

MVPでは「Next.jsアプリを複数作らないこと」が重要であり、fixtureの網羅性より簡潔さを優先する。

---

## 15. Package Manager Strategy

### MVP

**npmをfirst-class supportする。**

使用例:

```bash
npm install ...
npm pack
npm run ...
```

### Future

```text
pnpm
yarn
bun
```

を追加可能なarchitectureにする。

ただしMVPでは複数package managerを同時対応しない。

---

## 16. Node.js Version Strategy

Next.jsの互換性テストではNode.jsのversionも影響する。

ただしMVPでNode version matrixまで完全サポートすると実装が大きくなるため、**Node.js versionは原則としてCLIを実行しているNode.jsを利用する**。

将来:

```yaml
matrix:
  - name: next16-node22
    next: "16.0.0"
    react: "19.2.0"
    react-dom: "19.2.0"
    node: "22"
```

のような定義を追加できるarchitectureにする。

実装候補:

- mise
- nvm
- Volta
- Node.js binary management
- Docker

ただしMVPでは不要。

---

## 17. Security Considerations

`tests[].run`は任意のshell commandを実行する。

したがって、設定ファイルは**信頼できるプロジェクトからのみ実行する**ことを前提とする。

MVPではshell commandをサニタイズして安全化する機能は実装しない。

READMEに以下を明記する。

> `compat.yml` に定義されたコマンドはローカル環境で実行されます。信頼できない設定ファイルを実行しないでください。

Temporary pathにはrandom identifierを利用する。

---

## 18. Error Handling

### Config not found

```text
Error: compat.yml was not found.
```

### Invalid YAML

```text
Error: Invalid compat.yml
  matrix[1].next is required
```

### Duplicate matrix name

```text
Error: Duplicate matrix name: next15-react19
```

### Duplicate test name

```text
Error: Duplicate test name: build
```

### npm pack failure

```text
Error: Failed to create package tarball.
```

（`prepack`スクリプトのビルド失敗もここに含まれる。`compat`はビルドの成否を判定せず、`npm pack`自体の失敗として扱う。）

### Environment setup failure

```text
[next15-react19]
✗ environment setup   (infra)
```

### Test command failure

```text
[next15-react19]
✗ build   (test)
```

元commandのstdout/stderrを必要に応じて表示する。

---

## 19. Internal Architecture

Suggested modules:

```text
src/
├── cli.ts
├── config/
│   ├── loader.ts
│   ├── schema.ts
│   └── validator.ts
├── matrix/
│   ├── types.ts
│   └── planner.ts
├── package/
│   ├── packager.ts
│   └── artifact-cache.ts
├── environment/
│   ├── manager.ts
│   ├── builder.ts
│   └── cache.ts
├── execution/
│   ├── executor.ts
│   ├── matrix-runner.ts
│   └── process.ts
├── result/
│   ├── types.ts
│   ├── aggregator.ts
│   └── formatter.ts
└── errors.ts
```

### Config loader

責務:

- YAML parse
- schema validation
- duplicate validation
- default値適用
- Matrix版数指定がexact versionかrangeかの判定（cache適用可否の判断材料をmatrix plannerへ渡す）

### Matrix planner

責務:

- Matrix definitionを実行単位へ変換
- unique identifier生成
- execution plan作成

### Packager

責務:

- current NPM packageをpack（`npm pack`。ビルドは`prepack`任せで、compat自身はビルドコマンドを実行しない）
- tarball pathを返す
- artifact cacheを将来利用できる設計

### Environment manager

責務:

- environment key生成（exact versionのみをcache対象とする）
- cached environment lookup（**対象パッケージのtarballを一切含まない**。Section 9のHard rule参照）
- temporary runtime context生成
- fixtureテンプレートへのMatrix値（next/react/react-dom）注入によるpackage.json生成
- fixture materialization
- cleanup

### Installer

責務: 対象パッケージのinstallは、Environment cacheのhit/missに関わらず**毎回実行する**。

具体的な手順:

1. Environment（next/react/react-domがexact versionでpin済み）を`npm install`で構築、またはcacheから再利用する。
2. 対象パッケージのtarballを次のコマンドでinstallする。

   ```bash
   npm install ./my-package-1.0.0.tgz --no-save --legacy-peer-deps
   ```

   `--legacy-peer-deps`により、npmの自動peer依存解決がMatrixでpinした`next`/`react`/`react-dom`のバージョンを勝手に書き換えることを防ぐ。
3. peer dependencyの範囲違反が検出された場合でもinstallは失敗させず、CLI出力にwarningとして表示する（互換性の妥当性判定はユーザー責任という原則に一致させる）。

### Executor

責務:

- shell command実行（Node.jsの`child_process`をOSデフォルトshell経由（`shell: true`）で実行。shellの違いによる挙動差はMVPではサポート対象外とし、将来課題とする）
- stdout/stderr streaming
- exit code取得
- duration計測

### Result aggregator

責務:

- Matrix/test結果を集計
- 各失敗に`failureType: "infra" | "test"`を付与し、CLI出力でラベル表示する（Section 11参照）
- summary表示
- final exit code判定（0/1/2のみ。failureTypeはexit codeに影響しない）

---

## 20. Recommended Execution Architecture

MVPで特に重要な設計。

```text
                       compat.yml
                           │
                           ▼
                    ┌─────────────┐
                    │ Config      │
                    │ Validator   │
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │ Matrix      │
                    │ Planner     │
                    └──────┬──────┘
                           ▼
          ┌─────────────────────────────────┐
          │         Matrix Runner           │
          └───────┬─────────┬─────────┬────┘
                  ▼         ▼         ▼
              Next14     Next15     Next16
                  │         │         │
                  ▼         ▼         ▼
             Environment / Dependency Cache
             （next/react/react-domのみ。対象パッケージは含まない）
                  │         │         │
                  ▼         ▼         ▼
             install packed NPM artifact
             （cache hit/missに関わらず毎回実行）
                  │         │         │
                  ▼         ▼         ▼
                Test Executor
                  │         │         │
                  └─────────┼─────────┘
                            ▼
                     Result Aggregator
                            │
                            ▼
                         CLI output
```

Matrix runnerとenvironment managerを分離することで、将来:

- parallel execution
- cache
- remote execution
- CI integration

などを追加しやすくする。

---

## 21. Performance Strategy

### Core principle

> **Compatibility testingを毎回フル環境構築にしない。**

### Initial implementation priority

速度改善は以下の順番で実装する。

#### P0: avoid modifying current project

直接`npm install next@14`などを行わない。

#### P1: package manager cache

npmの既存cacheを利用する。

#### P2: environment reuse

同じMatrix combinationに対して、再利用可能なdependency environmentをcacheする（exact version指定時のみ）。

#### P3: artifact reuse

sourceが変化していなければ同じ`.tgz`を再利用する。

#### P4: parallel Matrix execution

複数Matrixを同時実行できるようにする。

#### P5: framework/build cache

Next.js側のcacheを安全に利用できる場合のみ再利用する。

### Cache correctness

cache keyが不十分な場合は、誤ったenvironmentを利用する危険がある。

したがって、**不確実なcache hitはmiss扱いにする**。

---

## 22. MVP Performance Target

数値を絶対的なSLAとして固定しないが、ローカル体験として以下を目標にする。

### Cold run

```text
3 Matrix程度で実用的に待てる時間に収める。
```

ネットワーク速度やPC性能に強く依存するため、具体的な秒数をMVPの合格条件にはしない。

### Warm run

同じconfiguration / dependency stateなら、cold runより明確に短くなること。

期待するUX:

```text
Cold
Next 14   installing...
Next 15   installing...
Next 16   installing...

Warm
Next 14   cached
Next 15   cached
Next 16   cached
```

---

## 23. Acceptance Criteria

### Configuration

- [ ] `compat.yml`を読み込める
- [ ] 複数Matrixを定義できる
- [ ] MatrixごとにNext.js/React/React DOMを指定できる
- [ ] 複数test commandを定義できる
- [ ] invalid configurationを明確に報告できる
- [ ] duplicate nameを検出できる
- [ ] Matrix版数指定がexact versionかrangeかを判定し、cache適用可否に反映できる

### Packaging

- [ ] current packageを`npm pack`できる（`prepack`によるbuildを前提とし、compat自身はbuildを実行しない）
- [ ] generated tarballをtest environmentでinstallできる
- [ ] package artifactをcurrent project外で利用できる

### Environment

- [ ] 1つの共通fixtureを利用できる
- [ ] fixtureのpackage.jsonにnext/react/react-domが含まれないことを前提にできる
- [ ] Matrixごとに依存環境が独立している
- [ ] current projectの`node_modules`を変更しない
- [ ] current projectのlockfileを変更しない
- [ ] temporary environmentをcleanupできる
- [ ] Environment cacheが対象パッケージのtarballを含まないことを保証できる

### Execution

- [ ] configured commandsを実行できる
- [ ] stdout/stderrを取得できる
- [ ] exit codeを取得できる
- [ ] durationを計測できる
- [ ] 1 Matrixが失敗しても他Matrixを実行できる
- [ ] failed Matrix内の後続testsをskipできる
- [ ] peer dependency解決がMatrixのpinned versionを上書きしないことを確認できる

### Results

- [ ] Matrixごとのsuccess/failureを表示できる
- [ ] testごとのsuccess/failureを表示できる
- [ ] durationを表示できる
- [ ] failure時に原因を確認できる
- [ ] infra起因の失敗とtest起因の失敗をラベルで区別できる
- [ ] final exit codeを正しく返す

### Performance

- [ ] npm cacheを利用する
- [ ] environment cacheを追加できるarchitectureになっている
- [ ] artifact cacheを追加できるarchitectureになっている
- [ ] parallel executionを後から追加できるarchitectureになっている

### Developer Experience

- [ ] `npx compat test`で実行できる
- [ ] sample projectをREADME通りに短時間で実行できる
- [ ] `--verbose`でdebug可能
- [ ] `--keep-temp`で失敗environmentを調査できる

---

## 24. Example End-to-End Scenario

ユーザーのNPM package:

```text
my-next-plugin/
```

構成:

```text
my-next-plugin/
├── src/
├── compat-fixture/
│   ├── app/
│   ├── package.json
│   └── next.config.ts
├── package.json
└── compat.yml
```

`compat.yml`:

```yaml
matrix:
  - name: next14-react18
    next: "14.2.0"
    react: "18.3.1"
    react-dom: "18.3.1"

  - name: next15-react19
    next: "15.5.0"
    react: "19.1.0"
    react-dom: "19.1.0"

  - name: next16-react19
    next: "16.0.0"
    react: "19.2.0"
    react-dom: "19.2.0"

tests:
  - name: build
    run: npm run build

  - name: unit
    run: npm test

execution:
  concurrency: 1
```

実行:

```bash
npx compat test
```

概念的な内部処理:

```text
1. load compat.yml
2. validate configuration
3. npm pack current package（prepackでbuild実行）
4. build/load Next14 environment（next/react/react-domのみ、exact version時はcache利用）
5. install packed package（--no-save --legacy-peer-deps、常に実行）
6. run build
7. run unit
8. cleanup runtime files
9. build/load Next15 environment
10. install packed package
11. run build
12. run unit
13. cleanup runtime files
14. build/load Next16 environment
15. install packed package
16. run build
17. run unit
18. cleanup runtime files
19. print summary
```

warm runでは、可能なenvironment/artifact cacheを再利用する。

---

## 25. Implementation Plan for Claude Code

Claude Codeには以下の順序で実装させる。

### Phase 1: Project bootstrap

- パッケージ名`compat`のnpm registry上の空き状況確認
- TypeScript CLI project setup
- executable entrypoint
- command parser
- test framework
- lint/format/typecheck

### Phase 2: Config

- YAML parser
- schema
- validation（exact version / range判定を含む）
- example config

### Phase 3: Fixture

- minimal Next.js fixture（package.jsonにnext/react/react-domを含めない）
- package import
- `next build`が実行できる構成

### Phase 4: Package artifact

- `npm pack`（`prepack`による事前buildを前提とし、compatはbuildを実行しない）
- tarball discovery
- cleanup
- packaging error handling

### Phase 5: Temporary environment

- OS temp directory
- fixture copy/materialization
- generated package.json（Matrix値のnext/react/react-domと対象パッケージの`file:`参照を注入）
- dependency install
- packed package install（`--no-save --legacy-peer-deps`、cache hit/missに関わらず毎回実行）

### Phase 6: Test runner

- shell command execution
- stdout/stderr
- exit code
- timing
- failure handling（infra/testのfailureTypeラベリングを含む）

### Phase 7: Matrix runner

- sequential Matrix execution
- result aggregation
- per-Matrix cleanup
- exit code

### Phase 8: Performance foundation

- package-manager cache usage
- explicit environment key abstraction（対象パッケージのtarballを含まない設計を維持）
- artifact cache interface
- environment cache interface

実装コストが高すぎる場合、最初はcache backendを単純なlocal filesystemにする。

### Phase 9: CLI UX

- summary output（failureTypeラベル表示を含む）
- readable errors
- `--verbose`
- `--keep-temp`
- optional `--matrix` / `--test`

### Phase 10: Integration tests

最低限以下を用意する。

1. config parsing test
2. invalid config test
3. duplicate name test
4. package packing test
5. temp environment lifecycle test
6. install test（peer dependency解決がpinned versionを壊さないことの検証を含む）
7. command runner success test
8. command runner failure test
9. Matrix aggregation test
10. final exit code test
11. end-to-end test using fixture

---

## 26. Future Roadmap

### v0.2

- parallel Matrix execution
- dependency/environment cache
- artifact cache
- JSON output
- pnpm support
- `--matrix`
- `--test`

### v0.3

- Node.js version matrix
- richer E2E support
- improved cache invalidation
- Docker isolation option

### v1.0

- GitHub Actions integration
- PR compatibility report
- remote cache
- automatic compatibility matrix discovery
- framework abstraction

### Potential long-term expansion

Next.js専用から、将来的に:

```text
compat test
├── Next.js
├── Nuxt
├── Vite
├── Astro
└── SvelteKit
```

などへ拡張できる可能性がある。プロダクト名を`compat`という汎用名にしているのはこの将来拡張を見据えたものだが、MVPではNext.js専用とする。

---

## 27. Non-goals Summary

MVPでやらないもの:

```text
❌ package.jsonからMatrix自動生成
❌ Next.js version自動検出
❌ React version自動検出
❌ registry metadataによる自動判定
❌ Docker必須化
❌ Web UI
❌ GitHub API依存
❌ Next.jsごとの複数fixture管理
❌ 複数package managerのfirst-class対応
❌ Node.js version matrixの完全対応
❌ 自動互換性ルール解析
❌ compat自身によるビルド実行（prepack任せ）
❌ プロジェクト固有のtests/ディレクトリとの連携
```

---

## 28. MVP Core Principle

このプロダクトの本質は、Next.jsのversion switchingそのものではない。

> **「1つのNext.js fixtureと1つのYAML設定だけで、publish相当のNPM packageを複数のNext.js / React組み合わせに対して、高速かつ安全にテストできること」**

最終的な基本UX:

```bash
npx compat test
```

設定:

```text
compat.yml
compat-fixture/
```

結果:

```text
Next.js compatibility matrix

✓ next14-react18   cached
✓ next15-react19   cached
✗ next16-react19

Result: FAILED
```

このUXをMVPの完成形とする。
