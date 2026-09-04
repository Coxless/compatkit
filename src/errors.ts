/**
 * exit code とエラー型の定義。
 *
 * spec.md Section 11 / plan.md Section 2 の不変条件6 により、compat が返す
 * exit code は 0 / 1 / 2 の3種類のみ。失敗の内訳（infra / test）は CLI 出力の
 * ラベルと Result aggregator の内部データに留め、exit code は細分化しない。
 */

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_CONFIG = 2;

/** compat が返しうる exit code。この3値以外を増やしてはならない。 */
export type ExitCode = typeof EXIT_OK | typeof EXIT_FAILED | typeof EXIT_CONFIG;

/** compat が意図的に送出するエラーの基底クラス。 */
export class CompatError extends Error {
  readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

/**
 * 設定ファイルまたは CLI 引数の誤り。exit code は常に 2。
 * spec.md Section 18 のエラー文言はこのクラス経由で報告する。
 */
export class ConfigError extends CompatError {
  constructor(message: string) {
    super(message, EXIT_CONFIG);
  }
}
