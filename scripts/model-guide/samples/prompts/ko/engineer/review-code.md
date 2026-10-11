---
profession: engineer
task: review-code
language: ko
deliverable: none
---

## Prompt

귀하는 가상의 멀티테넌트 HR 플랫폼 "(주)인사로"의 시니어 엔지니어입니다(TypeScript, Express, node-postgres). 다음 풀 리퀘스트를 리뷰해 주십시오.

**PR #482: "Admin: 사용자 CSV 내보내기", 작성자 박영수**

> 테넌트 관리자가 사용자 목록을 내려받을 수 있도록 `GET /admin/users/export`를 추가합니다. 읽기 전용이라 위험도는 낮고, 보안 검토는 제가 직접 했습니다. 로컬에서 사용자 50명으로 테스트했습니다. 가장 큰 테넌트의 사용자는 약 140,000명입니다.

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

**코드베이스에 대해 알고 있는 맥락**

- `requireRole('admin')`은 세션 사용자의 역할만 확인합니다. 테넌트는 확인하지 않습니다.
- `auditLog`는 `Promise<void>`를 반환하고 감사 테이블에 기록합니다. 개인정보 보호법과 개인정보의 안전성 확보조치 기준에 따라, 개인정보를 내려받을 때마다 접속기록(감사 기록)이 반드시 남아야 합니다.
- `users` 테이블 컬럼: `id, tenant_id, email, full_name, phone, password_hash, mfa_secret, resident_reg_no_enc, date_of_birth, salary_band, created_at, last_login_at`. (`resident_reg_no_enc`는 암호화된 주민등록번호입니다.)
- 사용자는 자신의 `full_name`을 자유롭게 수정할 수 있습니다. 이름은 대부분 한글이며, 관리자들은 내려받은 CSV를 주로 Excel에서 엽니다.
- 팀 컨벤션: 10,000행을 넘을 수 있는 응답은 스트리밍으로 보냅니다.

**산출물** (설명은 약 2,500자 이내, 코드는 더 길어도 됩니다):

1. 판정: approve, approve with nits, request changes 중 하나와 박영수 님에게 보내는 한 단락 요약.
2. 심각도(blocker, major, minor, nit) 순으로 정렬한 리뷰 코멘트. 각 코멘트마다 해당 라인, 문제, 관련된 경우 구체적인 공격 또는 장애 시나리오, 수정 제안을 쓰십시오.
3. blocker와 major를 해결한 핸들러 수정본.
4. 머지 전에 요구할 테스트 두세 가지.

직설적이되 건설적으로 써 주십시오. 박영수 님은 중간 연차 엔지니어이고, 개인정보를 다루는 기능은 이번이 처음입니다.

## A strong answer

- Requests changes and identifies the blockers: a tenant admin can pass `?tenantId=` to export another tenant's users (IDOR / broken access control), and `ORDER BY ${sort}` allows SQL injection. The fixes are to always use `req.user.tenantId` and to allow-list sort columns.
- Flags `SELECT *` leaking `password_hash`, `mfa_secret`, `resident_reg_no_enc` (주민등록번호, specially restricted under 개인정보 보호법), `date_of_birth` and `salary_band`, and requires an explicit column list. Also flags that the stack trace is returned to the client.
- Catches CSV problems: no quoting or escaping of commas, quotes and newlines, and CSV/formula injection through the user-editable `full_name` (for example a value starting with `=`). Also notes `rows[0]` crashing when a tenant has no users, and (minor) that Korean names will garble in Excel without a UTF-8 BOM or charset.
- Notes the un-awaited `auditLog` (the audit record can be lost silently, a compliance failure; it should be awaited, and ideally written before data is sent) and that loading 140,000 rows into memory breaks the streaming convention.
- The revised handler and tests address these issues (cross-tenant attempt, sort injection, formula escaping, audit written), and the tone is constructive, with priorities clear.

## Card

brief: HR 플랫폼의 사용자 CSV 내보내기 PR을 리뷰해 판정, 코멘트, 수정 핸들러, 테스트를 제시합니다.
given:
- PR 설명: 작성자의 위험도 판단, 테스트 범위, 가장 큰 테넌트의 규모
- diff: GET /admin/users/export를 추가하는 새 Express 핸들러
- 코드베이스 맥락: 역할 확인, 감사 기록 의무, users 컬럼, 수정 가능한 이름과 Excel, 스트리밍 컨벤션에 관한 사실 5개
asked:
- 판정과 박영수 님에게 보내는 한 단락 요약
- 심각도순 리뷰 코멘트: 라인, 문제, 공격·장애 시나리오, 수정 제안
- blocker와 major를 해결한 핸들러 수정본
- 머지 전에 요구할 테스트 2~3개
limit: 설명은 약 2,500자 이내, Markdown; 코드는 더 길어도 됨
hard: 위험도가 낮다는 변경에서 보안·개인정보·정확성·규모 문제를 찾아 심각도로 순위를 매기고, 개인정보 기능이 처음인 작성자에게 맞게 설명해야 합니다.

## Scorecard

- Requests changes; blockers: cross-tenant export via ?tenantId= (IDOR) and SQL injection via ORDER BY ${sort}
- Fixes them by always using req.user.tenantId and allow-listing sort columns
- Flags SELECT * leaking password_hash, mfa_secret, resident_reg_no_enc, date_of_birth, salary_band; requires explicit columns; stack-trace leak
- Catches missing CSV escaping, formula injection via full_name, the rows[0] crash, Korean garbling without UTF-8 BOM
- Flags the un-awaited auditLog (개인정보 보호법 access record) and 140,000 rows in memory against streaming
- Revised handler and tests cover cross-tenant, sort injection, formula escaping and audit; tone is constructive

## Scorecard, shown

- 변경 요청으로 판정하고, blocker로 ?tenantId=를 통한 다른 테넌트 내보내기(IDOR)와 ORDER BY ${sort}의 SQL 인젝션을 든다
- 항상 req.user.tenantId를 쓰고 정렬 컬럼을 허용 목록으로 제한해 고친다
- SELECT *로 password_hash, mfa_secret, resident_reg_no_enc, date_of_birth, salary_band가 새는 것을 지적해 명시적 컬럼을 요구하고, 스택 트레이스 노출도 지적한다
- CSV 이스케이프 누락, full_name을 통한 수식 인젝션, rows[0] 오류, UTF-8 BOM 없이 Excel에서 한글이 깨지는 문제를 잡는다
- await하지 않은 auditLog(개인정보 보호법상 접속기록)와 140,000행을 메모리에 올려 스트리밍 컨벤션을 어기는 점을 지적한다
- 수정 핸들러와 테스트가 교차 테넌트, 정렬 인젝션, 수식 이스케이프, 감사 기록을 다루고, 어조가 건설적이다
