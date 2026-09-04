import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { VERSION } from "./version.js";

const CLI_PATH = fileURLToPath(new URL("./cli.ts", import.meta.url));

async function runCli(args: string[]) {
  const proc = Bun.spawn([process.execPath, CLI_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("compat CLI", () => {
  test("`compat test` succeeds with a no-op placeholder", async () => {
    const { stdout, exitCode } = await runCli(["test"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("not implemented yet");
  });

  test("`--version` prints the version and exits 0", async () => {
    const { stdout, exitCode } = await runCli(["--version"]);

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(VERSION);
  });

  test("`--help` exits 0 and documents the test command", async () => {
    const { stdout, exitCode } = await runCli(["--help"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("compat");
    expect(stdout).toContain("test");
  });

  // spec.md Section 11: configuration / CLI error は exit code 2。
  // commander の既定（1）に引きずられていないことを固定する。
  test("an unknown command exits 2", async () => {
    const { stderr, exitCode } = await runCli(["bogus"]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("bogus");
  });

  test("an unknown option exits 2", async () => {
    const { exitCode } = await runCli(["test", "--nope"]);

    expect(exitCode).toBe(2);
  });

  test("no command prints help to stderr and exits 2", async () => {
    const { stderr, exitCode } = await runCli([]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("Usage:");
  });
});
