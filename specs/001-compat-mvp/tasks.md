> **SDD artifact: tasks.md** — 実行可能なタスク分解。要求仕様は[spec.md](./spec.md)、設計は[plan.md](./plan.md)を参照。各PhaseのDefinition of Doneはspec.md Section 23（Acceptance Criteria）の該当項目に対応する。

# compat — Implementation Tasks

進め方: Phaseは上から順に実施する。各Phase開始前にPlan Modeで設計差分を確認し、完了時にDefinition of Doneをチェックする。

---

## Phase 1: Project bootstrap

- [ ] `bun init`相当でproject初期化（name: `compat`のnpm registry上の空き状況を確認）
- [ ] TypeScript設定（tsconfig, ビルド方式）
- [ ] `bun install`で依存管理（`bun.lock`をcommit）
- [ ] CLI entrypoint（`bin`フィールド, shebang）
- [ ] CLI引数パーサー導入（commander/yargs等の選定、Bun互換性確認含む）
- [ ] `bun test`によるtest実行のセットアップ
- [ ] 公開ビルドパイプライン（`tsc`または`bun build --target=node`でNode.js互換JSを生成し`npx compat test`が動くことを確認 — plan.md 1.1参照）
- [ ] lint/format/typecheckのセットアップ（eslint, prettier or biome）

**Definition of Done**: `npx compat test`相当のコマンドが（未実装のno-opでも）実行できる状態。

---

## Phase 2: Config

- [ ] YAML parserの導入
- [ ] `config/schema.ts`: matrix / tests / execution のschema定義
- [ ] `config/loader.ts`: `compat.yml`読み込み、`--config`オプション対応
- [ ] `config/validator.ts`: duplicate name検出（matrix name / test name）
- [ ] `config/validator.ts`: exact version / range 判定ロジック（`^`, `~`, `>`, `<`, `x`等のoperator検出）
- [ ] エラーメッセージのフォーマット（spec.md Section 18の文言例に準拠）
- [ ] example config（`compat.yml`サンプル）の作成

**Definition of Done**: spec.md Section 23 Configuration の全項目。

---

## Phase 3: Fixture

- [ ] 最小Next.js fixture作成（`compat-fixture/app`, `next.config.ts`）
- [ ] fixtureの`package.json`にnext/react/react-domを含めないことを確認
- [ ] 対象パッケージをimportできる最小構成
- [ ] `next build`が実行できる構成の確認

**Definition of Done**: spec.md Section 23 Environment のfixture関連項目。

---

## Phase 4: Package artifact

- [ ] `package/packager.ts`: `npm pack`実行ラッパー
- [ ] tarball path discovery
- [ ] packing失敗時のエラーハンドリング（`prepack`失敗を含む）
- [ ] 一時packaging成果物のcleanup

**Definition of Done**: spec.md Section 23 Packaging の全項目。

---

## Phase 5: Temporary environment

- [ ] OS temp directory配下に一時runディレクトリ生成（`/tmp/compat/<run-id>/`相当、random identifier使用）
- [ ] fixture materialization（copy）
- [ ] `environment/builder.ts`: Matrix値（next/react/react-dom）と対象パッケージの`file:`参照をfixtureテンプレートへ注入したpackage.json生成
- [ ] dependency install（`npm install`）
- [ ] packed package install（`npm install ./pkg.tgz --no-save --legacy-peer-deps`、cache hit/missに関わらず毎回実行）
- [ ] peer dependency範囲違反時のwarning表示（installを失敗させない）
- [ ] cleanup（通常時は削除、`--keep-temp`時は保持しpathを表示）

**Definition of Done**: spec.md Section 23 Environment / Execution の該当項目（特に「current projectのnode_modules/lockfileを変更しない」「peer dependency解決がpinned versionを上書きしない」）。

---

## Phase 6: Test runner

- [ ] `execution/executor.ts`: shell command実行（`child_process`, `shell: true`）
- [ ] stdout/stderr streaming
- [ ] exit code取得
- [ ] duration計測
- [ ] test失敗時、同一Matrix内の残りtestをskip
- [ ] `failureType: "infra" | "test"` のラベリング

**Definition of Done**: spec.md Section 23 Execution の該当項目。

---

## Phase 7: Matrix runner

- [ ] `matrix/planner.ts`: Matrix定義 → 実行単位変換、unique identifier生成
- [ ] `execution/matrix-runner.ts`: sequential Matrix実行（concurrency: 1固定）
- [ ] 1つのMatrixが失敗しても他Matrixを継続
- [ ] `result/aggregator.ts`: Matrix/test結果集計
- [ ] final exit code判定（0/1/2）

**Definition of Done**: spec.md Section 23 Execution / Results の該当項目、exit code仕様（Section 11）。

---

## Phase 8: Performance foundation

- [ ] package-manager cache（npm標準cache）の活用確認
- [ ] `environment/cache.ts`: environment key生成（exact versionのみ対象）
- [ ] `environment/cache.ts`と`package/artifact-cache.ts`が独立module・独立cache keyであることを確認（**Hard rule: 対象パッケージのtarballを含まない**）
- [ ] artifact cache interfaceの用意（実装は簡易local filesystemで可）
- [ ] environment cache interfaceの用意

**Definition of Done**: spec.md Section 23 Performance の全項目（architectureとして追加可能であること）。

---

## Phase 9: CLI UX

- [ ] `result/formatter.ts`: summary出力（Section 13の出力例に準拠、failureTypeラベル表示含む）
- [ ] エラーメッセージの可読性（Section 18準拠）
- [ ] `--verbose`
- [ ] `--keep-temp`
- [ ] （Nice to have）`--matrix <name>` / `--test <name>`

**Definition of Done**: spec.md Section 23 Developer Experience の全項目。

---

## Phase 10: Integration tests

- [ ] config parsing test
- [ ] invalid config test
- [ ] duplicate name test（matrix / test 両方）
- [ ] package packing test
- [ ] temp environment lifecycle test
- [ ] install test（peer dependency解決がpinned versionを壊さないことの検証）
- [ ] command runner success test
- [ ] command runner failure test
- [ ] Matrix aggregation test
- [ ] final exit code test
- [ ] end-to-end test using fixture（実際に`compat test`をfixtureに対して実行）

**Definition of Done**: spec.md Section 23の全チェックリスト項目がテストでカバーされている。

---

## Out of scope（このtasks.mdでは着手しない）

spec.md Section 4「Explicitly Out of Scope」およびSection 27「Non-goals Summary」を参照。特に以下はPhase 1-10のいずれでも実装しない。

- Matrix自動生成、バージョン自動検出
- Docker必須設計
- Web UI / GitHub API依存
- 複数fixture管理、monorepo全体管理
- 対象パッケージのビルド実行（`prepack`任せ）
- Node.js version matrixの完全対応
- 複数package managerの同時first-class対応
