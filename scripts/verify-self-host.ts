import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";

import { envContractViolations, languageRuleViolations } from "./language-rules";
import { generatePassword, withCredentials } from "./neon-bootstrap";
import { bootstrapSelfHost } from "./self-host-bootstrap";
import { SEED_BRAND_EMAIL, SEED_DEMO_PASSWORD, SEED_STOREFRONT_SLUG } from "./seed";
import { startThrowawayDb } from "./with-throwaway-db";

/**
 * Recorded self-host path. Follows the same commands as SELF-HOST.md
 * (bootstrap → migrate → seed → next start) against a throwaway PG17
 * cluster so CI proves the path without Docker, Neon, Vercel, or secrets
 * in git.
 *
 * Accepts:
 *   GET /api/health → { ok: true }
 *   sign-in with a seed account
 *   GET /c/{seed-slug} is a live storefront
 */

const ROOT = path.resolve(__dirname, "..");

function fail(msg: string): never {
  console.error(`verify-self-host FAIL: ${msg}`);
  process.exit(1);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (address && typeof address === "object") {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("no port")));
      }
    });
    srv.on("error", reject);
  });
}

function runPnpm(args: string[], env: NodeJS.ProcessEnv): void {
  execFileSync("pnpm", args, {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });
}

function cookieHeader(setCookie: string[]): string {
  const parts: string[] = [];
  for (const raw of setCookie) {
    const first = raw.split(";")[0];
    if (first) parts.push(first.trim());
  }
  return parts.join("; ");
}

async function waitForHealth(origin: string, child: ChildProcess, timeoutMs: number): Promise<void> {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null) {
      fail(`next start exited ${child.exitCode} before becoming ready`);
    }
    try {
      const res = await fetch(`${origin}/api/health`, { cache: "no-store" });
      last = await res.text();
      if (res.ok && last.includes('"ok":true')) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  fail(`/api/health did not become ready within ${timeoutMs}ms (last: ${last.slice(0, 200)})`);
}

async function main(): Promise<void> {
  const lang = languageRuleViolations();
  if (lang.length) fail(`language rules:\n  ${lang.join("\n  ")}`);
  const envShape = envContractViolations();
  if (envShape.length) fail(`env contract:\n  ${envShape.join("\n  ")}`);
  console.log("language rules + env contract: ok");

  if (!existsSync(path.join(ROOT, ".next"))) {
    console.log("no .next — running pnpm build (SELF-HOST.md step)");
    runPnpm(["build"], process.env);
  }

  const ownerPassword = generatePassword();
  const appPassword = generatePassword();
  const authPassword = generatePassword();
  const authSecret = generatePassword() + generatePassword();

  const handle = await startThrowawayDb();
  let child: ChildProcess | undefined;
  try {
    process.env.SPECTACLE_OWNER_PASSWORD = ownerPassword;
    process.env.APP_USER_PASSWORD = appPassword;
    process.env.AUTH_USER_PASSWORD = authPassword;

    console.log("self-host:bootstrap (idempotent on an already-provisioned cluster)");
    const urls = await bootstrapSelfHost(handle.db.superuserUrl);

    const base = `postgres://unused@127.0.0.1:${handle.db.port}/spectacle`;
    const expectedApp = withCredentials(base, "app_user", appPassword);
    if (urls.app_user !== expectedApp) {
      fail("bootstrap did not return the app_user URL for the generated password");
    }

    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: urls.app_user,
      DATABASE_URL_OWNER: urls.spectacle_owner,
      AUTH_DATABASE_URL: urls.auth_user,
      BETTER_AUTH_SECRET: authSecret,
      FEATURE_BROWSE: "false",
      PLATFORM_FEE_BPS: "1000",
    };

    console.log("migrate");
    runPnpm(["migrate"], childEnv);
    console.log("seed");
    runPnpm(["seed"], childEnv);

    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    childEnv.BETTER_AUTH_URL = origin;
    childEnv.PORT = String(port);

    // `pnpm start` is the documented command. Next reads PORT from the env
    // (passing `-H` after `pnpm start --` is treated as a project directory).
    console.log(`pnpm start (PORT=${port})`);
    child = spawn("pnpm", ["start"], {
      cwd: ROOT,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let stderr = "";
    let stdout = "";
    child.stderr?.on("data", (buf: Buffer) => {
      stderr += buf.toString();
    });
    child.stdout?.on("data", (buf: Buffer) => {
      stdout += buf.toString();
    });

    try {
      await waitForHealth(origin, child, 60_000);
    } catch (err) {
      console.error("next start stdout:\n", stdout.slice(-1500));
      console.error("next start stderr:\n", stderr.slice(-1500));
      throw err;
    }
    console.log("GET /api/health → { ok: true }");

    const storefront = await fetch(`${origin}/c/${SEED_STOREFRONT_SLUG}`, { cache: "no-store" });
    const storefrontHtml = await storefront.text();
    if (!storefront.ok) {
      fail(`GET /c/${SEED_STOREFRONT_SLUG} → ${storefront.status}`);
    }
    if (!storefrontHtml.includes("Lumen Arc")) {
      fail(`GET /c/${SEED_STOREFRONT_SLUG} did not render the seeded storefront`);
    }
    console.log(`GET /c/${SEED_STOREFRONT_SLUG} → Lumen Arc`);

    const signIn = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({
        email: SEED_BRAND_EMAIL,
        password: SEED_DEMO_PASSWORD,
      }),
      redirect: "manual",
    });
    const signInBody = await signIn.text();
    if (!signIn.ok) {
      fail(`sign-in → ${signIn.status} ${signInBody.slice(0, 400)}`);
    }
    const setCookie = signIn.headers.getSetCookie?.() ?? [];
    if (setCookie.length === 0) {
      fail(`sign-in returned ${signIn.status} but no Set-Cookie`);
    }
    const cookie = cookieHeader(setCookie);

    const dashboard = await fetch(`${origin}/dashboard`, {
      headers: { Cookie: cookie, Origin: origin },
      redirect: "manual",
      cache: "no-store",
    });
    const dashHtml = await dashboard.text();
    if (dashboard.status >= 300 && dashboard.status < 400) {
      fail(`signed-in GET /dashboard redirected (${dashboard.status}) — session cookie not accepted`);
    }
    if (!dashboard.ok) {
      fail(`signed-in GET /dashboard → ${dashboard.status}`);
    }
    if (!dashHtml.includes("Brand dashboard") || !dashHtml.includes("Aurora summer launch facade")) {
      fail("signed-in dashboard did not render the seeded brand booking");
    }
    console.log(`signed in as ${SEED_BRAND_EMAIL} → /dashboard shows seeded booking`);

    if (stderr.toLowerCase().includes("uncaught") || stderr.toLowerCase().includes("fatal")) {
      fail(`next start stderr looked fatal:\n${stderr.slice(-800)}`);
    }

    console.log("verify-self-host PASS");
  } finally {
    if (child?.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        try {
          child.kill("SIGTERM");
        } catch {
          /* already gone */
        }
      }
    }
    await handle.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
