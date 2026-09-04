#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { CompatError, EXIT_CONFIG, EXIT_OK, type ExitCode } from "./errors.js";
import { VERSION } from "./version.js";

/**
 * commander が「正常終了」の合図として投げるエラーコード。
 * `--help` / `--version` はエラーではないので exit 0 に落とす。
 */
const SUCCESSFUL_COMMANDER_CODES: ReadonlySet<string> = new Set([
  "commander.help",
  "commander.helpDisplayed",
  "commander.version",
]);

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("compat")
    .description("Local compatibility test runner for framework-targeting packages")
    .version(VERSION)
    // commander は引数エラーを exit code 1 で終了させるが、spec.md Section 11 は
    // CLI error に 2 を要求する。プロセス終了を奪い、run() でマップし直す。
    .exitOverride();

  program
    .command("test")
    .description("Run the compatibility matrix defined in compat.yml")
    .exitOverride()
    .action(() => {
      // Phase 1 は project bootstrap のみ。実行本体は Phase 2 以降で実装する。
      process.stdout.write(`compat v${VERSION}\n`);
      process.stdout.write("compat test is not implemented yet (Phase 1: project bootstrap).\n");
    });

  return program;
}

/**
 * CLI を実行し exit code を返す。プロセスを直接終了させないので、
 * テストからも同じ経路を検証できる。
 */
export async function run(argv: readonly string[]): Promise<ExitCode> {
  const program = buildProgram();

  // コマンド未指定は使用方法の誤り。commander は `--help` と同じエラーコードを
  // 使うため区別できない。ここで先に処理して曖昧さをなくす。
  if (argv.length === 0) {
    program.outputHelp({ error: true });
    return EXIT_CONFIG;
  }

  try {
    await program.parseAsync([...argv], { from: "user" });
    return EXIT_OK;
  } catch (error) {
    if (error instanceof CommanderError) {
      return SUCCESSFUL_COMMANDER_CODES.has(error.code) ? EXIT_OK : EXIT_CONFIG;
    }
    if (error instanceof CompatError) {
      process.stderr.write(`Error: ${error.message}\n`);
      return error.exitCode;
    }
    throw error;
  }
}

// process.exit() ではなく exitCode を設定し、stdout を確実に flush させる。
process.exitCode = await run(process.argv.slice(2));
