# 1099 Summary and Detail query plans (L)

## Run 1 default, statement 1

```sql
SELECT `books_settings`.* FROM `books_settings` WHERE `books_settings`.`id`='bookssettings01' LIMIT 1
```

no statistics:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

after ANALYZE:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

## Run 1 default, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
```

no statistics:

```
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
```

after ANALYZE:

```
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

## Run 1 default, statement 3

```sql
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1))
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
```

## Run 1 default, statement 4

```sql
SELECT seq, name FROM pragma_database_list
```

no statistics:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

after ANALYZE:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

## Run 1 default, statement 5

```sql
SELECT type, name, tbl_name, COALESCE(rootpage, 0) AS rootpage,
				CASE WHEN type = 'view' OR (type = 'table' AND COALESCE(rootpage, 0) = 0) THEN COALESCE(sql, '') ELSE '' END AS sql
				FROM "main".sqlite_schema
```

no statistics:

```
SCAN main.sqlite_schema
```

after ANALYZE:

```
SCAN main.sqlite_schema
```

## Run 1 default, statement 6

```sql
WITH r0 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r2 AS (SELECT `books_settings`.* FROM `books_settings`),
r3 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r4 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t1.vendor]], '') AS c0, NULLIF([[t1.vendor]], '') AS c5, NULLIF([[t2.form_1099_box]], '') AS c6, [[t1.currency]] AS ck0, NULLIF([[t1.vendor]], '') AS k0, NULLIF([[t2.form_1099_box]], '') AS k1, NULLIF([[t2.form_1099_box]], '') AS h7, [[t1.card_payment]] AS h8, [[t1.debit]] AS h9, [[t1.credit]] AS h10
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], CAST(NULL AS TEXT) AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.payment_entry]] AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r4 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.account]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.vendor]]
WHERE (([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t2.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t2.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)) AND (/*pc1*/(/*pc0*/(NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger')/*pc0*/ AND (NOT COALESCE((NULLIF([[t1.doc_type]], '') IN (SELECT +value FROM json_each('["bill","invoice","credit_memo","vendor_credit","write_off"]')) AND [[t1.doc_type]] IN ('bill', 'invoice', 'credit_memo', 'vendor_credit', 'write_off', NULL)), 0)))/*pc1*/ OR /*pc3*/(/*pc2*/(NULLIF([[t1.layer]], '') IS 'cash' AND [[t1.layer]] = 'cash')/*pc2*/ AND (NOT COALESCE((NULLIF([[t1.payment_entry]], '') IS NULL OR NULLIF([[t1.payment_entry]], '') = ''), 0)))/*pc3*/) AND (NOT COALESCE((NULLIF([[t1.vendor]], '') IS NULL OR NULLIF([[t1.vendor]], '') = ''), 0)) AND ([[t3.track_1099]] IS ('meets' IS NOT 'untracked')) AND (('all' IS 'all') OR (('all' IS 'nec') AND (NULLIF([[t2.form_1099_box]], '') IS 'nec_1' AND [[t2.form_1099_box]] = 'nec_1')) OR (('all' IS 'misc') AND (NULLIF([[t2.form_1099_box]], '') IN (SELECT +value FROM json_each('["misc_1","misc_2","misc_3","misc_5","misc_6","misc_8","misc_9","misc_10","misc_11"]')) AND [[t2.form_1099_box]] IN ('misc_1', 'misc_2', 'misc_3', 'misc_5', 'misc_6', 'misc_8', 'misc_9', 'misc_10', 'misc_11', NULL)))))),
a0 AS (SELECT ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
rs0 AS (SELECT ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt1 GROUP BY ck0),
g0 AS (SELECT a.*, COALESCE(rs0.ch_v1, 0) AS ch_v1, COALESCE(rs0.ch_v4, 0) AS ch_v4, COALESCE(rs0.ch_v3, 0) AS ch_v3 FROM a0 a LEFT JOIN rs0 ON 1 AND rs0.ck0 IS a.ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, NULL AS v5, NULL AS v6, NULL AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM g0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch_v1, 0) AS ch_v1, COALESCE(rs1.ch_v4, 0) AS ch_v4, COALESCE(rs1.ch_v3, 0) AS ch_v3 FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, [[t4.legal_name]] AS rc2, NULLIF([[t4.id]], '') AS rc3 FROM g1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
lk1 AS MATERIALIZED (SELECT * FROM (SELECT a.*, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh0, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh1 FROM gr1 a) a),
rt1 AS (SELECT a.k0 AS k0, a.ck0 AS ck0, 1 AS __shown, a.ch_v1 AS v1, NULL AS vmx1, a.ch_v3 AS v3, NULL AS vmx3, a.ch_v4 AS v4, NULL AS vmx4 FROM lk1 a WHERE COALESCE((('meets' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('meets' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('meets' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
s1 AS MATERIALIZED (SELECT a.* FROM lk1 a WHERE COALESCE((('meets' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('meets' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('meets' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, a.k0 AS v5, NULL AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL), (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL) AS __s1_6, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, COALESCE(sum((COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) - COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0))), 0) AS y1, COALESCE(sum((COALESCE(w.h9, 0) - COALESCE(w.h10, 0))), 0) AS y2, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t7.id]], '') AS rc0, [[t7.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t7 ON [[t7.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, a.y0 AS v1, NULL AS vmx1, a.y2 AS v3, NULL AS vmx3, a.y1 AS v4, NULL AS vmx4 FROM gr2 a WHERE 1),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE EXISTS (SELECT 1 FROM s1 p WHERE p.k0 IS a.k0 AND p.ck0 IS a.ck0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, (CASE WHEN (a.y1 IS 0) THEN NULL ELSE a.y1 END) AS v2, a.y2 AS v3, a.y1 AS v4, a.k0 AS v5, a.k1 AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL), (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END), ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL), (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (CASE WHEN (a.k1 IS 'nec_1') THEN 'NEC 1 · Nonemployee compensation' WHEN (a.k1 IS 'misc_1') THEN 'MISC 1 · Rents' WHEN (a.k1 IS 'misc_2') THEN 'MISC 2 · Royalties' WHEN (a.k1 IS 'misc_3') THEN 'MISC 3 · Other income' WHEN (a.k1 IS 'misc_5') THEN 'MISC 5 · Fishing boat proceeds' WHEN (a.k1 IS 'misc_6') THEN 'MISC 6 · Medical and health care payments' WHEN (a.k1 IS 'misc_8') THEN 'MISC 8 · Substitute payments in lieu of dividends or interest' WHEN (a.k1 IS 'misc_9') THEN 'MISC 9 · Crop insurance proceeds' WHEN (a.k1 IS 'misc_10') THEN 'MISC 10 · Gross proceeds paid to an attorney' WHEN (a.k1 IS 'misc_11') THEN 'MISC 11 · Fish purchased for resale' ELSE 'Not reported' END) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL) AS __s2_0, (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) AS __s2_1, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_2, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_3, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s2_4, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s2_5, (lower(a.rc1) IS NULL) AS __s2_6, lower(a.rc1) AS __s2_7, ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL) AS __s2_8, (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t8.display_name]], ''), '(no name)')
FROM r1 t8
WHERE [[t8.id]] IS a.k0) AS wh0 FROM s2 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1),
pp2 AS (SELECT o.k0, o.k1, o.ck0, pp.__p1, o.__ord AS __p2 FROM o2 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, NULL AS __p2, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1
UNION ALL
SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, pp.__p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, o.__s2_0, o.__s2_1, o.__s2_2, o.__s2_3, o.__s2_4, o.__s2_5, o.__s2_6, o.__s2_7, o.__s2_8, o.__s2_9, o.__s2_10, o.__s2_11 FROM o2 o JOIN pp2 pp ON o.k0 IS pp.k0 AND o.k1 IS pp.k1 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1, __p2 LIMIT 201)
UNION ALL
SELECT __level, __row, k0, k1, ck0, v0, v1, v2, v3, v4, v5, v6, vl5, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1, __p2
```

no statistics:

```
CO-ROUTINE (subquery-48)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-46)
        CO-ROUTINE (subquery-45)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-50)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 21
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 22
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 27
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 30
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-50)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-52)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 37
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 39
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-52)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-45)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-46)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-53)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 25
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-53)
      SCAN o0
SCAN (subquery-48)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-48)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-46)
        CO-ROUTINE (subquery-45)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-50)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (ANY(account) AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                BLOOM FILTER ON books_accounts (id=?)
                                SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SCAN books_accounts
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 21
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 22
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 27
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 30
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-50)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-52)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 37
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 39
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-52)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-45)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-46)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-53)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 25
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-53)
      SCAN o0
SCAN (subquery-48)
USE TEMP B-TREE FOR ORDER BY
```

## Run 1 default, statement 7

```sql
WITH r0 AS (SELECT `books_settings`.* FROM `books_settings`)
SELECT (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS v0, (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS c0
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

## Run 2 all 1099 vendors, statement 1

```sql
SELECT `books_settings`.* FROM `books_settings` WHERE `books_settings`.`id`='bookssettings01' LIMIT 1
```

no statistics:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

after ANALYZE:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

## Run 2 all 1099 vendors, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
```

no statistics:

```
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

after ANALYZE:

```
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

## Run 2 all 1099 vendors, statement 3

```sql
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1))
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
```

## Run 2 all 1099 vendors, statement 4

```sql
SELECT seq, name FROM pragma_database_list
```

no statistics:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

after ANALYZE:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

## Run 2 all 1099 vendors, statement 5

```sql
SELECT type, name, tbl_name, COALESCE(rootpage, 0) AS rootpage,
				CASE WHEN type = 'view' OR (type = 'table' AND COALESCE(rootpage, 0) = 0) THEN COALESCE(sql, '') ELSE '' END AS sql
				FROM "main".sqlite_schema
```

no statistics:

```
SCAN main.sqlite_schema
```

after ANALYZE:

```
SCAN main.sqlite_schema
```

## Run 2 all 1099 vendors, statement 6

```sql
WITH r0 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r2 AS (SELECT `books_settings`.* FROM `books_settings`),
r3 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r4 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t1.vendor]], '') AS c0, NULLIF([[t1.vendor]], '') AS c5, NULLIF([[t2.form_1099_box]], '') AS c6, [[t1.currency]] AS ck0, NULLIF([[t1.vendor]], '') AS k0, NULLIF([[t2.form_1099_box]], '') AS k1, NULLIF([[t2.form_1099_box]], '') AS h7, [[t1.card_payment]] AS h8, [[t1.debit]] AS h9, [[t1.credit]] AS h10
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], CAST(NULL AS TEXT) AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.payment_entry]] AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r4 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.account]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.vendor]]
WHERE (([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t2.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t2.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)) AND (/*pc1*/(/*pc0*/(NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger')/*pc0*/ AND (NOT COALESCE((NULLIF([[t1.doc_type]], '') IN (SELECT +value FROM json_each('["bill","invoice","credit_memo","vendor_credit","write_off"]')) AND [[t1.doc_type]] IN ('bill', 'invoice', 'credit_memo', 'vendor_credit', 'write_off', NULL)), 0)))/*pc1*/ OR /*pc3*/(/*pc2*/(NULLIF([[t1.layer]], '') IS 'cash' AND [[t1.layer]] = 'cash')/*pc2*/ AND (NOT COALESCE((NULLIF([[t1.payment_entry]], '') IS NULL OR NULLIF([[t1.payment_entry]], '') = ''), 0)))/*pc3*/) AND (NOT COALESCE((NULLIF([[t1.vendor]], '') IS NULL OR NULLIF([[t1.vendor]], '') = ''), 0)) AND ([[t3.track_1099]] IS ('tracked' IS NOT 'untracked')) AND (('all' IS 'all') OR (('all' IS 'nec') AND (NULLIF([[t2.form_1099_box]], '') IS 'nec_1' AND [[t2.form_1099_box]] = 'nec_1')) OR (('all' IS 'misc') AND (NULLIF([[t2.form_1099_box]], '') IN (SELECT +value FROM json_each('["misc_1","misc_2","misc_3","misc_5","misc_6","misc_8","misc_9","misc_10","misc_11"]')) AND [[t2.form_1099_box]] IN ('misc_1', 'misc_2', 'misc_3', 'misc_5', 'misc_6', 'misc_8', 'misc_9', 'misc_10', 'misc_11', NULL)))))),
a0 AS (SELECT ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
rs0 AS (SELECT ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt1 GROUP BY ck0),
g0 AS (SELECT a.*, COALESCE(rs0.ch_v1, 0) AS ch_v1, COALESCE(rs0.ch_v4, 0) AS ch_v4, COALESCE(rs0.ch_v3, 0) AS ch_v3 FROM a0 a LEFT JOIN rs0 ON 1 AND rs0.ck0 IS a.ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, NULL AS v5, NULL AS v6, NULL AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM g0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch_v1, 0) AS ch_v1, COALESCE(rs1.ch_v4, 0) AS ch_v4, COALESCE(rs1.ch_v3, 0) AS ch_v3 FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, [[t4.legal_name]] AS rc2, NULLIF([[t4.id]], '') AS rc3 FROM g1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
lk1 AS MATERIALIZED (SELECT * FROM (SELECT a.*, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh0, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh1 FROM gr1 a) a),
rt1 AS (SELECT a.k0 AS k0, a.ck0 AS ck0, 1 AS __shown, a.ch_v1 AS v1, NULL AS vmx1, a.ch_v3 AS v3, NULL AS vmx3, a.ch_v4 AS v4, NULL AS vmx4 FROM lk1 a WHERE COALESCE((('tracked' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('tracked' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('tracked' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
s1 AS MATERIALIZED (SELECT a.* FROM lk1 a WHERE COALESCE((('tracked' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('tracked' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('tracked' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, a.k0 AS v5, NULL AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL), (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL) AS __s1_6, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, COALESCE(sum((COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) - COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0))), 0) AS y1, COALESCE(sum((COALESCE(w.h9, 0) - COALESCE(w.h10, 0))), 0) AS y2, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t7.id]], '') AS rc0, [[t7.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t7 ON [[t7.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, a.y0 AS v1, NULL AS vmx1, a.y2 AS v3, NULL AS vmx3, a.y1 AS v4, NULL AS vmx4 FROM gr2 a WHERE 1),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE EXISTS (SELECT 1 FROM s1 p WHERE p.k0 IS a.k0 AND p.ck0 IS a.ck0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, (CASE WHEN (a.y1 IS 0) THEN NULL ELSE a.y1 END) AS v2, a.y2 AS v3, a.y1 AS v4, a.k0 AS v5, a.k1 AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL), (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END), ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL), (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (CASE WHEN (a.k1 IS 'nec_1') THEN 'NEC 1 · Nonemployee compensation' WHEN (a.k1 IS 'misc_1') THEN 'MISC 1 · Rents' WHEN (a.k1 IS 'misc_2') THEN 'MISC 2 · Royalties' WHEN (a.k1 IS 'misc_3') THEN 'MISC 3 · Other income' WHEN (a.k1 IS 'misc_5') THEN 'MISC 5 · Fishing boat proceeds' WHEN (a.k1 IS 'misc_6') THEN 'MISC 6 · Medical and health care payments' WHEN (a.k1 IS 'misc_8') THEN 'MISC 8 · Substitute payments in lieu of dividends or interest' WHEN (a.k1 IS 'misc_9') THEN 'MISC 9 · Crop insurance proceeds' WHEN (a.k1 IS 'misc_10') THEN 'MISC 10 · Gross proceeds paid to an attorney' WHEN (a.k1 IS 'misc_11') THEN 'MISC 11 · Fish purchased for resale' ELSE 'Not reported' END) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL) AS __s2_0, (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) AS __s2_1, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_2, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_3, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s2_4, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s2_5, (lower(a.rc1) IS NULL) AS __s2_6, lower(a.rc1) AS __s2_7, ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL) AS __s2_8, (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t8.display_name]], ''), '(no name)')
FROM r1 t8
WHERE [[t8.id]] IS a.k0) AS wh0 FROM s2 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1),
pp2 AS (SELECT o.k0, o.k1, o.ck0, pp.__p1, o.__ord AS __p2 FROM o2 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, NULL AS __p2, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1
UNION ALL
SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, pp.__p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, o.__s2_0, o.__s2_1, o.__s2_2, o.__s2_3, o.__s2_4, o.__s2_5, o.__s2_6, o.__s2_7, o.__s2_8, o.__s2_9, o.__s2_10, o.__s2_11 FROM o2 o JOIN pp2 pp ON o.k0 IS pp.k0 AND o.k1 IS pp.k1 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1, __p2 LIMIT 201)
UNION ALL
SELECT __level, __row, k0, k1, ck0, v0, v1, v2, v3, v4, v5, v6, vl5, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1, __p2
```

no statistics:

```
CO-ROUTINE (subquery-48)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-46)
        CO-ROUTINE (subquery-45)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-50)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 21
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 22
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 27
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 30
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-50)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-52)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 37
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 39
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-52)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-45)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-46)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-53)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 25
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-53)
      SCAN o0
SCAN (subquery-48)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-48)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-46)
        CO-ROUTINE (subquery-45)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-50)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (ANY(account) AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                BLOOM FILTER ON books_accounts (id=?)
                                SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SCAN books_accounts
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 21
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 22
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 27
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 30
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-50)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-52)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 37
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 39
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-52)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-45)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-46)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-53)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 25
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-53)
      SCAN o0
SCAN (subquery-48)
USE TEMP B-TREE FOR ORDER BY
```

## Run 2 all 1099 vendors, statement 7

```sql
WITH r0 AS (SELECT `books_settings`.* FROM `books_settings`)
SELECT (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS v0, (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS c0
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

## Run 3 not tracked, statement 1

```sql
SELECT `books_settings`.* FROM `books_settings` WHERE `books_settings`.`id`='bookssettings01' LIMIT 1
```

no statistics:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

after ANALYZE:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

## Run 3 not tracked, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
```

no statistics:

```
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

after ANALYZE:

```
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

## Run 3 not tracked, statement 3

```sql
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1))
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
```

## Run 3 not tracked, statement 4

```sql
SELECT seq, name FROM pragma_database_list
```

no statistics:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

after ANALYZE:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

## Run 3 not tracked, statement 5

```sql
SELECT type, name, tbl_name, COALESCE(rootpage, 0) AS rootpage,
				CASE WHEN type = 'view' OR (type = 'table' AND COALESCE(rootpage, 0) = 0) THEN COALESCE(sql, '') ELSE '' END AS sql
				FROM "main".sqlite_schema
```

no statistics:

```
SCAN main.sqlite_schema
```

after ANALYZE:

```
SCAN main.sqlite_schema
```

## Run 3 not tracked, statement 6

```sql
WITH r0 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r2 AS (SELECT `books_settings`.* FROM `books_settings`),
r3 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r4 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t1.vendor]], '') AS c0, NULLIF([[t1.vendor]], '') AS c5, NULLIF([[t2.form_1099_box]], '') AS c6, [[t1.currency]] AS ck0, NULLIF([[t1.vendor]], '') AS k0, NULLIF([[t2.form_1099_box]], '') AS k1, NULLIF([[t2.form_1099_box]], '') AS h7, [[t1.card_payment]] AS h8, [[t1.debit]] AS h9, [[t1.credit]] AS h10
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], CAST(NULL AS TEXT) AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.payment_entry]] AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r4 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.account]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.vendor]]
WHERE (([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t2.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t2.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)) AND (/*pc1*/(/*pc0*/(NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger')/*pc0*/ AND (NOT COALESCE((NULLIF([[t1.doc_type]], '') IN (SELECT +value FROM json_each('["bill","invoice","credit_memo","vendor_credit","write_off"]')) AND [[t1.doc_type]] IN ('bill', 'invoice', 'credit_memo', 'vendor_credit', 'write_off', NULL)), 0)))/*pc1*/ OR /*pc3*/(/*pc2*/(NULLIF([[t1.layer]], '') IS 'cash' AND [[t1.layer]] = 'cash')/*pc2*/ AND (NOT COALESCE((NULLIF([[t1.payment_entry]], '') IS NULL OR NULLIF([[t1.payment_entry]], '') = ''), 0)))/*pc3*/) AND (NOT COALESCE((NULLIF([[t1.vendor]], '') IS NULL OR NULLIF([[t1.vendor]], '') = ''), 0)) AND ([[t3.track_1099]] IS ('untracked' IS NOT 'untracked')) AND (('all' IS 'all') OR (('all' IS 'nec') AND (NULLIF([[t2.form_1099_box]], '') IS 'nec_1' AND [[t2.form_1099_box]] = 'nec_1')) OR (('all' IS 'misc') AND (NULLIF([[t2.form_1099_box]], '') IN (SELECT +value FROM json_each('["misc_1","misc_2","misc_3","misc_5","misc_6","misc_8","misc_9","misc_10","misc_11"]')) AND [[t2.form_1099_box]] IN ('misc_1', 'misc_2', 'misc_3', 'misc_5', 'misc_6', 'misc_8', 'misc_9', 'misc_10', 'misc_11', NULL)))))),
a0 AS (SELECT ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
rs0 AS (SELECT ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt1 GROUP BY ck0),
g0 AS (SELECT a.*, COALESCE(rs0.ch_v1, 0) AS ch_v1, COALESCE(rs0.ch_v4, 0) AS ch_v4, COALESCE(rs0.ch_v3, 0) AS ch_v3 FROM a0 a LEFT JOIN rs0 ON 1 AND rs0.ck0 IS a.ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, NULL AS v5, NULL AS v6, NULL AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM g0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch_v1, 0) AS ch_v1, COALESCE(rs1.ch_v4, 0) AS ch_v4, COALESCE(rs1.ch_v3, 0) AS ch_v3 FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, [[t4.legal_name]] AS rc2, NULLIF([[t4.id]], '') AS rc3 FROM g1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
lk1 AS MATERIALIZED (SELECT * FROM (SELECT a.*, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh0, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh1 FROM gr1 a) a),
rt1 AS (SELECT a.k0 AS k0, a.ck0 AS ck0, 1 AS __shown, a.ch_v1 AS v1, NULL AS vmx1, a.ch_v3 AS v3, NULL AS vmx3, a.ch_v4 AS v4, NULL AS vmx4 FROM lk1 a WHERE COALESCE((('untracked' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('untracked' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('untracked' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
s1 AS MATERIALIZED (SELECT a.* FROM lk1 a WHERE COALESCE((('untracked' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('untracked' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('untracked' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, a.k0 AS v5, NULL AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL), (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL) AS __s1_6, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, COALESCE(sum((COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) - COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0))), 0) AS y1, COALESCE(sum((COALESCE(w.h9, 0) - COALESCE(w.h10, 0))), 0) AS y2, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t7.id]], '') AS rc0, [[t7.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t7 ON [[t7.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, a.y0 AS v1, NULL AS vmx1, a.y2 AS v3, NULL AS vmx3, a.y1 AS v4, NULL AS vmx4 FROM gr2 a WHERE 1),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE EXISTS (SELECT 1 FROM s1 p WHERE p.k0 IS a.k0 AND p.ck0 IS a.ck0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, (CASE WHEN (a.y1 IS 0) THEN NULL ELSE a.y1 END) AS v2, a.y2 AS v3, a.y1 AS v4, a.k0 AS v5, a.k1 AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL), (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END), ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL), (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (CASE WHEN (a.k1 IS 'nec_1') THEN 'NEC 1 · Nonemployee compensation' WHEN (a.k1 IS 'misc_1') THEN 'MISC 1 · Rents' WHEN (a.k1 IS 'misc_2') THEN 'MISC 2 · Royalties' WHEN (a.k1 IS 'misc_3') THEN 'MISC 3 · Other income' WHEN (a.k1 IS 'misc_5') THEN 'MISC 5 · Fishing boat proceeds' WHEN (a.k1 IS 'misc_6') THEN 'MISC 6 · Medical and health care payments' WHEN (a.k1 IS 'misc_8') THEN 'MISC 8 · Substitute payments in lieu of dividends or interest' WHEN (a.k1 IS 'misc_9') THEN 'MISC 9 · Crop insurance proceeds' WHEN (a.k1 IS 'misc_10') THEN 'MISC 10 · Gross proceeds paid to an attorney' WHEN (a.k1 IS 'misc_11') THEN 'MISC 11 · Fish purchased for resale' ELSE 'Not reported' END) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL) AS __s2_0, (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) AS __s2_1, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_2, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_3, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s2_4, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s2_5, (lower(a.rc1) IS NULL) AS __s2_6, lower(a.rc1) AS __s2_7, ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL) AS __s2_8, (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t8.display_name]], ''), '(no name)')
FROM r1 t8
WHERE [[t8.id]] IS a.k0) AS wh0 FROM s2 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1),
pp2 AS (SELECT o.k0, o.k1, o.ck0, pp.__p1, o.__ord AS __p2 FROM o2 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, NULL AS __p2, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1
UNION ALL
SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, pp.__p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, o.__s2_0, o.__s2_1, o.__s2_2, o.__s2_3, o.__s2_4, o.__s2_5, o.__s2_6, o.__s2_7, o.__s2_8, o.__s2_9, o.__s2_10, o.__s2_11 FROM o2 o JOIN pp2 pp ON o.k0 IS pp.k0 AND o.k1 IS pp.k1 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1, __p2 LIMIT 201)
UNION ALL
SELECT __level, __row, k0, k1, ck0, v0, v1, v2, v3, v4, v5, v6, vl5, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1, __p2
```

no statistics:

```
CO-ROUTINE (subquery-48)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-46)
        CO-ROUTINE (subquery-45)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-50)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 21
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 22
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 27
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 30
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-50)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-52)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 37
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 39
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-52)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-45)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-46)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-53)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 25
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-53)
      SCAN o0
SCAN (subquery-48)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-48)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-46)
        CO-ROUTINE (subquery-45)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-50)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (ANY(account) AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                BLOOM FILTER ON books_accounts (id=?)
                                SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SCAN books_accounts
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 21
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 22
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 27
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 30
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-50)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-52)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 37
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 39
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-52)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-45)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-46)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-53)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 25
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-53)
      SCAN o0
SCAN (subquery-48)
USE TEMP B-TREE FOR ORDER BY
```

## Run 3 not tracked, statement 7

```sql
WITH r0 AS (SELECT `books_settings`.* FROM `books_settings`)
SELECT (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS v0, (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS c0
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

## Run 4 1099-NEC, statement 1

```sql
SELECT `books_settings`.* FROM `books_settings` WHERE `books_settings`.`id`='bookssettings01' LIMIT 1
```

no statistics:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

after ANALYZE:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

## Run 4 1099-NEC, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
```

no statistics:

```
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

after ANALYZE:

```
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

## Run 4 1099-NEC, statement 3

```sql
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1))
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
```

## Run 4 1099-NEC, statement 4

```sql
SELECT seq, name FROM pragma_database_list
```

no statistics:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

after ANALYZE:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

## Run 4 1099-NEC, statement 5

```sql
SELECT type, name, tbl_name, COALESCE(rootpage, 0) AS rootpage,
				CASE WHEN type = 'view' OR (type = 'table' AND COALESCE(rootpage, 0) = 0) THEN COALESCE(sql, '') ELSE '' END AS sql
				FROM "main".sqlite_schema
```

no statistics:

```
SCAN main.sqlite_schema
```

after ANALYZE:

```
SCAN main.sqlite_schema
```

## Run 4 1099-NEC, statement 6

```sql
WITH r0 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r2 AS (SELECT `books_settings`.* FROM `books_settings`),
r3 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r4 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t1.vendor]], '') AS c0, NULLIF([[t1.vendor]], '') AS c5, NULLIF([[t2.form_1099_box]], '') AS c6, [[t1.currency]] AS ck0, NULLIF([[t1.vendor]], '') AS k0, NULLIF([[t2.form_1099_box]], '') AS k1, NULLIF([[t2.form_1099_box]], '') AS h7, [[t1.card_payment]] AS h8, [[t1.debit]] AS h9, [[t1.credit]] AS h10
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], CAST(NULL AS TEXT) AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.payment_entry]] AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r4 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.account]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.vendor]]
WHERE (([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t2.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t2.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)) AND (/*pc1*/(/*pc0*/(NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger')/*pc0*/ AND (NOT COALESCE((NULLIF([[t1.doc_type]], '') IN (SELECT +value FROM json_each('["bill","invoice","credit_memo","vendor_credit","write_off"]')) AND [[t1.doc_type]] IN ('bill', 'invoice', 'credit_memo', 'vendor_credit', 'write_off', NULL)), 0)))/*pc1*/ OR /*pc3*/(/*pc2*/(NULLIF([[t1.layer]], '') IS 'cash' AND [[t1.layer]] = 'cash')/*pc2*/ AND (NOT COALESCE((NULLIF([[t1.payment_entry]], '') IS NULL OR NULLIF([[t1.payment_entry]], '') = ''), 0)))/*pc3*/) AND (NOT COALESCE((NULLIF([[t1.vendor]], '') IS NULL OR NULLIF([[t1.vendor]], '') = ''), 0)) AND ([[t3.track_1099]] IS ('meets' IS NOT 'untracked')) AND (('nec' IS 'all') OR (('nec' IS 'nec') AND (NULLIF([[t2.form_1099_box]], '') IS 'nec_1' AND [[t2.form_1099_box]] = 'nec_1')) OR (('nec' IS 'misc') AND (NULLIF([[t2.form_1099_box]], '') IN (SELECT +value FROM json_each('["misc_1","misc_2","misc_3","misc_5","misc_6","misc_8","misc_9","misc_10","misc_11"]')) AND [[t2.form_1099_box]] IN ('misc_1', 'misc_2', 'misc_3', 'misc_5', 'misc_6', 'misc_8', 'misc_9', 'misc_10', 'misc_11', NULL)))))),
a0 AS (SELECT ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
rs0 AS (SELECT ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt1 GROUP BY ck0),
g0 AS (SELECT a.*, COALESCE(rs0.ch_v1, 0) AS ch_v1, COALESCE(rs0.ch_v4, 0) AS ch_v4, COALESCE(rs0.ch_v3, 0) AS ch_v3 FROM a0 a LEFT JOIN rs0 ON 1 AND rs0.ck0 IS a.ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, NULL AS v5, NULL AS v6, NULL AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM g0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch_v1, 0) AS ch_v1, COALESCE(rs1.ch_v4, 0) AS ch_v4, COALESCE(rs1.ch_v3, 0) AS ch_v3 FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, [[t4.legal_name]] AS rc2, NULLIF([[t4.id]], '') AS rc3 FROM g1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
lk1 AS MATERIALIZED (SELECT * FROM (SELECT a.*, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh0, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh1 FROM gr1 a) a),
rt1 AS (SELECT a.k0 AS k0, a.ck0 AS ck0, 1 AS __shown, a.ch_v1 AS v1, NULL AS vmx1, a.ch_v3 AS v3, NULL AS vmx3, a.ch_v4 AS v4, NULL AS vmx4 FROM lk1 a WHERE COALESCE((('meets' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('meets' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('meets' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
s1 AS MATERIALIZED (SELECT a.* FROM lk1 a WHERE COALESCE((('meets' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('meets' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('meets' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, a.k0 AS v5, NULL AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL), (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL) AS __s1_6, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, COALESCE(sum((COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) - COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0))), 0) AS y1, COALESCE(sum((COALESCE(w.h9, 0) - COALESCE(w.h10, 0))), 0) AS y2, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t7.id]], '') AS rc0, [[t7.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t7 ON [[t7.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, a.y0 AS v1, NULL AS vmx1, a.y2 AS v3, NULL AS vmx3, a.y1 AS v4, NULL AS vmx4 FROM gr2 a WHERE 1),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE EXISTS (SELECT 1 FROM s1 p WHERE p.k0 IS a.k0 AND p.ck0 IS a.ck0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, (CASE WHEN (a.y1 IS 0) THEN NULL ELSE a.y1 END) AS v2, a.y2 AS v3, a.y1 AS v4, a.k0 AS v5, a.k1 AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL), (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END), ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL), (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (CASE WHEN (a.k1 IS 'nec_1') THEN 'NEC 1 · Nonemployee compensation' WHEN (a.k1 IS 'misc_1') THEN 'MISC 1 · Rents' WHEN (a.k1 IS 'misc_2') THEN 'MISC 2 · Royalties' WHEN (a.k1 IS 'misc_3') THEN 'MISC 3 · Other income' WHEN (a.k1 IS 'misc_5') THEN 'MISC 5 · Fishing boat proceeds' WHEN (a.k1 IS 'misc_6') THEN 'MISC 6 · Medical and health care payments' WHEN (a.k1 IS 'misc_8') THEN 'MISC 8 · Substitute payments in lieu of dividends or interest' WHEN (a.k1 IS 'misc_9') THEN 'MISC 9 · Crop insurance proceeds' WHEN (a.k1 IS 'misc_10') THEN 'MISC 10 · Gross proceeds paid to an attorney' WHEN (a.k1 IS 'misc_11') THEN 'MISC 11 · Fish purchased for resale' ELSE 'Not reported' END) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL) AS __s2_0, (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) AS __s2_1, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_2, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_3, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s2_4, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s2_5, (lower(a.rc1) IS NULL) AS __s2_6, lower(a.rc1) AS __s2_7, ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL) AS __s2_8, (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t8.display_name]], ''), '(no name)')
FROM r1 t8
WHERE [[t8.id]] IS a.k0) AS wh0 FROM s2 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1),
pp2 AS (SELECT o.k0, o.k1, o.ck0, pp.__p1, o.__ord AS __p2 FROM o2 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, NULL AS __p2, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1
UNION ALL
SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, pp.__p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, o.__s2_0, o.__s2_1, o.__s2_2, o.__s2_3, o.__s2_4, o.__s2_5, o.__s2_6, o.__s2_7, o.__s2_8, o.__s2_9, o.__s2_10, o.__s2_11 FROM o2 o JOIN pp2 pp ON o.k0 IS pp.k0 AND o.k1 IS pp.k1 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1, __p2 LIMIT 201)
UNION ALL
SELECT __level, __row, k0, k1, ck0, v0, v1, v2, v3, v4, v5, v6, vl5, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1, __p2
```

no statistics:

```
CO-ROUTINE (subquery-48)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-46)
        CO-ROUTINE (subquery-45)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-50)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 21
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 22
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 27
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 30
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-50)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-52)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 37
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 39
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-52)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-45)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-46)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-53)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 25
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-53)
      SCAN o0
SCAN (subquery-48)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-48)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-46)
        CO-ROUTINE (subquery-45)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-50)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (ANY(account) AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                BLOOM FILTER ON books_accounts (id=?)
                                SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SCAN books_accounts
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 21
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 22
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 27
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 30
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-50)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-52)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 37
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 39
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-52)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-45)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-46)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-53)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 25
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-53)
      SCAN o0
SCAN (subquery-48)
USE TEMP B-TREE FOR ORDER BY
```

## Run 4 1099-NEC, statement 7

```sql
WITH r0 AS (SELECT `books_settings`.* FROM `books_settings`)
SELECT (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS v0, (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS c0
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

## Run 5 largest reportable, statement 1

```sql
SELECT `books_settings`.* FROM `books_settings` WHERE `books_settings`.`id`='bookssettings01' LIMIT 1
```

no statistics:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

after ANALYZE:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

## Run 5 largest reportable, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
```

no statistics:

```
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

after ANALYZE:

```
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

## Run 5 largest reportable, statement 3

```sql
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1))
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
```

## Run 5 largest reportable, statement 4

```sql
SELECT seq, name FROM pragma_database_list
```

no statistics:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

after ANALYZE:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

## Run 5 largest reportable, statement 5

```sql
SELECT type, name, tbl_name, COALESCE(rootpage, 0) AS rootpage,
				CASE WHEN type = 'view' OR (type = 'table' AND COALESCE(rootpage, 0) = 0) THEN COALESCE(sql, '') ELSE '' END AS sql
				FROM "main".sqlite_schema
```

no statistics:

```
SCAN main.sqlite_schema
```

after ANALYZE:

```
SCAN main.sqlite_schema
```

## Run 5 largest reportable, statement 6

```sql
WITH r0 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r2 AS (SELECT `books_settings`.* FROM `books_settings`),
r3 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r4 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t1.vendor]], '') AS c0, NULLIF([[t1.vendor]], '') AS c5, NULLIF([[t2.form_1099_box]], '') AS c6, [[t1.currency]] AS ck0, NULLIF([[t1.vendor]], '') AS k0, NULLIF([[t2.form_1099_box]], '') AS k1, NULLIF([[t2.form_1099_box]], '') AS h7, [[t1.card_payment]] AS h8, [[t1.debit]] AS h9, [[t1.credit]] AS h10
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], CAST(NULL AS TEXT) AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.payment_entry]] AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r4 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.account]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.vendor]]
WHERE (([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t2.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t2.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)) AND (/*pc1*/(/*pc0*/(NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger')/*pc0*/ AND (NOT COALESCE((NULLIF([[t1.doc_type]], '') IN (SELECT +value FROM json_each('["bill","invoice","credit_memo","vendor_credit","write_off"]')) AND [[t1.doc_type]] IN ('bill', 'invoice', 'credit_memo', 'vendor_credit', 'write_off', NULL)), 0)))/*pc1*/ OR /*pc3*/(/*pc2*/(NULLIF([[t1.layer]], '') IS 'cash' AND [[t1.layer]] = 'cash')/*pc2*/ AND (NOT COALESCE((NULLIF([[t1.payment_entry]], '') IS NULL OR NULLIF([[t1.payment_entry]], '') = ''), 0)))/*pc3*/) AND (NOT COALESCE((NULLIF([[t1.vendor]], '') IS NULL OR NULLIF([[t1.vendor]], '') = ''), 0)) AND ([[t3.track_1099]] IS ('meets' IS NOT 'untracked')) AND (('all' IS 'all') OR (('all' IS 'nec') AND (NULLIF([[t2.form_1099_box]], '') IS 'nec_1' AND [[t2.form_1099_box]] = 'nec_1')) OR (('all' IS 'misc') AND (NULLIF([[t2.form_1099_box]], '') IN (SELECT +value FROM json_each('["misc_1","misc_2","misc_3","misc_5","misc_6","misc_8","misc_9","misc_10","misc_11"]')) AND [[t2.form_1099_box]] IN ('misc_1', 'misc_2', 'misc_3', 'misc_5', 'misc_6', 'misc_8', 'misc_9', 'misc_10', 'misc_11', NULL)))))),
a0 AS (SELECT ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
rs0 AS (SELECT ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt1 GROUP BY ck0),
g0 AS (SELECT a.*, COALESCE(rs0.ch_v1, 0) AS ch_v1, COALESCE(rs0.ch_v4, 0) AS ch_v4, COALESCE(rs0.ch_v3, 0) AS ch_v3 FROM a0 a LEFT JOIN rs0 ON 1 AND rs0.ck0 IS a.ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, NULL AS v5, NULL AS v6, NULL AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM g0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch_v1, 0) AS ch_v1, COALESCE(rs1.ch_v4, 0) AS ch_v4, COALESCE(rs1.ch_v3, 0) AS ch_v3 FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, [[t4.legal_name]] AS rc2, NULLIF([[t4.id]], '') AS rc3 FROM g1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
lk1 AS MATERIALIZED (SELECT * FROM (SELECT a.*, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh0, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh1 FROM gr1 a) a),
rt1 AS (SELECT a.k0 AS k0, a.ck0 AS ck0, 1 AS __shown, a.ch_v1 AS v1, NULL AS vmx1, a.ch_v3 AS v3, NULL AS vmx3, a.ch_v4 AS v4, NULL AS vmx4 FROM lk1 a WHERE COALESCE((('meets' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('meets' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('meets' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
s1 AS MATERIALIZED (SELECT a.* FROM lk1 a WHERE COALESCE((('meets' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('meets' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('meets' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, a.k0 AS v5, NULL AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL), (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL) AS __s1_6, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, COALESCE(sum((COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) - COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0))), 0) AS y1, COALESCE(sum((COALESCE(w.h9, 0) - COALESCE(w.h10, 0))), 0) AS y2, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t7.id]], '') AS rc0, [[t7.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t7 ON [[t7.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, a.y0 AS v1, NULL AS vmx1, a.y2 AS v3, NULL AS vmx3, a.y1 AS v4, NULL AS vmx4 FROM gr2 a WHERE 1),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE EXISTS (SELECT 1 FROM s1 p WHERE p.k0 IS a.k0 AND p.ck0 IS a.ck0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, (CASE WHEN (a.y1 IS 0) THEN NULL ELSE a.y1 END) AS v2, a.y2 AS v3, a.y1 AS v4, a.k0 AS v5, a.k1 AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL), (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END), ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL), (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (CASE WHEN (a.k1 IS 'nec_1') THEN 'NEC 1 · Nonemployee compensation' WHEN (a.k1 IS 'misc_1') THEN 'MISC 1 · Rents' WHEN (a.k1 IS 'misc_2') THEN 'MISC 2 · Royalties' WHEN (a.k1 IS 'misc_3') THEN 'MISC 3 · Other income' WHEN (a.k1 IS 'misc_5') THEN 'MISC 5 · Fishing boat proceeds' WHEN (a.k1 IS 'misc_6') THEN 'MISC 6 · Medical and health care payments' WHEN (a.k1 IS 'misc_8') THEN 'MISC 8 · Substitute payments in lieu of dividends or interest' WHEN (a.k1 IS 'misc_9') THEN 'MISC 9 · Crop insurance proceeds' WHEN (a.k1 IS 'misc_10') THEN 'MISC 10 · Gross proceeds paid to an attorney' WHEN (a.k1 IS 'misc_11') THEN 'MISC 11 · Fish purchased for resale' ELSE 'Not reported' END) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL) AS __s2_0, (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) AS __s2_1, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_2, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_3, (tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s2_4, tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s2_5, (lower(a.rc1) IS NULL) AS __s2_6, lower(a.rc1) AS __s2_7, ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL) AS __s2_8, (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t8.display_name]], ''), '(no name)')
FROM r1 t8
WHERE [[t8.id]] IS a.k0) AS wh0 FROM s2 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1),
pp2 AS (SELECT o.k0, o.k1, o.ck0, pp.__p1, o.__ord AS __p2 FROM o2 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, NULL AS __p2, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1
UNION ALL
SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, pp.__p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, o.__s2_0, o.__s2_1, o.__s2_2, o.__s2_3, o.__s2_4, o.__s2_5, o.__s2_6, o.__s2_7, o.__s2_8, o.__s2_9, o.__s2_10, o.__s2_11 FROM o2 o JOIN pp2 pp ON o.k0 IS pp.k0 AND o.k1 IS pp.k1 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1, __p2 LIMIT 201)
UNION ALL
SELECT __level, __row, k0, k1, ck0, v0, v1, v2, v3, v4, v5, v6, vl5, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1, __p2
```

no statistics:

```
CO-ROUTINE (subquery-48)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-46)
        CO-ROUTINE (subquery-45)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-50)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 21
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 22
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 27
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 30
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-50)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-52)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 37
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 39
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-52)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-45)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-46)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-53)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 25
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-53)
      SCAN o0
SCAN (subquery-48)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-48)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-46)
        CO-ROUTINE (subquery-45)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-50)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (ANY(account) AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                BLOOM FILTER ON books_accounts (id=?)
                                SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SCAN books_accounts
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 21
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 22
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 27
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 30
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-50)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-52)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 37
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 39
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-52)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-45)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-46)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-53)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 25
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-53)
      SCAN o0
SCAN (subquery-48)
USE TEMP B-TREE FOR ORDER BY
```

## Run 5 largest reportable, statement 7

```sql
WITH r0 AS (SELECT `books_settings`.* FROM `books_settings`)
SELECT (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS v0, (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS c0
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

## Run 6 five vendors, statement 1

```sql
SELECT `books_settings`.* FROM `books_settings` WHERE `books_settings`.`id`='bookssettings01' LIMIT 1
```

no statistics:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

after ANALYZE:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

## Run 6 five vendors, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
```

no statistics:

```
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

after ANALYZE:

```
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

## Run 6 five vendors, statement 3

```sql
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1))
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
```

## Run 6 five vendors, statement 4

```sql
SELECT seq, name FROM pragma_database_list
```

no statistics:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

after ANALYZE:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

## Run 6 five vendors, statement 5

```sql
SELECT type, name, tbl_name, COALESCE(rootpage, 0) AS rootpage,
				CASE WHEN type = 'view' OR (type = 'table' AND COALESCE(rootpage, 0) = 0) THEN COALESCE(sql, '') ELSE '' END AS sql
				FROM "main".sqlite_schema
```

no statistics:

```
SCAN main.sqlite_schema
```

after ANALYZE:

```
SCAN main.sqlite_schema
```

## Run 6 five vendors, statement 6

```sql
WITH r0 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r2 AS (SELECT `books_settings`.* FROM `books_settings`),
r3 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r4 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t1.vendor]], '') AS c0, NULLIF([[t1.vendor]], '') AS c5, NULLIF([[t2.form_1099_box]], '') AS c6, [[t1.currency]] AS ck0, NULLIF([[t1.vendor]], '') AS k0, NULLIF([[t2.form_1099_box]], '') AS k1, NULLIF([[t2.form_1099_box]], '') AS h7, [[t1.card_payment]] AS h8, [[t1.debit]] AS h9, [[t1.credit]] AS h10
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], CAST(NULL AS TEXT) AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff') AND [[p.vendor]] IN (SELECT +value FROM json_each('["v3ezjfcwox61rlk","9y7vkqzxpol2c72","9bqr8wdo57onyjq","nxfqpazvd0dwrcz","dx8z0zg0c5d1f9k"]'))
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.payment_entry]] AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r4 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff') AND [[p.vendor]] IN (SELECT +value FROM json_each('["v3ezjfcwox61rlk","9y7vkqzxpol2c72","9bqr8wdo57onyjq","nxfqpazvd0dwrcz","dx8z0zg0c5d1f9k"]'))) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.account]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.vendor]]
WHERE (([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t2.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t2.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)) AND (/*pc1*/(/*pc0*/(NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger')/*pc0*/ AND (NOT COALESCE((NULLIF([[t1.doc_type]], '') IN (SELECT +value FROM json_each('["bill","invoice","credit_memo","vendor_credit","write_off"]')) AND [[t1.doc_type]] IN ('bill', 'invoice', 'credit_memo', 'vendor_credit', 'write_off', NULL)), 0)))/*pc1*/ OR /*pc3*/(/*pc2*/(NULLIF([[t1.layer]], '') IS 'cash' AND [[t1.layer]] = 'cash')/*pc2*/ AND (NOT COALESCE((NULLIF([[t1.payment_entry]], '') IS NULL OR NULLIF([[t1.payment_entry]], '') = ''), 0)))/*pc3*/) AND (NOT COALESCE((NULLIF([[t1.vendor]], '') IS NULL OR NULLIF([[t1.vendor]], '') = ''), 0)) AND ([[t3.track_1099]] IS ('tracked' IS NOT 'untracked')) AND (NULLIF([[t1.vendor]], '') IN (SELECT +value FROM json_each('["v3ezjfcwox61rlk","9y7vkqzxpol2c72","9bqr8wdo57onyjq","nxfqpazvd0dwrcz","dx8z0zg0c5d1f9k"]'))) AND (('all' IS 'all') OR (('all' IS 'nec') AND (NULLIF([[t2.form_1099_box]], '') IS 'nec_1' AND [[t2.form_1099_box]] = 'nec_1')) OR (('all' IS 'misc') AND (NULLIF([[t2.form_1099_box]], '') IN (SELECT +value FROM json_each('["misc_1","misc_2","misc_3","misc_5","misc_6","misc_8","misc_9","misc_10","misc_11"]')) AND [[t2.form_1099_box]] IN ('misc_1', 'misc_2', 'misc_3', 'misc_5', 'misc_6', 'misc_8', 'misc_9', 'misc_10', 'misc_11', NULL)))))),
a0 AS (SELECT ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
rs0 AS (SELECT ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt1 GROUP BY ck0),
g0 AS (SELECT a.*, COALESCE(rs0.ch_v1, 0) AS ch_v1, COALESCE(rs0.ch_v4, 0) AS ch_v4, COALESCE(rs0.ch_v3, 0) AS ch_v3 FROM a0 a LEFT JOIN rs0 ON 1 AND rs0.ck0 IS a.ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, NULL AS v5, NULL AS v6, NULL AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM g0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch_v1, 0) AS ch_v1, COALESCE(rs1.ch_v4, 0) AS ch_v4, COALESCE(rs1.ch_v3, 0) AS ch_v3 FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, [[t4.legal_name]] AS rc2, NULLIF([[t4.id]], '') AS rc3 FROM g1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
lk1 AS MATERIALIZED (SELECT * FROM (SELECT a.*, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh0, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh1 FROM gr1 a) a),
rt1 AS (SELECT a.k0 AS k0, a.ck0 AS ck0, 1 AS __shown, a.ch_v1 AS v1, NULL AS vmx1, a.ch_v3 AS v3, NULL AS vmx3, a.ch_v4 AS v4, NULL AS vmx4 FROM lk1 a WHERE COALESCE((('tracked' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('tracked' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('tracked' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
s1 AS MATERIALIZED (SELECT a.* FROM lk1 a WHERE COALESCE((('tracked' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('tracked' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('tracked' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, a.k0 AS v5, NULL AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL), (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL) AS __s1_6, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, COALESCE(sum((COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) - COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0))), 0) AS y1, COALESCE(sum((COALESCE(w.h9, 0) - COALESCE(w.h10, 0))), 0) AS y2, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t7.id]], '') AS rc0, [[t7.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t7 ON [[t7.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, a.y0 AS v1, NULL AS vmx1, a.y2 AS v3, NULL AS vmx3, a.y1 AS v4, NULL AS vmx4 FROM gr2 a WHERE 1),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE EXISTS (SELECT 1 FROM s1 p WHERE p.k0 IS a.k0 AND p.ck0 IS a.ck0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, (CASE WHEN (a.y1 IS 0) THEN NULL ELSE a.y1 END) AS v2, a.y2 AS v3, a.y1 AS v4, a.k0 AS v5, a.k1 AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL), (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END), ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL), (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (CASE WHEN (a.k1 IS 'nec_1') THEN 'NEC 1 · Nonemployee compensation' WHEN (a.k1 IS 'misc_1') THEN 'MISC 1 · Rents' WHEN (a.k1 IS 'misc_2') THEN 'MISC 2 · Royalties' WHEN (a.k1 IS 'misc_3') THEN 'MISC 3 · Other income' WHEN (a.k1 IS 'misc_5') THEN 'MISC 5 · Fishing boat proceeds' WHEN (a.k1 IS 'misc_6') THEN 'MISC 6 · Medical and health care payments' WHEN (a.k1 IS 'misc_8') THEN 'MISC 8 · Substitute payments in lieu of dividends or interest' WHEN (a.k1 IS 'misc_9') THEN 'MISC 9 · Crop insurance proceeds' WHEN (a.k1 IS 'misc_10') THEN 'MISC 10 · Gross proceeds paid to an attorney' WHEN (a.k1 IS 'misc_11') THEN 'MISC 11 · Fish purchased for resale' ELSE 'Not reported' END) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL) AS __s2_0, (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) AS __s2_1, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_2, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_3, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s2_4, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s2_5, (lower(a.rc1) IS NULL) AS __s2_6, lower(a.rc1) AS __s2_7, ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL) AS __s2_8, (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t8.display_name]], ''), '(no name)')
FROM r1 t8
WHERE [[t8.id]] IS a.k0) AS wh0 FROM s2 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1),
pp2 AS (SELECT o.k0, o.k1, o.ck0, pp.__p1, o.__ord AS __p2 FROM o2 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, NULL AS __p2, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1
UNION ALL
SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, pp.__p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, o.__s2_0, o.__s2_1, o.__s2_2, o.__s2_3, o.__s2_4, o.__s2_5, o.__s2_6, o.__s2_7, o.__s2_8, o.__s2_9, o.__s2_10, o.__s2_11 FROM o2 o JOIN pp2 pp ON o.k0 IS pp.k0 AND o.k1 IS pp.k1 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1, __p2 LIMIT 201)
UNION ALL
SELECT __level, __row, k0, k1, ck0, v0, v1, v2, v3, v4, v5, v6, vl5, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1, __p2
```

no statistics:

```
CO-ROUTINE (subquery-51)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-49)
        CO-ROUTINE (subquery-48)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-53)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 13
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 6
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 11
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 12
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 13
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 11
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 12
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 24
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 25
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 30
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 33
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-53)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-55)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 40
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 42
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-55)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-48)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-49)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-56)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 28
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-56)
      SCAN o0
SCAN (subquery-51)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-51)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-49)
        CO-ROUTINE (subquery-48)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-53)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (ANY(account) AND ANY(posted) AND vendor=? AND date>? AND date<?)
                                LIST SUBQUERY 6
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                LIST SUBQUERY 12
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 11
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                BLOOM FILTER ON books_accounts (id=?)
                                SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 13
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SEARCH books_cash_basis_lines USING INDEX idx_books_cash_basis_lines_account_posted_vendor_date (ANY(account) AND ANY(posted) AND vendor=? AND date>? AND date<?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                LIST SUBQUERY 12
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 11
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                BLOOM FILTER ON books_accounts (id=?)
                                SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 13
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 24
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 25
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 30
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 33
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-53)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-55)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 40
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 42
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-55)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-48)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-49)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-56)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 28
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-56)
      SCAN o0
SCAN (subquery-51)
USE TEMP B-TREE FOR ORDER BY
```

## Run 6 five vendors, statement 7

```sql
WITH r0 AS (SELECT `books_settings`.* FROM `books_settings`)
SELECT (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS v0, (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS c0
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

## Run 6 five vendors, statement 8

```sql
WITH r0 AS (SELECT `books_vendors`.* FROM `books_vendors`)
SELECT o.v AS v, o.l AS l, o.lc AS lc, o.g AS g FROM (SELECT CAST(NULLIF([[t1.id]], '') AS TEXT) AS v, COALESCE(min(NULLIF(CAST([[t1.display_name]] AS TEXT), '')), '') AS l, min(NULL) AS lc, NULL AS g, NULL AS k, NULL AS ok
FROM r0 t1
WHERE 1 AND CAST(NULLIF([[t1.id]], '') AS TEXT) IS NOT NULL
GROUP BY 1) o
WHERE 1 AND o.v IN (SELECT +value FROM json_each('["v3ezjfcwox61rlk","9y7vkqzxpol2c72","9bqr8wdo57onyjq","nxfqpazvd0dwrcz","dx8z0zg0c5d1f9k"]'))
ORDER BY o.l <> '', o.l, o.v LIMIT 6
```

no statistics:

```
CO-ROUTINE o
  SCAN books_vendors
  USE TEMP B-TREE FOR GROUP BY
  LIST SUBQUERY 3
    SCAN json_each VIRTUAL TABLE INDEX 1:
    CREATE BLOOM FILTER
SCAN o
REUSE LIST SUBQUERY 3
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE o
  SCAN books_vendors
  USE TEMP B-TREE FOR GROUP BY
  LIST SUBQUERY 3
    SCAN json_each VIRTUAL TABLE INDEX 1:
    CREATE BLOOM FILTER
SCAN o
REUSE LIST SUBQUERY 3
USE TEMP B-TREE FOR ORDER BY
```

## Run 7 box opened, statement 1

```sql
SELECT `books_settings`.* FROM `books_settings` WHERE `books_settings`.`id`='bookssettings01' LIMIT 1
```

no statistics:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

after ANALYZE:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

## Run 7 box opened, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
```

no statistics:

```
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

after ANALYZE:

```
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

## Run 7 box opened, statement 3

```sql
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1))
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
```

## Run 7 box opened, statement 4

```sql
SELECT seq, name FROM pragma_database_list
```

no statistics:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

after ANALYZE:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

## Run 7 box opened, statement 5

```sql
SELECT type, name, tbl_name, COALESCE(rootpage, 0) AS rootpage,
				CASE WHEN type = 'view' OR (type = 'table' AND COALESCE(rootpage, 0) = 0) THEN COALESCE(sql, '') ELSE '' END AS sql
				FROM "main".sqlite_schema
```

no statistics:

```
SCAN main.sqlite_schema
```

after ANALYZE:

```
SCAN main.sqlite_schema
```

## Run 7 box opened, statement 6

```sql
WITH r0 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r2 AS (SELECT `books_settings`.* FROM `books_settings`),
r3 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r4 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t1.vendor]], '') AS c0, NULLIF([[t1.vendor]], '') AS c5, NULLIF([[t2.form_1099_box]], '') AS c6, [[t1.currency]] AS ck0, NULLIF([[t1.vendor]], '') AS k0, NULLIF([[t2.form_1099_box]], '') AS k1, NULLIF([[t2.form_1099_box]], '') AS h7, [[t1.card_payment]] AS h8, [[t1.debit]] AS h9, [[t1.credit]] AS h10
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], CAST(NULL AS TEXT) AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.payment_entry]] AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r4 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.account]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.vendor]]
WHERE (([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t2.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t2.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)) AND (/*pc1*/(/*pc0*/(NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger')/*pc0*/ AND (NOT COALESCE((NULLIF([[t1.doc_type]], '') IN (SELECT +value FROM json_each('["bill","invoice","credit_memo","vendor_credit","write_off"]')) AND [[t1.doc_type]] IN ('bill', 'invoice', 'credit_memo', 'vendor_credit', 'write_off', NULL)), 0)))/*pc1*/ OR /*pc3*/(/*pc2*/(NULLIF([[t1.layer]], '') IS 'cash' AND [[t1.layer]] = 'cash')/*pc2*/ AND (NOT COALESCE((NULLIF([[t1.payment_entry]], '') IS NULL OR NULLIF([[t1.payment_entry]], '') = ''), 0)))/*pc3*/) AND (NOT COALESCE((NULLIF([[t1.vendor]], '') IS NULL OR NULLIF([[t1.vendor]], '') = ''), 0)) AND ([[t3.track_1099]] IS ('tracked' IS NOT 'untracked')) AND (('all' IS 'all') OR (('all' IS 'nec') AND (NULLIF([[t2.form_1099_box]], '') IS 'nec_1' AND [[t2.form_1099_box]] = 'nec_1')) OR (('all' IS 'misc') AND (NULLIF([[t2.form_1099_box]], '') IN (SELECT +value FROM json_each('["misc_1","misc_2","misc_3","misc_5","misc_6","misc_8","misc_9","misc_10","misc_11"]')) AND [[t2.form_1099_box]] IN ('misc_1', 'misc_2', 'misc_3', 'misc_5', 'misc_6', 'misc_8', 'misc_9', 'misc_10', 'misc_11', NULL)))))),
a0 AS (SELECT ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
rs0 AS (SELECT ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt1 GROUP BY ck0),
g0 AS (SELECT a.*, COALESCE(rs0.ch_v1, 0) AS ch_v1, COALESCE(rs0.ch_v4, 0) AS ch_v4, COALESCE(rs0.ch_v3, 0) AS ch_v3 FROM a0 a LEFT JOIN rs0 ON 1 AND rs0.ck0 IS a.ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, NULL AS v5, NULL AS v6, NULL AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM g0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch_v1, 0) AS ch_v1, COALESCE(rs1.ch_v4, 0) AS ch_v4, COALESCE(rs1.ch_v3, 0) AS ch_v3 FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, [[t4.legal_name]] AS rc2, NULLIF([[t4.id]], '') AS rc3 FROM g1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
lk1 AS MATERIALIZED (SELECT * FROM (SELECT a.*, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh0, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh1 FROM gr1 a) a),
rt1 AS (SELECT a.k0 AS k0, a.ck0 AS ck0, 1 AS __shown, a.ch_v1 AS v1, NULL AS vmx1, a.ch_v3 AS v3, NULL AS vmx3, a.ch_v4 AS v4, NULL AS vmx4 FROM lk1 a WHERE COALESCE((('tracked' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('tracked' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('tracked' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
s1 AS MATERIALIZED (SELECT a.* FROM lk1 a WHERE COALESCE((('tracked' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('tracked' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('tracked' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, a.k0 AS v5, NULL AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL), (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL) AS __s1_6, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, COALESCE(sum((COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) - COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0))), 0) AS y1, COALESCE(sum((COALESCE(w.h9, 0) - COALESCE(w.h10, 0))), 0) AS y2, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t7.id]], '') AS rc0, [[t7.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t7 ON [[t7.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, a.y0 AS v1, NULL AS vmx1, a.y2 AS v3, NULL AS vmx3, a.y1 AS v4, NULL AS vmx4 FROM gr2 a WHERE 1),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE EXISTS (SELECT 1 FROM s1 p WHERE p.k0 IS a.k0 AND p.ck0 IS a.ck0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, (CASE WHEN (a.y1 IS 0) THEN NULL ELSE a.y1 END) AS v2, a.y2 AS v3, a.y1 AS v4, a.k0 AS v5, a.k1 AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL), (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END), ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL), (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (CASE WHEN (a.k1 IS 'nec_1') THEN 'NEC 1 · Nonemployee compensation' WHEN (a.k1 IS 'misc_1') THEN 'MISC 1 · Rents' WHEN (a.k1 IS 'misc_2') THEN 'MISC 2 · Royalties' WHEN (a.k1 IS 'misc_3') THEN 'MISC 3 · Other income' WHEN (a.k1 IS 'misc_5') THEN 'MISC 5 · Fishing boat proceeds' WHEN (a.k1 IS 'misc_6') THEN 'MISC 6 · Medical and health care payments' WHEN (a.k1 IS 'misc_8') THEN 'MISC 8 · Substitute payments in lieu of dividends or interest' WHEN (a.k1 IS 'misc_9') THEN 'MISC 9 · Crop insurance proceeds' WHEN (a.k1 IS 'misc_10') THEN 'MISC 10 · Gross proceeds paid to an attorney' WHEN (a.k1 IS 'misc_11') THEN 'MISC 11 · Fish purchased for resale' ELSE 'Not reported' END) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL) AS __s2_0, (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) AS __s2_1, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_2, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_3, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s2_4, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s2_5, (lower(a.rc1) IS NULL) AS __s2_6, lower(a.rc1) AS __s2_7, ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL) AS __s2_8, (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t8.display_name]], ''), '(no name)')
FROM r1 t8
WHERE [[t8.id]] IS a.k0) AS wh0 FROM s2 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1),
pp2 AS (SELECT o.k0, o.k1, o.ck0, pp.__p1, o.__ord AS __p2 FROM o2 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, NULL AS __p2, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1
UNION ALL
SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, pp.__p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, o.__s2_0, o.__s2_1, o.__s2_2, o.__s2_3, o.__s2_4, o.__s2_5, o.__s2_6, o.__s2_7, o.__s2_8, o.__s2_9, o.__s2_10, o.__s2_11 FROM o2 o JOIN pp2 pp ON o.k0 IS pp.k0 AND o.k1 IS pp.k1 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1, __p2 LIMIT 201)
UNION ALL
SELECT __level, __row, k0, k1, ck0, v0, v1, v2, v3, v4, v5, v6, vl5, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1, __p2
```

no statistics:

```
CO-ROUTINE (subquery-48)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-46)
        CO-ROUTINE (subquery-45)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-50)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 21
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 22
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 27
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 30
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-50)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-52)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 37
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 39
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-52)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-45)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-46)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-53)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 25
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-53)
      SCAN o0
SCAN (subquery-48)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-48)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-46)
        CO-ROUTINE (subquery-45)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-50)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (ANY(account) AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                BLOOM FILTER ON books_accounts (id=?)
                                SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SCAN books_accounts
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 21
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 22
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 27
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 30
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-50)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-52)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 37
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 39
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-52)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-45)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-46)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-53)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 25
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-53)
      SCAN o0
SCAN (subquery-48)
USE TEMP B-TREE FOR ORDER BY
```

## Run 7 box opened, statement 7

```sql
WITH r0 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r2 AS (SELECT `books_settings`.* FROM `books_settings`),
r3 AS (SELECT `books_journal_entries`.* FROM `books_journal_entries`),
r4 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r5 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
gord AS MATERIALIZED (SELECT key AS __g, json_extract(value, '$[0]') AS g0, json_extract(value, '$[1]') AS g1, json_extract(value, '$[2]') AS g2 FROM json_each('[["8iyzxg045i6e0bu",null,"USD"]]')),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t1.vendor]], '') AS c0, NULLIF([[t1.vendor]], '') AS c5, NULLIF([[t2.form_1099_box]], '') AS c6, [[t1.currency]] AS ck0, NULLIF([[t1.vendor]], '') AS k0, NULLIF([[t2.form_1099_box]], '') AS k1, NULLIF([[t2.form_1099_box]], '') AS h7, [[t1.card_payment]] AS h8, [[t1.debit]] AS h9, [[t1.credit]] AS h10, NULLIF(substr([[t1.date]], 1, 10), '') AS h11, NULLIF([[t6.posted_at]], '') AS h12, [[t1.position]] AS h13, NULLIF([[t6.origin]], '') AS h14, [[t10.number]] AS h15, [[t6.number]] AS h16, NULLIF([[t6.doc_type]], '') AS h17, [[t2.number]] AS h18, [[t2.full_name]] AS h19, [[t1.memo]] AS h20, [[t6.memo]] AS h21, [[t6.document]] AS h22, NULLIF([[t1.entry]], '') AS h23
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], CAST(NULL AS TEXT) AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r4 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.payment_entry]] AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r5 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.account]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.vendor]]
LEFT JOIN r3 t6 ON [[t6.id]] = [[t1.entry]]
LEFT JOIN r3 t10 ON [[t10.id]] = [[t6.reverses]]
WHERE ((([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t2.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t2.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)) AND (/*pc1*/(/*pc0*/(NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger')/*pc0*/ AND (NOT COALESCE((NULLIF([[t1.doc_type]], '') IN (SELECT +value FROM json_each('["bill","invoice","credit_memo","vendor_credit","write_off"]')) AND [[t1.doc_type]] IN ('bill', 'invoice', 'credit_memo', 'vendor_credit', 'write_off', NULL)), 0)))/*pc1*/ OR /*pc3*/(/*pc2*/(NULLIF([[t1.layer]], '') IS 'cash' AND [[t1.layer]] = 'cash')/*pc2*/ AND (NOT COALESCE((NULLIF([[t1.payment_entry]], '') IS NULL OR NULLIF([[t1.payment_entry]], '') = ''), 0)))/*pc3*/) AND (NOT COALESCE((NULLIF([[t1.vendor]], '') IS NULL OR NULLIF([[t1.vendor]], '') = ''), 0)) AND ([[t3.track_1099]] IS ('tracked' IS NOT 'untracked')) AND (('all' IS 'all') OR (('all' IS 'nec') AND (NULLIF([[t2.form_1099_box]], '') IS 'nec_1' AND [[t2.form_1099_box]] = 'nec_1')) OR (('all' IS 'misc') AND (NULLIF([[t2.form_1099_box]], '') IN (SELECT +value FROM json_each('["misc_1","misc_2","misc_3","misc_5","misc_6","misc_8","misc_9","misc_10","misc_11"]')) AND [[t2.form_1099_box]] IN ('misc_1', 'misc_2', 'misc_3', 'misc_5', 'misc_6', 'misc_8', 'misc_9', 'misc_10', 'misc_11', NULL)))))) AND [[t1.vendor]] IN (SELECT g0 FROM gord WHERE g0 IS NOT NULL)),
a1 AS (SELECT k0, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, [[t4.legal_name]] AS rc2, NULLIF([[t4.id]], '') AS rc3 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
lk1 AS MATERIALIZED (SELECT * FROM (SELECT a.*, (SELECT (CASE WHEN t5.id IS NOT NULL THEN [[t5.threshold_1099]] END)
FROM r2 t5
WHERE 1 AND (CASE WHEN t5.id IS NOT NULL THEN [[t5.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t5.id IS NOT NULL THEN [[t5.threshold_1099]] END) ASC, (CASE WHEN t5.id IS NOT NULL THEN [[t5.currency]] END) LIMIT 1) AS kh0, (SELECT (CASE WHEN t5.id IS NOT NULL THEN [[t5.currency]] END)
FROM r2 t5
WHERE 1 AND (CASE WHEN t5.id IS NOT NULL THEN [[t5.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t5.id IS NOT NULL THEN [[t5.threshold_1099]] END) ASC, (CASE WHEN t5.id IS NOT NULL THEN [[t5.currency]] END) LIMIT 1) AS kh1 FROM gr1 a) a),
s1 AS MATERIALIZED (SELECT a.* FROM lk1 a WHERE COALESCE((('tracked' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('tracked' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('tracked' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
ws AS (SELECT w.* FROM w WHERE EXISTS (SELECT 1 FROM s1 p WHERE p.k0 IS w.k0 AND p.ck0 IS w.ck0))
SELECT * FROM (WITH wpage AS MATERIALIZED (SELECT * FROM (SELECT d.*, gord.__g AS __g FROM (SELECT w.*, (CASE WHEN (w.c6 IS 'nec_1') THEN 0 WHEN (w.c6 IS 'misc_1') THEN 1 WHEN (w.c6 IS 'misc_2') THEN 2 WHEN (w.c6 IS 'misc_3') THEN 3 WHEN (w.c6 IS 'misc_5') THEN 4 WHEN (w.c6 IS 'misc_6') THEN 5 WHEN (w.c6 IS 'misc_8') THEN 6 WHEN (w.c6 IS 'misc_9') THEN 7 WHEN (w.c6 IS 'misc_10') THEN 8 WHEN (w.c6 IS 'misc_11') THEN 9 ELSE 10 END) AS s0, w.h11 AS s1, w.h12 AS s2, w.h13 AS s3, (CASE WHEN (w.h9 > w.h10) THEN 0 ELSE 1 END) AS s4, (CASE WHEN (w.rc0 IS NULL OR w.rc0 = '') THEN 1 ELSE 0 END) AS s5, tc_round((CASE WHEN ('name' IS 'amount') THEN COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0) ELSE 0 END), 0) AS s6, lower(w.rc1) AS s7 FROM (SELECT w.*, NULLIF([[t7.id]], '') AS rc0, [[t7.display_name]] AS rc1 FROM ws w LEFT JOIN r1 t7 ON [[t7.id]] IS w.k0) w) d CROSS JOIN gord ON +d.k0 IS gord.g0 AND +d.k1 IS gord.g1 AND +d.ck0 IS gord.g2) d WHERE 1 ORDER BY d.__g, (d.s0 IS NULL), d.s0, (d.s1 IS NULL), d.s1, (d.s2 IS NULL), d.s2, (d.s3 IS NULL), d.s3, (d.s4 IS NULL), d.s4, (d.s5 IS NULL), d.s5, (d.s6 IS NULL), d.s6 DESC, (d.s7 IS NULL), d.s7, d.__id LIMIT 201), wcells AS MATERIALIZED (SELECT * FROM (SELECT w.*, (SELECT COALESCE(NULLIF([[t9.display_name]], ''), '(no name)')
FROM r1 t9
WHERE [[t9.id]] IS w.c5) AS wh1 FROM (SELECT w.*, (SELECT COALESCE(NULLIF([[t8.display_name]], ''), '(no name)')
FROM r1 t8
WHERE [[t8.id]] IS w.c0) AS wh0 FROM (SELECT * FROM wpage) w) w) w) SELECT w.__id AS __id, w.k0 AS k0, w.k1 AS k1, w.ck0 AS ck0, w.s0 AS s0, w.s1 AS s1, w.s2 AS s2, w.s3 AS s3, w.s4 AS s4, w.s5 AS s5, w.s6 AS s6, w.s7 AS s7, w.c0 AS v0, NULL AS vcur0, NULL AS vmx0, w.wh0 AS vl0, NULL AS vc0, COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0) AS v1, NULL AS vcur1, NULL AS vmx1, NULL AS vl1, NULL AS vc1, (CASE WHEN (COALESCE((COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) - COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0)), 0) IS 0) THEN NULL ELSE COALESCE((COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) - COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0)), 0) END) AS v2, NULL AS vcur2, NULL AS vmx2, NULL AS vl2, NULL AS vc2, COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) AS v3, NULL AS vcur3, NULL AS vmx3, NULL AS vl3, NULL AS vc3, COALESCE((COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) - COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0)), 0) AS v4, NULL AS vcur4, NULL AS vmx4, NULL AS vl4, NULL AS vc4, w.c5 AS v5, NULL AS vcur5, NULL AS vmx5, w.wh1 AS vl5, NULL AS vc5, w.c6 AS v6, NULL AS vcur6, NULL AS vmx6, NULL AS vl6, NULL AS vc6, (COALESCE((COALESCE(w.h11, '') || COALESCE(' · ', '') || COALESCE((CASE WHEN ((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))) AND (w.h15 IS w.h16)) THEN (CASE WHEN ((w.h17 IS 'bill') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill' WHEN ((w.h17 IS 'bill_payment') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill payment' WHEN ((w.h17 IS 'credit_memo') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Credit memo' WHEN ((w.h17 IS 'deposit') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Deposit' WHEN ((w.h17 IS 'expense') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Expense' WHEN ((w.h17 IS 'invoice') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Invoice' WHEN ((w.h17 IS 'payment') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Payment' WHEN ((w.h17 IS 'refund_receipt') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Refund receipt' WHEN ((w.h17 IS 'sales_receipt') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Sales receipt' WHEN ((w.h17 IS 'transfer') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Transfer' WHEN ((w.h17 IS 'vendor_credit') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor credit' WHEN ((w.h17 IS 'vendor_refund') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor refund' WHEN ((w.h17 IS 'write_off') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Write-off' WHEN (w.h14 IS 'reversal') THEN (CASE WHEN (w.h15 IS NULL OR w.h15 = '') THEN 'Reversal' ELSE (COALESCE('Reversal', '') || COALESCE(' of ', '') || COALESCE(w.h15, '')) END) WHEN (w.h14 IS 'void_reversal') THEN (CASE WHEN (w.h15 IS NULL OR w.h15 = '') THEN 'Void reversal' ELSE (COALESCE('Void reversal', '') || COALESCE(' of ', '') || COALESCE(w.h15, '')) END) WHEN (w.h14 IS 'auto_reversal') THEN (CASE WHEN (w.h15 IS NULL OR w.h15 = '') THEN 'Auto reversal' ELSE (COALESCE('Auto reversal', '') || COALESCE(' of ', '') || COALESCE(w.h15, '')) END) WHEN (w.h14 IS 'manual') THEN 'Journal entry' WHEN (w.h14 IS 'opening_balance') THEN 'Opening balances' ELSE 'Journal entry' END) ELSE (COALESCE((CASE WHEN ((w.h17 IS 'bill') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill' WHEN ((w.h17 IS 'bill_payment') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill payment' WHEN ((w.h17 IS 'credit_memo') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Credit memo' WHEN ((w.h17 IS 'deposit') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Deposit' WHEN ((w.h17 IS 'expense') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Expense' WHEN ((w.h17 IS 'invoice') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Invoice' WHEN ((w.h17 IS 'payment') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Payment' WHEN ((w.h17 IS 'refund_receipt') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Refund receipt' WHEN ((w.h17 IS 'sales_receipt') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Sales receipt' WHEN ((w.h17 IS 'transfer') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Transfer' WHEN ((w.h17 IS 'vendor_credit') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor credit' WHEN ((w.h17 IS 'vendor_refund') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor refund' WHEN ((w.h17 IS 'write_off') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Write-off' WHEN (w.h14 IS 'reversal') THEN (CASE WHEN (w.h15 IS NULL OR w.h15 = '') THEN 'Reversal' ELSE (COALESCE('Reversal', '') || COALESCE(' of ', '') || COALESCE(w.h15, '')) END) WHEN (w.h14 IS 'void_reversal') THEN (CASE WHEN (w.h15 IS NULL OR w.h15 = '') THEN 'Void reversal' ELSE (COALESCE('Void reversal', '') || COALESCE(' of ', '') || COALESCE(w.h15, '')) END) WHEN (w.h14 IS 'auto_reversal') THEN (CASE WHEN (w.h15 IS NULL OR w.h15 = '') THEN 'Auto reversal' ELSE (COALESCE('Auto reversal', '') || COALESCE(' of ', '') || COALESCE(w.h15, '')) END) WHEN (w.h14 IS 'manual') THEN 'Journal entry' WHEN (w.h14 IS 'opening_balance') THEN 'Opening balances' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(w.h16, '')) END), '') || COALESCE(' · ', '') || COALESCE((CASE WHEN (w.h18 IS NULL OR w.h18 = '') THEN w.h19 ELSE (COALESCE(w.h18, '') || COALESCE(' ', '') || COALESCE(w.h19, '')) END), '') || COALESCE((CASE WHEN ((CASE WHEN (w.h20 IS NULL OR w.h20 = '') THEN w.h21 ELSE w.h20 END) IS NULL OR (CASE WHEN (w.h20 IS NULL OR w.h20 = '') THEN w.h21 ELSE w.h20 END) = '') THEN '' ELSE (COALESCE(' · ', '') || COALESCE((CASE WHEN (w.h20 IS NULL OR w.h20 = '') THEN w.h21 ELSE w.h20 END), '')) END), '')), '') || COALESCE((CASE WHEN (w.h8 IS true) THEN ' · paid by card' ELSE '' END), '')) AS __label, NULL AS __labelcur, (CASE WHEN ((w.h14 IS 'document') AND (w.h17 IS 'bill') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/bills/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'bill_payment') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/bill-payments/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'credit_memo') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/credit-memos/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'deposit') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/deposits/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'expense') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/expenses/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'invoice') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/invoices/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'payment') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/payments/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'refund_receipt') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/refund-receipts/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'sales_receipt') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/sales-receipts/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'vendor_credit') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/vendor-credits/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'vendor_refund') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/vendor-refunds/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'write_off') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/write-offs/', '') || COALESCE(w.h22, '')) WHEN ((w.h17 IS 'transfer') AND (w.h14 IS 'manual')) THEN (COALESCE('books/transfers/', '') || COALESCE(w.h23, '')) ELSE (COALESCE('books/entries/', '') || COALESCE(w.h23, '')) END) AS __open, w.__g AS __g FROM wcells w) d ORDER BY d.__g, (d.s0 IS NULL), d.s0, (d.s1 IS NULL), d.s1, (d.s2 IS NULL), d.s2, (d.s3 IS NULL), d.s3, (d.s4 IS NULL), d.s4, (d.s5 IS NULL), d.s5, (d.s6 IS NULL), d.s6 DESC, (d.s7 IS NULL), d.s7, d.__id
```

no statistics:

```
MATERIALIZE wcells
  MATERIALIZE wpage
    MATERIALIZE w
      COMPOUND QUERY
        LEFT-MOST SUBQUERY
          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
          LIST SUBQUERY 10
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          LIST SUBQUERY 12
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date>? AND date<?)
          LIST SUBQUERY 11
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          LIST SUBQUERY 13
            MATERIALIZE gord
              SCAN json_each VIRTUAL TABLE INDEX 1:
            SCAN gord
            CREATE BLOOM FILTER
          SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
        UNION ALL
          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
          LIST SUBQUERY 10
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          LIST SUBQUERY 12
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          SEARCH books_cash_basis_lines USING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
          LIST SUBQUERY 11
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          LIST SUBQUERY 13
            SCAN gord
            CREATE BLOOM FILTER
          SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
    SCAN w
    CORRELATED SCALAR SUBQUERY 24
      MATERIALIZE s1
        MATERIALIZE lk1
          CO-ROUTINE a1
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
          SCALAR SUBQUERY 18
            SCAN books_settings
            USE TEMP B-TREE FOR ORDER BY
          SCALAR SUBQUERY 19
            SCAN books_settings
            USE TEMP B-TREE FOR ORDER BY
        SCAN a
        LIST SUBQUERY 22
          SCAN json_each VIRTUAL TABLE INDEX 1:
          CREATE BLOOM FILTER
      BLOOM FILTER ON p (k0=? AND ck0=?)
      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
    BLOOM FILTER ON gord (g0=? AND g1=? AND g2=?)
    SEARCH gord USING AUTOMATIC PARTIAL COVERING INDEX (g0=? AND g1=? AND g2=?)
    USE TEMP B-TREE FOR ORDER BY
  SCAN wpage
  CORRELATED SCALAR SUBQUERY 31
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  CORRELATED SCALAR SUBQUERY 30
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
SCAN w
LIST SUBQUERY 36
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 37
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 38
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 39
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 40
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 41
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 42
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 43
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 44
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 45
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 46
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 47
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 48
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 49
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 50
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 51
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 52
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 53
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 54
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 55
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 56
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 57
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 58
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 59
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 60
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 61
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 62
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
MATERIALIZE wcells
  MATERIALIZE wpage
    MATERIALIZE w
      COMPOUND QUERY
        LEFT-MOST SUBQUERY
          SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (ANY(account) AND ANY(posted) AND vendor=? AND date>? AND date<?)
          LIST SUBQUERY 13
            MATERIALIZE gord
              SCAN json_each VIRTUAL TABLE INDEX 1:
            SCAN gord
          LIST SUBQUERY 11
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          BLOOM FILTER ON books_accounts (id=?)
          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
          LIST SUBQUERY 10
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          LIST SUBQUERY 12
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
        UNION ALL
          SEARCH books_cash_basis_lines USING INDEX idx_books_cash_basis_lines_account_posted_vendor_date (ANY(account) AND ANY(posted) AND vendor=? AND date>? AND date<?)
          LIST SUBQUERY 13
            SCAN gord
          LIST SUBQUERY 11
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          BLOOM FILTER ON books_accounts (id=?)
          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
          LIST SUBQUERY 10
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          LIST SUBQUERY 12
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
    SCAN w
    CORRELATED SCALAR SUBQUERY 24
      MATERIALIZE s1
        MATERIALIZE lk1
          CO-ROUTINE a1
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
          SCALAR SUBQUERY 18
            SCAN books_settings
            USE TEMP B-TREE FOR ORDER BY
          SCALAR SUBQUERY 19
            SCAN books_settings
            USE TEMP B-TREE FOR ORDER BY
        SCAN a
        LIST SUBQUERY 22
          SCAN json_each VIRTUAL TABLE INDEX 1:
          CREATE BLOOM FILTER
      BLOOM FILTER ON p (k0=? AND ck0=?)
      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
    BLOOM FILTER ON gord (g0=? AND g1=? AND g2=?)
    SEARCH gord USING AUTOMATIC PARTIAL COVERING INDEX (g0=? AND g1=? AND g2=?)
    USE TEMP B-TREE FOR ORDER BY
  SCAN wpage
  CORRELATED SCALAR SUBQUERY 31
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  CORRELATED SCALAR SUBQUERY 30
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
SCAN w
LIST SUBQUERY 36
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 37
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 38
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 39
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 40
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 41
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 42
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 43
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 44
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 45
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 46
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 47
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 48
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 49
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 50
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 51
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 52
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 53
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 54
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 55
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 56
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 57
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 58
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 59
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 60
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 61
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 62
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
USE TEMP B-TREE FOR ORDER BY
```

## Run 7 box opened, statement 8

```sql
WITH r0 AS (SELECT `books_settings`.* FROM `books_settings`)
SELECT (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS v0, (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS c0
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

## Run 8 CSV export, statement 1

```sql
SELECT `reports`.* FROM `reports` WHERE [[reports.shipped_key]] = 'books.form_1099' LIMIT 1
```

no statistics:

```
SCAN reports
```

after ANALYZE:

```
SCAN reports
```

## Run 8 CSV export, statement 2

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_account_balances' OR LOWER([[name]])='books_account_balances' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 3

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_accounts' OR LOWER([[name]])='books_accounts' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 4

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_settings' OR LOWER([[name]])='books_settings' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 5

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_journal_lines' OR LOWER([[name]])='books_journal_lines' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 6

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_audit_log' OR LOWER([[name]])='books_audit_log' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 7

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_cash_basis_lines' OR LOWER([[name]])='books_cash_basis_lines' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 8

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_journal_entries' OR LOWER([[name]])='books_journal_entries' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 9

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_customers' OR LOWER([[name]])='books_customers' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 10

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_vendors' OR LOWER([[name]])='books_vendors' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 11

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_cash_basis_balances' OR LOWER([[name]])='books_cash_basis_balances' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 12

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_receivable_items' OR LOWER([[name]])='books_receivable_items' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 13

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_payable_items' OR LOWER([[name]])='books_payable_items' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 14

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_products' OR LOWER([[name]])='books_products' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 15

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_invoice_lines' OR LOWER([[name]])='books_invoice_lines' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 16

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_sales_receipt_lines' OR LOWER([[name]])='books_sales_receipt_lines' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 17

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_credit_memo_lines' OR LOWER([[name]])='books_credit_memo_lines' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 18

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_refund_receipt_sale_lines' OR LOWER([[name]])='books_refund_receipt_sale_lines' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 19

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_invoices' OR LOWER([[name]])='books_invoices' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 20

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_sales_receipts' OR LOWER([[name]])='books_sales_receipts' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 21

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_credit_memos' OR LOWER([[name]])='books_credit_memos' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 22

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_refund_receipts' OR LOWER([[name]])='books_refund_receipts' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 23

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_invoice_tax_lines' OR LOWER([[name]])='books_invoice_tax_lines' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 24

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_sales_receipt_tax_lines' OR LOWER([[name]])='books_sales_receipt_tax_lines' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 25

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_credit_memo_tax_lines' OR LOWER([[name]])='books_credit_memo_tax_lines' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 26

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_refund_receipt_tax_lines' OR LOWER([[name]])='books_refund_receipt_tax_lines' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 27

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_cash_basis_tax_lines' OR LOWER([[name]])='books_cash_basis_tax_lines' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 28

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_tax_rates' OR LOWER([[name]])='books_tax_rates' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 29

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='books_tax_agencies' OR LOWER([[name]])='books_tax_agencies' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 30

```sql
SELECT `reports`.* FROM `reports` WHERE [[reports.shipped_key]] = 'books.transaction_detail' LIMIT 1
```

no statistics:

```
SCAN reports
```

after ANALYZE:

```
SCAN reports
```

## Run 8 CSV export, statement 31

```sql
SELECT `reports`.* FROM `reports` WHERE [[reports.id]] > '' ORDER BY [[reports.id]] ASC LIMIT 50
```

no statistics:

```
SEARCH reports USING INDEX sqlite_autoindex_reports_1 (id>?)
```

after ANALYZE:

```
SEARCH reports USING INDEX sqlite_autoindex_reports_1 (id>?)
```

## Run 8 CSV export, statement 32

```sql
SELECT `users`.* FROM `users` WHERE `users`.`id`='ek42pt1nejj35w5' LIMIT 1
```

no statistics:

```
SEARCH users USING INDEX sqlite_autoindex_users_1 (id=?)
```

after ANALYZE:

```
SEARCH users USING INDEX sqlite_autoindex_users_1 (id=?)
```

## Run 8 CSV export, statement 33

```sql
SELECT `reports`.* FROM `reports` WHERE `reports`.`id`='yfr3gnf7az0rfbs' LIMIT 1
```

no statistics:

```
SEARCH reports USING INDEX sqlite_autoindex_reports_1 (id=?)
```

after ANALYZE:

```
SEARCH reports USING INDEX sqlite_autoindex_reports_1 (id=?)
```

## Run 8 CSV export, statement 34

```sql
SELECT DISTINCT (1) FROM `reports` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `report_shares` `reports_report_shares_via_report` ON [[reports_report_shares_via_report.report]] = [[reports.id]] WHERE (`reports`.`id`='yfr3gnf7az0rfbs') AND (('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND ([[reports.owner]] = 'ek42pt1nejj35w5' OR [[reports_report_shares_via_report.user]] = 'ek42pt1nejj35w5' OR ([[reports.published]] = 1 AND [[__auth_users.role]] IS NOT 'guest')))) LIMIT 1
```

no statistics:

```
SEARCH reports USING INDEX sqlite_autoindex_reports_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH reports_report_shares_via_report USING COVERING INDEX idx_report_shares_unique (report=?) LEFT-JOIN
```

after ANALYZE:

```
SCAN reports
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH reports_report_shares_via_report USING COVERING INDEX idx_report_shares_unique (report=?) LEFT-JOIN
USE TEMP B-TREE FOR DISTINCT
```

## Run 8 CSV export, statement 35

```sql
SELECT `books_settings`.* FROM `books_settings` WHERE `books_settings`.`id`='bookssettings01' LIMIT 1
```

no statistics:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

after ANALYZE:

```
SEARCH books_settings USING INDEX sqlite_autoindex_books_settings_1 (id=?)
```

## Run 8 CSV export, statement 36

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
```

no statistics:

```
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

after ANALYZE:

```
SEARCH books_settings USING COVERING INDEX sqlite_autoindex_books_settings_1 (id=?)
SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
CORRELATED SCALAR SUBQUERY 7
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 8
  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
CORRELATED SCALAR SUBQUERY 9
  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

## Run 8 CSV export, statement 37

```sql
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='ek42pt1nejj35w5' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('ek42pt1nejj35w5' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'ek42pt1nejj35w5' AND [[__collection_alias_me.can_read]] = 1))
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 9
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 10
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 11
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
```

## Run 8 CSV export, statement 38

```sql
SELECT seq, name FROM pragma_database_list
```

no statistics:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

after ANALYZE:

```
SCAN pragma_database_list VIRTUAL TABLE INDEX 0:
```

## Run 8 CSV export, statement 39

```sql
SELECT type, name, tbl_name, COALESCE(rootpage, 0) AS rootpage,
				CASE WHEN type = 'view' OR (type = 'table' AND COALESCE(rootpage, 0) = 0) THEN COALESCE(sql, '') ELSE '' END AS sql
				FROM "main".sqlite_schema
```

no statistics:

```
SCAN main.sqlite_schema
```

after ANALYZE:

```
SCAN main.sqlite_schema
```

## Run 8 CSV export, statement 40

```sql
WITH r0 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r2 AS (SELECT `books_settings`.* FROM `books_settings`),
r3 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r4 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t1.vendor]], '') AS c0, NULLIF([[t1.vendor]], '') AS c5, NULLIF([[t2.form_1099_box]], '') AS c6, [[t1.currency]] AS ck0, NULLIF([[t1.vendor]], '') AS k0, NULLIF([[t2.form_1099_box]], '') AS k1, NULLIF([[t2.form_1099_box]], '') AS h7, [[t1.card_payment]] AS h8, [[t1.debit]] AS h9, [[t1.credit]] AS h10
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], CAST(NULL AS TEXT) AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.payment_entry]] AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r4 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.account]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.vendor]]
WHERE (([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t2.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t2.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)) AND (/*pc1*/(/*pc0*/(NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger')/*pc0*/ AND (NOT COALESCE((NULLIF([[t1.doc_type]], '') IN (SELECT +value FROM json_each('["bill","invoice","credit_memo","vendor_credit","write_off"]')) AND [[t1.doc_type]] IN ('bill', 'invoice', 'credit_memo', 'vendor_credit', 'write_off', NULL)), 0)))/*pc1*/ OR /*pc3*/(/*pc2*/(NULLIF([[t1.layer]], '') IS 'cash' AND [[t1.layer]] = 'cash')/*pc2*/ AND (NOT COALESCE((NULLIF([[t1.payment_entry]], '') IS NULL OR NULLIF([[t1.payment_entry]], '') = ''), 0)))/*pc3*/) AND (NOT COALESCE((NULLIF([[t1.vendor]], '') IS NULL OR NULLIF([[t1.vendor]], '') = ''), 0)) AND ([[t3.track_1099]] IS ('meets' IS NOT 'untracked')) AND (('all' IS 'all') OR (('all' IS 'nec') AND (NULLIF([[t2.form_1099_box]], '') IS 'nec_1' AND [[t2.form_1099_box]] = 'nec_1')) OR (('all' IS 'misc') AND (NULLIF([[t2.form_1099_box]], '') IN (SELECT +value FROM json_each('["misc_1","misc_2","misc_3","misc_5","misc_6","misc_8","misc_9","misc_10","misc_11"]')) AND [[t2.form_1099_box]] IN ('misc_1', 'misc_2', 'misc_3', 'misc_5', 'misc_6', 'misc_8', 'misc_9', 'misc_10', 'misc_11', NULL)))))),
a0 AS (SELECT ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
rs0 AS (SELECT ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt1 GROUP BY ck0),
g0 AS (SELECT a.*, COALESCE(rs0.ch_v1, 0) AS ch_v1, COALESCE(rs0.ch_v4, 0) AS ch_v4, COALESCE(rs0.ch_v3, 0) AS ch_v3 FROM a0 a LEFT JOIN rs0 ON 1 AND rs0.ck0 IS a.ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, NULL AS v5, NULL AS v6, NULL AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM g0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(v1), 0) AS ch_v1, COALESCE(sum(v4), 0) AS ch_v4, COALESCE(sum(v3), 0) AS ch_v3 FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch_v1, 0) AS ch_v1, COALESCE(rs1.ch_v4, 0) AS ch_v4, COALESCE(rs1.ch_v3, 0) AS ch_v3 FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, [[t4.legal_name]] AS rc2, NULLIF([[t4.id]], '') AS rc3 FROM g1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
lk1 AS MATERIALIZED (SELECT * FROM (SELECT a.*, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh0, (SELECT (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END)
FROM r2 t6
WHERE 1 AND (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t6.id IS NOT NULL THEN [[t6.threshold_1099]] END) ASC, (CASE WHEN t6.id IS NOT NULL THEN [[t6.currency]] END) LIMIT 1) AS kh1 FROM gr1 a) a),
rt1 AS (SELECT a.k0 AS k0, a.ck0 AS ck0, 1 AS __shown, a.ch_v1 AS v1, NULL AS vmx1, a.ch_v3 AS v3, NULL AS vmx3, a.ch_v4 AS v4, NULL AS vmx4 FROM lk1 a WHERE COALESCE((('meets' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('meets' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('meets' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
s1 AS MATERIALIZED (SELECT a.* FROM lk1 a WHERE COALESCE((('meets' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('meets' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('meets' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, a.ch_v1 AS v1, (CASE WHEN (a.ch_v4 IS 0) THEN NULL ELSE a.ch_v4 END) AS v2, a.ch_v3 AS v3, a.ch_v4 AS v4, a.k0 AS v5, NULL AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL), (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc3 IS NULL OR a.rc3 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) IS NULL) AS __s1_6, (COALESCE((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), '') || COALESCE((CASE WHEN ((a.rc2 IS NULL OR a.rc2 = '') OR (lower(a.rc2) IS lower(a.rc0))) THEN '' ELSE (COALESCE(' (legal name: ', '') || COALESCE(a.rc2, '') || COALESCE(')', '')) END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, COALESCE(sum((COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) - COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0))), 0) AS y1, COALESCE(sum((COALESCE(w.h9, 0) - COALESCE(w.h10, 0))), 0) AS y2, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t7.id]], '') AS rc0, [[t7.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t7 ON [[t7.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, a.y0 AS v1, NULL AS vmx1, a.y2 AS v3, NULL AS vmx3, a.y1 AS v4, NULL AS vmx4 FROM gr2 a WHERE 1),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE EXISTS (SELECT 1 FROM s1 p WHERE p.k0 IS a.k0 AND p.ck0 IS a.ck0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, (CASE WHEN (a.y1 IS 0) THEN NULL ELSE a.y1 END) AS v2, a.y2 AS v3, a.y1 AS v4, a.k0 AS v5, a.k1 AS v6, a.wh0 AS vl5, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL), (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END), ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL), (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (CASE WHEN (a.k1 IS 'nec_1') THEN 'NEC 1 · Nonemployee compensation' WHEN (a.k1 IS 'misc_1') THEN 'MISC 1 · Rents' WHEN (a.k1 IS 'misc_2') THEN 'MISC 2 · Royalties' WHEN (a.k1 IS 'misc_3') THEN 'MISC 3 · Other income' WHEN (a.k1 IS 'misc_5') THEN 'MISC 5 · Fishing boat proceeds' WHEN (a.k1 IS 'misc_6') THEN 'MISC 6 · Medical and health care payments' WHEN (a.k1 IS 'misc_8') THEN 'MISC 8 · Substitute payments in lieu of dividends or interest' WHEN (a.k1 IS 'misc_9') THEN 'MISC 9 · Crop insurance proceeds' WHEN (a.k1 IS 'misc_10') THEN 'MISC 10 · Gross proceeds paid to an attorney' WHEN (a.k1 IS 'misc_11') THEN 'MISC 11 · Fish purchased for resale' ELSE 'Not reported' END) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, ((CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) IS NULL) AS __s2_0, (CASE WHEN (a.k1 IS 'nec_1') THEN 0 WHEN (a.k1 IS 'misc_1') THEN 1 WHEN (a.k1 IS 'misc_2') THEN 2 WHEN (a.k1 IS 'misc_3') THEN 3 WHEN (a.k1 IS 'misc_5') THEN 4 WHEN (a.k1 IS 'misc_6') THEN 5 WHEN (a.k1 IS 'misc_8') THEN 6 WHEN (a.k1 IS 'misc_9') THEN 7 WHEN (a.k1 IS 'misc_10') THEN 8 WHEN (a.k1 IS 'misc_11') THEN 9 ELSE 10 END) AS __s2_1, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_2, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_3, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s2_4, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s2_5, (lower(a.rc1) IS NULL) AS __s2_6, lower(a.rc1) AS __s2_7, ((CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) IS NULL) AS __s2_8, (CASE WHEN typeof(a.k1) = 'text' THEN COALESCE(json_extract('{"k6E65635F31":"NEC 1 · Nonemployee compensation","k6D6973635F31":"MISC 1 · Rents","k6D6973635F32":"MISC 2 · Royalties","k6D6973635F33":"MISC 3 · Other income","k6D6973635F35":"MISC 5 · Fishing boat proceeds","k6D6973635F36":"MISC 6 · Medical and health care payments","k6D6973635F38":"MISC 8 · Substitute payments in lieu of dividends or interest","k6D6973635F39":"MISC 9 · Crop insurance proceeds","k6D6973635F3130":"MISC 10 · Gross proceeds paid to an attorney","k6D6973635F3131":"MISC 11 · Fish purchased for resale"}', '$.k' || hex(a.k1)), a.k1) ELSE a.k1 END) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t8.display_name]], ''), '(no name)')
FROM r1 t8
WHERE [[t8.id]] IS a.k0) AS wh0 FROM s2 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1),
pp2 AS (SELECT o.k0, o.k1, o.ck0, pp.__p1, o.__ord AS __p2 FROM o2 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, NULL AS __p2, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1
UNION ALL
SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.vl5, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, pp.__p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, o.__s2_0, o.__s2_1, o.__s2_2, o.__s2_3, o.__s2_4, o.__s2_5, o.__s2_6, o.__s2_7, o.__s2_8, o.__s2_9, o.__s2_10, o.__s2_11 FROM o2 o JOIN pp2 pp ON o.k0 IS pp.k0 AND o.k1 IS pp.k1 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1, __p2 LIMIT 50002)
UNION ALL
SELECT __level, __row, k0, k1, ck0, v0, v1, v2, v3, v4, v5, v6, vl5, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1, __p2
```

no statistics:

```
CO-ROUTINE (subquery-48)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-46)
        CO-ROUTINE (subquery-45)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-50)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 21
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 22
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 27
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 30
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-50)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-52)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 37
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 39
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-52)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-45)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-46)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-53)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 25
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-53)
      SCAN o0
SCAN (subquery-48)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-48)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-46)
        CO-ROUTINE (subquery-45)
          COMPOUND QUERY
            LEFT-MOST SUBQUERY
              MATERIALIZE o1
                CO-ROUTINE (subquery-50)
                  MATERIALIZE il1
                    MATERIALIZE s1
                      MATERIALIZE lk1
                        MATERIALIZE a1
                          MATERIALIZE w
                            COMPOUND QUERY
                              LEFT-MOST SUBQUERY
                                SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (ANY(account) AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                BLOOM FILTER ON books_accounts (id=?)
                                SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                              UNION ALL
                                SCAN books_accounts
                                LIST SUBQUERY 8
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                LIST SUBQUERY 10
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                                LIST SUBQUERY 9
                                  SCAN json_each VIRTUAL TABLE INDEX 1:
                                  CREATE BLOOM FILTER
                                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          SCAN w
                          USE TEMP B-TREE FOR GROUP BY
                        MATERIALIZE rs1
                          MATERIALIZE a2
                            SCAN w
                            USE TEMP B-TREE FOR GROUP BY
                          SCAN a
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          USE TEMP B-TREE FOR GROUP BY
                        SCAN a
                        BLOOM FILTER ON rs1 (k0=? AND ck0=?)
                        SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
                        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        SCALAR SUBQUERY 21
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                        SCALAR SUBQUERY 22
                          SCAN books_settings
                          USE TEMP B-TREE FOR ORDER BY
                      SCAN a
                      LIST SUBQUERY 27
                        SCAN json_each VIRTUAL TABLE INDEX 1:
                        CREATE BLOOM FILTER
                    SCAN a
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 30
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-50)
              SCAN o
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
            UNION ALL
              MATERIALIZE o2
                CO-ROUTINE (subquery-52)
                  MATERIALIZE s2
                    SCAN a
                    CORRELATED SCALAR SUBQUERY 37
                      BLOOM FILTER ON p (k0=? AND ck0=?)
                      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCAN a
                  CORRELATED SCALAR SUBQUERY 39
                    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
                  USE TEMP B-TREE FOR ORDER BY
                SCAN (subquery-52)
              SCAN o
              BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
              SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
              BLOOM FILTER ON o1 (ck0=? AND k0=?)
              SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        SCAN (subquery-45)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-46)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-53)
          CO-ROUTINE a0
            SCAN w
            USE TEMP B-TREE FOR GROUP BY
          MATERIALIZE rs0
            SCAN a
            LIST SUBQUERY 25
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            USE TEMP B-TREE FOR GROUP BY
          SCAN a
          SEARCH rs0 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-53)
      SCAN o0
SCAN (subquery-48)
USE TEMP B-TREE FOR ORDER BY
```

## Run 8 CSV export, statement 41

```sql
WITH r0 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r2 AS (SELECT `books_settings`.* FROM `books_settings`),
r3 AS (SELECT `books_journal_entries`.* FROM `books_journal_entries`),
r4 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r5 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
gord AS MATERIALIZED (SELECT key AS __g, json_extract(value, '$[0]') AS g0, json_extract(value, '$[1]') AS g1, json_extract(value, '$[2]') AS g2 FROM json_each('[["nxfqpazvd0dwrcz","nec_1","USD"],["fpdukoq4ywa97aq","misc_1","USD"],["jhz0bx04jqli4jh","misc_3","USD"],["3kx151k2hd6xmim","misc_10","USD"],["6oxkxhs4qhathh6","nec_1","USD"],["gnxbxmce69pq4kl","misc_1","USD"],["szn6yhlhechhw97","misc_3","USD"],["4opc6irue21k3oa","misc_10","USD"],["eprnq4ehimaub83","nec_1","USD"],["y6ea0s8v25xz5ny","misc_1","USD"],["htp457rhc4sww9x","misc_3","USD"],["65cm4o381qjnmr9","misc_10","USD"],["s3749mbqvypce1v","nec_1","USD"],["jrgext7bqo7sg2e","misc_1","USD"],["vr1p2c0a3emu2qb","misc_3","USD"],["0czufn990idzh93","misc_10","USD"],["84dmct9jy6tt9so","nec_1","USD"],["is0s78er0avmmvx","misc_1","USD"],["p1bbqsb76561ejr","misc_3","USD"],["nsxcozbukqkf03v","misc_10","USD"],["2f2crmkndvr0op8","nec_1","USD"],["7lqdrgiol91h6ca","misc_1","USD"],["hs021rkzneefjlm","misc_3","USD"],["xho31x8zmcixwaa","misc_10","USD"],["vh8nm33uievikii","nec_1","USD"],["393d1548lzc67sq","misc_1","USD"],["zgkti6dm4t8tlox","misc_3","USD"],["db9cuo6ckivsszj","misc_10","USD"],["f4d2tpegwmvas7o","nec_1","USD"],["zudwix0fgk4t07f","misc_1","USD"],["b1yjhfcfp6lstfk","misc_3","USD"],["s7231zbtniazngi","misc_10","USD"],["8w54qh4zj3suh50","nec_1","USD"],["yps2411ydp7k37u","misc_1","USD"],["6vla5lv8umrm09z","misc_3","USD"],["nt7s3dt3tnj81u6","misc_10","USD"],["w1xwdvuwooztwag","nec_1","USD"],["va3awf95k280ai1","misc_1","USD"],["4lhbp6ho8t1lzfw","misc_3","USD"],["6mlka3xdsokzy6g","misc_10","USD"],["rsyutmkfw0xb28h","nec_1","USD"],["rt9pxagft5al2cz","misc_1","USD"],["y9jyiqzpm1q9k77","misc_3","USD"],["5h73bjprqpfa39g","misc_10","USD"],["j4lq8psld95j3pm","nec_1","USD"],["dae6ij16qsp37yv","misc_1","USD"],["aqxg9bvosay2w5b","misc_3","USD"],["zuit5bb6rjjatr9","misc_10","USD"],["hsaqo6jbwlue31q","nec_1","USD"],["bwsf75hayyiqh6v","misc_1","USD"],["yexjqic9hhk7mao","misc_3","USD"],["p7efvxuktvt1xml","misc_10","USD"],["q0nxwijfbf7vjus","nec_1","USD"],["ad8sacgate5mloi","misc_1","USD"],["fbuoo6omqwyh0yy","misc_3","USD"],["cmqd00h7302v7i2","misc_10","USD"],["r1uhycpp8zndf0d","nec_1","USD"],["je8rlejwmo272co","misc_1","USD"],["qv69wkb6fir3q40","misc_3","USD"],["tdpv1wn75aiba4v","misc_10","USD"],["kbbgv3g40yxh1wc","nec_1","USD"],["midc7t84puz0opf","misc_1","USD"],["w4ihcvw653rwez5","misc_3","USD"],["zjtbygz94e98tdx","misc_10","USD"],["m6ngdu4gl6wnb73","nec_1","USD"],["hbqrgutnfck4hl4","misc_1","USD"],["iu7ryzqqtyoka91","misc_3","USD"],["rcyncb4lpj2ttjh","misc_10","USD"],["ss68ctpctsbrpq7","nec_1","USD"],["vnk8gwymulf0z4w","misc_1","USD"],["ja1an5yjp3xu7t2","misc_3","USD"],["8lyz1ax91b8tc4w","misc_10","USD"],["ws98ac9gqyyave1","nec_1","USD"],["r3nrfadehhe7cup","misc_1","USD"],["9gyb7znlc86aw3b","misc_3","USD"],["qnedt7xehn2ukfw","misc_10","USD"],["pjxfi64djcw9dr2","nec_1","USD"],["y9a5j8jp4q7wd6h","misc_1","USD"],["cvkm269ylfke9fj","misc_3","USD"],["d7cwij03f6wxcuo","misc_10","USD"],["xiokw3lr0b9r1ap","nec_1","USD"],["12zy41wacceb70o","misc_1","USD"],["g8tmrg8znxqwm9j","misc_3","USD"],["7ac3usj7qx9x65w","misc_10","USD"],["jipf0wkvnzirjp8","nec_1","USD"],["p3u6p3ccrtjdx2i","misc_1","USD"],["3iestup2z1iyikg","misc_3","USD"],["v1vdq042nucbbu7","misc_10","USD"],["c849tpvpqyf9jcv","nec_1","USD"],["k9x9pek9i8pa1if","misc_1","USD"],["r21fjuj92y7ksdc","misc_3","USD"],["h87kfai78h8klnm","misc_10","USD"],["rq5r21ysfov7hvo","nec_1","USD"],["8jzvw2o375ip18n","misc_1","USD"],["v1jiyckfia0bq88","misc_3","USD"],["psce0am0xhf4c85","misc_10","USD"],["hb08vi9j7mtyoth","nec_1","USD"],["5dk8r3y307unuhi","misc_1","USD"],["myg7scexpakidl0","misc_3","USD"],["6ie5mx7jn38aq7m","misc_10","USD"]]')),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t1.vendor]], '') AS c0, NULLIF([[t1.vendor]], '') AS c5, NULLIF([[t2.form_1099_box]], '') AS c6, [[t1.currency]] AS ck0, NULLIF([[t1.vendor]], '') AS k0, NULLIF([[t2.form_1099_box]], '') AS k1, NULLIF([[t2.form_1099_box]], '') AS h7, [[t1.card_payment]] AS h8, [[t1.debit]] AS h9, [[t1.credit]] AS h10, NULLIF(substr([[t1.date]], 1, 10), '') AS h11, NULLIF([[t6.posted_at]], '') AS h12, [[t1.position]] AS h13, NULLIF([[t6.origin]], '') AS h14, [[t10.number]] AS h15, [[t6.number]] AS h16, NULLIF([[t6.doc_type]], '') AS h17, [[t2.number]] AS h18, [[t2.full_name]] AS h19, [[t1.memo]] AS h20, [[t6.memo]] AS h21, [[t6.document]] AS h22, NULLIF([[t1.entry]], '') AS h23
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], CAST(NULL AS TEXT) AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r4 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.card_payment]] AS [[card_payment]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.doc_type]] AS [[doc_type]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.payment_entry]] AS [[payment_entry]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r5 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.account]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.vendor]]
LEFT JOIN r3 t6 ON [[t6.id]] = [[t1.entry]]
LEFT JOIN r3 t10 ON [[t10.id]] = [[t6.reverses]]
WHERE ((([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t2.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t2.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)) AND (/*pc1*/(/*pc0*/(NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger')/*pc0*/ AND (NOT COALESCE((NULLIF([[t1.doc_type]], '') IN (SELECT +value FROM json_each('["bill","invoice","credit_memo","vendor_credit","write_off"]')) AND [[t1.doc_type]] IN ('bill', 'invoice', 'credit_memo', 'vendor_credit', 'write_off', NULL)), 0)))/*pc1*/ OR /*pc3*/(/*pc2*/(NULLIF([[t1.layer]], '') IS 'cash' AND [[t1.layer]] = 'cash')/*pc2*/ AND (NOT COALESCE((NULLIF([[t1.payment_entry]], '') IS NULL OR NULLIF([[t1.payment_entry]], '') = ''), 0)))/*pc3*/) AND (NOT COALESCE((NULLIF([[t1.vendor]], '') IS NULL OR NULLIF([[t1.vendor]], '') = ''), 0)) AND ([[t3.track_1099]] IS ('meets' IS NOT 'untracked')) AND (('all' IS 'all') OR (('all' IS 'nec') AND (NULLIF([[t2.form_1099_box]], '') IS 'nec_1' AND [[t2.form_1099_box]] = 'nec_1')) OR (('all' IS 'misc') AND (NULLIF([[t2.form_1099_box]], '') IN (SELECT +value FROM json_each('["misc_1","misc_2","misc_3","misc_5","misc_6","misc_8","misc_9","misc_10","misc_11"]')) AND [[t2.form_1099_box]] IN ('misc_1', 'misc_2', 'misc_3', 'misc_5', 'misc_6', 'misc_8', 'misc_9', 'misc_10', 'misc_11', NULL)))))) AND [[t1.vendor]] IN (SELECT g0 FROM gord WHERE g0 IS NOT NULL)),
a1 AS (SELECT k0, ck0, COALESCE(sum(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0)), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, [[t4.legal_name]] AS rc2, NULLIF([[t4.id]], '') AS rc3 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
lk1 AS MATERIALIZED (SELECT * FROM (SELECT a.*, (SELECT (CASE WHEN t5.id IS NOT NULL THEN [[t5.threshold_1099]] END)
FROM r2 t5
WHERE 1 AND (CASE WHEN t5.id IS NOT NULL THEN [[t5.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t5.id IS NOT NULL THEN [[t5.threshold_1099]] END) ASC, (CASE WHEN t5.id IS NOT NULL THEN [[t5.currency]] END) LIMIT 1) AS kh0, (SELECT (CASE WHEN t5.id IS NOT NULL THEN [[t5.currency]] END)
FROM r2 t5
WHERE 1 AND (CASE WHEN t5.id IS NOT NULL THEN [[t5.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t5.id IS NOT NULL THEN [[t5.threshold_1099]] END) ASC, (CASE WHEN t5.id IS NOT NULL THEN [[t5.currency]] END) LIMIT 1) AS kh1 FROM gr1 a) a),
s1 AS MATERIALIZED (SELECT a.* FROM lk1 a WHERE COALESCE((('meets' IN (SELECT +value FROM json_each('["tracked","untracked"]'))) OR (('meets' IS 'meets') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 >= a.kh0) END)) OR (('meets' IS 'below') AND (CASE WHEN a.ck0 IS NOT NULL AND a.kh1 IS NOT NULL AND NOT (a.ck0 IS a.kh1) THEN 0 ELSE (a.y0 < a.kh0) END))), 0)),
ws AS (SELECT w.* FROM w WHERE EXISTS (SELECT 1 FROM s1 p WHERE p.k0 IS w.k0 AND p.ck0 IS w.ck0)),
gcut AS MATERIALIZED (SELECT MIN(c.__g) AS __g FROM (SELECT n.__g AS __g, SUM(n.n) OVER (ORDER BY n.__g ROWS UNBOUNDED PRECEDING) AS seen FROM (SELECT gord.__g AS __g, COUNT(*) AS n FROM ws w CROSS JOIN gord ON +w.k0 IS gord.g0 AND +w.k1 IS gord.g1 AND +w.ck0 IS gord.g2 GROUP BY gord.__g) n) c WHERE c.seen >= 50002),
wl AS MATERIALIZED (SELECT w.* FROM ws w CROSS JOIN gord ON +w.k0 IS gord.g0 AND +w.k1 IS gord.g1 AND +w.ck0 IS gord.g2 WHERE gord.__g <= COALESCE((SELECT __g FROM gcut), gord.__g))
SELECT * FROM (WITH wpage AS MATERIALIZED (SELECT * FROM (SELECT d.*, gord.__g AS __g FROM (SELECT w.*, (CASE WHEN (w.c6 IS 'nec_1') THEN 0 WHEN (w.c6 IS 'misc_1') THEN 1 WHEN (w.c6 IS 'misc_2') THEN 2 WHEN (w.c6 IS 'misc_3') THEN 3 WHEN (w.c6 IS 'misc_5') THEN 4 WHEN (w.c6 IS 'misc_6') THEN 5 WHEN (w.c6 IS 'misc_8') THEN 6 WHEN (w.c6 IS 'misc_9') THEN 7 WHEN (w.c6 IS 'misc_10') THEN 8 WHEN (w.c6 IS 'misc_11') THEN 9 ELSE 10 END) AS s0, w.h11 AS s1, w.h12 AS s2, w.h13 AS s3, (CASE WHEN (w.h9 > w.h10) THEN 0 ELSE 1 END) AS s4, (CASE WHEN (w.rc0 IS NULL OR w.rc0 = '') THEN 1 ELSE 0 END) AS s5, tc_round((CASE WHEN ('name' IS 'amount') THEN COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0) ELSE 0 END), 0) AS s6, lower(w.rc1) AS s7 FROM (SELECT w.*, NULLIF([[t7.id]], '') AS rc0, [[t7.display_name]] AS rc1 FROM wl w LEFT JOIN r1 t7 ON [[t7.id]] IS w.k0) w) d CROSS JOIN gord ON +d.k0 IS gord.g0 AND +d.k1 IS gord.g1 AND +d.ck0 IS gord.g2) d WHERE 1 ORDER BY d.__g, (d.s0 IS NULL), d.s0, (d.s1 IS NULL), d.s1, (d.s2 IS NULL), d.s2, (d.s3 IS NULL), d.s3, (d.s4 IS NULL), d.s4, (d.s5 IS NULL), d.s5, (d.s6 IS NULL), d.s6 DESC, (d.s7 IS NULL), d.s7, d.__id LIMIT 50002), wcells AS MATERIALIZED (SELECT * FROM (SELECT w.*, (SELECT COALESCE(NULLIF([[t9.display_name]], ''), '(no name)')
FROM r1 t9
WHERE [[t9.id]] IS w.c5) AS wh1 FROM (SELECT w.*, (SELECT COALESCE(NULLIF([[t8.display_name]], ''), '(no name)')
FROM r1 t8
WHERE [[t8.id]] IS w.c0) AS wh0 FROM (SELECT * FROM wpage) w) w) w) SELECT w.__id AS __id, w.k0 AS k0, w.k1 AS k1, w.ck0 AS ck0, w.s0 AS s0, w.s1 AS s1, w.s2 AS s2, w.s3 AS s3, w.s4 AS s4, w.s5 AS s5, w.s6 AS s6, w.s7 AS s7, w.c0 AS v0, NULL AS vcur0, NULL AS vmx0, w.wh0 AS vl0, NULL AS vc0, COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0) AS v1, NULL AS vcur1, NULL AS vmx1, NULL AS vl1, NULL AS vc1, (CASE WHEN (COALESCE((COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) - COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0)), 0) IS 0) THEN NULL ELSE COALESCE((COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) - COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0)), 0) END) AS v2, NULL AS vcur2, NULL AS vmx2, NULL AS vl2, NULL AS vc2, COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) AS v3, NULL AS vcur3, NULL AS vmx3, NULL AS vl3, NULL AS vc3, COALESCE((COALESCE((COALESCE(w.h9, 0) - COALESCE(w.h10, 0)), 0) - COALESCE(tc_round((CASE WHEN ((NOT COALESCE((w.h7 IS NULL OR w.h7 = ''), 0)) AND (NOT COALESCE((w.h8 IS true), 0))) THEN (COALESCE(w.h9, 0) - COALESCE(w.h10, 0)) ELSE 0 END), 0), 0)), 0) AS v4, NULL AS vcur4, NULL AS vmx4, NULL AS vl4, NULL AS vc4, w.c5 AS v5, NULL AS vcur5, NULL AS vmx5, w.wh1 AS vl5, NULL AS vc5, w.c6 AS v6, NULL AS vcur6, NULL AS vmx6, NULL AS vl6, NULL AS vc6, (COALESCE((COALESCE(w.h11, '') || COALESCE(' · ', '') || COALESCE((CASE WHEN ((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))) AND (w.h15 IS w.h16)) THEN (CASE WHEN ((w.h17 IS 'bill') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill' WHEN ((w.h17 IS 'bill_payment') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill payment' WHEN ((w.h17 IS 'credit_memo') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Credit memo' WHEN ((w.h17 IS 'deposit') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Deposit' WHEN ((w.h17 IS 'expense') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Expense' WHEN ((w.h17 IS 'invoice') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Invoice' WHEN ((w.h17 IS 'payment') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Payment' WHEN ((w.h17 IS 'refund_receipt') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Refund receipt' WHEN ((w.h17 IS 'sales_receipt') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Sales receipt' WHEN ((w.h17 IS 'transfer') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Transfer' WHEN ((w.h17 IS 'vendor_credit') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor credit' WHEN ((w.h17 IS 'vendor_refund') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor refund' WHEN ((w.h17 IS 'write_off') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Write-off' WHEN (w.h14 IS 'reversal') THEN (CASE WHEN (w.h15 IS NULL OR w.h15 = '') THEN 'Reversal' ELSE (COALESCE('Reversal', '') || COALESCE(' of ', '') || COALESCE(w.h15, '')) END) WHEN (w.h14 IS 'void_reversal') THEN (CASE WHEN (w.h15 IS NULL OR w.h15 = '') THEN 'Void reversal' ELSE (COALESCE('Void reversal', '') || COALESCE(' of ', '') || COALESCE(w.h15, '')) END) WHEN (w.h14 IS 'auto_reversal') THEN (CASE WHEN (w.h15 IS NULL OR w.h15 = '') THEN 'Auto reversal' ELSE (COALESCE('Auto reversal', '') || COALESCE(' of ', '') || COALESCE(w.h15, '')) END) WHEN (w.h14 IS 'manual') THEN 'Journal entry' WHEN (w.h14 IS 'opening_balance') THEN 'Opening balances' ELSE 'Journal entry' END) ELSE (COALESCE((CASE WHEN ((w.h17 IS 'bill') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill' WHEN ((w.h17 IS 'bill_payment') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill payment' WHEN ((w.h17 IS 'credit_memo') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Credit memo' WHEN ((w.h17 IS 'deposit') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Deposit' WHEN ((w.h17 IS 'expense') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Expense' WHEN ((w.h17 IS 'invoice') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Invoice' WHEN ((w.h17 IS 'payment') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Payment' WHEN ((w.h17 IS 'refund_receipt') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Refund receipt' WHEN ((w.h17 IS 'sales_receipt') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Sales receipt' WHEN ((w.h17 IS 'transfer') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Transfer' WHEN ((w.h17 IS 'vendor_credit') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor credit' WHEN ((w.h17 IS 'vendor_refund') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor refund' WHEN ((w.h17 IS 'write_off') AND (NOT COALESCE((w.h14 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Write-off' WHEN (w.h14 IS 'reversal') THEN (CASE WHEN (w.h15 IS NULL OR w.h15 = '') THEN 'Reversal' ELSE (COALESCE('Reversal', '') || COALESCE(' of ', '') || COALESCE(w.h15, '')) END) WHEN (w.h14 IS 'void_reversal') THEN (CASE WHEN (w.h15 IS NULL OR w.h15 = '') THEN 'Void reversal' ELSE (COALESCE('Void reversal', '') || COALESCE(' of ', '') || COALESCE(w.h15, '')) END) WHEN (w.h14 IS 'auto_reversal') THEN (CASE WHEN (w.h15 IS NULL OR w.h15 = '') THEN 'Auto reversal' ELSE (COALESCE('Auto reversal', '') || COALESCE(' of ', '') || COALESCE(w.h15, '')) END) WHEN (w.h14 IS 'manual') THEN 'Journal entry' WHEN (w.h14 IS 'opening_balance') THEN 'Opening balances' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(w.h16, '')) END), '') || COALESCE(' · ', '') || COALESCE((CASE WHEN (w.h18 IS NULL OR w.h18 = '') THEN w.h19 ELSE (COALESCE(w.h18, '') || COALESCE(' ', '') || COALESCE(w.h19, '')) END), '') || COALESCE((CASE WHEN ((CASE WHEN (w.h20 IS NULL OR w.h20 = '') THEN w.h21 ELSE w.h20 END) IS NULL OR (CASE WHEN (w.h20 IS NULL OR w.h20 = '') THEN w.h21 ELSE w.h20 END) = '') THEN '' ELSE (COALESCE(' · ', '') || COALESCE((CASE WHEN (w.h20 IS NULL OR w.h20 = '') THEN w.h21 ELSE w.h20 END), '')) END), '')), '') || COALESCE((CASE WHEN (w.h8 IS true) THEN ' · paid by card' ELSE '' END), '')) AS __label, NULL AS __labelcur, (CASE WHEN ((w.h14 IS 'document') AND (w.h17 IS 'bill') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/bills/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'bill_payment') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/bill-payments/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'credit_memo') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/credit-memos/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'deposit') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/deposits/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'expense') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/expenses/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'invoice') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/invoices/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'payment') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/payments/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'refund_receipt') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/refund-receipts/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'sales_receipt') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/sales-receipts/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'vendor_credit') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/vendor-credits/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'vendor_refund') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/vendor-refunds/', '') || COALESCE(w.h22, '')) WHEN ((w.h14 IS 'document') AND (w.h17 IS 'write_off') AND (NOT COALESCE((w.h22 IS NULL OR w.h22 = ''), 0))) THEN (COALESCE('books/write-offs/', '') || COALESCE(w.h22, '')) WHEN ((w.h17 IS 'transfer') AND (w.h14 IS 'manual')) THEN (COALESCE('books/transfers/', '') || COALESCE(w.h23, '')) ELSE (COALESCE('books/entries/', '') || COALESCE(w.h23, '')) END) AS __open, w.__g AS __g FROM wcells w) d ORDER BY d.__g, (d.s0 IS NULL), d.s0, (d.s1 IS NULL), d.s1, (d.s2 IS NULL), d.s2, (d.s3 IS NULL), d.s3, (d.s4 IS NULL), d.s4, (d.s5 IS NULL), d.s5, (d.s6 IS NULL), d.s6 DESC, (d.s7 IS NULL), d.s7, d.__id
```

no statistics:

```
MATERIALIZE wcells
  MATERIALIZE wpage
    MATERIALIZE wl
      MATERIALIZE w
        COMPOUND QUERY
          LEFT-MOST SUBQUERY
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            LIST SUBQUERY 10
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            LIST SUBQUERY 12
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date>? AND date<?)
            LIST SUBQUERY 11
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            LIST SUBQUERY 13
              MATERIALIZE gord
                SCAN json_each VIRTUAL TABLE INDEX 1:
              SCAN gord
              CREATE BLOOM FILTER
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
            SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
          UNION ALL
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            LIST SUBQUERY 10
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            LIST SUBQUERY 12
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            SEARCH books_cash_basis_lines USING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
            LIST SUBQUERY 11
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            LIST SUBQUERY 13
              SCAN gord
              CREATE BLOOM FILTER
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
            SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCAN w
      CORRELATED SCALAR SUBQUERY 24
        MATERIALIZE s1
          MATERIALIZE lk1
            MATERIALIZE a1
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 18
              SCAN books_settings
              USE TEMP B-TREE FOR ORDER BY
            SCALAR SUBQUERY 19
              SCAN books_settings
              USE TEMP B-TREE FOR ORDER BY
          SCAN a
          LIST SUBQUERY 22
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
        BLOOM FILTER ON p (k0=? AND ck0=?)
        SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
      BLOOM FILTER ON gord (g0=? AND g1=? AND g2=?)
      SEARCH gord USING AUTOMATIC COVERING INDEX (g0=? AND g1=? AND g2=?)
      SCALAR SUBQUERY 29
        MATERIALIZE gcut
          CO-ROUTINE c
            CO-ROUTINE (subquery-71)
              CO-ROUTINE n
                SCAN w
                CORRELATED SCALAR SUBQUERY 24
                  BLOOM FILTER ON p (k0=? AND ck0=?)
                  SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                BLOOM FILTER ON gord (g0=? AND g1=? AND g2=?)
                SEARCH gord USING AUTOMATIC COVERING INDEX (g0=? AND g1=? AND g2=?)
                USE TEMP B-TREE FOR GROUP BY
              SCAN n
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-71)
          SEARCH c
        SCAN gcut
    SCAN w
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
    BLOOM FILTER ON gord (g0=? AND g1=? AND g2=?)
    SEARCH gord USING AUTOMATIC PARTIAL COVERING INDEX (g0=? AND g1=? AND g2=?)
    USE TEMP B-TREE FOR ORDER BY
  SCAN wpage
  CORRELATED SCALAR SUBQUERY 36
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  CORRELATED SCALAR SUBQUERY 35
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
SCAN w
LIST SUBQUERY 41
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 42
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 43
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 44
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 45
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 46
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 47
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 48
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 49
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 50
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 51
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 52
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 53
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 54
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 55
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 56
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 57
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 58
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 59
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 60
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 61
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 62
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 63
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 64
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 65
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 66
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 67
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
MATERIALIZE wcells
  MATERIALIZE wpage
    MATERIALIZE wl
      MATERIALIZE w
        COMPOUND QUERY
          LEFT-MOST SUBQUERY
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (ANY(account) AND ANY(posted) AND vendor=? AND date>? AND date<?)
            LIST SUBQUERY 13
              MATERIALIZE gord
                SCAN json_each VIRTUAL TABLE INDEX 1:
              SCAN gord
            LIST SUBQUERY 11
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            BLOOM FILTER ON books_accounts (id=?)
            SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
            LIST SUBQUERY 10
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            LIST SUBQUERY 12
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
            SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
          UNION ALL
            SEARCH books_cash_basis_lines USING INDEX idx_books_cash_basis_lines_account_posted_vendor_date (ANY(account) AND ANY(posted) AND vendor=? AND date>? AND date<?)
            LIST SUBQUERY 13
              SCAN gord
            LIST SUBQUERY 11
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            BLOOM FILTER ON books_accounts (id=?)
            SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
            LIST SUBQUERY 10
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            LIST SUBQUERY 12
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
            SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCAN w
      CORRELATED SCALAR SUBQUERY 24
        MATERIALIZE s1
          MATERIALIZE lk1
            MATERIALIZE a1
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 18
              SCAN books_settings
              USE TEMP B-TREE FOR ORDER BY
            SCALAR SUBQUERY 19
              SCAN books_settings
              USE TEMP B-TREE FOR ORDER BY
          SCAN a
          LIST SUBQUERY 22
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
        BLOOM FILTER ON p (k0=? AND ck0=?)
        SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
      BLOOM FILTER ON gord (g0=? AND g1=? AND g2=?)
      SEARCH gord USING AUTOMATIC COVERING INDEX (g0=? AND g1=? AND g2=?)
      SCALAR SUBQUERY 29
        MATERIALIZE gcut
          CO-ROUTINE c
            CO-ROUTINE (subquery-71)
              CO-ROUTINE n
                SCAN w
                CORRELATED SCALAR SUBQUERY 24
                  BLOOM FILTER ON p (k0=? AND ck0=?)
                  SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
                BLOOM FILTER ON gord (g0=? AND g1=? AND g2=?)
                SEARCH gord USING AUTOMATIC COVERING INDEX (g0=? AND g1=? AND g2=?)
                USE TEMP B-TREE FOR GROUP BY
              SCAN n
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-71)
          SEARCH c
        SCAN gcut
    SCAN w
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
    BLOOM FILTER ON gord (g0=? AND g1=? AND g2=?)
    SEARCH gord USING AUTOMATIC PARTIAL COVERING INDEX (g0=? AND g1=? AND g2=?)
    USE TEMP B-TREE FOR ORDER BY
  SCAN wpage
  CORRELATED SCALAR SUBQUERY 36
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  CORRELATED SCALAR SUBQUERY 35
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
SCAN w
LIST SUBQUERY 41
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 42
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 43
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 44
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 45
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 46
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 47
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 48
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 49
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 50
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 51
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 52
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 53
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 54
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 55
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 56
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 57
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 58
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 59
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 60
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 61
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 62
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 63
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 64
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 65
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 66
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 67
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
USE TEMP B-TREE FOR ORDER BY
```

## Run 8 CSV export, statement 42

```sql
WITH r0 AS (SELECT `books_settings`.* FROM `books_settings`)
SELECT (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS v0, (SELECT (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END)
FROM r0 t1
WHERE 1 AND (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) IS NOT NULL
ORDER BY (CASE WHEN t1.id IS NOT NULL THEN [[t1.threshold_1099]] END) ASC, (CASE WHEN t1.id IS NOT NULL THEN [[t1.currency]] END) LIMIT 1) AS c0
```

no statistics:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
SCAN CONSTANT ROW
SCALAR SUBQUERY 2
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
SCALAR SUBQUERY 3
  SCAN books_settings
  USE TEMP B-TREE FOR ORDER BY
```

## Run 8 CSV export, statement 43

```sql
SELECT {{_collections}}.* FROM `_collections` WHERE [[id]]='audit_logs' OR LOWER([[name]])='audit_logs' LIMIT 1
```

no statistics:

```
SCAN _collections
```

after ANALYZE:

```
SCAN _collections
```

## Run 8 CSV export, statement 44

```sql
SELECT count(*) FROM `users` WHERE `id`='ek42pt1nejj35w5'
```

no statistics:

```
SEARCH users USING COVERING INDEX sqlite_autoindex_users_1 (id=?)
```

after ANALYZE:

```
SEARCH users USING COVERING INDEX sqlite_autoindex_users_1 (id=?)
```
