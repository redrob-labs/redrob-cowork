---
profession: engineer
task: review-code
language: en
deliverable: none
---

## Prompt

You are a senior engineer at Rosterly, a fictional multi-tenant HR platform (TypeScript, Express, node-postgres). Review this pull request.

**PR #482: "Admin: export users as CSV", by Richard Roe**

> Adds `GET /admin/users/export` so tenant admins can download their user list. It's read-only, so it's low risk; I reviewed it for security myself. Tested locally with 50 users. Our largest tenant has about 140,000 users.

```diff
--- a/src/routes/admin.ts
+++ b/src/routes/admin.ts
@@ -1,6 +1,8 @@
 import { Router } from 'express';
 import { pool } from '../db';
 import { requireRole } from '../auth';
+import { auditLog } from '../audit';
+
 const router = Router();
 
@@ -40,0 +43,40 @@
+router.get('/users/export', requireRole('admin'), async (req, res) => {
+  const tenantId = (req.query.tenantId as string) ?? req.user.tenantId;
+  const sort = (req.query.sort as string) || 'created_at';
+
+  try {
+    const { rows } = await pool.query(
+      `SELECT * FROM users WHERE tenant_id = $1 ORDER BY ${sort}`,
+      [tenantId],
+    );
+
+    const header = Object.keys(rows[0]).join(',');
+    const lines = rows.map((r) =>
+      Object.values(r)
+        .map((v) => `${v}`)
+        .join(','),
+    );
+
+    auditLog({
+      actor: req.user.id,
+      action: 'users.export',
+      tenantId,
+      count: rows.length,
+    });
+
+    res.setHeader('Content-Type', 'text/csv');
+    res.setHeader(
+      'Content-Disposition',
+      `attachment; filename="users-${tenantId}.csv"`,
+    );
+    res.send([header, ...lines].join('\n'));
+  } catch (err) {
+    res.status(500).json({ error: (err as Error).stack });
+  }
+});
+
 export default router;
```

**Context you know from the codebase**

- `requireRole('admin')` checks the role on the session user only. It does not look at tenants.
- `auditLog` returns a `Promise<void>` and writes to the audit table; compliance requires an audit record for every export of personal data.
- The `users` table has these columns: `id, tenant_id, email, full_name, phone, password_hash, mfa_secret, date_of_birth, salary_band, created_at, last_login_at`.
- Users can edit their own `full_name` freely.
- The team's convention is to stream any response that may exceed 10,000 rows.

**Deliver** (at most ~1,200 words of prose; code may run longer):

1. A verdict: approve, approve with nits, or request changes, with a one-paragraph summary addressed to Richard.
2. Review comments ordered by severity (blocker, major, minor, nit). For each, give the line it refers to, the problem, a concrete exploit or failure scenario where relevant, and a suggested fix.
3. A revised version of the handler that addresses the blockers and majors.
4. Two or three tests you would require before merging.

Be direct but constructive. Richard is a mid-level engineer, and this is his first feature touching personal data.

## A strong answer

- Requests changes and identifies the blockers: a tenant admin can pass `?tenantId=` to export another tenant's users (IDOR / broken access control), and `ORDER BY ${sort}` allows SQL injection. The fixes are to always use `req.user.tenantId` and to allow-list sort columns.
- Flags `SELECT *` leaking `password_hash`, `mfa_secret`, `date_of_birth` and `salary_band`, and requires an explicit column list. Also flags that the stack trace is returned to the client.
- Catches CSV problems: no quoting or escaping of commas, quotes and newlines, and CSV/formula injection through the user-editable `full_name` (for example a value starting with `=`). Also notes `rows[0]` crashing when a tenant has no users.
- Notes the un-awaited `auditLog` (the audit record can be lost silently, a compliance failure; it should be awaited, and ideally written before data is sent) and that loading 140,000 rows into memory breaks the streaming convention.
- The revised handler and tests address these issues (cross-tenant attempt, sort injection, formula escaping, audit written), and the tone is constructive, with priorities clear.
