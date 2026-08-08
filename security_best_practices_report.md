# Security Audit Report — Discord Bot and ATC Web UI

**Audit date:** 2026-08-05  
**Scope:** Discord.js bot, Astro/Elysia web UI, PostgreSQL/Drizzle data layer, web-to-bot internal API, migrations, containers, CI, configuration, and Bun dependencies.  
**Method:** Source review, CodeGraph call-flow analysis, targeted sink/source searches, dependency audit, build/lint/test execution, and configuration review. Runtime testing requiring Discord, PostgreSQL, or OAuth credentials was not possible because no local `.env` files were present. No production systems were probed.

## Executive summary

> **Remediation update (2026-08-05):** SEC-001, SEC-002, SEC-003, SEC-005, SEC-006, and SEC-007 were patched after this audit. SEC-004 intentionally remains open pending deployment transport design. The original findings below are retained as the audit record.

No Critical or High severity vulnerability was confirmed. In particular, the audit found no exploitable SQL injection or XSS path in the reviewed code: database inputs are parameterized/Drizzle-bound, public resources are ownership-scoped, the browser consistently escapes attacker-controlled values before its HTML sinks, and a restrictive CSP is present.

Seven defense-in-depth and resilience findings remain: four Medium and three Low. The highest-priority work is to add explicit CSRF/origin enforcement, rate limiting, protected storage for the managed AVWX credential, and encrypted/authenticated transport for the privileged web-to-bot API. The application already has strong OAuth state binding and PKCE, hashed session tokens, fresh role-based authorization, constant-time internal API key comparison, request-size limiting on the bot internal server, transactional appeal consumption, database uniqueness constraints, and atomic moderation-action claiming.

### Finding summary

| ID | Severity | Finding |
|---|---|---|
| SEC-001 | Medium | State-changing web routes have no explicit CSRF/origin validation |
| SEC-002 | Medium | Public authentication and appeal endpoints have no application-level rate limits |
| SEC-003 | Medium | Managed API credentials are stored as plaintext in PostgreSQL |
| SEC-004 | Medium | Production internal API configuration permits plaintext HTTP for a highly privileged bearer credential |
| SEC-005 | Low | Browser responses omit several baseline hardening headers |
| SEC-006 | Low | Internal-operation errors are relayed to browser clients |
| SEC-007 | Low | Appeal uniqueness and cleanup are not fully guild-scoped at the schema level |

## Medium findings

### SEC-001 — State-changing web routes have no explicit CSRF/origin validation

- **CWE:** CWE-352 — Cross-Site Request Forgery
- **Location:** `webui/src/server/auth.ts:44-59`; `webui/src/server.ts:211-216`, `332-524`, `538-631`
- **Evidence:** The session cookie uses `HttpOnly`, `SameSite=Lax`, and production `Secure`, but state-changing POST/PUT/DELETE handlers authenticate only from the cookie. No CSRF token or `Origin`/`Sec-Fetch-Site` validation is performed.
- **Impact:** `SameSite=Lax` blocks conventional cross-site `fetch`/form attacks for most non-GET methods, so direct exploitation from an unrelated site is constrained. It does not provide an explicit application invariant and may not protect against a compromised sibling subdomain/same-site origin, future cookie-policy changes, or an accidentally introduced simple-request route. The affected operations include moderation, message sending, settings changes, appeals, and deletion.
- **Fix:** Add a single Elysia pre-handler for unsafe methods that requires an exact trusted `Origin` and rejects missing/cross-origin browser requests. For stronger protection, add a session-bound CSRF token sent in a custom header. Keep `SameSite=Lax` as defense in depth.
- **Mitigation:** Ensure the deployment does not host attacker-controlled content on sibling subdomains and keep all mutating routes on non-GET methods.
- **False-positive note:** This is defense in depth rather than a demonstrated cross-site exploit because modern browsers enforce the existing `SameSite=Lax` cookie.

### SEC-002 — Public authentication and appeal endpoints have no application-level rate limits

- **CWE:** CWE-770 — Allocation of Resources Without Limits or Throttling
- **Location:** `webui/src/server.ts:191-209`, `538-631`; `webui/src/server/database.ts:745-756`, `819-865`; `webui/src/server/domain.ts:272-274`
- **Evidence:** Every `/auth/discord/start` request generates and inserts a new OAuth state row. Appeal-window creation and captcha attempts are also unrestricted. No rate-limit implementation appears in the Elysia app. Expired-row cleanup is periodic rather than a request admission control.
- **Impact:** An unauthenticated client can create large numbers of OAuth-state rows and Discord authorization redirects. Authenticated accounts can generate appeal windows and make unlimited captcha/prepare attempts, increasing database and Discord/API load. The simple math prompt is workflow friction, not an abuse-control mechanism.
- **Fix:** Apply IP-based limits to OAuth start/callback and account/session-plus-IP limits to appeal-window, prepare, and submission endpoints. Cap outstanding OAuth states/appeal windows per principal and return `429` with `Retry-After`. Prefer a shared limiter if multiple replicas run.
- **Mitigation:** Enforce equivalent limits at the reverse proxy/edge and monitor row-creation and rejection rates.
- **False-positive note:** An external proxy may already rate-limit these routes, but no such configuration is present in this repository and must be verified in deployment.

### SEC-003 — Managed API credentials are stored as plaintext in PostgreSQL

- **CWE:** CWE-312 — Cleartext Storage of Sensitive Information
- **Location:** `webui/drizzle/0000_atc_webui.sql:78-84`; `webui/src/server/database.ts:109-131`; `src/db/schema/botSettings.ts:4-13`; `src/db/repositories/botSettings.ts:11-22,25-40`
- **Evidence:** `bot_settings.setting_value` is plain `text`; the web UI writes the AVWX key directly and the bot reads it directly. Browser responses correctly mask it, but storage is not encrypted at the application layer.
- **Impact:** A database read compromise, overly broad database account, unprotected backup, or SQL-console access reveals the third-party API credential immediately.
- **Fix:** Store managed secrets in a secret manager, or encrypt values with an authenticated cipher using a key supplied outside the database. Separate migration/administrative and runtime database privileges, and rotate the AVWX credential after migration.
- **Mitigation:** Use encrypted database volumes/backups, tightly restrict database roles and backup access, and retain the existing masked UI behavior.
- **False-positive note:** Provider-side database encryption may protect lost media but does not protect against logical database reads, so it is not equivalent to application/secret-manager protection.

### SEC-004 — Production internal API configuration permits plaintext HTTP for a privileged bearer credential

- **CWE:** CWE-319 — Cleartext Transmission of Sensitive Information
- **Location:** `webui/src/server/config.ts:31-40`; `webui/src/server/events.ts:4-31`; `src/health.ts:18-31,70-88,251-285`; `.env.example:13-20`; `webui/.env.example:12-16`
- **Evidence:** Production validates key length but accepts both `http:` and `https:` bot URLs. The web process sends the shared bearer token and privileged moderation/message operation bodies on every request. The bot listens on `0.0.0.0` by default; it additionally requires a private source address and compares the key in constant time.
- **Impact:** A process or network actor able to observe traffic on the container/private network can recover the bearer token and invoke moderation, deletion, appeal-decision, and message operations while impersonating arbitrary authorized actor IDs (the bot re-checks the supplied actor's live roles, but the stolen caller can select any known privileged member ID).
- **Fix:** Require `https:` in production, or use a Unix socket/service-mesh mTLS mechanism where applicable. Bind to the narrowest interface, isolate the service network, and support key rotation. For stronger caller binding, use short-lived signed requests or mTLS identities instead of a static bearer token.
- **Mitigation:** The existing private-address check, 32-character production minimum, constant-time comparison, 64 KiB body limit, and live role re-checks materially reduce risk; keep them.
- **False-positive note:** Plain HTTP can be acceptable inside a rigorously isolated single-host network, but that deployment guarantee is not represented or verifiable in this repository.

## Low findings

### SEC-005 — Browser responses omit several baseline hardening headers

- **CWE:** CWE-693 — Protection Mechanism Failure
- **Location:** `webui/src/server.ts:51-70,165-186`; `webui/src/server/auth.ts:44-59`
- **Evidence:** HTML/static responses include a strong CSP and JSON responses include a restrictive CSP, but the app does not set `X-Content-Type-Options: nosniff`, `Referrer-Policy`, or an explicit `Permissions-Policy`. The bot internal JSON server does set `nosniff` (`src/health.ts:45-51`).
- **Impact:** This slightly increases exposure to MIME confusion, referrer leakage, and unnecessary browser capabilities if a deployment proxy does not add equivalent headers.
- **Fix:** Add `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (or stricter), and a minimal `Permissions-Policy` to browser responses. Do not add HSTS without confirming the complete production TLS/domain strategy.
- **Mitigation:** The current CSP (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`) is a strong compensating control.
- **False-positive note:** Verify the final public response because an ingress/CDN may already add these headers.

### SEC-006 — Internal-operation errors are relayed to browser clients

- **CWE:** CWE-209 — Generation of Error Message Containing Sensitive Information
- **Location:** `src/health.ts:245-248`; `webui/src/server/events.ts:29-31`; `webui/src/server.ts:86-92,148-153,342-420,464-468`
- **Evidence:** The bot returns raw caught `Error.message` values from internal operations; the web server forwards `data.error` and often returns it to the browser. Current messages are mostly controlled validation/Discord errors, but this creates a direct disclosure path for future library/database error text.
- **Impact:** Authenticated users may learn implementation, Discord, database, or operational details that should remain server-side. Moderator-facing endpoints expose the most detail.
- **Fix:** Return stable public error codes/messages and log detailed errors with a correlation ID. Preserve explicitly allowlisted validation messages only.
- **Mitigation:** JSON responses are `no-store`, and no current logging path was found that prints request authorization headers or managed secret values.
- **False-positive note:** No secret-bearing error was observed statically; the risk is the unrestricted forwarding boundary.

### SEC-007 — Appeal uniqueness and cleanup are not fully guild-scoped at the schema level

- **CWE:** CWE-662 — Improper Synchronization / data isolation weakness
- **Location:** `webui/drizzle/0000_atc_webui.sql:31-49,51-76`; `webui/src/server/database.ts:878-904`; `src/db/repositories/moderationActions.ts:50-54`
- **Evidence:** `atc_appeal_windows` has no `guild_id`. The open-appeal unique index is on `(upper(action_id), discord_user_id)` without `guild_id`, and appeal-window cleanup by the bot matches only normalized action ID. Most application queries otherwise include the configured guild ID.
- **Impact:** In a future multi-guild deployment, identical action/user IDs across guilds could incorrectly block an appeal or cause cleanup of another guild's window. Randomized action IDs make collision unlikely, and the current deployment is configured for one guild.
- **Fix:** Add `guild_id` to appeal windows and include it in lookup/cleanup keys, the open-appeal unique index, and relevant advisory-lock keys. Consider foreign-key-style integrity to the action mapping where practical.
- **Mitigation:** Continue operating one configured guild per deployment and preserve high-entropy action IDs.
- **False-positive note:** This is not currently exploitable if the database is guaranteed to contain only one guild.

## Validated controls

| Control | Result | Evidence |
|---|---|---|
| SQL injection prevention | **Validated** | User values use `$n` parameters or Drizzle `sql` bindings. Dynamic query fragments in `webui/src/server/database.ts:540-558` are fixed strings; status is allowlisted. Migration SQL is read from repository-controlled files only. |
| Browser XSS prevention | **Validated with caution** | Attacker-controlled Discord/database/form values reaching the 67 HTML sinks in `webui/src/scripts/app.ts` are escaped by `escapeHtml` (`164-170`) or encoded for paths. Appeal answers are escaped at `2348` and `2394`. A restrictive CSP is set at `webui/src/server.ts:51-61`. Continued review is required whenever new interpolation is added. |
| Open redirect prevention | **Validated** | `safeReturnPath` rejects external, protocol-relative, and backslash paths (`webui/src/server/domain.ts:171-179`); tests pass. |
| OAuth login CSRF/code interception | **Validated** | Random state and browser-binding tokens, hashed state/browser values, single-use `DELETE ... RETURNING`, expiry, and PKCE S256 are implemented (`webui/src/server/auth.ts:61-86,113-154`; `database.ts:745-780`). |
| Session secrecy | **Validated** | 256-bit random session token; only SHA-256 hash stored; `HttpOnly`, `SameSite=Lax`, production `Secure`, expiry, logout deletion, and `no-store` API responses. |
| Object ownership/IDOR | **Validated** | Public action/appeal/invite endpoints always query by authenticated Discord user ID plus action/appeal ID (`webui/src/server.ts:525-649`). Moderator data requires live role authorization. |
| Moderator authorization | **Validated** | Role-based access uses `roleGroups.moderation` with management/moderator fallbacks and fetches the current guild member (`src/lib/atcInternalTools.ts:43-55,103-115`). Bot-side checks prevent trusting browser-provided access. Existing RBAC tests pass. |
| Internal API authentication | **Validated with SEC-004** | Private-network source check, production key-length requirement, constant-time comparison, JSON content-type enforcement, and 64 KiB request limit (`src/health.ts:18-100`). Transport remains deployment-dependent. |
| Static file traversal | **Validated** | Resolved paths must equal or remain under the distribution directory (`webui/src/server.ts:165-177`). |
| Appeal consistency/replay | **Validated with SEC-007** | Session/user/action-bound windows, transaction, advisory lock, atomic consumption, and partial unique open-appeal index (`webui/src/server/database.ts:845-914`; migration lines `71-73`). |
| Moderation replay/partial failure | **Validated** | Pending actions are atomically claimed before execution and partial Discord/database outcomes are recorded for reconciliation (`src/db/repositories/pendingModeration.ts:77-115`; `src/lib/moderationExecute.ts:80-213`). |
| Input bounds | **Mostly validated** | Appeal text, moderation reasons/durations, embeds, message size, and internal request bodies are bounded. The public Elysia server relies on framework/proxy body behavior and lacks repository-visible request-rate controls (SEC-002). |
| Dependency vulnerabilities | **Validated at audit time** | `bun audit --json` returned `{}` for both lockfiles on 2026-08-05. Overrides pin patched `brace-expansion`, `esbuild`, `fast-uri`, and `sharp` versions. |
| Container privilege | **Validated** | Both production images run as `USER bun` and install from frozen lockfiles (`Dockerfile:1-18`; `webui/Dockerfile:1-22`). |
| Secret leakage in source/history | **No confirmed leak** | Targeted current-tree and Git-history pattern scans found only placeholder `user:pass` example URLs. `.env` files are ignored. This was not a full entropy-based history scan because no dedicated secret-scanning tool is installed. |

## Verification results

- `bun run check` (repository root): **passed** — TypeScript build, ESLint, and 47 tests passed. ESLint reported 16 pre-existing `max-len` warnings and no errors.
- `bun run check` (`webui/`): **passed** — Astro diagnostics reported 0 errors/warnings/hints and 13 tests passed.
- `bun audit --json` (repository root): **passed**, no advisories (`{}`).
- `bun audit --json` (`webui/`): **passed**, no advisories (`{}`).
- CodeGraph: initialized successfully; 127 TypeScript files, 1,438 nodes, and 3,748 edges indexed.
- Local credentialed runtime checks: **not performed** — `.env` and `webui/.env` were absent, so PostgreSQL, Discord OAuth, and development-guild behavior could not be exercised safely.

## Recommended remediation order

1. Add CSRF/origin validation and route-specific rate limits (SEC-001, SEC-002).
2. Protect managed secrets outside plaintext database columns (SEC-003).
3. Require authenticated encrypted transport for the internal API in production (SEC-004).
4. Add browser hardening headers and sanitize the internal error boundary (SEC-005, SEC-006).
5. Make appeal constraints guild-scoped before any multi-guild deployment (SEC-007).

## Manual security regression checklist

- With disposable local accounts representing ordinary user, moderator, management, and developer roles, verify every API route returns the expected 401/403/2xx result and immediately reflects role removal.
- Submit harmless HTML/attribute/URL marker strings in usernames, moderation reasons, notes, appeals, audit details, and API errors; confirm they render only as text and CSP reports no violations.
- Send SQL metacharacters through every search, identifier, and body field; confirm normal empty/validation results and no database errors or data changes.
- Repeat OAuth start, appeal-window, captcha, and submission requests past the configured thresholds; confirm `429`, `Retry-After`, and bounded outstanding rows after SEC-002 is fixed.
- Attempt each unsafe method with a valid cookie but a missing and hostile `Origin`; confirm rejection after SEC-001 is fixed.
- Call the internal API with missing, malformed, wrong, and valid credentials from permitted and non-permitted network origins; verify only the intended combination succeeds and detailed errors stay server-side.
- Race two appeal submissions and two identical moderation actions using disposable records; verify one application, one open appeal, and consistent pending/audit state.
- Inspect final deployed HTML, JSON, asset, redirect, and error responses at the ingress to confirm CSP, cache controls, `nosniff`, referrer policy, and cookie attributes.
