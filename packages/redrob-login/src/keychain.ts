import { spawn } from "node:child_process";

import { NotAvailableError } from "./errors.js";

/**
 * Refresh tokens live in the OS keychain, under service `ai.redrob.login` and account = client id,
 * the same slot the Rust `redrob-login` crate uses.
 *
 * Redrob Cowork has no keychain code of its own today (its Console key lives in Redrob Code's
 * auth store, which Cowork can write but never read back), so this talks to each OS's own keychain
 * tool instead of adding a native module:
 *   - macOS: `security` (login keychain). The secret is written through `security -i` on stdin so
 *     it never appears on a command line.
 *   - Linux: `secret-tool` (Secret Service: GNOME Keyring / KWallet). Secret goes in on stdin.
 *   - Windows: Credential Locker (`Windows.Security.Credentials.PasswordVault`) via powershell.exe.
 *     Secret goes in on stdin.
 * A machine without the tool (a headless Linux box with no Secret Service) gets NotAvailableError,
 * so the caller falls back to its Console key path.
 */
export const KEYCHAIN_SERVICE = "ai.redrob.login";

export type TokenStore = {
  get(account: string): Promise<string | null>;
  set(account: string, secret: string): Promise<void>;
  delete(account: string): Promise<void>;
};

/** Client ids and tokens are interpolated into tool input, so both are held to a strict alphabet. */
const ACCOUNT_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SECRET_RE = /^[A-Za-z0-9._~+/=-]{1,8192}$/;

function checkAccount(account: string): void {
  if (!ACCOUNT_RE.test(account)) throw new Error(`invalid client id: ${account}`);
}

type RunResult = { code: number; stdout: string };

function run(command: string, args: string[], stdin?: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new NotAvailableError("keychain_unavailable", `${command} not found`));
      } else {
        reject(error);
      }
    });
    child.on("close", (code) => resolve({ code: code ?? -1, stdout }));
    child.stdin.end(stdin ?? "");
  });
}

function failed(action: string, code: number): Error {
  return new Error(`keychain ${action} failed (exit ${code})`);
}

const macStore: TokenStore = {
  async get(account) {
    checkAccount(account);
    const r = await run("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"]);
    if (r.code === 44) return null; // errSecItemNotFound
    if (r.code !== 0) throw failed("read", r.code);
    return r.stdout.replace(/\r?\n$/, "") || null;
  },
  async set(account, secret) {
    checkAccount(account);
    if (!SECRET_RE.test(secret)) throw new Error("refusing to store a token with unexpected characters");
    const line = `add-generic-password -U -s "${KEYCHAIN_SERVICE}" -a "${account}" -w "${secret}"\n`;
    const r = await run("security", ["-i"], line);
    if (r.code !== 0) throw failed("write", r.code);
  },
  async delete(account) {
    checkAccount(account);
    const r = await run("security", ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account]);
    if (r.code !== 0 && r.code !== 44) throw failed("delete", r.code);
  },
};

const linuxStore: TokenStore = {
  async get(account) {
    checkAccount(account);
    const r = await run("secret-tool", ["lookup", "service", KEYCHAIN_SERVICE, "account", account]);
    if (r.code === 1 && !r.stdout) return null;
    if (r.code !== 0) throw failed("read", r.code);
    return r.stdout.replace(/\r?\n$/, "") || null;
  },
  async set(account, secret) {
    checkAccount(account);
    const r = await run(
      "secret-tool",
      ["store", `--label=Redrob login (${account})`, "service", KEYCHAIN_SERVICE, "account", account],
      secret,
    );
    if (r.code !== 0) throw new NotAvailableError("keychain_unavailable", `secret-tool store exit ${r.code}`);
  },
  async delete(account) {
    checkAccount(account);
    const r = await run("secret-tool", ["clear", "service", KEYCHAIN_SERVICE, "account", account]);
    if (r.code !== 0 && r.code !== 1) throw failed("delete", r.code);
  },
};

const VAULT = [
  "$ErrorActionPreference='Stop'",
  "[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]",
  "$v=New-Object Windows.Security.Credentials.PasswordVault",
].join(";");

function powershell(script: string, stdin?: string): Promise<RunResult> {
  return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `${VAULT};${script}`], stdin);
}

const windowsStore: TokenStore = {
  async get(account) {
    checkAccount(account);
    const r = await powershell(
      `try{$c=$v.Retrieve('${KEYCHAIN_SERVICE}','${account}')}catch{exit 3};$c.RetrievePassword();[Console]::Out.Write($c.Password)`,
    );
    if (r.code === 3) return null;
    if (r.code !== 0) throw failed("read", r.code);
    return r.stdout.trim() || null;
  },
  async set(account, secret) {
    checkAccount(account);
    const r = await powershell(
      `$s=[Console]::In.ReadToEnd();try{$v.Remove($v.Retrieve('${KEYCHAIN_SERVICE}','${account}'))}catch{};` +
        `$v.Add((New-Object Windows.Security.Credentials.PasswordCredential('${KEYCHAIN_SERVICE}','${account}',$s)))`,
      secret,
    );
    if (r.code !== 0) throw failed("write", r.code);
  },
  async delete(account) {
    checkAccount(account);
    const r = await powershell(`try{$v.Remove($v.Retrieve('${KEYCHAIN_SERVICE}','${account}'))}catch{}`);
    if (r.code !== 0) throw failed("delete", r.code);
  },
};

export function osKeychain(): TokenStore {
  switch (process.platform) {
    case "darwin":
      return macStore;
    case "win32":
      return windowsStore;
    case "linux":
      return linuxStore;
    default:
      throw new NotAvailableError("keychain_unavailable", `no keychain support on ${process.platform}`);
  }
}
