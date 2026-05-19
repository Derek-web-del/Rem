# XAMPP MySQL on Windows (“shutdown unexpectedly”, `ECONNREFUSED`, `ECONNRESET`)

LenLearn cannot fix the MySQL **server** from this repo. If XAMPP shows **MySQL shutdown unexpectedly** a few seconds after Start, fix MySQL first; then `npm run mysql:ping` and `npm run migrate` will work.

## 1. Read the real error (always do this first)

1. Stop MySQL in XAMPP (if it is trying to run).
2. Open **`C:\xampp\mysql\data\mysql_error.log`** in a text editor (path may differ if XAMPP is not on `C:\xampp`).
3. Scroll to the **bottom**; the last lines after a failed start tell you the cause (port bind failure, InnoDB error, permission denied, etc.).

Keep that snippet when asking for help on forums.

## 2. Log shows `Server socket created on IP: '::'` and clients get `ECONNREFUSED` on `127.0.0.1`

MariaDB is listening on the **IPv6** wildcard (`::`). On some Windows setups **nothing listens on IPv4 `127.0.0.1:3306`**, so Node, `mysql:ping`, and `127.0.0.1` tests fail even though MySQL “started”.

**Fix (recommended for local dev):**

1. Stop MySQL in XAMPP.
2. Open **`C:\xampp\mysql\bin\my.ini`** (XAMPP: **MySQL → Config → my.ini**).
3. Under **`[mysqld]`**, add or change:

   ```ini
   bind-address=127.0.0.1
   ```

   (For a machine-wide dev server you may use `0.0.0.0` instead; only on trusted networks.)

4. Save, start MySQL again.
5. Confirm:

   ```text
   C:\xampp\mysql\bin\mysql.exe -h 127.0.0.1 -P 3306 -u root -e "SELECT VERSION();"
   ```

**Alternative without `my.ini`:** In LenLearn `.env`, set **`MYSQL_HOST=::1`** (IPv6 loopback) so the client matches the socket. Prefer fixing `bind-address` if you want the usual `127.0.0.1` everywhere.

### 2b. Still see `ECONNRESET` during `npm run migrate` after bind-address works

1. **Create the database** — LenLearn `npm run migrate` runs `ensure-mysql-database.mjs` first so `MYSQL_DATABASE` (e.g. `lenlearn`) exists. You can run it alone: `node scripts/ensure-mysql-database.mjs`.

2. **Use IPv4 in `.env`** — set **`MYSQL_HOST=127.0.0.1`** (not `localhost`) so the client matches `bind-address=127.0.0.1`.

3. **Raise InnoDB buffer pool** (XAMPP default **16M** is very small). In `my.ini` under `[mysqld]` add or increase:

   ```ini
   innodb_buffer_pool_size=256M
   ```

   Restart MySQL.

4. **Read the log after “Server socket created”** — if `mysqld` crashes during the migrate query, the next lines in `mysql_error.log` will show `[ERROR]` (e.g. InnoDB, permissions, antivirus).

5. **Try Node 22 LTS** if you use Node 24 and problems persist (`mysql2` + Windows + MariaDB can be sensitive across Node majors).

## 3. Port 3306 already in use

Another MySQL/MariaDB, Docker, or an old `mysqld` process may own the port.

**PowerShell:**

```powershell
Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue | Format-Table -AutoSize
```

If something else is listening:

- Stop the other service (Services → “MySQL”, Docker container, etc.), **or**
- Change XAMPP MySQL port: **MySQL → Config → my.ini** → under `[mysqld]` set `port=3307` (example), save, restart MySQL, and set **`MYSQL_PORT=3307`** in LenLearn `.env`.

## 4. Corrupted InnoDB / redo log (very common after bad shutdown)

**Back up** `C:\xampp\mysql\data\` (zip the folder) before changing anything.

Typical log phrases: `InnoDB`, `log sequence`, `corrupt`, `tablespace`.

**Lower-risk attempt (only if logs point at redo logs):**

1. Stop MySQL in XAMPP.
2. In `data\`, delete only **`ib_logfile0`** and **`ib_logfile1`** (not `ibdata1` unless a guide for your exact error says so).
3. Start MySQL again.

If it still crashes, search the **exact** last 20 lines of `mysql_error.log` for your XAMPP/MariaDB version.

## 5. Broken or partial `mysql\data` directory

If the data directory was copied from another PC, mixed versions, or antivirus locked files during an update:

- Reinstall XAMPP’s MySQL component **or** replace `data` with a clean tree from the same XAMPP version’s `mysql\backup` flow (see Apache Friends documentation). **You will lose local DBs** unless you export SQL first from phpMyAdmin when MySQL can still start.

## 6. Visual C++ runtime

MariaDB in XAMPP needs the **Microsoft Visual C++ Redistributable (x64)**. Install the latest supported “VC++” package from Microsoft, reboot, try MySQL again.

## 7. Antivirus / Controlled folder access

Exclude **`C:\xampp\mysql\data`** (and optionally the whole `C:\xampp\mysql`) from real-time scanning. Windows “Controlled folder access” can block `mysqld` from writing logs or tables.

## 8. After MySQL stays “Running” (green)

1. Test from a terminal:

   ```text
   C:\xampp\mysql\bin\mysql.exe -h 127.0.0.1 -P 3306 -u root -e "SELECT VERSION();"
   ```

2. In the LenLearn project:

   ```text
   npm run mysql:ping
   npm run migrate
   ```

If `mysql:ping` works but migrate shows **`ECONNRESET`**, ensure `.env` uses a **loopback** host (`127.0.0.1` or `localhost`) so the app defaults to `ssl: false`, or set `MYSQL_SSL=false` for non-loopback hosts.

## 9. MySQL goes red / “stopped” right after you run `npm run dev` (PowerShell)

**LenLearn does not run any command to shut down XAMPP MySQL.** `npm run dev` only starts Node (auth API + Vite). If MySQL was green and then fails, the **MySQL process crashed or exited on its own**—often triggered by the **first real client traffic** (LenLearn opening a pool and running `CREATE TABLE` / `SELECT` on startup), but the **fix is always in XAMPP** (config, data directory, port, antivirus), not in “stopping Node.”

### Steps (do in order)

1. **Confirm timing** — In XAMPP, note whether MySQL turns red **before** or **after** the terminal prints `[dev] Auth API will use port …`. If it is **before**, something else stopped it; if **after**, treat it as “crash on first app connection” and continue.

2. **Read the crash reason** — Open **`C:\xampp\mysql\data\mysql_error.log`** (path may differ). Scroll to the **last `[ERROR]` block** after the failure. That line names the real cause (InnoDB, port bind, permissions, etc.). Keep those lines when asking for help.

3. **Stability test without LenLearn** — Start MySQL in XAMPP, wait **30–60 seconds**, then in a **second** PowerShell window run:
   ```powershell
   cd C:\xampp\htdocs\LenLearn
   npm run mysql:ping
   ```
   If MySQL dies **here** too, the problem is XAMPP/MySQL alone, not Vite.

4. **Isolate LenLearn** — With MySQL green, set **`LMS_USE_MYSQL=false`** in `.env` (keep other vars if you like), save, run **`npm run dev`**. If MySQL **stays** green, the crash is tied to **LMS traffic**; still fix XAMPP using the log (often **InnoDB buffer too small**, **bind-address**, or **antivirus** on `mysql\data` — see sections 2, 4, 7 above).

5. **Reconnect Workbench** — After a crash, Workbench tabs show errors until you **restart MySQL** in XAMPP and **reconnect** the session.

### Optional: delay heavy LMS until MySQL is warm

Start XAMPP MySQL, wait until it has been green for **a minute**, then run `npm run dev`. Some Windows setups are less flaky with a short delay after `mysqld` starts.

## 10. MySQL Workbench: Error **1175**, Error **2013**, “Tables could not be fetched”

These are **Workbench / connection** issues, not LenLearn application bugs.

### Error 1175 — “Safe update mode” (DELETE blocked)

Workbench enables **SQL_SAFE_UPDATES** so broad `DELETE`/`UPDATE` queries are blocked unless the `WHERE` clause satisfies the safe‑update rules. A `DELETE` with `id = 1 OR title LIKE ...` often triggers **1175**.

**Fix A:** In the same SQL tab, run `SET SESSION sql_safe_updates = 0;` then your narrow `DELETE`/`UPDATE`, then `SET SESSION sql_safe_updates = 1;` (only for that session). Or temporarily disable safe updates in **Edit → Preferences → SQL Editor** (see Fix B).

**Fix B:** **Edit → Preferences → SQL Editor** → uncheck **“Safe Updates”** → **OK** → disconnect and connect again. Re‑enable later if you want.

### Error 2013 — “Lost connection to MySQL server during query”

The client lost the TCP connection to MariaDB while a query (often a large metadata query) was running. Typical causes: **MySQL restarted or crashed**, **timeouts**, **firewall/antivirus**, or **Workbench read timeout** too low.

**Steps:**

1. XAMPP: confirm **MySQL is green**. If red, read **`mysql_error.log`** (§1) and fix the server first.
2. Workbench: **Database → Reconnect to Server**, or close the SQL tab and reconnect from the home screen.
3. Navigator: **Refresh** on **Schemas**; right‑click **`lenlearn_db` → Refresh All**.
4. **Edit → Preferences → SQL Editor** → increase **“DBMS connection read time out (in seconds)”** (e.g. **600**) → **OK** → reconnect.

### “Tables could not be fetched” under `lenlearn_db`

Usually a **follow‑on** from **2013** or a bad session: Workbench could not load `information_schema` metadata. Fix **2013** first (steps above). Also try host **127.0.0.1** instead of **`localhost`** (§2). If Workbench still fails, use **phpMyAdmin** (`http://localhost/phpmyadmin`) to verify tables while you stabilize XAMPP.

## 11. Entire `lenlearn_db` shows “could not be fetched” (tables, views, everything)

LenLearn does **not** remove your database when this happens. Workbench’s **Navigator** is failing to download metadata from **MariaDB** (timeouts, dropped connections, or Workbench/MariaDB quirks). Your tables may still be there.

### A) Prove the database is OK (2 minutes)

1. XAMPP → **MySQL = green**.
2. Workbench → **close all SQL tabs** → **click your home connection** → open a **new** SQL tab (or **Database → Reconnect to Server**).
3. **File → Open SQL Script** → run **`scripts/sql/lenlearn_db_smoke_test.sql`** from this repo (or paste `USE lenlearn_db; SHOW TABLES;` and execute).

If **`SHOW TABLES`** lists `app_state`, `curriculum`, etc., the DB is fine — only the **left tree** is broken until Workbench/XAMPP are adjusted below.

### B) Stop the connection dropping (fixes most “could not be fetched”)

1. **Workbench timeouts** — **Edit → Preferences → SQL Editor**:
   - Set **DBMS connection read time out** to **600** (or higher).
   - Set **DBMS connection timeout interval** higher if present.
   - Click **OK**, then **disconnect and reconnect** the connection.

2. **MariaDB timeouts (XAMPP)** — Stop MySQL in XAMPP. Edit **`C:\xampp\mysql\bin\my.ini`** (or **MySQL → Config → my.ini**). Under **`[mysqld]`**, add or increase (merge with existing lines; do not duplicate keys):

   ```ini
   max_allowed_packet=64M
   net_read_timeout=120
   net_write_timeout=120
   wait_timeout=28800
   interactive_timeout=28800
   ```

   Save, start **MySQL** again, reconnect Workbench, **Refresh** Schemas.

3. **Host name** — In your Workbench **stored connection**, set **Hostname** to **`127.0.0.1`** (not `localhost`) and port **3306** (see §2).

4. **Antivirus** — Exclude **`C:\xampp\mysql\data`** from real-time scan (§7).

### C) If the Navigator still refuses to load

Use one of these while you keep XAMPP stable; they do not rely on the broken tree:

- **SQL tab only:** `USE lenlearn_db;` then `SHOW TABLES;` / your queries.
- **phpMyAdmin:** `http://localhost/phpmyadmin` → select **`lenlearn_db`**.
- **Command line:**

  ```text
  C:\xampp\mysql\bin\mysql.exe -h 127.0.0.1 -P 3306 -u root -e "SHOW TABLES FROM lenlearn_db;"
  ```

### D) Last resort (Workbench UI only)

- **Help → Check for Updates** (newer Workbench builds handle MariaDB metadata better).
- Or install **DBeaver** (free) and connect to the same **`127.0.0.1:3306`** — use it for browsing `lenlearn_db` if Workbench’s tree never recovers.

## 12. Clicking / checking **`lenlearn_db` in the Navigator stops XAMPP MySQL** (Error **2013** on “Error loading schema content”)

When you **tick or expand** `lenlearn_db`, MySQL Workbench runs **many metadata queries** (`information_schema`, engine status, etc.). If **MariaDB crashes or hangs** while answering, the TCP connection drops → Workbench shows **2013 Lost connection** and XAMPP MySQL may turn **red**. That is almost always a **MariaDB / data / resource** issue triggered by that load, not LenLearn “shutting down” MySQL.

### Do this first (30 seconds)

1. Start MySQL in XAMPP again.
2. Open **`C:\xampp\mysql\data\mysql_error.log`** (path may differ if XAMPP is not on `C:\xampp`).
3. Scroll to the **timestamp** right when MySQL stopped. Copy the last **20–40 lines** — they name the real cause (InnoDB, tablespace, out of memory, antivirus, etc.).

### Workaround so you can keep working (today)

1. In Workbench **do not** check or expand **`lenlearn_db`** in the left tree (avoid “Error loading schema content” for that schema).
2. Open a **SQL tab** only and run:

   ```sql
   USE lenlearn_db;
   SHOW TABLES;
   ```

   Or run **`scripts/sql/lenlearn_db_smoke_test.sql`** (light version; no `SHOW TABLE STATUS`).

3. Edit your stored connection (**Database → Manage Connections → your XAMPP connection**): clear **“Default Schema”** if it was set to **`lenlearn_db`**, so connecting does not auto-load that schema into the tree.

4. Use **phpMyAdmin** (`http://localhost/phpmyadmin`) or **`C:\xampp\mysql\bin\mysql.exe`** for browsing if Workbench’s tree always kills the server.

### Common fixes (after you read the log)

| If the log suggests… | Action |
| --- | --- |
| **InnoDB / tablespace / corruption** for a table under `lenlearn_db` | From a SQL tab (after stable connect): `CHECK TABLE app_state;` then other tables. Back up with **`mysqldump`** when the server stays up; repair or recreate tables per MariaDB docs for that error. |
| **Out of memory** / **buffer pool** | In **`my.ini`** under `[mysqld]`, set **`innodb_buffer_pool_size=256M`** (or **512M** if RAM allows). Restart MySQL. |
| **Antivirus** locking `.ibd` files | Exclude **`C:\xampp\mysql\data`** (§7). |
| **Huge `app_state` JSON** | Run **`scripts/sql/lenlearn_db_check_app_state_size.sql`**. If **`json_mb`** is very large, trim old data in the institute dashboard or export/archive; giant JSON increases load on every heavy client. |

### One-line check from PowerShell (no Workbench tree)

```powershell
& "C:\xampp\mysql\bin\mysql.exe" -h 127.0.0.1 -P 3306 -u root -e "SHOW TABLES FROM lenlearn_db;"
```

If this **also** makes XAMPP MySQL stop, the problem is **server/data**, not Workbench alone — use **`mysql_error.log`** as above.
