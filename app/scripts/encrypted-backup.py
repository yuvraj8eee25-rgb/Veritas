#!/usr/bin/env python3
"""Stream the Veritas application database directly into an age-encrypted archive."""
import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from urllib.parse import parse_qs, unquote, urlsplit

MAX_BYTES = 20 * 1024 * 1024
PROJECT = "wwfcydtkftrrraxgadbz"


def connection_environment(url, allow_local=False):
    connection = urlsplit(url)
    if connection.scheme not in ("postgres", "postgresql"):
        raise ValueError("Expected a PostgreSQL connection URL.")
    host = connection.hostname or ""
    user = unquote(connection.username or "")
    local = allow_local and host in ("127.0.0.1", "localhost", "::1")
    direct = host == f"db.{PROJECT}.supabase.co" and user == "postgres"
    pooler = host.endswith(".pooler.supabase.com") and user == f"postgres.{PROJECT}"
    if not local and not (direct or pooler):
        raise ValueError("Use this project's direct or session-pooler database URL.")
    if pooler and connection.port != 5432:
        raise ValueError("Use session mode on port 5432, not transaction pooling.")
    if not connection.password or not connection.path.strip("/"):
        raise ValueError("The connection must include a password and database name.")
    query = parse_qs(connection.query)
    if set(query) - {"sslmode"}:
        raise ValueError("Only sslmode is accepted as a connection URL option.")
    if not local and query.get("sslmode", ["require"])[0] not in ("require", "verify-ca", "verify-full"):
        raise ValueError("TLS is required for hosted database backups.")
    # Keep the credential out of process arguments and error output.
    env = {k: v for k, v in os.environ.items() if not k.startswith("PG") and k != "VERITAS_BACKUP_DB_URL"}
    env.update(PGHOST=host, PGPORT=str(connection.port or 5432), PGUSER=user,
               PGPASSWORD=unquote(connection.password), PGDATABASE=unquote(connection.path[1:]),
               PGSSLMODE="disable" if local else query.get("sslmode", ["require"])[0],
               PGCONNECT_TIMEOUT="15", PGAPPNAME="veritas-encrypted-backup",
               PGOPTIONS="-c statement_timeout=300000", PGPASSFILE=os.devnull)
    return env


def backup(output, recipient, env, pg_dump="pg_dump", age="age"):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    dump = cipher = None
    created = False
    try:
        with output.open("xb") as encrypted, tempfile.TemporaryFile() as errors:
            created = True
            os.chmod(output, 0o600)
            dump = subprocess.Popen([pg_dump, "--format=custom", "--compress=6", "--no-owner",
                                     "--strict-names", "--schema=public", "--schema=auth",
                                     "--schema=storage", "--lock-wait-timeout=10000"],
                                    env=env, stdout=subprocess.PIPE, stderr=errors)
            cipher = subprocess.Popen([age, "--encrypt", "--recipient", recipient],
                                      stdin=dump.stdout, stdout=subprocess.PIPE, stderr=errors,
                                      env={k: v for k, v in os.environ.items() if k != "VERITAS_BACKUP_DB_URL"})
            dump.stdout.close()
            total = 0
            while chunk := cipher.stdout.read(65536):
                total += len(chunk)
                if total > MAX_BYTES:
                    raise RuntimeError("Encrypted backup exceeded the 20 MiB free-storage safety limit.")
                encrypted.write(chunk)
            cipher.stdout.close()
            cipher_status, dump_status = cipher.wait(), dump.wait()
            if cipher_status or dump_status or total < 100:
                raise RuntimeError("Database export or encryption failed; no backup was saved. Check the connection and client versions privately.")
        digest = hashlib.sha256(output.read_bytes()).hexdigest()
        output.with_suffix(output.suffix + ".sha256").write_text(f"{digest}  {output.name}\n")
        print(f"Encrypted application-schema backup saved ({total} bytes).")
    except BaseException:
        for process in (cipher, dump):
            if process is not None and process.poll() is None:
                process.kill()
                process.wait()
        if created:
            output.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    parser.add_argument("--recipient", required=True)
    parser.add_argument("--allow-local", action="store_true", help="Allow an isolated loopback test database.")
    args = parser.parse_args()
    try:
        env = connection_environment(os.environ.get("VERITAS_BACKUP_DB_URL", ""), args.allow_local)
        backup(args.output, args.recipient, env,
               os.environ.get("VERITAS_PG_DUMP_BIN", "pg_dump"), os.environ.get("VERITAS_AGE_BIN", "age"))
    except (ValueError, RuntimeError, OSError):
        # Never echo a connection string or raw libpq diagnostics in public Actions logs.
        print("::error::Encrypted backup failed. Check connection, TLS, client versions and the 20 MiB size limit. No partial archive was retained.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
