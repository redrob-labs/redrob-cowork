---
profession: engineer
task: review-code
language: hi
deliverable: none
---

## Prompt

आप रोस्टरली (Rosterly) में senior engineer हैं। यह भारतीय कंपनियों के लिए एक काल्पनिक multi-tenant HR प्लेटफ़ॉर्म है (TypeScript, Express, node-postgres)। इस pull request का review कीजिए।

**PR #482: "Admin: users को CSV के रूप में export करें", रिचर्ड रो द्वारा**

> `GET /admin/users/export` जोड़ता है ताकि tenant admins अपनी user list डाउनलोड कर सकें। यह read-only है, इसलिए जोखिम कम है; security के लिए मैंने ख़ुद review कर लिया है। Local पर 50 users के साथ टेस्ट किया। हमारे सबसे बड़े tenant में लगभग 1,40,000 users हैं।

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

**Codebase से आपको पता संदर्भ**

- `requireRole('admin')` केवल session user का role जाँचता है। यह tenants को नहीं देखता।
- `auditLog` एक `Promise<void>` लौटाता है और audit table में लिखता है; DPDP Act, 2023 के अनुपालन के लिए कंपनी की नीति है कि personal data के हर export का audit record ज़रूरी है।
- `users` table के columns: `id, tenant_id, email, full_name, phone, password_hash, mfa_secret, date_of_birth, pan_number, salary_band, created_at, last_login_at`।
- Users अपना `full_name` स्वतंत्र रूप से edit कर सकते हैं।
- टीम की convention है कि जो भी response 10,000 rows से अधिक हो सकता है उसे stream किया जाए।

**डिलीवर करें** (गद्य लगभग 1,200 शब्दों के भीतर; कोड इससे लंबा हो सकता है):

1. Verdict: approve, approve with nits, या request changes, रिचर्ड को संबोधित एक पैराग्राफ़ के सारांश के साथ।
2. गंभीरता के क्रम में review comments (blocker, major, minor, nit)। हर एक के लिए: वह किस line से संबंधित है, समस्या, जहाँ प्रासंगिक हो वहाँ एक ठोस exploit या failure scenario, और सुझाया गया fix।
3. Handler का संशोधित संस्करण जो blockers और majors को ठीक करे।
4. दो या तीन tests जो merge से पहले आप अनिवार्य करेंगे।

सीधे लेकिन रचनात्मक रहें। रिचर्ड mid-level engineer हैं, और personal data छूने वाला यह उनका पहला feature है।

## A strong answer

- Requests changes and identifies the blockers: a tenant admin can pass `?tenantId=` to export another tenant's users (IDOR / broken access control), and `ORDER BY ${sort}` allows SQL injection. The fixes are to always use `req.user.tenantId` and to allow-list sort columns.
- Flags `SELECT *` leaking `password_hash`, `mfa_secret`, `date_of_birth`, `pan_number` and `salary_band`, and requires an explicit column list. Also flags that the stack trace is returned to the client.
- Catches CSV problems: no quoting or escaping of commas, quotes and newlines, and CSV/formula injection through the user-editable `full_name` (for example a value starting with `=`). Also notes `rows[0]` crashing when a tenant has no users.
- Notes the un-awaited `auditLog` (the audit record can be lost silently, a compliance failure; it should be awaited, and ideally written before data is sent) and that loading 1,40,000 rows into memory breaks the streaming convention.
- The revised handler and tests address these issues (cross-tenant attempt, sort injection, formula escaping, audit written), and the tone is constructive, with priorities clear.

## Card

brief: एक multi-tenant HR प्लेटफ़ॉर्म में CSV user export जोड़ने वाले PR की review करें: verdict, गंभीरता क्रम में comments, संशोधित handler और tests।
given:
- PR विवरण: लेखक का कम जोखिम वाला दावा, टेस्ट का दायरा और सबसे बड़े tenant का आकार
- Diff: GET /admin/users/export के लिए नया Express handler
- Codebase संदर्भ: role जाँच, audit logging, users के columns, editable नाम और streaming पर 5 तथ्य
asked:
- Verdict, रिचर्ड को संबोधित एक पैराग्राफ़ के सारांश के साथ
- गंभीरता क्रम में review comments, हर एक में line, समस्या, failure scenario और fix
- Blockers और majors ठीक करने वाला संशोधित handler
- Merge से पहले ज़रूरी दो या तीन tests
limit: गद्य लगभग 1,200 शब्दों के भीतर, Markdown; कोड इससे लंबा हो सकता है
hard: "कम जोखिम" बताए बदलाव को security, privacy, correctness और scale की समस्याओं के लिए परखना है, गंभीरता से क्रम देना है, और mid-level लेखक के अनुकूल ढंग से समझाना है।

## Scorecard

- Requests changes; blockers: cross-tenant export via ?tenantId= (IDOR) and SQL injection via ORDER BY ${sort}
- Fixes them by always using req.user.tenantId and allow-listing sort columns
- Flags SELECT * leaking password_hash, mfa_secret, date_of_birth, pan_number, salary_band; requires explicit columns; flags stack-trace leak
- Catches missing CSV escaping, formula injection via full_name, and the rows[0] crash for empty tenants
- Flags the un-awaited auditLog (DPDP compliance) and 1,40,000 rows in memory against the streaming convention
- Revised handler and tests cover cross-tenant, sort injection, formula escaping and audit; tone is constructive

## Scorecard, shown

- Request changes; blockers: ?tenantId= से दूसरे tenant का export (IDOR) और ORDER BY ${sort} से SQL injection
- हमेशा req.user.tenantId इस्तेमाल करके और sort columns की allow-list बनाकर इन्हें ठीक करता है
- SELECT * से password_hash, mfa_secret, date_of_birth, pan_number, salary_band के लीक को पकड़ता है; स्पष्ट columns माँगता है; stack trace का लीक भी बताता है
- CSV escaping की कमी, full_name से formula injection, और बिना users वाले tenant पर rows[0] का crash पकड़ता है
- Await न किया गया auditLog (DPDP अनुपालन) और streaming convention के ख़िलाफ़ 1,40,000 rows memory में लेना बताता है
- संशोधित handler और tests cross-tenant, sort injection, formula escaping और audit cover करते हैं; लहजा रचनात्मक है
