import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { applyMigrations } from "./migrate";

/**
 * Ephemeral local Postgres cluster: initdb + pg_ctl into a temp datadir — no
 * docker daemon needed (docker-compose.yml is there for devs who prefer a
 * long-lived one). Used by verify-gates and the status-machine tests so every
 * gate runs against real migrations on a real cluster, then vanishes.
 *
 * Prefer 17 — the major Neon runs. A gate suite on a different major than
 * production can green on behaviour prod does not have, so 16 is only a
 * fallback for a machine that has nothing newer.
 *
 * trust auth, loopback only, random free port. The initdb superuser runs
 * bootstrap-roles.sql (mirroring the privileged one-time step on Neon, which
 * scripts/neon-bootstrap.ts performs as the project's default role), the app
 * database is owned by spectacle_owner, and the journaled chain applies via
 * scripts/migrate.ts — the same path production uses.
 */

const PG_BIN =
  process.env.PGBIN ??
  ["/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin"].find((p) =>
    existsSync(path.join(p, "initdb")),
  ) ??
  "";

export type ThrowawayDb = {
  port: number;
  superuserUrl: string;
  ownerUrl: string;
  appUrl: string;
  authUrl: string;
  psql: (dbUrl: string, sqlText: string) => string;
};

function bin(name: string): string {
  if (!PG_BIN) throw new Error("No Postgres binaries found; set PGBIN");
  return path.join(PG_BIN, name);
}

/**
 * initdb/pg_ctl refuse to run as root (e.g. CI containers, remote dev boxes);
 * when we are root, delegate the server-side binaries to the unprivileged
 * `postgres` OS user via setpriv. Client access stays TCP as the SQL roles.
 */
const RUN_AS_PG_USER = typeof process.getuid === "function" && process.getuid() === 0;

function execServerBin(name: string, args: string[]): void {
  if (RUN_AS_PG_USER) {
    execFileSync(
      "setpriv",
      ["--reuid=postgres", "--regid=postgres", "--clear-groups", bin(name), ...args],
      { stdio: "pipe" },
    );
  } else {
    execFileSync(bin(name), args, { stdio: "pipe" });
  }
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

function runPsql(url: string, args: string[]): string {
  return execFileSync(bin("psql"), ["-X", "-v", "ON_ERROR_STOP=1", "-d", url, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export type ThrowawayHandle = { db: ThrowawayDb; stop: () => Promise<void> };

export async function startThrowawayDb(): Promise<ThrowawayHandle> {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "spectacle-pg-"));
  const logFile = path.join(dataDir, "pg.log");
  let started = false;
  try {
    if (RUN_AS_PG_USER) {
      execFileSync("chown", ["-R", "postgres:postgres", dataDir], { stdio: "pipe" });
    }
    execServerBin("initdb", [
      "-D",
      dataDir,
      "-U",
      "postgres",
      "-A",
      "trust",
      "--no-sync",
    ]);
    const port = await freePort();
    execServerBin("pg_ctl", [
      "-D",
      dataDir,
      "-w",
      "-l",
      logFile,
      "-o",
      `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories='${dataDir}' -F`,
      "start",
    ]);
    started = true;

    const base = `postgres://postgres@127.0.0.1:${port}`;
    // Roles are cluster-level; REVOKE TEMPORARY applies per-database, so the
    // bootstrap file runs again against the app DB after it exists — exactly
    // the documented Neon sequence.
    runPsql(`${base}/postgres`, ["-f", "scripts/bootstrap-roles.sql"]);
    runPsql(`${base}/postgres`, [
      "-c",
      "CREATE DATABASE spectacle OWNER spectacle_owner",
    ]);
    runPsql(`${base}/spectacle`, ["-f", "scripts/bootstrap-roles.sql"]);

    const db: ThrowawayDb = {
      port,
      superuserUrl: `${base}/spectacle`,
      ownerUrl: `postgres://spectacle_owner@127.0.0.1:${port}/spectacle`,
      appUrl: `postgres://app_user@127.0.0.1:${port}/spectacle`,
      authUrl: `postgres://auth_user@127.0.0.1:${port}/spectacle`,
      psql: (dbUrl, sqlText) => runPsql(dbUrl, ["-c", sqlText]),
    };

    await applyMigrations(db.ownerUrl);
    return {
      db,
      stop: async () => {
        try {
          execServerBin("pg_ctl", ["-D", dataDir, "-m", "immediate", "stop"]);
        } catch {
          /* already down */
        }
        rmSync(dataDir, { recursive: true, force: true });
      },
    };
  } catch (err) {
    if (started) {
      try {
        execServerBin("pg_ctl", ["-D", dataDir, "-m", "immediate", "stop"]);
      } catch {
        /* already down */
      }
    }
    rmSync(dataDir, { recursive: true, force: true });
    throw err;
  }
}

export async function withThrowawayDb<T>(
  fn: (db: ThrowawayDb) => Promise<T>,
): Promise<T> {
  const handle = await startThrowawayDb();
  try {
    return await fn(handle.db);
  } finally {
    await handle.stop();
  }
}
