/**
 * CLI が報告するバージョン。package.json の `version` と一致させること。
 *
 * package.json を直接 import しないのは、`outDir: dist` の構成では
 * ビルド後の相対パスが変わり Node/Bun 双方で壊れやすいため。
 */
export const VERSION = "0.1.0";
