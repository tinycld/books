# A/P Aging query plans (L)

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
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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

## Run 1 default, statement 4

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

## Run 1 default, statement 5

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h9, [[t1.item_seq]] AS h10, NULLIF([[t1.item_kind]], '') AS h11, [[t1.item_number]] AS h12
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
WHERE (([[t1.settled]] > '2026-11-18') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, NULL AS v8, NULL AS v9, NULL AS v10, NULL AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(__shown), 0) AS ch___shown FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch___shown, 0) AS ch___shown FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM g1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE (1 AND a.ch___shown > 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, a.k0 AS v8, NULL AS v9, NULL AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, a.ch___shown AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t4.display_name]], ''), '(no name)')
FROM r1 t4
WHERE [[t4.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, min(w.h11) AS y0, min(w.h12) AS y1, min(w.h9) AS y2, min(w.h10) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y7, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y8, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y9, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t5.id]], '') AS rc0, [[t5.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t5 ON [[t5.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, 1 AS __shown FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y2 AS v1, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v2, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v3, (CASE WHEN (a.y7 IS 0) THEN NULL ELSE a.y7 END) AS v4, (CASE WHEN (a.y8 IS 0) THEN NULL ELSE a.y8 END) AS v5, (CASE WHEN (a.y9 IS 0) THEN NULL ELSE a.y9 END) AS v6, a.y4 AS v7, a.k0 AS v8, a.k1 AS v9, a.y3 AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY (a.y2 IS NULL), a.y2, (a.y3 IS NULL), a.y3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (COALESCE((CASE WHEN (a.y0 IS 'bill') THEN 'Bill' WHEN (a.y0 IS 'vendor_credit') THEN 'Vendor credit' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(a.y1, '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, (a.y2 IS NULL) AS __s2_0, a.y2 AS __s2_1, (a.y3 IS NULL) AS __s2_2, a.y3 AS __s2_3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_4, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_5, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL) AS __s2_6, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) AS __s2_7, (lower(a.rc1) IS NULL) AS __s2_8, lower(a.rc1) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t6.display_name]], ''), '(no name)')
FROM r1 t6
WHERE [[t6.id]] IS a.k0) AS wh0 FROM s2 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1),
pp2 AS (SELECT o.k0, o.k1, o.ck0, pp.__p1, o.__ord AS __p2 FROM o2 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0)
SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.v7, o.v8, o.v9, o.v10, o.vl8, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, NULL AS __p2, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1
UNION ALL
SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.v7, o.v8, o.v9, o.v10, o.vl8, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, pp.__p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, o.__s2_0, o.__s2_1, o.__s2_2, o.__s2_3, o.__s2_4, o.__s2_5, o.__s2_6, o.__s2_7, o.__s2_8, o.__s2_9, o.__s2_10, o.__s2_11 FROM o2 o JOIN pp2 pp ON o.k0 IS pp.k0 AND o.k1 IS pp.k1 AND o.ck0 IS pp.ck0 WHERE 0)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1, __p2 LIMIT 201
```

no statistics:

```
CO-ROUTINE (subquery-31)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      MATERIALIZE o1
        CO-ROUTINE (subquery-439)
          MATERIALIZE il1
            MATERIALIZE s1
              MATERIALIZE a1
                MATERIALIZE w
                  SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
                  SCALAR SUBQUERY 2
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 248
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 249
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 250
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCALAR SUBQUERY 5
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 262
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 263
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 264
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                SCAN w
                USE TEMP B-TREE FOR GROUP BY
              MATERIALIZE rs1
                MATERIALIZE a2
                  SCAN w
                  USE TEMP B-TREE FOR GROUP BY
                SCAN a
                SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCALAR SUBQUERY 5
                  CO-ROUTINE __rule
                    SCAN CONSTANT ROW
                  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                  CORRELATED SCALAR SUBQUERY 304
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 305
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 306
                    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                  SCAN __rule
                  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                USE TEMP B-TREE FOR GROUP BY
              SCAN a
              BLOOM FILTER ON rs1 (k0=? AND ck0=?)
              SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
              SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
              SCALAR SUBQUERY 5
                CO-ROUTINE __rule
                  SCAN CONSTANT ROW
                SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                CORRELATED SCALAR SUBQUERY 318
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 319
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 320
                  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                SCAN __rule
                SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCAN a
          SCAN a
          CORRELATED SCALAR SUBQUERY 17
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 332
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 333
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 334
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-439)
      SCAN o
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
    UNION ALL
      MATERIALIZE o2
        CO-ROUTINE (subquery-440)
          MATERIALIZE s2
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 66
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 67
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 68
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN a
          CORRELATED SCALAR SUBQUERY 25
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 80
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 81
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 82
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-440)
      SCAN o
      BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
      SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
SCAN (subquery-31)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-31)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      MATERIALIZE o1
        CO-ROUTINE (subquery-439)
          MATERIALIZE il1
            MATERIALIZE s1
              MATERIALIZE a1
                MATERIALIZE w
                  SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
                  SCALAR SUBQUERY 2
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 248
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 249
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 250
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCALAR SUBQUERY 5
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 262
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 263
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 264
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                SCAN w
                USE TEMP B-TREE FOR GROUP BY
              MATERIALIZE rs1
                MATERIALIZE a2
                  SCAN w
                  USE TEMP B-TREE FOR GROUP BY
                SCAN a
                SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCALAR SUBQUERY 5
                  CO-ROUTINE __rule
                    SCAN CONSTANT ROW
                  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                  CORRELATED SCALAR SUBQUERY 304
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 305
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 306
                    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                  SCAN __rule
                  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                USE TEMP B-TREE FOR GROUP BY
              SCAN a
              BLOOM FILTER ON rs1 (k0=? AND ck0=?)
              SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
              SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
              SCALAR SUBQUERY 5
                CO-ROUTINE __rule
                  SCAN CONSTANT ROW
                SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                CORRELATED SCALAR SUBQUERY 318
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 319
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 320
                  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                SCAN __rule
                SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCAN a
          SCAN a
          CORRELATED SCALAR SUBQUERY 17
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 332
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 333
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 334
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-439)
      SCAN o
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
    UNION ALL
      MATERIALIZE o2
        CO-ROUTINE (subquery-440)
          MATERIALIZE s2
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 66
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 67
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 68
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN a
          CORRELATED SCALAR SUBQUERY 25
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 80
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 81
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 82
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-440)
      SCAN o
      BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
      SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
SCAN (subquery-31)
USE TEMP B-TREE FOR ORDER BY
```

## Run 1 default, statement 6

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h9, [[t1.item_seq]] AS h10, NULLIF([[t1.item_kind]], '') AS h11, [[t1.item_number]] AS h12
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
WHERE (([[t1.settled]] > '2026-11-18') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, NULL AS v8, NULL AS v9, NULL AS v10, NULL AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(__shown), 0) AS ch___shown FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch___shown, 0) AS ch___shown FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM g1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE (1 AND a.ch___shown > 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, a.k0 AS v8, NULL AS v9, NULL AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, a.ch___shown AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t4.display_name]], ''), '(no name)')
FROM r1 t4
WHERE [[t4.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, min(w.h11) AS y0, min(w.h12) AS y1, min(w.h9) AS y2, min(w.h10) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y7, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y8, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y9, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t5.id]], '') AS rc0, [[t5.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t5 ON [[t5.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, 1 AS __shown FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y2 AS v1, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v2, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v3, (CASE WHEN (a.y7 IS 0) THEN NULL ELSE a.y7 END) AS v4, (CASE WHEN (a.y8 IS 0) THEN NULL ELSE a.y8 END) AS v5, (CASE WHEN (a.y9 IS 0) THEN NULL ELSE a.y9 END) AS v6, a.y4 AS v7, a.k0 AS v8, a.k1 AS v9, a.y3 AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY (a.y2 IS NULL), a.y2, (a.y3 IS NULL), a.y3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (COALESCE((CASE WHEN (a.y0 IS 'bill') THEN 'Bill' WHEN (a.y0 IS 'vendor_credit') THEN 'Vendor credit' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(a.y1, '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, (a.y2 IS NULL) AS __s2_0, a.y2 AS __s2_1, (a.y3 IS NULL) AS __s2_2, a.y3 AS __s2_3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_4, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_5, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL) AS __s2_6, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) AS __s2_7, (lower(a.rc1) IS NULL) AS __s2_8, lower(a.rc1) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t6.display_name]], ''), '(no name)')
FROM r1 t6
WHERE [[t6.id]] IS a.k0) AS wh0 FROM s2 a) a)
SELECT * FROM o0
```

no statistics:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-57)
    CO-ROUTINE a0
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 34
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 35
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 36
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 48
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 49
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 50
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-57)
SCAN o0
```

after ANALYZE:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-57)
    CO-ROUTINE a0
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 34
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 35
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 36
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 48
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 49
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 50
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-57)
SCAN o0
```

## Run 2 past day, statement 1

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

## Run 2 past day, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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

## Run 2 past day, statement 3

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

## Run 2 past day, statement 4

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

## Run 2 past day, statement 5

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h9, [[t1.item_seq]] AS h10, NULLIF([[t1.item_kind]], '') AS h11, [[t1.item_number]] AS h12
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
WHERE (([[t1.settled]] > '2024-05-20') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2024-05-20'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, NULL AS v8, NULL AS v9, NULL AS v10, NULL AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(__shown), 0) AS ch___shown FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch___shown, 0) AS ch___shown FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM g1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE (1 AND a.ch___shown > 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, a.k0 AS v8, NULL AS v9, NULL AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, a.ch___shown AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t4.display_name]], ''), '(no name)')
FROM r1 t4
WHERE [[t4.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, min(w.h11) AS y0, min(w.h12) AS y1, min(w.h9) AS y2, min(w.h10) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y7, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y8, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y9, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t5.id]], '') AS rc0, [[t5.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t5 ON [[t5.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, 1 AS __shown FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y2 AS v1, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v2, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v3, (CASE WHEN (a.y7 IS 0) THEN NULL ELSE a.y7 END) AS v4, (CASE WHEN (a.y8 IS 0) THEN NULL ELSE a.y8 END) AS v5, (CASE WHEN (a.y9 IS 0) THEN NULL ELSE a.y9 END) AS v6, a.y4 AS v7, a.k0 AS v8, a.k1 AS v9, a.y3 AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY (a.y2 IS NULL), a.y2, (a.y3 IS NULL), a.y3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (COALESCE((CASE WHEN (a.y0 IS 'bill') THEN 'Bill' WHEN (a.y0 IS 'vendor_credit') THEN 'Vendor credit' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(a.y1, '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, (a.y2 IS NULL) AS __s2_0, a.y2 AS __s2_1, (a.y3 IS NULL) AS __s2_2, a.y3 AS __s2_3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_4, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_5, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL) AS __s2_6, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) AS __s2_7, (lower(a.rc1) IS NULL) AS __s2_8, lower(a.rc1) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t6.display_name]], ''), '(no name)')
FROM r1 t6
WHERE [[t6.id]] IS a.k0) AS wh0 FROM s2 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1),
pp2 AS (SELECT o.k0, o.k1, o.ck0, pp.__p1, o.__ord AS __p2 FROM o2 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0)
SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.v7, o.v8, o.v9, o.v10, o.vl8, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, NULL AS __p2, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1
UNION ALL
SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.v7, o.v8, o.v9, o.v10, o.vl8, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, pp.__p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, o.__s2_0, o.__s2_1, o.__s2_2, o.__s2_3, o.__s2_4, o.__s2_5, o.__s2_6, o.__s2_7, o.__s2_8, o.__s2_9, o.__s2_10, o.__s2_11 FROM o2 o JOIN pp2 pp ON o.k0 IS pp.k0 AND o.k1 IS pp.k1 AND o.ck0 IS pp.ck0 WHERE 0)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1, __p2 LIMIT 201
```

no statistics:

```
CO-ROUTINE (subquery-31)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      MATERIALIZE o1
        CO-ROUTINE (subquery-439)
          MATERIALIZE il1
            MATERIALIZE s1
              MATERIALIZE a1
                MATERIALIZE w
                  SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
                  SCALAR SUBQUERY 2
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 248
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 249
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 250
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCALAR SUBQUERY 5
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 262
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 263
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 264
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                SCAN w
                USE TEMP B-TREE FOR GROUP BY
              MATERIALIZE rs1
                MATERIALIZE a2
                  SCAN w
                  USE TEMP B-TREE FOR GROUP BY
                SCAN a
                SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCALAR SUBQUERY 5
                  CO-ROUTINE __rule
                    SCAN CONSTANT ROW
                  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                  CORRELATED SCALAR SUBQUERY 304
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 305
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 306
                    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                  SCAN __rule
                  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                USE TEMP B-TREE FOR GROUP BY
              SCAN a
              BLOOM FILTER ON rs1 (k0=? AND ck0=?)
              SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
              SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
              SCALAR SUBQUERY 5
                CO-ROUTINE __rule
                  SCAN CONSTANT ROW
                SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                CORRELATED SCALAR SUBQUERY 318
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 319
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 320
                  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                SCAN __rule
                SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCAN a
          SCAN a
          CORRELATED SCALAR SUBQUERY 17
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 332
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 333
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 334
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-439)
      SCAN o
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
    UNION ALL
      MATERIALIZE o2
        CO-ROUTINE (subquery-440)
          MATERIALIZE s2
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 66
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 67
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 68
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN a
          CORRELATED SCALAR SUBQUERY 25
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 80
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 81
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 82
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-440)
      SCAN o
      BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
      SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
SCAN (subquery-31)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-31)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      MATERIALIZE o1
        CO-ROUTINE (subquery-439)
          MATERIALIZE il1
            MATERIALIZE s1
              MATERIALIZE a1
                MATERIALIZE w
                  SCAN books_payable_items
                  SCALAR SUBQUERY 2
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 248
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 249
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 250
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCALAR SUBQUERY 5
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 262
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 263
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 264
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                SCAN w
                USE TEMP B-TREE FOR GROUP BY
              MATERIALIZE rs1
                MATERIALIZE a2
                  SCAN w
                  USE TEMP B-TREE FOR GROUP BY
                SCAN a
                SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCALAR SUBQUERY 5
                  CO-ROUTINE __rule
                    SCAN CONSTANT ROW
                  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                  CORRELATED SCALAR SUBQUERY 304
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 305
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 306
                    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                  SCAN __rule
                  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                USE TEMP B-TREE FOR GROUP BY
              SCAN a
              BLOOM FILTER ON rs1 (k0=? AND ck0=?)
              SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
              SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
              SCALAR SUBQUERY 5
                CO-ROUTINE __rule
                  SCAN CONSTANT ROW
                SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                CORRELATED SCALAR SUBQUERY 318
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 319
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 320
                  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                SCAN __rule
                SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCAN a
          SCAN a
          CORRELATED SCALAR SUBQUERY 17
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 332
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 333
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 334
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-439)
      SCAN o
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
    UNION ALL
      MATERIALIZE o2
        CO-ROUTINE (subquery-440)
          MATERIALIZE s2
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 66
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 67
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 68
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN a
          CORRELATED SCALAR SUBQUERY 25
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 80
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 81
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 82
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-440)
      SCAN o
      BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
      SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
SCAN (subquery-31)
USE TEMP B-TREE FOR ORDER BY
```

## Run 2 past day, statement 6

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h9, [[t1.item_seq]] AS h10, NULLIF([[t1.item_kind]], '') AS h11, [[t1.item_number]] AS h12
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
WHERE (([[t1.settled]] > '2024-05-20') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2024-05-20'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, NULL AS v8, NULL AS v9, NULL AS v10, NULL AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(__shown), 0) AS ch___shown FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch___shown, 0) AS ch___shown FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM g1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE (1 AND a.ch___shown > 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, a.k0 AS v8, NULL AS v9, NULL AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, a.ch___shown AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t4.display_name]], ''), '(no name)')
FROM r1 t4
WHERE [[t4.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, min(w.h11) AS y0, min(w.h12) AS y1, min(w.h9) AS y2, min(w.h10) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y7, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y8, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2024-05-20', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y9, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t5.id]], '') AS rc0, [[t5.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t5 ON [[t5.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, 1 AS __shown FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y2 AS v1, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v2, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v3, (CASE WHEN (a.y7 IS 0) THEN NULL ELSE a.y7 END) AS v4, (CASE WHEN (a.y8 IS 0) THEN NULL ELSE a.y8 END) AS v5, (CASE WHEN (a.y9 IS 0) THEN NULL ELSE a.y9 END) AS v6, a.y4 AS v7, a.k0 AS v8, a.k1 AS v9, a.y3 AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY (a.y2 IS NULL), a.y2, (a.y3 IS NULL), a.y3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (COALESCE((CASE WHEN (a.y0 IS 'bill') THEN 'Bill' WHEN (a.y0 IS 'vendor_credit') THEN 'Vendor credit' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(a.y1, '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, (a.y2 IS NULL) AS __s2_0, a.y2 AS __s2_1, (a.y3 IS NULL) AS __s2_2, a.y3 AS __s2_3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_4, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_5, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL) AS __s2_6, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) AS __s2_7, (lower(a.rc1) IS NULL) AS __s2_8, lower(a.rc1) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t6.display_name]], ''), '(no name)')
FROM r1 t6
WHERE [[t6.id]] IS a.k0) AS wh0 FROM s2 a) a)
SELECT * FROM o0
```

no statistics:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-57)
    CO-ROUTINE a0
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 34
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 35
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 36
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 48
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 49
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 50
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-57)
SCAN o0
```

after ANALYZE:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-57)
    CO-ROUTINE a0
      SCAN books_payable_items
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 34
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 35
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 36
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 48
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 49
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 50
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-57)
SCAN o0
```

## Run 3 largest balance, statement 1

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

## Run 3 largest balance, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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

## Run 3 largest balance, statement 3

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

## Run 3 largest balance, statement 4

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

## Run 3 largest balance, statement 5

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h9, [[t1.item_seq]] AS h10, NULLIF([[t1.item_kind]], '') AS h11, [[t1.item_number]] AS h12
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
WHERE (([[t1.settled]] > '2026-11-18') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, NULL AS v8, NULL AS v9, NULL AS v10, NULL AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(__shown), 0) AS ch___shown FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch___shown, 0) AS ch___shown FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM g1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE (1 AND a.ch___shown > 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, a.k0 AS v8, NULL AS v9, NULL AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, a.ch___shown AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t4.display_name]], ''), '(no name)')
FROM r1 t4
WHERE [[t4.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, min(w.h11) AS y0, min(w.h12) AS y1, min(w.h9) AS y2, min(w.h10) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y7, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y8, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y9, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t5.id]], '') AS rc0, [[t5.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t5 ON [[t5.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, 1 AS __shown FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y2 AS v1, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v2, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v3, (CASE WHEN (a.y7 IS 0) THEN NULL ELSE a.y7 END) AS v4, (CASE WHEN (a.y8 IS 0) THEN NULL ELSE a.y8 END) AS v5, (CASE WHEN (a.y9 IS 0) THEN NULL ELSE a.y9 END) AS v6, a.y4 AS v7, a.k0 AS v8, a.k1 AS v9, a.y3 AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY (a.y2 IS NULL), a.y2, (a.y3 IS NULL), a.y3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y4 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (COALESCE((CASE WHEN (a.y0 IS 'bill') THEN 'Bill' WHEN (a.y0 IS 'vendor_credit') THEN 'Vendor credit' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(a.y1, '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, (a.y2 IS NULL) AS __s2_0, a.y2 AS __s2_1, (a.y3 IS NULL) AS __s2_2, a.y3 AS __s2_3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_4, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_5, (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL) AS __s2_6, tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y4 ELSE 0 END), 0) AS __s2_7, (lower(a.rc1) IS NULL) AS __s2_8, lower(a.rc1) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t6.display_name]], ''), '(no name)')
FROM r1 t6
WHERE [[t6.id]] IS a.k0) AS wh0 FROM s2 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1),
pp2 AS (SELECT o.k0, o.k1, o.ck0, pp.__p1, o.__ord AS __p2 FROM o2 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0)
SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.v7, o.v8, o.v9, o.v10, o.vl8, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, NULL AS __p2, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1
UNION ALL
SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.v7, o.v8, o.v9, o.v10, o.vl8, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, pp.__p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, o.__s2_0, o.__s2_1, o.__s2_2, o.__s2_3, o.__s2_4, o.__s2_5, o.__s2_6, o.__s2_7, o.__s2_8, o.__s2_9, o.__s2_10, o.__s2_11 FROM o2 o JOIN pp2 pp ON o.k0 IS pp.k0 AND o.k1 IS pp.k1 AND o.ck0 IS pp.ck0 WHERE 0)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1, __p2 LIMIT 201
```

no statistics:

```
CO-ROUTINE (subquery-31)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      MATERIALIZE o1
        CO-ROUTINE (subquery-439)
          MATERIALIZE il1
            MATERIALIZE s1
              MATERIALIZE a1
                MATERIALIZE w
                  SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
                  SCALAR SUBQUERY 2
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 248
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 249
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 250
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCALAR SUBQUERY 5
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 262
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 263
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 264
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                SCAN w
                USE TEMP B-TREE FOR GROUP BY
              MATERIALIZE rs1
                MATERIALIZE a2
                  SCAN w
                  USE TEMP B-TREE FOR GROUP BY
                SCAN a
                SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCALAR SUBQUERY 5
                  CO-ROUTINE __rule
                    SCAN CONSTANT ROW
                  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                  CORRELATED SCALAR SUBQUERY 304
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 305
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 306
                    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                  SCAN __rule
                  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                USE TEMP B-TREE FOR GROUP BY
              SCAN a
              BLOOM FILTER ON rs1 (k0=? AND ck0=?)
              SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
              SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
              SCALAR SUBQUERY 5
                CO-ROUTINE __rule
                  SCAN CONSTANT ROW
                SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                CORRELATED SCALAR SUBQUERY 318
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 319
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 320
                  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                SCAN __rule
                SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCAN a
          SCAN a
          CORRELATED SCALAR SUBQUERY 17
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 332
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 333
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 334
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-439)
      SCAN o
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
    UNION ALL
      MATERIALIZE o2
        CO-ROUTINE (subquery-440)
          MATERIALIZE s2
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 66
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 67
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 68
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN a
          CORRELATED SCALAR SUBQUERY 25
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 80
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 81
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 82
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-440)
      SCAN o
      BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
      SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
SCAN (subquery-31)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-31)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      MATERIALIZE o1
        CO-ROUTINE (subquery-439)
          MATERIALIZE il1
            MATERIALIZE s1
              MATERIALIZE a1
                MATERIALIZE w
                  SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
                  SCALAR SUBQUERY 2
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 248
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 249
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 250
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCALAR SUBQUERY 5
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 262
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 263
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 264
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                SCAN w
                USE TEMP B-TREE FOR GROUP BY
              MATERIALIZE rs1
                MATERIALIZE a2
                  SCAN w
                  USE TEMP B-TREE FOR GROUP BY
                SCAN a
                SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCALAR SUBQUERY 5
                  CO-ROUTINE __rule
                    SCAN CONSTANT ROW
                  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                  CORRELATED SCALAR SUBQUERY 304
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 305
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 306
                    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                  SCAN __rule
                  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                USE TEMP B-TREE FOR GROUP BY
              SCAN a
              BLOOM FILTER ON rs1 (k0=? AND ck0=?)
              SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
              SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
              SCALAR SUBQUERY 5
                CO-ROUTINE __rule
                  SCAN CONSTANT ROW
                SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                CORRELATED SCALAR SUBQUERY 318
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 319
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 320
                  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                SCAN __rule
                SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCAN a
          SCAN a
          CORRELATED SCALAR SUBQUERY 17
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 332
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 333
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 334
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-439)
      SCAN o
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
    UNION ALL
      MATERIALIZE o2
        CO-ROUTINE (subquery-440)
          MATERIALIZE s2
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 66
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 67
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 68
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN a
          CORRELATED SCALAR SUBQUERY 25
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 80
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 81
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 82
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-440)
      SCAN o
      BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
      SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
SCAN (subquery-31)
USE TEMP B-TREE FOR ORDER BY
```

## Run 3 largest balance, statement 6

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h9, [[t1.item_seq]] AS h10, NULLIF([[t1.item_kind]], '') AS h11, [[t1.item_number]] AS h12
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
WHERE (([[t1.settled]] > '2026-11-18') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, NULL AS v8, NULL AS v9, NULL AS v10, NULL AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(__shown), 0) AS ch___shown FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch___shown, 0) AS ch___shown FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM g1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE (1 AND a.ch___shown > 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, a.k0 AS v8, NULL AS v9, NULL AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, a.ch___shown AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t4.display_name]], ''), '(no name)')
FROM r1 t4
WHERE [[t4.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, min(w.h11) AS y0, min(w.h12) AS y1, min(w.h9) AS y2, min(w.h10) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y7, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y8, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y9, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t5.id]], '') AS rc0, [[t5.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t5 ON [[t5.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, 1 AS __shown FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y2 AS v1, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v2, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v3, (CASE WHEN (a.y7 IS 0) THEN NULL ELSE a.y7 END) AS v4, (CASE WHEN (a.y8 IS 0) THEN NULL ELSE a.y8 END) AS v5, (CASE WHEN (a.y9 IS 0) THEN NULL ELSE a.y9 END) AS v6, a.y4 AS v7, a.k0 AS v8, a.k1 AS v9, a.y3 AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY (a.y2 IS NULL), a.y2, (a.y3 IS NULL), a.y3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y4 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (COALESCE((CASE WHEN (a.y0 IS 'bill') THEN 'Bill' WHEN (a.y0 IS 'vendor_credit') THEN 'Vendor credit' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(a.y1, '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, (a.y2 IS NULL) AS __s2_0, a.y2 AS __s2_1, (a.y3 IS NULL) AS __s2_2, a.y3 AS __s2_3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_4, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_5, (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL) AS __s2_6, tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y4 ELSE 0 END), 0) AS __s2_7, (lower(a.rc1) IS NULL) AS __s2_8, lower(a.rc1) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t6.display_name]], ''), '(no name)')
FROM r1 t6
WHERE [[t6.id]] IS a.k0) AS wh0 FROM s2 a) a)
SELECT * FROM o0
```

no statistics:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-57)
    CO-ROUTINE a0
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 34
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 35
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 36
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 48
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 49
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 50
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-57)
SCAN o0
```

after ANALYZE:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-57)
    CO-ROUTINE a0
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 34
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 35
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 36
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 48
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 49
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 50
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-57)
SCAN o0
```

## Run 4 five vendors, statement 1

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

## Run 4 five vendors, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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

## Run 4 five vendors, statement 3

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

## Run 4 five vendors, statement 4

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

## Run 4 five vendors, statement 5

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h9, [[t1.item_seq]] AS h10, NULLIF([[t1.item_kind]], '') AS h11, [[t1.item_number]] AS h12
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
WHERE (([[t1.settled]] > '2026-11-18') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18') AND (NULLIF([[t2.id]], '') IN (SELECT +value FROM json_each('["8m2kyoqn1esmpd7","cjtyphxau3wpakw","o4oqxpjw6qbgnxo","tnwbz88dgbxpo4m","e8c1zuvwqhyuvtx"]'))))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, NULL AS v8, NULL AS v9, NULL AS v10, NULL AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(__shown), 0) AS ch___shown FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch___shown, 0) AS ch___shown FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM g1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE (1 AND a.ch___shown > 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, a.k0 AS v8, NULL AS v9, NULL AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, a.ch___shown AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t4.display_name]], ''), '(no name)')
FROM r1 t4
WHERE [[t4.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, min(w.h11) AS y0, min(w.h12) AS y1, min(w.h9) AS y2, min(w.h10) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y7, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y8, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y9, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t5.id]], '') AS rc0, [[t5.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t5 ON [[t5.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, 1 AS __shown FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y2 AS v1, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v2, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v3, (CASE WHEN (a.y7 IS 0) THEN NULL ELSE a.y7 END) AS v4, (CASE WHEN (a.y8 IS 0) THEN NULL ELSE a.y8 END) AS v5, (CASE WHEN (a.y9 IS 0) THEN NULL ELSE a.y9 END) AS v6, a.y4 AS v7, a.k0 AS v8, a.k1 AS v9, a.y3 AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY (a.y2 IS NULL), a.y2, (a.y3 IS NULL), a.y3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (COALESCE((CASE WHEN (a.y0 IS 'bill') THEN 'Bill' WHEN (a.y0 IS 'vendor_credit') THEN 'Vendor credit' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(a.y1, '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, (a.y2 IS NULL) AS __s2_0, a.y2 AS __s2_1, (a.y3 IS NULL) AS __s2_2, a.y3 AS __s2_3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_4, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_5, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL) AS __s2_6, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) AS __s2_7, (lower(a.rc1) IS NULL) AS __s2_8, lower(a.rc1) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t6.display_name]], ''), '(no name)')
FROM r1 t6
WHERE [[t6.id]] IS a.k0) AS wh0 FROM s2 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1),
pp2 AS (SELECT o.k0, o.k1, o.ck0, pp.__p1, o.__ord AS __p2 FROM o2 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0)
SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.v7, o.v8, o.v9, o.v10, o.vl8, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, NULL AS __p2, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1
UNION ALL
SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.v7, o.v8, o.v9, o.v10, o.vl8, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, pp.__p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, o.__s2_0, o.__s2_1, o.__s2_2, o.__s2_3, o.__s2_4, o.__s2_5, o.__s2_6, o.__s2_7, o.__s2_8, o.__s2_9, o.__s2_10, o.__s2_11 FROM o2 o JOIN pp2 pp ON o.k0 IS pp.k0 AND o.k1 IS pp.k1 AND o.ck0 IS pp.ck0 WHERE 0)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1, __p2 LIMIT 201
```

no statistics:

```
CO-ROUTINE (subquery-32)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      MATERIALIZE o1
        CO-ROUTINE (subquery-440)
          MATERIALIZE il1
            MATERIALIZE s1
              MATERIALIZE a1
                MATERIALIZE w
                  SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
                  SCALAR SUBQUERY 2
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 249
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 250
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 251
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCALAR SUBQUERY 5
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 263
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 264
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 265
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  LIST SUBQUERY 7
                    SCAN json_each VIRTUAL TABLE INDEX 1:
                    CREATE BLOOM FILTER
                SCAN w
                USE TEMP B-TREE FOR GROUP BY
              MATERIALIZE rs1
                MATERIALIZE a2
                  SCAN w
                  USE TEMP B-TREE FOR GROUP BY
                SCAN a
                SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCALAR SUBQUERY 5
                  CO-ROUTINE __rule
                    SCAN CONSTANT ROW
                  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                  CORRELATED SCALAR SUBQUERY 305
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 306
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 307
                    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                  SCAN __rule
                  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                USE TEMP B-TREE FOR GROUP BY
              SCAN a
              BLOOM FILTER ON rs1 (k0=? AND ck0=?)
              SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
              SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
              SCALAR SUBQUERY 5
                CO-ROUTINE __rule
                  SCAN CONSTANT ROW
                SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                CORRELATED SCALAR SUBQUERY 319
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 320
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 321
                  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                SCAN __rule
                SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCAN a
          SCAN a
          CORRELATED SCALAR SUBQUERY 18
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 333
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 334
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 335
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-440)
      SCAN o
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
    UNION ALL
      MATERIALIZE o2
        CO-ROUTINE (subquery-441)
          MATERIALIZE s2
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 67
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 68
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 69
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN a
          CORRELATED SCALAR SUBQUERY 26
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 81
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 82
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 83
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-441)
      SCAN o
      BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
      SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
SCAN (subquery-32)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-32)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      MATERIALIZE o1
        CO-ROUTINE (subquery-440)
          MATERIALIZE il1
            MATERIALIZE s1
              MATERIALIZE a1
                MATERIALIZE w
                  SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
                  SCALAR SUBQUERY 2
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 249
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 250
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 251
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCALAR SUBQUERY 5
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 263
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 264
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 265
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  LIST SUBQUERY 7
                    SCAN json_each VIRTUAL TABLE INDEX 1:
                    CREATE BLOOM FILTER
                SCAN w
                USE TEMP B-TREE FOR GROUP BY
              MATERIALIZE rs1
                MATERIALIZE a2
                  SCAN w
                  USE TEMP B-TREE FOR GROUP BY
                SCAN a
                SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCALAR SUBQUERY 5
                  CO-ROUTINE __rule
                    SCAN CONSTANT ROW
                  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                  CORRELATED SCALAR SUBQUERY 305
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 306
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 307
                    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                  SCAN __rule
                  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                USE TEMP B-TREE FOR GROUP BY
              SCAN a
              BLOOM FILTER ON rs1 (k0=? AND ck0=?)
              SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
              SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
              SCALAR SUBQUERY 5
                CO-ROUTINE __rule
                  SCAN CONSTANT ROW
                SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                CORRELATED SCALAR SUBQUERY 319
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 320
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 321
                  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                SCAN __rule
                SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCAN a
          SCAN a
          CORRELATED SCALAR SUBQUERY 18
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 333
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 334
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 335
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-440)
      SCAN o
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
    UNION ALL
      MATERIALIZE o2
        CO-ROUTINE (subquery-441)
          MATERIALIZE s2
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 67
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 68
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 69
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN a
          CORRELATED SCALAR SUBQUERY 26
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 81
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 82
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 83
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-441)
      SCAN o
      BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
      SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
SCAN (subquery-32)
USE TEMP B-TREE FOR ORDER BY
```

## Run 4 five vendors, statement 6

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h9, [[t1.item_seq]] AS h10, NULLIF([[t1.item_kind]], '') AS h11, [[t1.item_number]] AS h12
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
WHERE (([[t1.settled]] > '2026-11-18') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18') AND (NULLIF([[t2.id]], '') IN (SELECT +value FROM json_each('["8m2kyoqn1esmpd7","cjtyphxau3wpakw","o4oqxpjw6qbgnxo","tnwbz88dgbxpo4m","e8c1zuvwqhyuvtx"]'))))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, NULL AS v8, NULL AS v9, NULL AS v10, NULL AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(__shown), 0) AS ch___shown FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch___shown, 0) AS ch___shown FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM g1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE (1 AND a.ch___shown > 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, a.k0 AS v8, NULL AS v9, NULL AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, a.ch___shown AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t4.display_name]], ''), '(no name)')
FROM r1 t4
WHERE [[t4.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, min(w.h11) AS y0, min(w.h12) AS y1, min(w.h9) AS y2, min(w.h10) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y7, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y8, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y9, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t5.id]], '') AS rc0, [[t5.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t5 ON [[t5.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, 1 AS __shown FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y2 AS v1, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v2, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v3, (CASE WHEN (a.y7 IS 0) THEN NULL ELSE a.y7 END) AS v4, (CASE WHEN (a.y8 IS 0) THEN NULL ELSE a.y8 END) AS v5, (CASE WHEN (a.y9 IS 0) THEN NULL ELSE a.y9 END) AS v6, a.y4 AS v7, a.k0 AS v8, a.k1 AS v9, a.y3 AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY (a.y2 IS NULL), a.y2, (a.y3 IS NULL), a.y3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (COALESCE((CASE WHEN (a.y0 IS 'bill') THEN 'Bill' WHEN (a.y0 IS 'vendor_credit') THEN 'Vendor credit' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(a.y1, '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, (a.y2 IS NULL) AS __s2_0, a.y2 AS __s2_1, (a.y3 IS NULL) AS __s2_2, a.y3 AS __s2_3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_4, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_5, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL) AS __s2_6, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) AS __s2_7, (lower(a.rc1) IS NULL) AS __s2_8, lower(a.rc1) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t6.display_name]], ''), '(no name)')
FROM r1 t6
WHERE [[t6.id]] IS a.k0) AS wh0 FROM s2 a) a)
SELECT * FROM o0
```

no statistics:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-58)
    CO-ROUTINE a0
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 35
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 36
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 37
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 49
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 50
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 51
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      LIST SUBQUERY 7
        SCAN json_each VIRTUAL TABLE INDEX 1:
        CREATE BLOOM FILTER
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-58)
SCAN o0
```

after ANALYZE:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-58)
    CO-ROUTINE a0
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 35
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 36
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 37
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 49
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 50
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 51
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      LIST SUBQUERY 7
        SCAN json_each VIRTUAL TABLE INDEX 1:
        CREATE BLOOM FILTER
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-58)
SCAN o0
```

## Run 4 five vendors, statement 7

```sql
WITH r0 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1)))
SELECT o.v AS v, o.l AS l, o.lc AS lc, o.g AS g FROM (SELECT CAST(NULLIF([[t1.id]], '') AS TEXT) AS v, COALESCE(min(NULLIF(CAST([[t1.display_name]] AS TEXT), '')), '') AS l, min(NULL) AS lc, NULL AS g, NULL AS k
FROM r0 t1
WHERE 1 AND CAST(NULLIF([[t1.id]], '') AS TEXT) IS NOT NULL
GROUP BY 1) o
WHERE 1 AND o.v IN (SELECT +value FROM json_each('["8m2kyoqn1esmpd7","cjtyphxau3wpakw","o4oqxpjw6qbgnxo","tnwbz88dgbxpo4m","e8c1zuvwqhyuvtx"]'))
ORDER BY o.l <> '', o.l, o.v LIMIT 6
```

no statistics:

```
CO-ROUTINE o
  SCAN books_vendors
  SCALAR SUBQUERY 2
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 12
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 13
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 14
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  USE TEMP B-TREE FOR GROUP BY
  LIST SUBQUERY 5
    SCAN json_each VIRTUAL TABLE INDEX 1:
    CREATE BLOOM FILTER
SCAN o
REUSE LIST SUBQUERY 5
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE o
  SCAN books_vendors
  SCALAR SUBQUERY 2
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 12
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 13
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 14
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  USE TEMP B-TREE FOR GROUP BY
  LIST SUBQUERY 5
    SCAN json_each VIRTUAL TABLE INDEX 1:
    CREATE BLOOM FILTER
SCAN o
REUSE LIST SUBQUERY 5
USE TEMP B-TREE FOR ORDER BY
```

## Run 5 vendor opened, statement 1

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

## Run 5 vendor opened, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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

## Run 5 vendor opened, statement 3

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

## Run 5 vendor opened, statement 4

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

## Run 5 vendor opened, statement 5

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h9, [[t1.item_seq]] AS h10, NULLIF([[t1.item_kind]], '') AS h11, [[t1.item_number]] AS h12
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
WHERE (([[t1.settled]] > '2026-11-18') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, NULL AS v8, NULL AS v9, NULL AS v10, NULL AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(__shown), 0) AS ch___shown FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch___shown, 0) AS ch___shown FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM g1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE (1 AND a.ch___shown > 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, a.k0 AS v8, NULL AS v9, NULL AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, a.ch___shown AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t4.display_name]], ''), '(no name)')
FROM r1 t4
WHERE [[t4.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, min(w.h11) AS y0, min(w.h12) AS y1, min(w.h9) AS y2, min(w.h10) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y7, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y8, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y9, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t5.id]], '') AS rc0, [[t5.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t5 ON [[t5.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, 1 AS __shown FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y2 AS v1, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v2, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v3, (CASE WHEN (a.y7 IS 0) THEN NULL ELSE a.y7 END) AS v4, (CASE WHEN (a.y8 IS 0) THEN NULL ELSE a.y8 END) AS v5, (CASE WHEN (a.y9 IS 0) THEN NULL ELSE a.y9 END) AS v6, a.y4 AS v7, a.k0 AS v8, a.k1 AS v9, a.y3 AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY (a.y2 IS NULL), a.y2, (a.y3 IS NULL), a.y3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (COALESCE((CASE WHEN (a.y0 IS 'bill') THEN 'Bill' WHEN (a.y0 IS 'vendor_credit') THEN 'Vendor credit' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(a.y1, '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, (a.y2 IS NULL) AS __s2_0, a.y2 AS __s2_1, (a.y3 IS NULL) AS __s2_2, a.y3 AS __s2_3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_4, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_5, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL) AS __s2_6, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) AS __s2_7, (lower(a.rc1) IS NULL) AS __s2_8, lower(a.rc1) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t6.display_name]], ''), '(no name)')
FROM r1 t6
WHERE [[t6.id]] IS a.k0) AS wh0 FROM s2 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1),
pp2 AS (SELECT o.k0, o.k1, o.ck0, pp.__p1, o.__ord AS __p2 FROM o2 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0)
SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.v7, o.v8, o.v9, o.v10, o.vl8, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, NULL AS __p2, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1
UNION ALL
SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.v7, o.v8, o.v9, o.v10, o.vl8, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, pp.__p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, o.__s2_0, o.__s2_1, o.__s2_2, o.__s2_3, o.__s2_4, o.__s2_5, o.__s2_6, o.__s2_7, o.__s2_8, o.__s2_9, o.__s2_10, o.__s2_11 FROM o2 o JOIN pp2 pp ON o.k0 IS pp.k0 AND o.k1 IS pp.k1 AND o.ck0 IS pp.ck0 WHERE ((o.k0 COLLATE BINARY, o.ck0 COLLATE BINARY) IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each('[["jr7u2lily7sl2fx","USD"]]'))))
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1, __p2 LIMIT 201
```

no statistics:

```
CO-ROUTINE (subquery-32)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      MATERIALIZE o1
        CO-ROUTINE (subquery-440)
          MATERIALIZE il1
            MATERIALIZE s1
              MATERIALIZE a1
                MATERIALIZE w
                  SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
                  SCALAR SUBQUERY 2
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 249
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 250
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 251
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCALAR SUBQUERY 5
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 263
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 264
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 265
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                SCAN w
                USE TEMP B-TREE FOR GROUP BY
              MATERIALIZE rs1
                MATERIALIZE a2
                  SCAN w
                  USE TEMP B-TREE FOR GROUP BY
                SCAN a
                SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCALAR SUBQUERY 5
                  CO-ROUTINE __rule
                    SCAN CONSTANT ROW
                  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                  CORRELATED SCALAR SUBQUERY 305
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 306
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 307
                    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                  SCAN __rule
                  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                USE TEMP B-TREE FOR GROUP BY
              SCAN a
              BLOOM FILTER ON rs1 (k0=? AND ck0=?)
              SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
              SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
              SCALAR SUBQUERY 5
                CO-ROUTINE __rule
                  SCAN CONSTANT ROW
                SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                CORRELATED SCALAR SUBQUERY 319
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 320
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 321
                  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                SCAN __rule
                SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCAN a
          SCAN a
          CORRELATED SCALAR SUBQUERY 17
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 333
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 334
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 335
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-440)
      SCAN o
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
    UNION ALL
      MATERIALIZE o2
        CO-ROUTINE (subquery-441)
          MATERIALIZE s2
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 67
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 68
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 69
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN a
          CORRELATED SCALAR SUBQUERY 25
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 81
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 82
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 83
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-441)
      SCAN o
      LIST SUBQUERY 31
        SCAN json_each VIRTUAL TABLE INDEX 1:
        CREATE BLOOM FILTER
      BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
      SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
SCAN (subquery-32)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-32)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      MATERIALIZE o1
        CO-ROUTINE (subquery-440)
          MATERIALIZE il1
            MATERIALIZE s1
              MATERIALIZE a1
                MATERIALIZE w
                  SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
                  SCALAR SUBQUERY 2
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 249
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 250
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 251
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCALAR SUBQUERY 5
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 263
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 264
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 265
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                SCAN w
                USE TEMP B-TREE FOR GROUP BY
              MATERIALIZE rs1
                MATERIALIZE a2
                  SCAN w
                  USE TEMP B-TREE FOR GROUP BY
                SCAN a
                SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCALAR SUBQUERY 5
                  CO-ROUTINE __rule
                    SCAN CONSTANT ROW
                  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                  CORRELATED SCALAR SUBQUERY 305
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 306
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 307
                    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                  SCAN __rule
                  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                USE TEMP B-TREE FOR GROUP BY
              SCAN a
              BLOOM FILTER ON rs1 (k0=? AND ck0=?)
              SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
              SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
              SCALAR SUBQUERY 5
                CO-ROUTINE __rule
                  SCAN CONSTANT ROW
                SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                CORRELATED SCALAR SUBQUERY 319
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 320
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 321
                  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                SCAN __rule
                SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCAN a
          SCAN a
          CORRELATED SCALAR SUBQUERY 17
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 333
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 334
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 335
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-440)
      SCAN o
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
    UNION ALL
      MATERIALIZE o2
        CO-ROUTINE (subquery-441)
          MATERIALIZE s2
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 67
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 68
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 69
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN a
          CORRELATED SCALAR SUBQUERY 25
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 81
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 82
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 83
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-441)
      SCAN o
      LIST SUBQUERY 31
        SCAN json_each VIRTUAL TABLE INDEX 1:
        CREATE BLOOM FILTER
      BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
      SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
SCAN (subquery-32)
USE TEMP B-TREE FOR ORDER BY
```

## Run 5 vendor opened, statement 6

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h9, [[t1.item_seq]] AS h10, NULLIF([[t1.item_kind]], '') AS h11, [[t1.item_number]] AS h12
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
WHERE (([[t1.settled]] > '2026-11-18') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, NULL AS v8, NULL AS v9, NULL AS v10, NULL AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(__shown), 0) AS ch___shown FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch___shown, 0) AS ch___shown FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM g1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE (1 AND a.ch___shown > 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, a.k0 AS v8, NULL AS v9, NULL AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, a.ch___shown AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t4.display_name]], ''), '(no name)')
FROM r1 t4
WHERE [[t4.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, min(w.h11) AS y0, min(w.h12) AS y1, min(w.h9) AS y2, min(w.h10) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y7, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y8, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y9, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t5.id]], '') AS rc0, [[t5.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t5 ON [[t5.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, 1 AS __shown FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y2 AS v1, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v2, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v3, (CASE WHEN (a.y7 IS 0) THEN NULL ELSE a.y7 END) AS v4, (CASE WHEN (a.y8 IS 0) THEN NULL ELSE a.y8 END) AS v5, (CASE WHEN (a.y9 IS 0) THEN NULL ELSE a.y9 END) AS v6, a.y4 AS v7, a.k0 AS v8, a.k1 AS v9, a.y3 AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY (a.y2 IS NULL), a.y2, (a.y3 IS NULL), a.y3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (COALESCE((CASE WHEN (a.y0 IS 'bill') THEN 'Bill' WHEN (a.y0 IS 'vendor_credit') THEN 'Vendor credit' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(a.y1, '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, (a.y2 IS NULL) AS __s2_0, a.y2 AS __s2_1, (a.y3 IS NULL) AS __s2_2, a.y3 AS __s2_3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_4, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_5, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL) AS __s2_6, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) AS __s2_7, (lower(a.rc1) IS NULL) AS __s2_8, lower(a.rc1) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t6.display_name]], ''), '(no name)')
FROM r1 t6
WHERE [[t6.id]] IS a.k0) AS wh0 FROM s2 a) a)
SELECT * FROM o0
```

no statistics:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-57)
    CO-ROUTINE a0
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 34
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 35
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 36
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 48
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 49
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 50
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-57)
SCAN o0
```

after ANALYZE:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-57)
    CO-ROUTINE a0
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 34
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 35
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 36
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 48
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 49
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 50
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-57)
SCAN o0
```

## Run 6 item opened, statement 1

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

## Run 6 item opened, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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

## Run 6 item opened, statement 3

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

## Run 6 item opened, statement 4

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

## Run 6 item opened, statement 5

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h9, [[t1.item_seq]] AS h10, NULLIF([[t1.item_kind]], '') AS h11, [[t1.item_number]] AS h12
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
WHERE (([[t1.settled]] > '2026-11-18') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, NULL AS v8, NULL AS v9, NULL AS v10, NULL AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(__shown), 0) AS ch___shown FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch___shown, 0) AS ch___shown FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM g1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE (1 AND a.ch___shown > 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, a.k0 AS v8, NULL AS v9, NULL AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, a.ch___shown AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t4.display_name]], ''), '(no name)')
FROM r1 t4
WHERE [[t4.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, min(w.h11) AS y0, min(w.h12) AS y1, min(w.h9) AS y2, min(w.h10) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y7, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y8, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y9, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t5.id]], '') AS rc0, [[t5.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t5 ON [[t5.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, 1 AS __shown FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y2 AS v1, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v2, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v3, (CASE WHEN (a.y7 IS 0) THEN NULL ELSE a.y7 END) AS v4, (CASE WHEN (a.y8 IS 0) THEN NULL ELSE a.y8 END) AS v5, (CASE WHEN (a.y9 IS 0) THEN NULL ELSE a.y9 END) AS v6, a.y4 AS v7, a.k0 AS v8, a.k1 AS v9, a.y3 AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY (a.y2 IS NULL), a.y2, (a.y3 IS NULL), a.y3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (COALESCE((CASE WHEN (a.y0 IS 'bill') THEN 'Bill' WHEN (a.y0 IS 'vendor_credit') THEN 'Vendor credit' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(a.y1, '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, (a.y2 IS NULL) AS __s2_0, a.y2 AS __s2_1, (a.y3 IS NULL) AS __s2_2, a.y3 AS __s2_3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_4, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_5, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL) AS __s2_6, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) AS __s2_7, (lower(a.rc1) IS NULL) AS __s2_8, lower(a.rc1) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t6.display_name]], ''), '(no name)')
FROM r1 t6
WHERE [[t6.id]] IS a.k0) AS wh0 FROM s2 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1),
pp2 AS (SELECT o.k0, o.k1, o.ck0, pp.__p1, o.__ord AS __p2 FROM o2 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0)
SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.v7, o.v8, o.v9, o.v10, o.vl8, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, NULL AS __p2, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1
UNION ALL
SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.v7, o.v8, o.v9, o.v10, o.vl8, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, pp.__p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, o.__s2_0, o.__s2_1, o.__s2_2, o.__s2_3, o.__s2_4, o.__s2_5, o.__s2_6, o.__s2_7, o.__s2_8, o.__s2_9, o.__s2_10, o.__s2_11 FROM o2 o JOIN pp2 pp ON o.k0 IS pp.k0 AND o.k1 IS pp.k1 AND o.ck0 IS pp.ck0 WHERE ((o.k0 COLLATE BINARY, o.ck0 COLLATE BINARY) IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each('[["jr7u2lily7sl2fx","USD"]]'))))
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1, __p2 LIMIT 201
```

no statistics:

```
CO-ROUTINE (subquery-32)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      MATERIALIZE o1
        CO-ROUTINE (subquery-440)
          MATERIALIZE il1
            MATERIALIZE s1
              MATERIALIZE a1
                MATERIALIZE w
                  SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
                  SCALAR SUBQUERY 2
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 249
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 250
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 251
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCALAR SUBQUERY 5
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 263
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 264
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 265
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                SCAN w
                USE TEMP B-TREE FOR GROUP BY
              MATERIALIZE rs1
                MATERIALIZE a2
                  SCAN w
                  USE TEMP B-TREE FOR GROUP BY
                SCAN a
                SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCALAR SUBQUERY 5
                  CO-ROUTINE __rule
                    SCAN CONSTANT ROW
                  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                  CORRELATED SCALAR SUBQUERY 305
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 306
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 307
                    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                  SCAN __rule
                  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                USE TEMP B-TREE FOR GROUP BY
              SCAN a
              BLOOM FILTER ON rs1 (k0=? AND ck0=?)
              SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
              SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
              SCALAR SUBQUERY 5
                CO-ROUTINE __rule
                  SCAN CONSTANT ROW
                SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                CORRELATED SCALAR SUBQUERY 319
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 320
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 321
                  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                SCAN __rule
                SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCAN a
          SCAN a
          CORRELATED SCALAR SUBQUERY 17
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 333
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 334
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 335
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-440)
      SCAN o
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
    UNION ALL
      MATERIALIZE o2
        CO-ROUTINE (subquery-441)
          MATERIALIZE s2
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 67
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 68
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 69
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN a
          CORRELATED SCALAR SUBQUERY 25
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 81
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 82
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 83
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-441)
      SCAN o
      LIST SUBQUERY 31
        SCAN json_each VIRTUAL TABLE INDEX 1:
        CREATE BLOOM FILTER
      BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
      SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
SCAN (subquery-32)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-32)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      MATERIALIZE o1
        CO-ROUTINE (subquery-440)
          MATERIALIZE il1
            MATERIALIZE s1
              MATERIALIZE a1
                MATERIALIZE w
                  SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
                  SCALAR SUBQUERY 2
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 249
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 250
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 251
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCALAR SUBQUERY 5
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 263
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 264
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 265
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                SCAN w
                USE TEMP B-TREE FOR GROUP BY
              MATERIALIZE rs1
                MATERIALIZE a2
                  SCAN w
                  USE TEMP B-TREE FOR GROUP BY
                SCAN a
                SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCALAR SUBQUERY 5
                  CO-ROUTINE __rule
                    SCAN CONSTANT ROW
                  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                  CORRELATED SCALAR SUBQUERY 305
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 306
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 307
                    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                  SCAN __rule
                  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                USE TEMP B-TREE FOR GROUP BY
              SCAN a
              BLOOM FILTER ON rs1 (k0=? AND ck0=?)
              SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
              SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
              SCALAR SUBQUERY 5
                CO-ROUTINE __rule
                  SCAN CONSTANT ROW
                SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                CORRELATED SCALAR SUBQUERY 319
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 320
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 321
                  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                SCAN __rule
                SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCAN a
          SCAN a
          CORRELATED SCALAR SUBQUERY 17
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 333
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 334
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 335
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-440)
      SCAN o
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
    UNION ALL
      MATERIALIZE o2
        CO-ROUTINE (subquery-441)
          MATERIALIZE s2
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 67
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 68
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 69
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN a
          CORRELATED SCALAR SUBQUERY 25
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 81
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 82
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 83
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-441)
      SCAN o
      LIST SUBQUERY 31
        SCAN json_each VIRTUAL TABLE INDEX 1:
        CREATE BLOOM FILTER
      BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
      SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
SCAN (subquery-32)
USE TEMP B-TREE FOR ORDER BY
```

## Run 6 item opened, statement 6

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h9, [[t1.item_seq]] AS h10, NULLIF([[t1.item_kind]], '') AS h11, [[t1.item_number]] AS h12
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
WHERE (([[t1.settled]] > '2026-11-18') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, NULL AS v8, NULL AS v9, NULL AS v10, NULL AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(__shown), 0) AS ch___shown FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch___shown, 0) AS ch___shown FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM g1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE (1 AND a.ch___shown > 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, a.k0 AS v8, NULL AS v9, NULL AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, a.ch___shown AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t4.display_name]], ''), '(no name)')
FROM r1 t4
WHERE [[t4.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, min(w.h11) AS y0, min(w.h12) AS y1, min(w.h9) AS y2, min(w.h10) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y7, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y8, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y9, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t5.id]], '') AS rc0, [[t5.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t5 ON [[t5.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, 1 AS __shown FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y2 AS v1, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v2, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v3, (CASE WHEN (a.y7 IS 0) THEN NULL ELSE a.y7 END) AS v4, (CASE WHEN (a.y8 IS 0) THEN NULL ELSE a.y8 END) AS v5, (CASE WHEN (a.y9 IS 0) THEN NULL ELSE a.y9 END) AS v6, a.y4 AS v7, a.k0 AS v8, a.k1 AS v9, a.y3 AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY (a.y2 IS NULL), a.y2, (a.y3 IS NULL), a.y3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (COALESCE((CASE WHEN (a.y0 IS 'bill') THEN 'Bill' WHEN (a.y0 IS 'vendor_credit') THEN 'Vendor credit' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(a.y1, '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, (a.y2 IS NULL) AS __s2_0, a.y2 AS __s2_1, (a.y3 IS NULL) AS __s2_2, a.y3 AS __s2_3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_4, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_5, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL) AS __s2_6, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) AS __s2_7, (lower(a.rc1) IS NULL) AS __s2_8, lower(a.rc1) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t6.display_name]], ''), '(no name)')
FROM r1 t6
WHERE [[t6.id]] IS a.k0) AS wh0 FROM s2 a) a)
SELECT * FROM o0
```

no statistics:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-57)
    CO-ROUTINE a0
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 34
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 35
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 36
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 48
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 49
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 50
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-57)
SCAN o0
```

after ANALYZE:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-57)
    CO-ROUTINE a0
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 34
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 35
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 36
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 48
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 49
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 50
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-57)
SCAN o0
```

## Run 6 item opened, statement 7

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_journal_entries`.* FROM `books_journal_entries` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF([[t1.item_kind]], '') AS h9, [[t1.item_number]] AS h10, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h11, [[t1.item_seq]] AS h12, NULLIF(substr([[t1.date]], 1, 10), '') AS h13, NULLIF([[t5.posted_at]], '') AS h14, NULLIF([[t5.doc_type]], '') AS h15, NULLIF([[t5.origin]], '') AS h16, [[t9.number]] AS h17, [[t5.number]] AS h18, [[t5.document]] AS h19, NULLIF([[t5.id]], '') AS h20
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t5 ON [[t5.id]] = [[t1.entry]]
LEFT JOIN r2 t9 ON [[t9.id]] = [[t5.reverses]]
WHERE (([[t1.settled]] > '2026-11-18') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
a2 AS (SELECT k0, k1, ck0, min(w.h9) AS y0, min(w.h10) AS y1, min(w.h11) AS y2, min(w.h12) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t4.id]], '') AS rc0, [[t4.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
ws AS (SELECT w.* FROM w WHERE EXISTS (SELECT 1 FROM s2 p WHERE p.k0 IS w.k0 AND p.k1 IS w.k1 AND p.ck0 IS w.ck0)),
gord AS MATERIALIZED (SELECT key AS __g, json_extract(value, '$[0]') AS g0, json_extract(value, '$[1]') AS g1, json_extract(value, '$[2]') AS g2 FROM json_each('[["jr7u2lily7sl2fx","arb000000000385","USD"]]'))
SELECT * FROM (SELECT d.*, gord.__g AS __g FROM (SELECT w.__id AS __id, w.k0 AS k0, w.k1 AS k1, w.ck0 AS ck0, w.h11 AS s0, w.h12 AS s1, w.h13 AS s2, w.h14 AS s3, (CASE WHEN (w.rc0 IS NULL OR w.rc0 = '') THEN 1 ELSE 0 END) AS s4, tc_round((CASE WHEN ('name' IS 'balance') THEN COALESCE((COALESCE(w.h7, 0) - COALESCE(w.h8, 0)), 0) ELSE 0 END), 0) AS s5, lower(w.rc1) AS s6, w.c0 AS v0, NULL AS vcur0, NULL AS vmx0, w.wh0 AS vl0, NULL AS vc0, w.h11 AS v1, NULL AS vcur1, NULL AS vmx1, NULL AS vl1, NULL AS vc1, (CASE WHEN (COALESCE(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) IS 0) THEN NULL ELSE COALESCE(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) END) AS v2, NULL AS vcur2, NULL AS vmx2, NULL AS vl2, NULL AS vc2, (CASE WHEN (COALESCE(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) IS 0) THEN NULL ELSE COALESCE(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) END) AS v3, NULL AS vcur3, NULL AS vmx3, NULL AS vl3, NULL AS vc3, (CASE WHEN (COALESCE(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) IS 0) THEN NULL ELSE COALESCE(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) END) AS v4, NULL AS vcur4, NULL AS vmx4, NULL AS vl4, NULL AS vc4, (CASE WHEN (COALESCE(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) IS 0) THEN NULL ELSE COALESCE(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) END) AS v5, NULL AS vcur5, NULL AS vmx5, NULL AS vl5, NULL AS vc5, (CASE WHEN (COALESCE(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) IS 0) THEN NULL ELSE COALESCE(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) END) AS v6, NULL AS vcur6, NULL AS vmx6, NULL AS vl6, NULL AS vc6, COALESCE((COALESCE(w.h7, 0) - COALESCE(w.h8, 0)), 0) AS v7, NULL AS vcur7, NULL AS vmx7, NULL AS vl7, NULL AS vc7, w.c8 AS v8, NULL AS vcur8, NULL AS vmx8, w.wh1 AS vl8, NULL AS vc8, w.c9 AS v9, NULL AS vcur9, NULL AS vmx9, NULL AS vl9, NULL AS vc9, w.h12 AS v10, NULL AS vcur10, NULL AS vmx10, NULL AS vl10, NULL AS vc10, (COALESCE(w.h13, '') || COALESCE(' · ', '') || COALESCE((CASE WHEN ((w.h15 IS 'bill') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill' WHEN ((w.h15 IS 'bill_payment') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill payment' WHEN ((w.h15 IS 'credit_memo') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Credit memo' WHEN ((w.h15 IS 'expense') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Expense' WHEN ((w.h15 IS 'invoice') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Invoice' WHEN ((w.h15 IS 'payment') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Payment' WHEN ((w.h15 IS 'refund_receipt') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Refund receipt' WHEN ((w.h15 IS 'sales_receipt') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Sales receipt' WHEN ((w.h15 IS 'transfer') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Transfer' WHEN ((w.h15 IS 'vendor_credit') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor credit' WHEN ((w.h15 IS 'vendor_refund') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor refund' WHEN ((w.h15 IS 'write_off') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Write-off' WHEN (w.h16 IS 'reversal') THEN (CASE WHEN (w.h17 IS NULL OR w.h17 = '') THEN 'Reversal' ELSE (COALESCE('Reversal', '') || COALESCE(' of ', '') || COALESCE(w.h17, '')) END) WHEN (w.h16 IS 'void_reversal') THEN (CASE WHEN (w.h17 IS NULL OR w.h17 = '') THEN 'Void reversal' ELSE (COALESCE('Void reversal', '') || COALESCE(' of ', '') || COALESCE(w.h17, '')) END) WHEN (w.h16 IS 'auto_reversal') THEN (CASE WHEN (w.h17 IS NULL OR w.h17 = '') THEN 'Auto reversal' ELSE (COALESCE('Auto reversal', '') || COALESCE(' of ', '') || COALESCE(w.h17, '')) END) WHEN (w.h16 IS 'manual') THEN 'Journal entry' WHEN (w.h16 IS 'opening_balance') THEN 'Opening balances' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(w.h18, '')) AS __label, NULL AS __labelcur, (CASE WHEN ((w.h16 IS 'document') AND (w.h15 IS 'bill') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/bills/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'bill_payment') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/bill-payments/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'credit_memo') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/credit-memos/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'expense') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/expenses/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'invoice') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/invoices/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'payment') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/payments/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'refund_receipt') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/refund-receipts/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'sales_receipt') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/sales-receipts/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'vendor_credit') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/vendor-credits/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'vendor_refund') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/vendor-refunds/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'write_off') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/write-offs/', '') || COALESCE(w.h19, '')) WHEN ((w.h15 IS 'transfer') AND (w.h16 IS 'manual')) THEN (COALESCE('books/transfers/', '') || COALESCE(w.h20, '')) ELSE (COALESCE('books/entries/', '') || COALESCE(w.h20, '')) END) AS __open FROM (SELECT w.*, (SELECT COALESCE(NULLIF([[t8.display_name]], ''), '(no name)')
FROM r1 t8
WHERE [[t8.id]] IS w.c8) AS wh1 FROM (SELECT w.*, (SELECT COALESCE(NULLIF([[t7.display_name]], ''), '(no name)')
FROM r1 t7
WHERE [[t7.id]] IS w.c0) AS wh0 FROM (SELECT w.*, NULLIF([[t6.id]], '') AS rc0, [[t6.display_name]] AS rc1 FROM ws w LEFT JOIN r1 t6 ON [[t6.id]] IS w.k0) w) w) w) d JOIN gord ON d.k0 IS gord.g0 AND d.k1 IS gord.g1 AND d.ck0 IS gord.g2) d WHERE 1 ORDER BY d.__g, (d.s0 IS NULL), d.s0, (d.s1 IS NULL), d.s1, (d.s2 IS NULL), d.s2, (d.s3 IS NULL), d.s3, (d.s4 IS NULL), d.s4, (d.s5 IS NULL), d.s5 DESC, (d.s6 IS NULL), d.s6, d.__id LIMIT 201
```

no statistics:

```
MATERIALIZE gord
  SCAN json_each VIRTUAL TABLE INDEX 1:
SCAN gord
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 46
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 47
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 48
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_payable_items USING INDEX idx_books_payable_items_item (item=?)
SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 60
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 61
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 62
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 18
  MATERIALIZE s2
    CO-ROUTINE a2
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 102
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 103
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 104
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 116
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 117
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 118
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 130
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 131
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 132
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_entries USING COVERING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 144
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 145
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 146
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
    SCALAR SUBQUERY 5
      CO-ROUTINE __rule
        SCAN CONSTANT ROW
      SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
      CORRELATED SCALAR SUBQUERY 158
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 159
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 160
        SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
      SCAN __rule
      SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  BLOOM FILTER ON p (k0=? AND k1=? AND ck0=?)
  SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND k1=? AND ck0=?)
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 8
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 74
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 75
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 76
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 8
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 88
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 89
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 90
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 172
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 173
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 174
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 34
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 186
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 187
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 188
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 33
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 200
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 201
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 202
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
LIST SUBQUERY 21
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 22
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 23
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 24
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 25
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 26
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 27
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 28
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 29
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 30
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 31
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 32
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
MATERIALIZE gord
  SCAN json_each VIRTUAL TABLE INDEX 1:
SCAN gord
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 46
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 47
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 48
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_payable_items USING INDEX idx_books_payable_items_item (item=?)
SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 60
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 61
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 62
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 18
  MATERIALIZE s2
    CO-ROUTINE a2
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 102
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 103
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 104
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 116
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 117
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 118
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 130
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 131
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 132
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_entries USING COVERING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 144
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 145
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 146
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
    SCALAR SUBQUERY 5
      CO-ROUTINE __rule
        SCAN CONSTANT ROW
      SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
      CORRELATED SCALAR SUBQUERY 158
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 159
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 160
        SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
      SCAN __rule
      SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  BLOOM FILTER ON p (k0=? AND k1=? AND ck0=?)
  SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND k1=? AND ck0=?)
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 8
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 74
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 75
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 76
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 8
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 88
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 89
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 90
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 172
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 173
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 174
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 34
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 186
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 187
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 188
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 33
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 200
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 201
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 202
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
LIST SUBQUERY 21
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 22
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 23
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 24
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 25
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 26
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 27
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 28
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 29
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 30
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 31
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 32
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
USE TEMP B-TREE FOR ORDER BY
```

## Run 7 CSV export, statement 1

```sql
SELECT `reports`.* FROM `reports` WHERE [[reports.shipped_key]] = 'books.ap_aging' LIMIT 1
```

no statistics:

```
SCAN reports
```

after ANALYZE:

```
SCAN reports
```

## Run 7 CSV export, statement 2

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

## Run 7 CSV export, statement 3

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

## Run 7 CSV export, statement 4

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

## Run 7 CSV export, statement 5

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

## Run 7 CSV export, statement 6

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

## Run 7 CSV export, statement 7

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

## Run 7 CSV export, statement 8

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

## Run 7 CSV export, statement 9

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

## Run 7 CSV export, statement 10

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

## Run 7 CSV export, statement 11

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

## Run 7 CSV export, statement 12

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

## Run 7 CSV export, statement 13

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

## Run 7 CSV export, statement 14

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

## Run 7 CSV export, statement 15

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

## Run 7 CSV export, statement 16

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

## Run 7 CSV export, statement 17

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

## Run 7 CSV export, statement 18

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

## Run 7 CSV export, statement 19

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

## Run 7 CSV export, statement 20

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

## Run 7 CSV export, statement 21

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

## Run 7 CSV export, statement 22

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

## Run 7 CSV export, statement 23

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

## Run 7 CSV export, statement 24

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

## Run 7 CSV export, statement 25

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

## Run 7 CSV export, statement 26

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

## Run 7 CSV export, statement 27

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

## Run 7 CSV export, statement 28

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

## Run 7 CSV export, statement 29

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

## Run 7 CSV export, statement 30

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

## Run 7 CSV export, statement 31

```sql
SELECT `users`.* FROM `users` WHERE `users`.`id`='erm9hfihaqj47y3' LIMIT 1
```

no statistics:

```
SEARCH users USING INDEX sqlite_autoindex_users_1 (id=?)
```

after ANALYZE:

```
SEARCH users USING INDEX sqlite_autoindex_users_1 (id=?)
```

## Run 7 CSV export, statement 32

```sql
SELECT `reports`.* FROM `reports` WHERE `reports`.`id`='gvezn54m7sz69jy' LIMIT 1
```

no statistics:

```
SEARCH reports USING INDEX sqlite_autoindex_reports_1 (id=?)
```

after ANALYZE:

```
SEARCH reports USING INDEX sqlite_autoindex_reports_1 (id=?)
```

## Run 7 CSV export, statement 33

```sql
SELECT DISTINCT (1) FROM `reports` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `report_shares` `reports_report_shares_via_report` ON [[reports_report_shares_via_report.report]] = [[reports.id]] WHERE (`reports`.`id`='gvezn54m7sz69jy') AND (('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND ([[reports.owner]] = 'erm9hfihaqj47y3' OR [[reports_report_shares_via_report.user]] = 'erm9hfihaqj47y3' OR ([[reports.published]] = 1 AND [[__auth_users.role]] IS NOT 'guest')))) LIMIT 1
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

## Run 7 CSV export, statement 34

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

## Run 7 CSV export, statement 35

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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

## Run 7 CSV export, statement 36

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

## Run 7 CSV export, statement 37

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

## Run 7 CSV export, statement 38

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h9, [[t1.item_seq]] AS h10, NULLIF([[t1.item_kind]], '') AS h11, [[t1.item_number]] AS h12
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
WHERE (([[t1.settled]] > '2026-11-18') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, NULL AS v8, NULL AS v9, NULL AS v10, NULL AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(__shown), 0) AS ch___shown FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch___shown, 0) AS ch___shown FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM g1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE (1 AND a.ch___shown > 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, a.k0 AS v8, NULL AS v9, NULL AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, a.ch___shown AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t4.display_name]], ''), '(no name)')
FROM r1 t4
WHERE [[t4.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, min(w.h11) AS y0, min(w.h12) AS y1, min(w.h9) AS y2, min(w.h10) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y7, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y8, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y9, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t5.id]], '') AS rc0, [[t5.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t5 ON [[t5.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, 1 AS __shown FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y2 AS v1, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v2, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v3, (CASE WHEN (a.y7 IS 0) THEN NULL ELSE a.y7 END) AS v4, (CASE WHEN (a.y8 IS 0) THEN NULL ELSE a.y8 END) AS v5, (CASE WHEN (a.y9 IS 0) THEN NULL ELSE a.y9 END) AS v6, a.y4 AS v7, a.k0 AS v8, a.k1 AS v9, a.y3 AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY (a.y2 IS NULL), a.y2, (a.y3 IS NULL), a.y3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (COALESCE((CASE WHEN (a.y0 IS 'bill') THEN 'Bill' WHEN (a.y0 IS 'vendor_credit') THEN 'Vendor credit' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(a.y1, '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, (a.y2 IS NULL) AS __s2_0, a.y2 AS __s2_1, (a.y3 IS NULL) AS __s2_2, a.y3 AS __s2_3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_4, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_5, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL) AS __s2_6, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) AS __s2_7, (lower(a.rc1) IS NULL) AS __s2_8, lower(a.rc1) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t6.display_name]], ''), '(no name)')
FROM r1 t6
WHERE [[t6.id]] IS a.k0) AS wh0 FROM s2 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1),
pp2 AS (SELECT o.k0, o.k1, o.ck0, pp.__p1, o.__ord AS __p2 FROM o2 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0)
SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.v7, o.v8, o.v9, o.v10, o.vl8, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, NULL AS __p2, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9, NULL AS __s2_0, NULL AS __s2_1, NULL AS __s2_2, NULL AS __s2_3, NULL AS __s2_4, NULL AS __s2_5, NULL AS __s2_6, NULL AS __s2_7, NULL AS __s2_8, NULL AS __s2_9, NULL AS __s2_10, NULL AS __s2_11 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1
UNION ALL
SELECT o.__level, o.__row, o.k0, o.k1, o.ck0, o.v0, o.v1, o.v2, o.v3, o.v4, o.v5, o.v6, o.v7, o.v8, o.v9, o.v10, o.vl8, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, pp.__p2, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9, o.__s2_0, o.__s2_1, o.__s2_2, o.__s2_3, o.__s2_4, o.__s2_5, o.__s2_6, o.__s2_7, o.__s2_8, o.__s2_9, o.__s2_10, o.__s2_11 FROM o2 o JOIN pp2 pp ON o.k0 IS pp.k0 AND o.k1 IS pp.k1 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1, __p2 LIMIT 50002
```

no statistics:

```
CO-ROUTINE (subquery-31)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      MATERIALIZE o1
        CO-ROUTINE (subquery-439)
          MATERIALIZE il1
            MATERIALIZE s1
              MATERIALIZE a1
                MATERIALIZE w
                  SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
                  SCALAR SUBQUERY 2
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 248
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 249
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 250
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCALAR SUBQUERY 5
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 262
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 263
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 264
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                SCAN w
                USE TEMP B-TREE FOR GROUP BY
              MATERIALIZE rs1
                MATERIALIZE a2
                  SCAN w
                  USE TEMP B-TREE FOR GROUP BY
                SCAN a
                SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCALAR SUBQUERY 5
                  CO-ROUTINE __rule
                    SCAN CONSTANT ROW
                  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                  CORRELATED SCALAR SUBQUERY 304
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 305
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 306
                    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                  SCAN __rule
                  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                USE TEMP B-TREE FOR GROUP BY
              SCAN a
              BLOOM FILTER ON rs1 (k0=? AND ck0=?)
              SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
              SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
              SCALAR SUBQUERY 5
                CO-ROUTINE __rule
                  SCAN CONSTANT ROW
                SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                CORRELATED SCALAR SUBQUERY 318
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 319
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 320
                  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                SCAN __rule
                SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCAN a
          SCAN a
          CORRELATED SCALAR SUBQUERY 17
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 332
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 333
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 334
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-439)
      SCAN o
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
    UNION ALL
      MATERIALIZE o2
        CO-ROUTINE (subquery-440)
          MATERIALIZE s2
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 66
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 67
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 68
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN a
          CORRELATED SCALAR SUBQUERY 25
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 80
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 81
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 82
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-440)
      SCAN o
      BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
      SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
SCAN (subquery-31)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-31)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      MATERIALIZE o1
        CO-ROUTINE (subquery-439)
          MATERIALIZE il1
            MATERIALIZE s1
              MATERIALIZE a1
                MATERIALIZE w
                  SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
                  SCALAR SUBQUERY 2
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 248
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 249
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 250
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                  SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                  SCALAR SUBQUERY 5
                    CO-ROUTINE __rule
                      SCAN CONSTANT ROW
                    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                    CORRELATED SCALAR SUBQUERY 262
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 263
                      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                    CORRELATED SCALAR SUBQUERY 264
                      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                    SCAN __rule
                    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                SCAN w
                USE TEMP B-TREE FOR GROUP BY
              MATERIALIZE rs1
                MATERIALIZE a2
                  SCAN w
                  USE TEMP B-TREE FOR GROUP BY
                SCAN a
                SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCALAR SUBQUERY 5
                  CO-ROUTINE __rule
                    SCAN CONSTANT ROW
                  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                  CORRELATED SCALAR SUBQUERY 304
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 305
                    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                  CORRELATED SCALAR SUBQUERY 306
                    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                  SCAN __rule
                  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
                USE TEMP B-TREE FOR GROUP BY
              SCAN a
              BLOOM FILTER ON rs1 (k0=? AND ck0=?)
              SEARCH rs1 USING AUTOMATIC PARTIAL COVERING INDEX (k0=? AND ck0=?) LEFT-JOIN
              SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
              SCALAR SUBQUERY 5
                CO-ROUTINE __rule
                  SCAN CONSTANT ROW
                SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
                CORRELATED SCALAR SUBQUERY 318
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 319
                  SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
                CORRELATED SCALAR SUBQUERY 320
                  SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
                SCAN __rule
                SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCAN a
          SCAN a
          CORRELATED SCALAR SUBQUERY 17
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 332
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 333
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 334
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-439)
      SCAN o
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
    UNION ALL
      MATERIALIZE o2
        CO-ROUTINE (subquery-440)
          MATERIALIZE s2
            SCAN a
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 66
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 67
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 68
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN a
          CORRELATED SCALAR SUBQUERY 25
            SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 80
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 81
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 82
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          USE TEMP B-TREE FOR ORDER BY
        SCAN (subquery-440)
      SCAN o
      BLOOM FILTER ON o (ck0=? AND k1=? AND k0=?)
      SEARCH o USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k1=? AND k0=?)
      BLOOM FILTER ON o1 (ck0=? AND k0=?)
      SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
SCAN (subquery-31)
USE TEMP B-TREE FOR ORDER BY
```

## Run 7 CSV export, statement 39

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h9, [[t1.item_seq]] AS h10, NULLIF([[t1.item_kind]], '') AS h11, [[t1.item_number]] AS h12
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
WHERE (([[t1.settled]] > '2026-11-18') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, NULL AS v8, NULL AS v9, NULL AS v10, NULL AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, min(w.h9) AS y1, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y2, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y3, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, min(w.h10) AS y7, count(*) AS __n FROM w GROUP BY k0, ck0),
rs1 AS (SELECT k0, ck0, COALESCE(sum(__shown), 0) AS ch___shown FROM rt2 GROUP BY k0, ck0),
g1 AS (SELECT a.*, COALESCE(rs1.ch___shown, 0) AS ch___shown FROM a1 a LEFT JOIN rs1 ON 1 AND rs1.k0 IS a.k0 AND rs1.ck0 IS a.ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM g1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE (1 AND a.ch___shown > 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, NULL AS k1, a.ck0 AS ck0, NULL AS v0, NULL AS v1, (CASE WHEN (a.y2 IS 0) THEN NULL ELSE a.y2 END) AS v2, (CASE WHEN (a.y3 IS 0) THEN NULL ELSE a.y3 END) AS v3, (CASE WHEN (a.y4 IS 0) THEN NULL ELSE a.y4 END) AS v4, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v5, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v6, a.y0 AS v7, a.k0 AS v8, NULL AS v9, NULL AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, a.ch___shown AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t4.display_name]], ''), '(no name)')
FROM r1 t4
WHERE [[t4.id]] IS a.k0) AS wh0 FROM il1 a) a),
a2 AS (SELECT k0, k1, ck0, min(w.h11) AS y0, min(w.h12) AS y1, min(w.h9) AS y2, min(w.h10) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y5, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y6, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y7, COALESCE(sum(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y8, COALESCE(sum(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h9, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0)), 0) AS y9, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t5.id]], '') AS rc0, [[t5.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t5 ON [[t5.id]] IS a.k0) a),
rt2 AS (SELECT a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, 1 AS __shown FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
o2 AS MATERIALIZED (SELECT 2 AS __level, NULL AS __row, a.k0 AS k0, a.k1 AS k1, a.ck0 AS ck0, NULL AS v0, a.y2 AS v1, (CASE WHEN (a.y5 IS 0) THEN NULL ELSE a.y5 END) AS v2, (CASE WHEN (a.y6 IS 0) THEN NULL ELSE a.y6 END) AS v3, (CASE WHEN (a.y7 IS 0) THEN NULL ELSE a.y7 END) AS v4, (CASE WHEN (a.y8 IS 0) THEN NULL ELSE a.y8 END) AS v5, (CASE WHEN (a.y9 IS 0) THEN NULL ELSE a.y9 END) AS v6, a.y4 AS v7, a.k0 AS v8, a.k1 AS v9, a.y3 AS v10, a.wh0 AS vl8, ROW_NUMBER() OVER (PARTITION BY a.ck0, a.k0 ORDER BY (a.y2 IS NULL), a.y2, (a.y3 IS NULL), a.y3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) DESC, (lower(a.rc1) IS NULL), lower(a.rc1), (a.k1 IS NULL), a.k1) AS __ord, 1 AS __own, (COALESCE((CASE WHEN (a.y0 IS 'bill') THEN 'Bill' WHEN (a.y0 IS 'vendor_credit') THEN 'Vendor credit' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(a.y1, '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted, (a.y2 IS NULL) AS __s2_0, a.y2 AS __s2_1, (a.y3 IS NULL) AS __s2_2, a.y3 AS __s2_3, ((CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) IS NULL) AS __s2_4, (CASE WHEN (a.rc0 IS NULL OR a.rc0 = '') THEN 1 ELSE 0 END) AS __s2_5, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) IS NULL) AS __s2_6, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y4 ELSE 0 END), 0) AS __s2_7, (lower(a.rc1) IS NULL) AS __s2_8, lower(a.rc1) AS __s2_9, (a.k1 IS NULL) AS __s2_10, a.k1 AS __s2_11 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t6.display_name]], ''), '(no name)')
FROM r1 t6
WHERE [[t6.id]] IS a.k0) AS wh0 FROM s2 a) a)
SELECT * FROM o0
```

no statistics:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-57)
    CO-ROUTINE a0
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 34
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 35
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 36
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 48
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 49
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 50
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-57)
SCAN o0
```

after ANALYZE:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-57)
    CO-ROUTINE a0
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 34
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 35
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 36
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 48
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 49
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 50
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-57)
SCAN o0
```

## Run 7 CSV export, statement 40

```sql
WITH r0 AS (SELECT `books_payable_items`.* FROM `books_payable_items` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_journal_entries`.* FROM `books_journal_entries` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='erm9hfihaqj47y3' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('erm9hfihaqj47y3' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'erm9hfihaqj47y3' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c8, [[t1.item]] AS c9, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.item]] AS k1, [[t1.credit]] AS h7, [[t1.debit]] AS h8, NULLIF([[t1.item_kind]], '') AS h9, [[t1.item_number]] AS h10, NULLIF(substr([[t1.due_date]], 1, 10), '') AS h11, [[t1.item_seq]] AS h12, NULLIF(substr([[t1.date]], 1, 10), '') AS h13, NULLIF([[t5.posted_at]], '') AS h14, NULLIF([[t5.doc_type]], '') AS h15, NULLIF([[t5.origin]], '') AS h16, [[t9.number]] AS h17, [[t5.number]] AS h18, [[t5.document]] AS h19, NULLIF([[t5.id]], '') AS h20
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t5 ON [[t5.id]] = [[t1.entry]]
LEFT JOIN r2 t9 ON [[t9.id]] = [[t5.reverses]]
WHERE (([[t1.settled]] > '2026-11-18') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t3.display_name]] AS rc0, [[t3.inactive]] AS rc1, NULLIF([[t3.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t3 ON [[t3.id]] IS a.k0) a),
a2 AS (SELECT k0, k1, ck0, min(w.h9) AS y0, min(w.h10) AS y1, min(w.h11) AS y2, min(w.h12) AS y3, COALESCE(sum((COALESCE(w.h7, 0) - COALESCE(w.h8, 0))), 0) AS y4, count(*) AS __n FROM w GROUP BY k0, k1, ck0),
gr2 AS (SELECT * FROM (SELECT a.*, NULLIF([[t4.id]], '') AS rc0, [[t4.display_name]] AS rc1 FROM a2 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s2 AS MATERIALIZED (SELECT a.* FROM gr2 a WHERE COALESCE((a.y4 IS NOT 0), 0)),
ws AS (SELECT w.* FROM w WHERE EXISTS (SELECT 1 FROM s2 p WHERE p.k0 IS w.k0 AND p.k1 IS w.k1 AND p.ck0 IS w.ck0)),
gord AS MATERIALIZED (SELECT key AS __g, json_extract(value, '$[0]') AS g0, json_extract(value, '$[1]') AS g1, json_extract(value, '$[2]') AS g2 FROM json_each('[["jr7u2lily7sl2fx","arb000000000385","USD"],["jr7u2lily7sl2fx","arb000000000027","USD"],["jr7u2lily7sl2fx","arb000000000323","USD"],["jr7u2lily7sl2fx","arb000000000205","USD"],["jr7u2lily7sl2fx","arb000000000215","USD"],["jr7u2lily7sl2fx","arb000000000621","USD"],["jr7u2lily7sl2fx","arb000000000397","USD"],["jr7u2lily7sl2fx","arb000000000437","USD"],["jr7u2lily7sl2fx","arb000000000063","USD"],["jr7u2lily7sl2fx","arb000000000455","USD"],["jr7u2lily7sl2fx","arb000000000559","USD"],["jr7u2lily7sl2fx","arb000000000537","USD"],["jr7u2lily7sl2fx","arb000000000011","USD"],["jr7u2lily7sl2fx","arb000000000603","USD"],["jr7u2lily7sl2fx","arb000000000589","USD"],["jr7u2lily7sl2fx","arb000000000041","USD"],["jr7u2lily7sl2fx","arb000000000023","USD"],["jr7u2lily7sl2fx","arb000000000489","USD"],["jr7u2lily7sl2fx","arb000000000415","USD"],["jr7u2lily7sl2fx","arb000000000163","USD"],["jr7u2lily7sl2fx","arb000000000177","USD"],["jr7u2lily7sl2fx","arb000000000309","USD"],["jr7u2lily7sl2fx","arb000000000089","USD"],["jr7u2lily7sl2fx","arb000000000341","USD"],["jr7u2lily7sl2fx","arb000000000517","USD"],["jr7u2lily7sl2fx","arb000000000503","USD"],["jr7u2lily7sl2fx","arb000000000223","USD"],["jr7u2lily7sl2fx","arb000000000073","USD"],["jr7u2lily7sl2fx","arb000000000523","USD"],["jr7u2lily7sl2fx","arb000000000553","USD"],["jr7u2lily7sl2fx","arb000000000377","USD"],["jr7u2lily7sl2fx","arb000000000519","USD"],["jr7u2lily7sl2fx","arb000000000103","USD"],["jr7u2lily7sl2fx","arb000000000443","USD"],["jr7u2lily7sl2fx","arb000000000139","USD"],["jr7u2lily7sl2fx","arb000000000609","USD"],["jr7u2lily7sl2fx","arb000000000275","USD"],["jr7u2lily7sl2fx","arb000000000447","USD"],["jr7u2lily7sl2fx","arb000000000405","USD"],["jr7u2lily7sl2fx","arb000000000449","USD"],["jr7u2lily7sl2fx","arb000000000425","USD"],["jr7u2lily7sl2fx","arb000000000219","USD"],["jr7u2lily7sl2fx","arb000000000331","USD"],["jr7u2lily7sl2fx","arb000000000525","USD"],["jr7u2lily7sl2fx","arb000000000487","USD"],["jr7u2lily7sl2fx","arb000000000605","USD"],["jr7u2lily7sl2fx","arb000000000221","USD"],["jr7u2lily7sl2fx","arb000000000441","USD"],["jr7u2lily7sl2fx","arb000000000585","USD"],["jr7u2lily7sl2fx","arb000000000255","USD"],["jr7u2lily7sl2fx","arb000000000247","USD"],["jr7u2lily7sl2fx","arb000000000391","USD"],["jr7u2lily7sl2fx","arb000000000557","USD"],["jr7u2lily7sl2fx","arb000000000025","USD"],["jr7u2lily7sl2fx","arb000000000035","USD"],["jr7u2lily7sl2fx","arb000000000409","USD"],["jr7u2lily7sl2fx","arb000000000299","USD"],["jr7u2lily7sl2fx","arb000000000419","USD"],["jr7u2lily7sl2fx","arb000000000315","USD"],["jr7u2lily7sl2fx","arb000000000471","USD"],["jr7u2lily7sl2fx","arb000000000001","USD"],["jr7u2lily7sl2fx","arb000000000269","USD"],["jr7u2lily7sl2fx","arb000000000531","USD"],["jr7u2lily7sl2fx","arb000000000597","USD"],["jr7u2lily7sl2fx","arb000000000623","USD"],["jr7u2lily7sl2fx","arb000000000631","USD"],["jr7u2lily7sl2fx","arb000000000171","USD"],["jr7u2lily7sl2fx","arb000000000495","USD"],["jr7u2lily7sl2fx","arb000000000627","USD"],["jr7u2lily7sl2fx","arb000000000361","USD"],["jr7u2lily7sl2fx","arb000000000563","USD"],["jr7u2lily7sl2fx","arb000000000395","USD"],["jr7u2lily7sl2fx","arb000000000387","USD"],["jr7u2lily7sl2fx","arb000000000167","USD"],["jr7u2lily7sl2fx","arb000000000457","USD"],["jr7u2lily7sl2fx","arb000000000641","USD"],["jr7u2lily7sl2fx","arb000000000137","USD"],["jr7u2lily7sl2fx","arb000000000479","USD"],["jr7u2lily7sl2fx","arb000000000111","USD"],["jr7u2lily7sl2fx","arb000000000241","USD"],["jr7u2lily7sl2fx","arb000000000085","USD"],["jr7u2lily7sl2fx","arb000000000581","USD"],["jr7u2lily7sl2fx","arb000000000189","USD"],["jr7u2lily7sl2fx","arb000000000165","USD"],["jr7u2lily7sl2fx","arb000000000245","USD"],["jr7u2lily7sl2fx","arb000000000527","USD"],["jr7u2lily7sl2fx","arb000000000347","USD"],["jr7u2lily7sl2fx","arb000000000069","USD"],["jr7u2lily7sl2fx","arb000000000297","USD"],["jr7u2lily7sl2fx","arb000000000101","USD"],["jr7u2lily7sl2fx","arb000000000569","USD"],["jr7u2lily7sl2fx","arb000000000127","USD"],["jr7u2lily7sl2fx","arb000000000545","USD"],["jr7u2lily7sl2fx","arb000000000061","USD"],["jr7u2lily7sl2fx","arb000000000141","USD"],["jr7u2lily7sl2fx","arb000000000337","USD"],["jr7u2lily7sl2fx","arb000000000529","USD"],["jr7u2lily7sl2fx","arb000000000179","USD"],["jr7u2lily7sl2fx","arb000000000351","USD"],["jr7u2lily7sl2fx","arb000000000613","USD"],["jr7u2lily7sl2fx","arb000000000317","USD"],["jr7u2lily7sl2fx","arb000000000033","USD"],["jr7u2lily7sl2fx","arb000000000107","USD"],["jr7u2lily7sl2fx","arb000000000099","USD"],["jr7u2lily7sl2fx","arb000000000125","USD"],["jr7u2lily7sl2fx","arb000000000619","USD"],["jr7u2lily7sl2fx","arb000000000509","USD"],["jr7u2lily7sl2fx","arb000000000037","USD"],["jr7u2lily7sl2fx","arb000000000097","USD"],["jr7u2lily7sl2fx","arb000000000463","USD"],["jr7u2lily7sl2fx","arb000000000599","USD"],["jr7u2lily7sl2fx","arb000000000109","USD"],["jr7u2lily7sl2fx","arb000000000459","USD"],["jr7u2lily7sl2fx","arb000000000551","USD"],["jr7u2lily7sl2fx","arb000000000373","USD"],["jr7u2lily7sl2fx","arb000000000013","USD"],["jr7u2lily7sl2fx","arb000000000017","USD"],["jr7u2lily7sl2fx","arb000000000105","USD"],["jr7u2lily7sl2fx","arb000000000197","USD"],["jr7u2lily7sl2fx","arb000000000043","USD"],["jr7u2lily7sl2fx","arb000000000131","USD"],["jr7u2lily7sl2fx","arb000000000483","USD"],["jr7u2lily7sl2fx","arb000000000369","USD"],["jr7u2lily7sl2fx","arb000000000263","USD"],["jr7u2lily7sl2fx","arb000000000067","USD"],["jr7u2lily7sl2fx","arb000000000615","USD"],["jr7u2lily7sl2fx","arb000000000493","USD"],["jr7u2lily7sl2fx","arb000000000461","USD"],["jr7u2lily7sl2fx","arb000000000083","USD"],["jr7u2lily7sl2fx","arb000000000539","USD"],["jr7u2lily7sl2fx","arb000000000287","USD"],["jr7u2lily7sl2fx","arb000000000277","USD"],["jr7u2lily7sl2fx","arb000000000403","USD"],["jr7u2lily7sl2fx","arb000000000307","USD"],["jr7u2lily7sl2fx","arb000000000617","USD"],["jr7u2lily7sl2fx","arb000000000049","USD"],["jr7u2lily7sl2fx","arb000000000149","USD"],["jr7u2lily7sl2fx","arb000000000541","USD"],["jr7u2lily7sl2fx","arb000000000451","USD"],["jr7u2lily7sl2fx","arb000000000421","USD"],["jr7u2lily7sl2fx","arb000000000133","USD"],["jr7u2lily7sl2fx","arb000000000249","USD"],["jr7u2lily7sl2fx","arb000000000129","USD"],["jr7u2lily7sl2fx","arb000000000535","USD"],["jr7u2lily7sl2fx","arb000000000417","USD"],["jr7u2lily7sl2fx","arb000000000431","USD"],["jr7u2lily7sl2fx","arb000000000115","USD"],["jr7u2lily7sl2fx","arb000000000629","USD"],["jr7u2lily7sl2fx","arb000000000561","USD"],["jr7u2lily7sl2fx","arb000000000475","USD"],["jr7u2lily7sl2fx","arb000000000587","USD"],["jr7u2lily7sl2fx","arb000000000481","USD"],["jr7u2lily7sl2fx","arb000000000055","USD"],["jr7u2lily7sl2fx","arb000000000261","USD"],["jr7u2lily7sl2fx","arb000000000333","USD"],["jr7u2lily7sl2fx","arb000000000159","USD"],["jr7u2lily7sl2fx","arb000000000191","USD"],["jr7u2lily7sl2fx","arb000000000095","USD"],["jr7u2lily7sl2fx","arb000000000157","USD"],["jr7u2lily7sl2fx","arb000000000399","USD"],["jr7u2lily7sl2fx","arb000000000549","USD"],["jr7u2lily7sl2fx","arb000000000183","USD"],["jr7u2lily7sl2fx","arb000000000293","USD"],["jr7u2lily7sl2fx","arb000000000283","USD"],["jr7u2lily7sl2fx","arb000000000279","USD"],["jr7u2lily7sl2fx","arb000000000029","USD"],["jr7u2lily7sl2fx","arb000000000319","USD"],["jr7u2lily7sl2fx","arb000000000203","USD"],["jr7u2lily7sl2fx","arb000000000513","USD"],["jr7u2lily7sl2fx","arb000000000057","USD"],["jr7u2lily7sl2fx","arb000000000579","USD"],["jr7u2lily7sl2fx","arb000000000135","USD"],["jr7u2lily7sl2fx","arb000000000343","USD"],["jr7u2lily7sl2fx","arb000000000515","USD"],["jr7u2lily7sl2fx","arb000000000259","USD"],["jr7u2lily7sl2fx","arb000000000473","USD"],["jr7u2lily7sl2fx","arb000000000555","USD"],["jr7u2lily7sl2fx","arb000000000499","USD"],["jr7u2lily7sl2fx","arb000000000071","USD"],["jr7u2lily7sl2fx","arb000000000213","USD"],["jr7u2lily7sl2fx","arb000000000121","USD"],["jr7u2lily7sl2fx","arb000000000207","USD"],["jr7u2lily7sl2fx","arb000000000117","USD"],["jr7u2lily7sl2fx","arb000000000637","USD"],["jr7u2lily7sl2fx","arb000000000209","USD"],["jr7u2lily7sl2fx","arb000000000583","USD"],["jr7u2lily7sl2fx","arb000000000485","USD"],["jr7u2lily7sl2fx","arb000000000007","USD"],["jr7u2lily7sl2fx","arb000000000161","USD"],["jr7u2lily7sl2fx","arb000000000285","USD"],["jr7u2lily7sl2fx","arb000000000389","USD"],["jr7u2lily7sl2fx","arb000000000647","USD"],["jr7u2lily7sl2fx","arb000000000173","USD"],["jr7u2lily7sl2fx","arb000000000303","USD"],["jr7u2lily7sl2fx","arb000000000601","USD"],["jr7u2lily7sl2fx","arb000000000225","USD"],["jr7u2lily7sl2fx","arb000000000453","USD"],["jr7u2lily7sl2fx","arb000000000305","USD"],["jr7u2lily7sl2fx","arb000000000239","USD"],["jr7u2lily7sl2fx","arb000000000301","USD"],["jr7u2lily7sl2fx","arb000000000091","USD"],["jr7u2lily7sl2fx","arb000000000591","USD"],["jr7u2lily7sl2fx","arb000000000491","USD"],["jr7u2lily7sl2fx","arb000000000465","USD"],["jr7u2lily7sl2fx","arb000000000625","USD"],["jr7u2lily7sl2fx","arb000000000229","USD"],["jr7u2lily7sl2fx","arb000000000639","USD"],["jr7u2lily7sl2fx","arb000000000273","USD"],["jr7u2lily7sl2fx","arb000000000407","USD"],["jr7u2lily7sl2fx","arl000000886633","USD"],["jr7u2lily7sl2fx","arb000000000145","USD"],["jr7u2lily7sl2fx","arb000000000005","USD"],["jr7u2lily7sl2fx","arb000000000271","USD"],["jr7u2lily7sl2fx","arb000000000365","USD"],["jr7u2lily7sl2fx","arb000000000433","USD"],["jr7u2lily7sl2fx","arb000000000053","USD"],["jr7u2lily7sl2fx","arb000000000339","USD"],["jr7u2lily7sl2fx","arb000000000243","USD"],["jr7u2lily7sl2fx","arb000000000155","USD"],["jr7u2lily7sl2fx","arb000000000501","USD"],["jr7u2lily7sl2fx","arb000000000633","USD"],["jr7u2lily7sl2fx","arb000000000193","USD"],["jr7u2lily7sl2fx","arb000000000439","USD"],["jr7u2lily7sl2fx","arb000000000321","USD"],["jr7u2lily7sl2fx","arb000000000375","USD"],["jr7u2lily7sl2fx","arb000000000075","USD"],["jr7u2lily7sl2fx","arb000000000547","USD"],["jr7u2lily7sl2fx","arb000000000381","USD"],["jr7u2lily7sl2fx","arb000000000469","USD"],["jr7u2lily7sl2fx","arb000000000253","USD"],["jr7u2lily7sl2fx","arb000000000169","USD"],["jr7u2lily7sl2fx","arb000000000187","USD"],["jr7u2lily7sl2fx","arb000000000357","USD"],["jr7u2lily7sl2fx","arb000000000123","USD"],["jr7u2lily7sl2fx","arb000000000143","USD"],["jr7u2lily7sl2fx","arb000000000507","USD"],["jr7u2lily7sl2fx","arb000000000467","USD"],["jr7u2lily7sl2fx","arb000000005603","USD"],["jr7u2lily7sl2fx","arb000000000533","USD"],["jr7u2lily7sl2fx","arb000000000643","USD"],["jr7u2lily7sl2fx","arb000000000295","USD"],["jr7u2lily7sl2fx","arb000000000093","USD"],["jr7u2lily7sl2fx","arb000000000235","USD"],["jr7u2lily7sl2fx","arb000000000379","USD"],["jr7u2lily7sl2fx","arb000000000423","USD"],["jr7u2lily7sl2fx","arb000000000051","USD"],["jr7u2lily7sl2fx","arb000000000345","USD"],["jr7u2lily7sl2fx","arb000000000267","USD"],["jr7u2lily7sl2fx","arb000000000353","USD"],["jr7u2lily7sl2fx","arb000000000059","USD"],["jr7u2lily7sl2fx","arb000000000371","USD"],["jr7u2lily7sl2fx","arb000000000175","USD"],["jr7u2lily7sl2fx","arb000000000565","USD"],["jr7u2lily7sl2fx","arb000000000153","USD"],["jr7u2lily7sl2fx","arb000000000147","USD"],["jr7u2lily7sl2fx","arb000000000227","USD"],["jr7u2lily7sl2fx","arb000000000195","USD"],["jr7u2lily7sl2fx","arb000000000367","USD"],["jr7u2lily7sl2fx","arb000000000573","USD"],["jr7u2lily7sl2fx","arb000000000045","USD"],["jr7u2lily7sl2fx","arb000000000003","USD"],["jr7u2lily7sl2fx","arb000000000595","USD"],["jr7u2lily7sl2fx","arb000000000021","USD"],["jr7u2lily7sl2fx","arb000000000359","USD"],["jr7u2lily7sl2fx","arb000000000393","USD"],["jr7u2lily7sl2fx","arb000000000237","USD"],["jr7u2lily7sl2fx","arb000000000181","USD"],["jr7u2lily7sl2fx","arb000000000325","USD"],["jr7u2lily7sl2fx","arb000000000289","USD"],["jr7u2lily7sl2fx","arb000000000313","USD"],["jr7u2lily7sl2fx","arb000000000087","USD"],["jr7u2lily7sl2fx","arb000000000185","USD"],["jr7u2lily7sl2fx","arb000000000211","USD"],["jr7u2lily7sl2fx","arb000000000611","USD"],["jr7u2lily7sl2fx","arb000000000039","USD"],["jr7u2lily7sl2fx","arb000000000511","USD"],["jr7u2lily7sl2fx","arb000000000217","USD"],["jr7u2lily7sl2fx","arb000000000413","USD"],["jr7u2lily7sl2fx","arb000000000265","USD"],["jr7u2lily7sl2fx","arb000000000281","USD"],["jr7u2lily7sl2fx","arb000000000311","USD"],["jr7u2lily7sl2fx","arb000000000411","USD"],["jr7u2lily7sl2fx","arb000000000201","USD"],["jr7u2lily7sl2fx","arb000000000009","USD"],["jr7u2lily7sl2fx","arb000000000505","USD"],["jr7u2lily7sl2fx","arb000000000401","USD"],["jr7u2lily7sl2fx","arb000000000363","USD"],["jr7u2lily7sl2fx","arb000000000015","USD"],["jr7u2lily7sl2fx","arb000000000635","USD"],["jr7u2lily7sl2fx","arb000000000445","USD"],["jr7u2lily7sl2fx","arb000000000251","USD"],["jr7u2lily7sl2fx","arb000000000435","USD"],["jr7u2lily7sl2fx","arb000000000231","USD"],["jr7u2lily7sl2fx","arb000000000649","USD"],["jr7u2lily7sl2fx","arb000000000329","USD"],["jr7u2lily7sl2fx","arb000000000427","USD"],["jr7u2lily7sl2fx","arb000000000257","USD"],["jr7u2lily7sl2fx","arb000000000543","USD"],["jr7u2lily7sl2fx","arb000000000113","USD"],["jr7u2lily7sl2fx","arb000000000151","USD"],["jr7u2lily7sl2fx","arb000000000119","USD"],["jr7u2lily7sl2fx","arb000000000019","USD"],["jr7u2lily7sl2fx","arb000000000607","USD"],["jr7u2lily7sl2fx","arb000000000079","USD"],["jr7u2lily7sl2fx","arb000000000077","USD"],["jr7u2lily7sl2fx","arb000000000571","USD"],["jr7u2lily7sl2fx","arb000000000429","USD"],["jr7u2lily7sl2fx","arb000000000567","USD"],["jr7u2lily7sl2fx","arb000000000065","USD"],["jr7u2lily7sl2fx","arb000000000327","USD"],["jr7u2lily7sl2fx","arb000000000477","USD"],["jr7u2lily7sl2fx","arb000000000577","USD"],["jr7u2lily7sl2fx","arb000000000335","USD"],["jr7u2lily7sl2fx","arb000000000291","USD"],["jr7u2lily7sl2fx","arb000000000199","USD"],["jr7u2lily7sl2fx","arb000000000521","USD"],["jr7u2lily7sl2fx","arb000000000383","USD"],["jr7u2lily7sl2fx","arb000000000645","USD"],["jr7u2lily7sl2fx","arb000000000081","USD"],["jr7u2lily7sl2fx","arb000000000497","USD"],["jr7u2lily7sl2fx","arb000000000047","USD"],["jr7u2lily7sl2fx","arb000000000031","USD"],["jr7u2lily7sl2fx","arb000000000233","USD"],["jr7u2lily7sl2fx","arb000000000355","USD"],["jr7u2lily7sl2fx","arb000000000593","USD"],["jr7u2lily7sl2fx","arb000000000575","USD"],["jr7u2lily7sl2fx","arb000000000349","USD"],["jr7u2lily7sl2fx","arb000000001827","USD"],["8m2kyoqn1esmpd7","arb000000010829","USD"],["8m2kyoqn1esmpd7","arb000000005571","USD"],["8m2kyoqn1esmpd7","arb000000004615","USD"],["cjtyphxau3wpakw","arb000000001965","USD"],["o4oqxpjw6qbgnxo","arb000000004831","USD"],["o4oqxpjw6qbgnxo","arb000000001053","USD"],["o4oqxpjw6qbgnxo","arb000000004121","USD"],["o4oqxpjw6qbgnxo","arb000000004175","USD"],["o4oqxpjw6qbgnxo","arb000000002257","USD"],["o4oqxpjw6qbgnxo","arb000000011927","USD"],["tnwbz88dgbxpo4m","arb000000006387","USD"],["tnwbz88dgbxpo4m","arb000000002765","USD"],["tnwbz88dgbxpo4m","arb000000004861","USD"],["e8c1zuvwqhyuvtx","arl000000887165","USD"],["dhm3odjgv6nfsfq","arc000000357766","USD"],["dhm3odjgv6nfsfq","arb000000002411","USD"],["dhm3odjgv6nfsfq","arb000000011145","USD"],["dhm3odjgv6nfsfq","arb000000005787","USD"],["dhm3odjgv6nfsfq","arb000000003511","USD"],["dhm3odjgv6nfsfq","arb000000004067","USD"],["dhm3odjgv6nfsfq","arb000000009411","USD"],["dhm3odjgv6nfsfq","arl000000887261","USD"],["dhm3odjgv6nfsfq","arb000000003285","USD"],["dhm3odjgv6nfsfq","arc000000357427","USD"],["chg72niw877x8p8","arb000000011739","USD"],["chg72niw877x8p8","arb000000002173","USD"],["chg72niw877x8p8","arl000000886835","USD"],["chg72niw877x8p8","arb000000004673","USD"],["chg72niw877x8p8","arb000000012403","USD"],["x6cu9p65hzyj28j","arb000000008205","USD"],["x6cu9p65hzyj28j","arb000000010315","USD"],["x6cu9p65hzyj28j","arl000000887337","USD"],["vs3fgrx8u90vpzy","arb000000001623","USD"],["vs3fgrx8u90vpzy","arl000000886955","USD"],["vs3fgrx8u90vpzy","arb000000008571","USD"],["vs3fgrx8u90vpzy","arb000000007621","USD"],["vs3fgrx8u90vpzy","arb000000004509","USD"],["vs3fgrx8u90vpzy","arb000000010275","USD"],["vs3fgrx8u90vpzy","arb000000002589","USD"],["ai5cgr3ovgkh3h5","arb000000004545","USD"],["ai5cgr3ovgkh3h5","arc000000357352","USD"],["ai5cgr3ovgkh3h5","arb000000011061","USD"],["ai5cgr3ovgkh3h5","arb000000003235","USD"],["ai5cgr3ovgkh3h5","arb000000003203","USD"],["ai5cgr3ovgkh3h5","arb000000008799","USD"],["ai5cgr3ovgkh3h5","arl000000885755","USD"],["ai5cgr3ovgkh3h5","arb000000006315","USD"],["ai5cgr3ovgkh3h5","arb000000007969","USD"],["ai5cgr3ovgkh3h5","arc000000357304","USD"],["9eek0ar9n6wy41w","arl000000887013","USD"],["9eek0ar9n6wy41w","arb000000005595","USD"],["9eek0ar9n6wy41w","arb000000006467","USD"],["vceo91w9niae0s9","arc000000357163","USD"],["vceo91w9niae0s9","arb000000002909","USD"],["vceo91w9niae0s9","arb000000011965","USD"],["vceo91w9niae0s9","arb000000003109","USD"],["vceo91w9niae0s9","arl000000885749","USD"],["vceo91w9niae0s9","arb000000012555","USD"],["vceo91w9niae0s9","arb000000006451","USD"],["ps0fczahyxgf8j6","arb000000008581","USD"],["ps0fczahyxgf8j6","arb000000012815","USD"],["ps0fczahyxgf8j6","arb000000008829","USD"],["ldjm3a47ugc25yp","arb000000002827","USD"],["ldjm3a47ugc25yp","arb000000009843","USD"],["ldjm3a47ugc25yp","arb000000006649","USD"],["ldjm3a47ugc25yp","arb000000002473","USD"],["ldjm3a47ugc25yp","arb000000003915","USD"],["ldjm3a47ugc25yp","arb000000005807","USD"],["ldjm3a47ugc25yp","arc000000358372","USD"],["l9jr1zmb5hj7m9w","arb000000002655","USD"],["phxc9vfz5ufzd9k","arb000000007539","USD"],["phxc9vfz5ufzd9k","arb000000000871","USD"],["phxc9vfz5ufzd9k","arb000000009537","USD"],["phxc9vfz5ufzd9k","arb000000003959","USD"],["phxc9vfz5ufzd9k","arc000000358438","USD"],["2frrlcupfek9cx3","arb000000005511","USD"],["2frrlcupfek9cx3","arb000000009995","USD"],["08vux8cgqpn9pu2","arb000000006207","USD"],["yiew54wcerqkwa5","arb000000005285","USD"],["yiew54wcerqkwa5","arb000000002085","USD"],["yiew54wcerqkwa5","arb000000003585","USD"],["yiew54wcerqkwa5","arb000000004515","USD"],["yiew54wcerqkwa5","arl000000887403","USD"],["yiew54wcerqkwa5","arc000000357877","USD"],["t2d3r0ma3sclqho","arb000000011993","USD"],["t2d3r0ma3sclqho","arb000000004215","USD"],["t2d3r0ma3sclqho","arb000000001149","USD"],["mwh9qw6ed74jp1t","arl000000885961","USD"],["mwh9qw6ed74jp1t","arb000000005339","USD"],["mwh9qw6ed74jp1t","arb000000002035","USD"],["lt2o6dnwq83e20n","arb000000005001","USD"],["lt2o6dnwq83e20n","arb000000011485","USD"],["lt2o6dnwq83e20n","arb000000006957","USD"],["rmr1ck8zj38fqm3","arb000000005387","USD"],["rmr1ck8zj38fqm3","arb000000006267","USD"],["rmr1ck8zj38fqm3","arl000000885711","USD"],["rmr1ck8zj38fqm3","arb000000010515","USD"],["x55w30yw3zdwub6","arl000000885869","USD"],["x55w30yw3zdwub6","arb000000008189","USD"],["x55w30yw3zdwub6","arb000000005617","USD"],["x55w30yw3zdwub6","arb000000010433","USD"],["x55w30yw3zdwub6","arb000000001081","USD"],["x55w30yw3zdwub6","arl000000886487","USD"],["x55w30yw3zdwub6","arb000000002545","USD"],["75tfhntcho4yusa","arb000000005379","USD"],["75tfhntcho4yusa","arb000000008609","USD"],["75tfhntcho4yusa","arb000000001229","USD"],["75tfhntcho4yusa","arc000000358495","USD"],["75tfhntcho4yusa","arl000000886813","USD"],["75tfhntcho4yusa","arb000000005007","USD"],["75tfhntcho4yusa","arb000000008751","USD"],["75tfhntcho4yusa","arb000000003997","USD"],["kdi1eu4hlmqncup","arb000000011369","USD"],["kdi1eu4hlmqncup","arb000000003107","USD"],["kdi1eu4hlmqncup","arc000000357160","USD"],["kdi1eu4hlmqncup","arb000000006121","USD"],["kdi1eu4hlmqncup","arl000000886375","USD"],["kdi1eu4hlmqncup","arb000000007399","USD"],["or43rht4akmjbwi","arb000000007577","USD"],["or43rht4akmjbwi","arb000000002917","USD"],["l41l7d1n692w3a3","arb000000007693","USD"],["l41l7d1n692w3a3","arb000000008547","USD"],["l41l7d1n692w3a3","arb000000007023","USD"],["l41l7d1n692w3a3","arb000000012477","USD"],["sl6g33m1ky5ggiz","arb000000012967","USD"],["sl6g33m1ky5ggiz","arl000000885505","USD"],["sl6g33m1ky5ggiz","arb000000011393","USD"],["7mf4lwftdwdcwat","arb000000004239","USD"],["7mf4lwftdwdcwat","arb000000002535","USD"],["7mf4lwftdwdcwat","arb000000008131","USD"],["5l6nr50syw3syxr","arb000000011551","USD"],["5l6nr50syw3syxr","arb000000012369","USD"],["5l6nr50syw3syxr","arl000000886817","USD"],["5l6nr50syw3syxr","arb000000005393","USD"],["5l6nr50syw3syxr","arb000000004905","USD"],["blqmo9fnaxfg1y6","arc000000357082","USD"],["blqmo9fnaxfg1y6","arb000000011099","USD"],["blqmo9fnaxfg1y6","arl000000887155","USD"],["blqmo9fnaxfg1y6","arb000000003055","USD"],["uhof6pqbeh1gx1n","arb000000010997","USD"],["uhof6pqbeh1gx1n","arb000000003841","USD"],["uhof6pqbeh1gx1n","arc000000358261","USD"],["uhof6pqbeh1gx1n","arb000000001497","USD"],["uhof6pqbeh1gx1n","arl000000887321","USD"],["uhof6pqbeh1gx1n","arb000000009337","USD"],["jbihgc33tqiihxv","arb000000012839","USD"],["jbihgc33tqiihxv","arb000000006671","USD"],["jbihgc33tqiihxv","arb000000011355","USD"],["jbihgc33tqiihxv","arb000000007683","USD"],["jbihgc33tqiihxv","arb000000010569","USD"],["zmsy07cdknfks8i","arb000000012473","USD"],["zmsy07cdknfks8i","arb000000000883","USD"],["zmsy07cdknfks8i","arb000000009297","USD"],["9i2ixmdigqz7yd4","arb000000007095","USD"],["9i2ixmdigqz7yd4","arl000000886433","USD"],["q186ozhcf1pc7qy","arb000000009937","USD"],["q186ozhcf1pc7qy","arb000000010729","USD"],["q186ozhcf1pc7qy","arb000000001049","USD"],["m6ft353f3i1k738","arb000000012855","USD"],["m6ft353f3i1k738","arb000000009713","USD"],["m6ft353f3i1k738","arb000000005707","USD"],["yztfgl67kr54xrz","arb000000010297","USD"],["yztfgl67kr54xrz","arb000000007021","USD"],["yztfgl67kr54xrz","arb000000011995","USD"],["yztfgl67kr54xrz","arb000000004009","USD"],["yztfgl67kr54xrz","arb000000009029","USD"],["9mibrst51up676h","arl000000886235","USD"],["9mibrst51up676h","arb000000012835","USD"],["9mibrst51up676h","arl000000885665","USD"],["2osovhomsvnmvf6","arc000000358006","USD"],["2osovhomsvnmvf6","arb000000003671","USD"],["2osovhomsvnmvf6","arc000000357889","USD"],["2osovhomsvnmvf6","arb000000005219","USD"],["2osovhomsvnmvf6","arb000000003593","USD"],["n7fxuokgj76jg9m","arb000000007611","USD"],["i12f17d7fhyq2p1","arb000000008849","USD"],["i12f17d7fhyq2p1","arb000000002837","USD"],["i12f17d7fhyq2p1","arb000000011331","USD"],["h1isnjx6f57ws7v","arb000000002415","USD"],["h1isnjx6f57ws7v","arb000000005889","USD"],["z7cz6wgy03qyb9m","arb000000001595","USD"],["z7cz6wgy03qyb9m","arb000000006307","USD"],["z7cz6wgy03qyb9m","arl000000886827","USD"],["wct8frd49ujzbkb","arb000000002443","USD"],["wct8frd49ujzbkb","arb000000002113","USD"],["wct8frd49ujzbkb","arb000000001133","USD"],["wct8frd49ujzbkb","arb000000008011","USD"],["1o9os354dtlzm6w","arb000000007325","USD"],["1o9os354dtlzm6w","arb000000012621","USD"],["1o9os354dtlzm6w","arb000000002345","USD"],["1o9os354dtlzm6w","arb000000012571","USD"],["4k1dfvxxujvxtk9","arb000000008179","USD"],["4k1dfvxxujvxtk9","arb000000005547","USD"],["4k1dfvxxujvxtk9","arc000000357721","USD"],["4k1dfvxxujvxtk9","arb000000003481","USD"],["80yjez2fuq0yq69","arb000000009683","USD"],["uwnojaet2b0q7wm","arb000000006365","USD"],["uwnojaet2b0q7wm","arb000000009523","USD"],["uwnojaet2b0q7wm","arb000000006765","USD"],["uwnojaet2b0q7wm","arb000000009247","USD"],["uwnojaet2b0q7wm","arl000000886137","USD"],["xl78jfvzsx8gqeu","arb000000002505","USD"],["xl78jfvzsx8gqeu","arb000000009129","USD"],["xl78jfvzsx8gqeu","arb000000007127","USD"],["xl78jfvzsx8gqeu","arb000000003867","USD"],["xl78jfvzsx8gqeu","arb000000012787","USD"],["xl78jfvzsx8gqeu","arl000000887183","USD"],["xl78jfvzsx8gqeu","arc000000358300","USD"],["yaar1xzecehi2u0","arb000000001839","USD"],["yaar1xzecehi2u0","arb000000002077","USD"],["yaar1xzecehi2u0","arl000000885651","USD"],["yaar1xzecehi2u0","arb000000012363","USD"],["yaar1xzecehi2u0","arl000000885955","USD"],["yaar1xzecehi2u0","arb000000012591","USD"],["ls4mwrmt2w54xe7","arb000000002435","USD"],["ls4mwrmt2w54xe7","arl000000887297","USD"],["ls4mwrmt2w54xe7","arb000000012657","USD"],["ls4mwrmt2w54xe7","arb000000012047","USD"],["ls4mwrmt2w54xe7","arb000000006905","USD"],["vo37pdx7uxc16rp","arb000000000707","USD"],["vo37pdx7uxc16rp","arl000000886517","USD"],["vo37pdx7uxc16rp","arb000000001381","USD"],["vo37pdx7uxc16rp","arb000000004577","USD"],["vo37pdx7uxc16rp","arb000000000867","USD"],["zqq3fqr3e6qmnwl","arb000000003929","USD"],["zqq3fqr3e6qmnwl","arb000000008107","USD"],["zqq3fqr3e6qmnwl","arc000000358393","USD"],["z7ajuf8789p6w6g","arb000000003323","USD"],["z7ajuf8789p6w6g","arc000000357484","USD"],["m6iscyx6nro6h55","arb000000006861","USD"],["m6iscyx6nro6h55","arb000000009795","USD"],["m6iscyx6nro6h55","arb000000009443","USD"],["m6iscyx6nro6h55","arc000000357679","USD"],["m6iscyx6nro6h55","arb000000010373","USD"],["m6iscyx6nro6h55","arb000000003453","USD"],["m6iscyx6nro6h55","arb000000001509","USD"],["wujuquuhx7808il","arb000000012759","USD"],["76tty98d4azu8dd","arc000000357979","USD"],["76tty98d4azu8dd","arb000000002973","USD"],["76tty98d4azu8dd","arb000000009399","USD"],["76tty98d4azu8dd","arb000000003653","USD"],["g0bf0y6eol7mw8f","arb000000004551","USD"],["g0bf0y6eol7mw8f","arb000000012805","USD"],["g0bf0y6eol7mw8f","arb000000005911","USD"],["g0bf0y6eol7mw8f","arb000000008563","USD"],["17lzqz7hp56oh2n","arb000000005767","USD"],["17lzqz7hp56oh2n","arc000000358327","USD"],["17lzqz7hp56oh2n","arb000000003885","USD"],["17lzqz7hp56oh2n","arl000000886903","USD"],["e9pf34cjlutg9mp","arl000000886393","USD"],["e9pf34cjlutg9mp","arb000000011267","USD"],["e9pf34cjlutg9mp","arb000000005283","USD"],["e9pf34cjlutg9mp","arb000000003665","USD"],["e9pf34cjlutg9mp","arb000000010751","USD"],["e9pf34cjlutg9mp","arb000000010363","USD"],["e9pf34cjlutg9mp","arc000000357997","USD"],["e9pf34cjlutg9mp","arb000000010551","USD"],["e9pf34cjlutg9mp","arl000000886461","USD"],["e9pf34cjlutg9mp","arl000000885701","USD"],["r3zjdglh5io1jr8","arl000000886953","USD"],["60isytvnqf6oy47","arb000000004019","USD"],["b6e7gvru2zl3609","arb000000008253","USD"],["b6e7gvru2zl3609","arb000000005775","USD"],["29bugmiq8agnm1o","arb000000012267","USD"],["z7veewlsocq3qr2","arb000000005899","USD"],["z7veewlsocq3qr2","arb000000002731","USD"],["z7veewlsocq3qr2","arb000000003611","USD"],["z7veewlsocq3qr2","arc000000357916","USD"],["z7veewlsocq3qr2","arb000000010065","USD"],["z7veewlsocq3qr2","arb000000011785","USD"],["q2enz04xy7v3lof","arb000000009109","USD"],["q2enz04xy7v3lof","arb000000001165","USD"],["q2enz04xy7v3lof","arb000000010539","USD"],["dvxks9feee4sqkr","arb000000010595","USD"],["dvxks9feee4sqkr","arb000000006227","USD"],["rqfped8jzixagnp","arb000000007085","USD"],["rqfped8jzixagnp","arb000000011555","USD"],["rqfped8jzixagnp","arb000000010201","USD"],["rqfped8jzixagnp","arb000000002161","USD"],["rqfped8jzixagnp","arb000000009147","USD"],["rqfped8jzixagnp","arb000000012929","USD"],["ujo9qgciowc1opo","arb000000012513","USD"],["ujo9qgciowc1opo","arb000000001631","USD"],["w611dvvodirs8ec","arb000000008721","USD"],["w611dvvodirs8ec","arb000000011707","USD"],["w611dvvodirs8ec","arb000000011161","USD"],["w611dvvodirs8ec","arb000000005255","USD"],["w611dvvodirs8ec","arb000000007653","USD"],["46t33t9mxnzz7vn","arb000000005671","USD"],["46t33t9mxnzz7vn","arb000000008541","USD"],["46t33t9mxnzz7vn","arb000000003773","USD"],["46t33t9mxnzz7vn","arc000000358159","USD"],["l99vqm663o7vgxg","arb000000007673","USD"],["l99vqm663o7vgxg","arb000000009669","USD"],["l99vqm663o7vgxg","arb000000006747","USD"],["l99vqm663o7vgxg","arb000000007283","USD"],["blz05fahdewexmj","arb000000010859","USD"],["blz05fahdewexmj","arb000000008843","USD"],["blz05fahdewexmj","arb000000012093","USD"],["blz05fahdewexmj","arb000000007361","USD"],["blz05fahdewexmj","arb000000001811","USD"],["0txcvrfc6bdaw8j","arb000000004421","USD"],["0txcvrfc6bdaw8j","arl000000886249","USD"],["0txcvrfc6bdaw8j","arb000000005029","USD"],["yts0yni5cmg18pq","arb000000010115","USD"],["yts0yni5cmg18pq","arc000000358237","USD"],["yts0yni5cmg18pq","arb000000006053","USD"],["yts0yni5cmg18pq","arb000000003825","USD"],["yts0yni5cmg18pq","arl000000885889","USD"],["shcu5bgytgv5o93","arb000000007875","USD"],["shcu5bgytgv5o93","arb000000006809","USD"],["shcu5bgytgv5o93","arl000000885769","USD"],["shcu5bgytgv5o93","arl000000886683","USD"],["shcu5bgytgv5o93","arb000000012115","USD"],["2x4vbexd7w4eyhf","arb000000008873","USD"],["rw17upc6td4vjbt","arb000000011615","USD"],["rw17upc6td4vjbt","arb000000012463","USD"],["rw17upc6td4vjbt","arb000000012079","USD"],["0lrxnvigetizjl8","arl000000886995","USD"],["0lrxnvigetizjl8","arc000000357226","USD"],["0lrxnvigetizjl8","arb000000003151","USD"],["t7hd0j2dajxbkx4","arb000000002341","USD"],["t7hd0j2dajxbkx4","arb000000005779","USD"],["t7hd0j2dajxbkx4","arb000000001283","USD"],["t7hd0j2dajxbkx4","arb000000011087","USD"],["t7hd0j2dajxbkx4","arb000000005013","USD"],["t7hd0j2dajxbkx4","arb000000006197","USD"],["t7hd0j2dajxbkx4","arb000000008053","USD"],["t7hd0j2dajxbkx4","arb000000001387","USD"],["qy3vb4jaj4vlz89","arl000000885529","USD"],["qy3vb4jaj4vlz89","arb000000001683","USD"],["qy3vb4jaj4vlz89","arb000000005659","USD"],["qy3vb4jaj4vlz89","arb000000011865","USD"],["qy3vb4jaj4vlz89","arb000000004533","USD"],["qy3vb4jaj4vlz89","arc000000357088","USD"],["qy3vb4jaj4vlz89","arb000000001307","USD"],["qy3vb4jaj4vlz89","arb000000004347","USD"],["qy3vb4jaj4vlz89","arb000000012633","USD"],["qy3vb4jaj4vlz89","arb000000003059","USD"],["xesc8wki384tqr0","arl000000885937","USD"],["xesc8wki384tqr0","arb000000007741","USD"],["xesc8wki384tqr0","arb000000010601","USD"],["xesc8wki384tqr0","arb000000009271","USD"],["xesc8wki384tqr0","arb000000012213","USD"],["0aif474bfkq7515","arb000000011165","USD"],["0aif474bfkq7515","arb000000005149","USD"],["0aif474bfkq7515","arb000000002343","USD"],["vrqsged7z0tm0vc","arb000000007101","USD"],["8ny4y5ana79xnhg","arb000000011189","USD"],["wdsg0u5gzelx4rt","arb000000009943","USD"],["wdsg0u5gzelx4rt","arb000000011289","USD"],["wdsg0u5gzelx4rt","arb000000002805","USD"],["vwnpawodvu72nz4","arb000000002975","USD"],["vwnpawodvu72nz4","arb000000006901","USD"],["vwnpawodvu72nz4","arb000000005139","USD"],["tcgl0mazqf0u5af","arb000000007297","USD"],["tcgl0mazqf0u5af","arb000000000701","USD"],["tcgl0mazqf0u5af","arb000000005725","USD"],["tcgl0mazqf0u5af","arc000000358063","USD"],["tcgl0mazqf0u5af","arb000000007107","USD"],["tcgl0mazqf0u5af","arb000000003709","USD"],["5u4ncnsshenld99","arb000000010323","USD"],["5u4ncnsshenld99","arb000000009751","USD"],["5u4ncnsshenld99","arl000000885951","USD"],["2wfzo1552y0aylm","arl000000886553","USD"],["2wfzo1552y0aylm","arb000000002175","USD"],["2wfzo1552y0aylm","arl000000885907","USD"],["2wfzo1552y0aylm","arl000000885947","USD"],["t04ptk6r99ekiuc","arb000000004183","USD"],["igp9gpgqzpr1s9h","arb000000010559","USD"],["igp9gpgqzpr1s9h","arb000000006753","USD"],["igp9gpgqzpr1s9h","arb000000012789","USD"],["wxfpkf38npxd6wy","arb000000006025","USD"],["wxfpkf38npxd6wy","arb000000011571","USD"],["wxfpkf38npxd6wy","arb000000008701","USD"],["048qfui67ylafev","arb000000011221","USD"],["048qfui67ylafev","arb000000005717","USD"],["048qfui67ylafev","arl000000887453","USD"],["048qfui67ylafev","arb000000010377","USD"],["048qfui67ylafev","arb000000007935","USD"],["048qfui67ylafev","arb000000005635","USD"],["yv7gipqg62zyv0v","arb000000001727","USD"],["yv7gipqg62zyv0v","arb000000007911","USD"],["yv7gipqg62zyv0v","arb000000001539","USD"],["cf349rlz8jwx4fq","arb000000006303","USD"],["cf349rlz8jwx4fq","arb000000001779","USD"],["02y8ui03wz7lzfe","arc000000358228","USD"],["02y8ui03wz7lzfe","arb000000003819","USD"],["sf2owrrgy62b0qp","arb000000011895","USD"],["sf2owrrgy62b0qp","arb000000000657","USD"],["sf2owrrgy62b0qp","arb000000002885","USD"],["sf2owrrgy62b0qp","arb000000006443","USD"],["sczl602lerb1y0k","arb000000004829","USD"],["sczl602lerb1y0k","arb000000002379","USD"],["zsgu7ilyz4x7n95","arb000000004313","USD"],["tfnyziuaosje7zn","arb000000009671","USD"],["tfnyziuaosje7zn","arb000000012675","USD"],["a3quyhokce2npnq","arb000000011969","USD"],["a3quyhokce2npnq","arb000000008457","USD"],["a3quyhokce2npnq","arb000000007687","USD"],["w7xdv7x5mp9g4vt","arb000000005273","USD"],["w7xdv7x5mp9g4vt","arb000000007435","USD"],["w7xdv7x5mp9g4vt","arl000000887047","USD"],["w7xdv7x5mp9g4vt","arb000000009783","USD"],["w7xdv7x5mp9g4vt","arb000000009775","USD"],["45nkvlhhw66bpp4","arb000000008969","USD"],["45nkvlhhw66bpp4","arb000000006331","USD"],["45nkvlhhw66bpp4","arl000000885865","USD"],["774eo87n4sx7o4m","arb000000011009","USD"],["774eo87n4sx7o4m","arl000000886281","USD"],["774eo87n4sx7o4m","arb000000009179","USD"],["cboalsgi475xxte","arb000000005903","USD"],["cboalsgi475xxte","arl000000885885","USD"],["cboalsgi475xxte","arb000000005045","USD"],["cboalsgi475xxte","arb000000006549","USD"],["cboalsgi475xxte","arl000000885587","USD"],["qbkycd3k8kkxh8q","arb000000002065","USD"],["qbkycd3k8kkxh8q","arb000000002937","USD"],["qbkycd3k8kkxh8q","arb000000005869","USD"],["qbkycd3k8kkxh8q","arb000000002775","USD"],["sd6s4vv31nhy9r7","arb000000008137","USD"],["sd6s4vv31nhy9r7","arb000000011013","USD"],["hseefds7cgib3fb","arb000000007723","USD"],["hseefds7cgib3fb","arb000000010379","USD"],["4v1vxz76qxrbu23","arc000000358150","USD"],["4v1vxz76qxrbu23","arb000000003767","USD"],["4v1vxz76qxrbu23","arb000000007989","USD"],["4v1vxz76qxrbu23","arb000000012895","USD"],["f81k9bgkz1deq9s","arb000000011603","USD"],["eu3qvk89rn74ivd","arb000000012203","USD"],["eu3qvk89rn74ivd","arl000000887209","USD"],["eu3qvk89rn74ivd","arb000000007595","USD"],["3ew04w3hwtb08rz","arb000000002579","USD"],["3ew04w3hwtb08rz","arb000000011387","USD"],["3ew04w3hwtb08rz","arl000000886849","USD"],["3ew04w3hwtb08rz","arb000000012329","USD"],["3ew04w3hwtb08rz","arb000000002845","USD"],["3ew04w3hwtb08rz","arb000000001495","USD"],["yhozyxed3b7ktgb","arb000000010999","USD"],["yhozyxed3b7ktgb","arb000000008115","USD"],["ihrrcy6xo4j0dp9","arl000000885881","USD"],["ihrrcy6xo4j0dp9","arb000000002475","USD"],["ihrrcy6xo4j0dp9","arb000000012987","USD"],["ihrrcy6xo4j0dp9","arb000000005933","USD"],["am7b7zj66jax1rx","arb000000004729","USD"],["am7b7zj66jax1rx","arb000000002131","USD"],["am7b7zj66jax1rx","arb000000001339","USD"],["am7b7zj66jax1rx","arb000000005363","USD"],["am7b7zj66jax1rx","arb000000007499","USD"],["7zp2gb9scxxz8vh","arb000000009861","USD"],["bqrrf2aknlclxy1","arb000000009617","USD"],["bqrrf2aknlclxy1","arb000000002303","USD"],["bqrrf2aknlclxy1","arl000000886053","USD"],["lj3u9xlbkm35d2o","arc000000357973","USD"],["lj3u9xlbkm35d2o","arb000000005237","USD"],["lj3u9xlbkm35d2o","arb000000010805","USD"],["lj3u9xlbkm35d2o","arb000000003649","USD"],["lj3u9xlbkm35d2o","arb000000007619","USD"],["lj3u9xlbkm35d2o","arb000000009573","USD"],["lj3u9xlbkm35d2o","arb000000008213","USD"],["ifnbmq9hjnzi39b","arb000000003871","USD"],["ifnbmq9hjnzi39b","arc000000358306","USD"],["ifnbmq9hjnzi39b","arb000000011157","USD"],["6gvtu4f50bb07bd","arb000000008657","USD"],["un1m60uh1mp6n9i","arb000000001937","USD"],["un1m60uh1mp6n9i","arb000000012299","USD"],["un1m60uh1mp6n9i","arc000000357955","USD"],["un1m60uh1mp6n9i","arb000000002253","USD"],["un1m60uh1mp6n9i","arb000000005239","USD"],["un1m60uh1mp6n9i","arb000000003637","USD"],["un1m60uh1mp6n9i","arb000000011905","USD"],["ibkyxw5nps2kcnq","arb000000011197","USD"],["ibkyxw5nps2kcnq","arb000000012057","USD"],["ibkyxw5nps2kcnq","arb000000005847","USD"],["aj97c0hiv43wjch","arb000000002951","USD"],["aj97c0hiv43wjch","arb000000000651","USD"],["pq9n9db834oh4sc","arb000000001297","USD"],["pq9n9db834oh4sc","arb000000004571","USD"],["pq9n9db834oh4sc","arb000000004763","USD"],["pq9n9db834oh4sc","arl000000886121","USD"],["o4w0lojzfomc3rb","arb000000001315","USD"],["o4w0lojzfomc3rb","arb000000005245","USD"],["o4w0lojzfomc3rb","arb000000005491","USD"],["4utjwhis68e2dyi","arb000000006339","USD"],["4utjwhis68e2dyi","arb000000002847","USD"],["4utjwhis68e2dyi","arl000000885707","USD"],["4utjwhis68e2dyi","arb000000004217","USD"],["9doek3nuvhmv66v","arb000000005683","USD"],["9doek3nuvhmv66v","arb000000006475","USD"],["9doek3nuvhmv66v","arl000000887103","USD"],["291qxfhlz01oxwq","arb000000004031","USD"],["291qxfhlz01oxwq","arb000000001327","USD"],["291qxfhlz01oxwq","arb000000008527","USD"],["291qxfhlz01oxwq","arb000000012999","USD"],["291qxfhlz01oxwq","arb000000006205","USD"],["1d1y9fegg9mnpgb","arb000000010359","USD"],["1d1y9fegg9mnpgb","arb000000004953","USD"],["1d1y9fegg9mnpgb","arb000000001359","USD"],["1d1y9fegg9mnpgb","arb000000006401","USD"],["5zrmux8rn224fpd","arb000000007133","USD"],["5zrmux8rn224fpd","arb000000000949","USD"],["5zrmux8rn224fpd","arb000000012321","USD"],["5zrmux8rn224fpd","arb000000008201","USD"],["5zrmux8rn224fpd","arb000000011017","USD"],["8kktkcmxuxtwfkq","arb000000004535","USD"],["8kktkcmxuxtwfkq","arl000000887063","USD"],["8kktkcmxuxtwfkq","arl000000886183","USD"],["8kktkcmxuxtwfkq","arb000000012923","USD"],["8kktkcmxuxtwfkq","arb000000004145","USD"],["v7g4riia8xvtdbf","arb000000003783","USD"],["v7g4riia8xvtdbf","arc000000358174","USD"],["v7g4riia8xvtdbf","arb000000011091","USD"],["v7g4riia8xvtdbf","arb000000003423","USD"],["v7g4riia8xvtdbf","arc000000357634","USD"],["v7g4riia8xvtdbf","arl000000887447","USD"],["pf9jngqmxor6qqw","arb000000010493","USD"],["pf9jngqmxor6qqw","arb000000012277","USD"],["pf9jngqmxor6qqw","arb000000009667","USD"],["flxfvi3psq2f3kp","arb000000010607","USD"],["flxfvi3psq2f3kp","arb000000006775","USD"],["flxfvi3psq2f3kp","arb000000008079","USD"],["flxfvi3psq2f3kp","arl000000885567","USD"],["flxfvi3psq2f3kp","arl000000885547","USD"],["zkr9cczs9tlzdxp","arb000000009413","USD"],["zkr9cczs9tlzdxp","arb000000004657","USD"],["zkr9cczs9tlzdxp","arl000000885593","USD"],["tb5h6kfbcjn32wv","arl000000886209","USD"],["tb5h6kfbcjn32wv","arb000000011903","USD"],["tb5h6kfbcjn32wv","arl000000886815","USD"],["tb5h6kfbcjn32wv","arb000000007571","USD"],["tb5h6kfbcjn32wv","arb000000006661","USD"],["mavr8yemovo2oi4","arb000000008951","USD"],["mavr8yemovo2oi4","arb000000006797","USD"],["mavr8yemovo2oi4","arb000000002401","USD"],["mavr8yemovo2oi4","arb000000010127","USD"],["mavr8yemovo2oi4","arb000000007225","USD"],["drga2j7a8ws397v","arb000000008763","USD"],["drga2j7a8ws397v","arb000000002677","USD"],["drga2j7a8ws397v","arb000000006833","USD"],["j7leyqkspr5ccqj","arb000000009979","USD"],["j7leyqkspr5ccqj","arb000000010597","USD"],["j7leyqkspr5ccqj","arb000000011179","USD"],["j7leyqkspr5ccqj","arb000000005615","USD"],["rrxxm41nyijlrkt","arb000000004623","USD"],["rrxxm41nyijlrkt","arc000000357340","USD"],["rrxxm41nyijlrkt","arb000000011803","USD"],["rrxxm41nyijlrkt","arb000000004195","USD"],["rrxxm41nyijlrkt","arb000000002515","USD"],["rrxxm41nyijlrkt","arb000000003227","USD"],["zotrbtteetj9w68","arb000000000703","USD"],["zotrbtteetj9w68","arb000000001699","USD"],["zotrbtteetj9w68","arb000000007007","USD"],["zotrbtteetj9w68","arb000000012751","USD"],["iat3959d1odc7nu","arb000000002167","USD"],["iat3959d1odc7nu","arb000000006575","USD"],["iat3959d1odc7nu","arb000000001643","USD"],["iat3959d1odc7nu","arb000000005757","USD"],["iat3959d1odc7nu","arb000000001853","USD"],["iat3959d1odc7nu","arl000000885729","USD"],["iat3959d1odc7nu","arb000000009939","USD"],["ez93rlubmn2tbzm","arb000000006031","USD"],["ez93rlubmn2tbzm","arb000000012907","USD"],["ez93rlubmn2tbzm","arb000000006397","USD"],["ez93rlubmn2tbzm","arb000000006065","USD"],["6fa7yj1yl8q29w8","arb000000009369","USD"],["6fa7yj1yl8q29w8","arl000000887487","USD"],["6fa7yj1yl8q29w8","arl000000885967","USD"],["der60e2vbboblgh","arb000000001301","USD"],["der60e2vbboblgh","arb000000007221","USD"],["der60e2vbboblgh","arb000000001341","USD"],["25c1mijgmgu2isu","arb000000002489","USD"],["rszi200lh0qq93q","arb000000011529","USD"],["rszi200lh0qq93q","arb000000012957","USD"],["rszi200lh0qq93q","arl000000885849","USD"],["rszi200lh0qq93q","arb000000006687","USD"],["41bc5cjc27i8588","arb000000010733","USD"],["ksfpvmdzq5j8q6g","arl000000886417","USD"],["ksfpvmdzq5j8q6g","arb000000005091","USD"],["ksfpvmdzq5j8q6g","arl000000885771","USD"],["ksfpvmdzq5j8q6g","arl000000885895","USD"],["ksfpvmdzq5j8q6g","arb000000012129","USD"],["ht1v6civ5vj69he","arl000000886411","USD"],["ht1v6civ5vj69he","arb000000004639","USD"],["ht1v6civ5vj69he","arb000000001385","USD"],["ht1v6civ5vj69he","arb000000007945","USD"],["ht1v6civ5vj69he","arc000000357529","USD"],["ht1v6civ5vj69he","arb000000006995","USD"],["ht1v6civ5vj69he","arb000000003353","USD"],["3tgygmnut5x09ew","arb000000005663","USD"],["3tgygmnut5x09ew","arl000000885965","USD"],["3tgygmnut5x09ew","arl000000886661","USD"],["3tgygmnut5x09ew","arb000000011617","USD"],["3tgygmnut5x09ew","arb000000008147","USD"],["3tgygmnut5x09ew","arl000000887389","USD"],["zi6j670ntk7reuo","arl000000887485","USD"],["zi6j670ntk7reuo","arl000000887357","USD"],["ygpoqh9nvq7ztys","arb000000002865","USD"],["ht9rd6ebtcrzht1","arb000000008235","USD"],["pcnt08pfp4s9t5b","arb000000007167","USD"],["pcnt08pfp4s9t5b","arb000000010845","USD"],["pcnt08pfp4s9t5b","arb000000004101","USD"],["b71rslfhdcaywwj","arb000000004821","USD"],["b71rslfhdcaywwj","arb000000004925","USD"],["b71rslfhdcaywwj","arb000000001587","USD"],["b71rslfhdcaywwj","arl000000885945","USD"],["b71rslfhdcaywwj","arb000000006933","USD"],["b71rslfhdcaywwj","arb000000001625","USD"],["zfblrmyk8goljb7","arb000000012799","USD"],["0m3wg6850syt3l9","arc000000357730","USD"],["0m3wg6850syt3l9","arb000000003487","USD"],["0m3wg6850syt3l9","arb000000006503","USD"],["0m3wg6850syt3l9","arb000000010095","USD"],["dbx3mpcbbiefgba","arb000000002995","USD"],["dbx3mpcbbiefgba","arc000000357292","USD"],["dbx3mpcbbiefgba","arb000000003195","USD"],["dbx3mpcbbiefgba","arb000000008211","USD"],["dbx3mpcbbiefgba","arb000000011243","USD"],["tugfvja8cxgbv4a","arb000000011031","USD"],["tugfvja8cxgbv4a","arb000000005661","USD"],["tugfvja8cxgbv4a","arb000000007117","USD"],["4wq9zmqe0yo4and","arb000000011093","USD"],["4wq9zmqe0yo4and","arb000000006201","USD"],["4wq9zmqe0yo4and","arb000000006419","USD"],["xxmd7xvtujabawu","arl000000887093","USD"],["xxmd7xvtujabawu","arb000000001459","USD"],["xxmd7xvtujabawu","arl000000886313","USD"],["xxmd7xvtujabawu","arl000000886977","USD"],["xxmd7xvtujabawu","arl000000887227","USD"],["btrpg88psg7stlq","arc000000357148","USD"],["btrpg88psg7stlq","arb000000009061","USD"],["btrpg88psg7stlq","arb000000007381","USD"],["btrpg88psg7stlq","arb000000003099","USD"],["btrpg88psg7stlq","arb000000009981","USD"],["d2srsyrnau0c5l3","arl000000886237","USD"],["d2srsyrnau0c5l3","arb000000009725","USD"],["d2srsyrnau0c5l3","arb000000006255","USD"],["d2srsyrnau0c5l3","arb000000004807","USD"],["59r8zrrx7u56dbo","arb000000012333","USD"],["59r8zrrx7u56dbo","arl000000886689","USD"],["59r8zrrx7u56dbo","arb000000004777","USD"],["59r8zrrx7u56dbo","arb000000004029","USD"],["1u5olv384jw2ho8","arl000000885767","USD"],["1u5olv384jw2ho8","arc000000357106","USD"],["1u5olv384jw2ho8","arb000000003071","USD"],["f5uj40yg3guswt6","arb000000001141","USD"],["f5uj40yg3guswt6","arb000000012359","USD"],["f5uj40yg3guswt6","arb000000007219","USD"],["f5uj40yg3guswt6","arb000000012651","USD"],["f5uj40yg3guswt6","arb000000008979","USD"],["gs0c2v0lmo7x6tx","arl000000885725","USD"],["gs0c2v0lmo7x6tx","arb000000011769","USD"],["u4mdlky4c2d5ekw","arb000000005939","USD"],["u4mdlky4c2d5ekw","arb000000010801","USD"],["u4mdlky4c2d5ekw","arb000000002229","USD"],["u4mdlky4c2d5ekw","arb000000006653","USD"],["dwbzk207uw9x06u","arb000000002139","USD"],["1b7iebiu49gg0yh","arl000000886493","USD"],["1b7iebiu49gg0yh","arb000000009763","USD"],["1b7iebiu49gg0yh","arb000000011205","USD"],["1b7iebiu49gg0yh","arb000000008495","USD"],["w9udxefamd7kr2f","arl000000887243","USD"],["w9udxefamd7kr2f","arb000000010933","USD"],["w9udxefamd7kr2f","arb000000010243","USD"],["w9udxefamd7kr2f","arl000000886877","USD"],["lygshirijloa0mm","arb000000011773","USD"],["lygshirijloa0mm","arb000000005187","USD"],["kdgrunq104bnqut","arl000000885821","USD"],["kdgrunq104bnqut","arb000000009049","USD"],["ad623msft0un8kf","arb000000010445","USD"],["ad623msft0un8kf","arb000000005445","USD"],["ad623msft0un8kf","arb000000002931","USD"],["ad623msft0un8kf","arb000000001801","USD"],["ad623msft0un8kf","arb000000009157","USD"],["ad623msft0un8kf","arb000000010777","USD"],["jehdtpt3hnlm29s","arb000000006693","USD"],["jehdtpt3hnlm29s","arl000000886143","USD"],["jehdtpt3hnlm29s","arb000000003337","USD"],["jehdtpt3hnlm29s","arc000000357505","USD"],["jehdtpt3hnlm29s","arb000000007405","USD"],["jehdtpt3hnlm29s","arb000000012259","USD"],["lso5sboc0f1wxqu","arb000000011337","USD"],["lso5sboc0f1wxqu","arb000000005105","USD"],["lso5sboc0f1wxqu","arb000000002923","USD"],["lso5sboc0f1wxqu","arl000000886285","USD"],["lso5sboc0f1wxqu","arl000000885591","USD"],["lso5sboc0f1wxqu","arl000000886969","USD"],["iuhgjm0ut3bzr32","arb000000001253","USD"],["iuhgjm0ut3bzr32","arb000000011129","USD"],["qdxs4ywoiv2gxlp","arb000000004467","USD"],["qdxs4ywoiv2gxlp","arb000000010981","USD"],["qdxs4ywoiv2gxlp","arb000000008423","USD"],["qdxs4ywoiv2gxlp","arb000000009469","USD"],["qdxs4ywoiv2gxlp","arb000000004397","USD"],["gw0y1tk52k60fj0","arb000000011167","USD"],["gw0y1tk52k60fj0","arl000000885555","USD"],["xm203gggsk5ht4a","arb000000011409","USD"],["xm203gggsk5ht4a","arb000000001461","USD"],["xm203gggsk5ht4a","arb000000004933","USD"],["9trdqufe0aj7n5y","arb000000009069","USD"],["9trdqufe0aj7n5y","arb000000011285","USD"],["9trdqufe0aj7n5y","arb000000009123","USD"],["9trdqufe0aj7n5y","arb000000009227","USD"],["fsignx42rhmakq4","arb000000009637","USD"],["fsignx42rhmakq4","arb000000007679","USD"],["fsignx42rhmakq4","arb000000002493","USD"],["7kq7wlq4125y88z","arb000000011559","USD"],["7kq7wlq4125y88z","arb000000004913","USD"],["kukty8iuseozs64","arb000000006409","USD"],["kukty8iuseozs64","arb000000012979","USD"],["kukty8iuseozs64","arb000000010663","USD"],["kukty8iuseozs64","arb000000005701","USD"],["ysln0azkjpj9quy","arc000000357919","USD"],["ysln0azkjpj9quy","arc000000357022","USD"],["ysln0azkjpj9quy","arb000000009483","USD"],["ysln0azkjpj9quy","arb000000003015","USD"],["ysln0azkjpj9quy","arb000000003613","USD"],["lpogx13rugrjlc7","arb000000008859","USD"],["lpogx13rugrjlc7","arl000000886765","USD"],["lpogx13rugrjlc7","arl000000885797","USD"],["lpogx13rugrjlc7","arb000000007417","USD"],["ci4c17m9nly7lwn","arb000000004125","USD"],["xxgh7ofh4cdlhl1","arc000000357214","USD"],["xxgh7ofh4cdlhl1","arb000000003143","USD"],["xxgh7ofh4cdlhl1","arb000000012263","USD"],["xxgh7ofh4cdlhl1","arb000000008939","USD"],["1t6nuhj4epluyqm","arb000000001031","USD"],["1t6nuhj4epluyqm","arb000000002901","USD"],["1t6nuhj4epluyqm","arb000000004095","USD"],["m3l63m6qbqhozzs","arb000000001825","USD"],["qkbxuvicv8c2yey","arb000000010861","USD"],["qkbxuvicv8c2yey","arb000000007643","USD"],["qkbxuvicv8c2yey","arb000000001787","USD"],["a4kagcgm69m02sw","arb000000006353","USD"],["a4kagcgm69m02sw","arc000000357961","USD"],["a4kagcgm69m02sw","arb000000003641","USD"],["a4kagcgm69m02sw","arb000000008601","USD"],["a4kagcgm69m02sw","arb000000007605","USD"],["qz9ubfk5k9aymlm","arb000000006461","USD"],["qz9ubfk5k9aymlm","arb000000004033","USD"],["gj041yhbxxsr20t","arb000000004355","USD"],["gj041yhbxxsr20t","arb000000007631","USD"],["gj041yhbxxsr20t","arb000000009581","USD"],["gj041yhbxxsr20t","arb000000007129","USD"],["gj041yhbxxsr20t","arb000000010339","USD"],["gj041yhbxxsr20t","arb000000010895","USD"],["gj041yhbxxsr20t","arb000000004839","USD"],["irgoy7gldwtrzwh","arb000000011779","USD"],["irgoy7gldwtrzwh","arb000000009561","USD"],["irgoy7gldwtrzwh","arc000000358375","USD"],["irgoy7gldwtrzwh","arb000000010855","USD"],["irgoy7gldwtrzwh","arb000000003917","USD"],["irgoy7gldwtrzwh","arb000000006641","USD"],["irgoy7gldwtrzwh","arb000000008887","USD"],["irgoy7gldwtrzwh","arb000000011049","USD"],["irgoy7gldwtrzwh","arb000000012531","USD"],["l7r890uixakbpuo","arb000000001857","USD"],["l7r890uixakbpuo","arb000000001215","USD"],["l7r890uixakbpuo","arb000000004521","USD"],["l7r890uixakbpuo","arb000000002671","USD"],["gqs8h2mddvdktkl","arb000000012451","USD"],["gqs8h2mddvdktkl","arb000000012357","USD"],["gqs8h2mddvdktkl","arb000000001193","USD"],["gqs8h2mddvdktkl","arb000000012881","USD"],["gqs8h2mddvdktkl","arb000000010545","USD"],["gqs8h2mddvdktkl","arl000000886635","USD"],["pglpcqo4du0zqle","arc000000357562","USD"],["pglpcqo4du0zqle","arb000000006891","USD"],["pglpcqo4du0zqle","arb000000003375","USD"],["pglpcqo4du0zqle","arb000000005525","USD"],["55jxyoyyv682jxe","arb000000005193","USD"],["55jxyoyyv682jxe","arb000000008733","USD"],["55jxyoyyv682jxe","arb000000002061","USD"],["55jxyoyyv682jxe","arb000000004211","USD"],["55jxyoyyv682jxe","arb000000001499","USD"],["16x20lp1kmtyigs","arb000000012307","USD"],["16x20lp1kmtyigs","arb000000007119","USD"],["16x20lp1kmtyigs","arb000000004303","USD"],["16x20lp1kmtyigs","arb000000005243","USD"],["hq1fsj3uf0mg366","arl000000885745","USD"],["hq1fsj3uf0mg366","arb000000010873","USD"],["hq1fsj3uf0mg366","arb000000005551","USD"],["scxmmibs9rbf5lr","arb000000008823","USD"],["scxmmibs9rbf5lr","arb000000001619","USD"],["scxmmibs9rbf5lr","arb000000012795","USD"],["q49ihrekfiyagcr","arb000000001651","USD"],["q49ihrekfiyagcr","arb000000001323","USD"],["q49ihrekfiyagcr","arb000000009107","USD"],["q49ihrekfiyagcr","arb000000010011","USD"],["q49ihrekfiyagcr","arb000000008165","USD"],["q49ihrekfiyagcr","arl000000886435","USD"],["x4kbisweknehtwz","arb000000003789","USD"],["x4kbisweknehtwz","arc000000358183","USD"],["x4kbisweknehtwz","arb000000002001","USD"],["zsedlgvleqrr7bu","arb000000012335","USD"],["zsedlgvleqrr7bu","arl000000886443","USD"],["zsedlgvleqrr7bu","arb000000010617","USD"],["zsedlgvleqrr7bu","arb000000003073","USD"],["zsedlgvleqrr7bu","arb000000005973","USD"],["zsedlgvleqrr7bu","arc000000357109","USD"],["1888t4jvs2teffs","arl000000886391","USD"],["1888t4jvs2teffs","arb000000010955","USD"],["1888t4jvs2teffs","arb000000008067","USD"],["nvoyvpxezwhvt3f","arb000000010367","USD"],["nvoyvpxezwhvt3f","arb000000004159","USD"],["nvoyvpxezwhvt3f","arb000000001257","USD"],["nvoyvpxezwhvt3f","arb000000002095","USD"],["hh1h0p4u9fydhb1","arb000000008897","USD"],["hh1h0p4u9fydhb1","arb000000002283","USD"],["jgfagxx2q7jkjl2","arb000000009641","USD"],["jgfagxx2q7jkjl2","arl000000886531","USD"],["jgfagxx2q7jkjl2","arb000000001477","USD"],["e5lp43fdfdng5rx","arb000000009101","USD"],["e5lp43fdfdng5rx","arb000000005951","USD"],["e5lp43fdfdng5rx","arl000000887221","USD"],["e5lp43fdfdng5rx","arb000000005791","USD"],["e5lp43fdfdng5rx","arb000000012781","USD"],["e5lp43fdfdng5rx","arb000000011367","USD"],["extx2eywigdbdbx","arb000000011947","USD"],["extx2eywigdbdbx","arb000000010291","USD"],["extx2eywigdbdbx","arb000000004271","USD"],["t4x4p6xojq92n0w","arb000000012347","USD"],["t4x4p6xojq92n0w","arl000000886387","USD"],["t4x4p6xojq92n0w","arb000000005473","USD"],["t4x4p6xojq92n0w","arb000000006595","USD"],["vqgxm2b7tacib3v","arb000000004023","USD"],["vqgxm2b7tacib3v","arb000000004287","USD"],["vqgxm2b7tacib3v","arc000000357613","USD"],["vqgxm2b7tacib3v","arb000000011203","USD"],["vqgxm2b7tacib3v","arb000000005207","USD"],["vqgxm2b7tacib3v","arb000000003409","USD"],["hv8mh60vvu1mwfo","arb000000012917","USD"],["hv8mh60vvu1mwfo","arb000000005229","USD"],["hv8mh60vvu1mwfo","arb000000002581","USD"],["hv8mh60vvu1mwfo","arb000000011909","USD"],["hv8mh60vvu1mwfo","arb000000006171","USD"],["hv8mh60vvu1mwfo","arb000000009345","USD"],["hv8mh60vvu1mwfo","arb000000011675","USD"],["p0u61k4dwhjlwu5","arb000000002751","USD"],["p0u61k4dwhjlwu5","arb000000003527","USD"],["p0u61k4dwhjlwu5","arc000000357790","USD"],["p0u61k4dwhjlwu5","arb000000012241","USD"],["p0u61k4dwhjlwu5","arb000000005649","USD"],["kuadiix6gigkp3u","arb000000007105","USD"],["kuadiix6gigkp3u","arb000000002331","USD"],["kuadiix6gigkp3u","arb000000006263","USD"],["kuadiix6gigkp3u","arb000000009809","USD"],["kuadiix6gigkp3u","arb000000010649","USD"],["d6axdcc02943ahk","arb000000008565","USD"],["d6axdcc02943ahk","arb000000008519","USD"],["d6axdcc02943ahk","arb000000011601","USD"],["d6axdcc02943ahk","arb000000007261","USD"],["d6axdcc02943ahk","arb000000008501","USD"],["pha0zpe3ff5ekmq","arl000000886947","USD"],["pha0zpe3ff5ekmq","arb000000006803","USD"],["pha0zpe3ff5ekmq","arb000000003251","USD"],["pha0zpe3ff5ekmq","arl000000886041","USD"],["pha0zpe3ff5ekmq","arc000000357376","USD"],["pha0zpe3ff5ekmq","arb000000004679","USD"],["pha0zpe3ff5ekmq","arb000000007665","USD"],["xxyc1ypyozahnl0","arb000000007479","USD"],["xxyc1ypyozahnl0","arb000000003515","USD"],["xxyc1ypyozahnl0","arl000000885757","USD"],["xxyc1ypyozahnl0","arb000000009485","USD"],["xxyc1ypyozahnl0","arc000000357772","USD"],["3zib8ddqa5i4jv0","arb000000004963","USD"],["3zib8ddqa5i4jv0","arb000000004885","USD"],["3zib8ddqa5i4jv0","arl000000886829","USD"],["3zib8ddqa5i4jv0","arb000000007799","USD"],["3zib8ddqa5i4jv0","arb000000005737","USD"],["cob5y3delxdb7b4","arb000000005867","USD"],["cob5y3delxdb7b4","arc000000357610","USD"],["cob5y3delxdb7b4","arb000000003407","USD"],["cob5y3delxdb7b4","arl000000886971","USD"],["cob5y3delxdb7b4","arb000000007575","USD"],["pdevhof56i57fse","arc000000357280","USD"],["pdevhof56i57fse","arb000000003187","USD"],["pdevhof56i57fse","arb000000007765","USD"],["3cmig44o0dtfbum","arl000000885535","USD"],["3cmig44o0dtfbum","arb000000002705","USD"],["3cmig44o0dtfbum","arb000000005259","USD"],["w08g6t80kljupm9","arb000000005465","USD"],["w08g6t80kljupm9","arb000000006259","USD"],["w08g6t80kljupm9","arb000000008279","USD"],["j1rpwh0n93z5bn9","arb000000004257","USD"],["j1rpwh0n93z5bn9","arl000000886569","USD"],["j1rpwh0n93z5bn9","arl000000885883","USD"],["j1rpwh0n93z5bn9","arb000000007845","USD"],["6psk8sh67bdc4ul","arb000000010345","USD"],["6psk8sh67bdc4ul","arb000000005639","USD"],["2vihufbhdqj6i2l","arb000000005225","USD"],["2vihufbhdqj6i2l","arb000000010651","USD"],["xkt8wlzhd8y7dfp","arc000000357322","USD"],["xkt8wlzhd8y7dfp","arb000000001681","USD"],["xkt8wlzhd8y7dfp","arb000000005955","USD"],["xkt8wlzhd8y7dfp","arb000000001797","USD"],["xkt8wlzhd8y7dfp","arb000000003215","USD"],["xkt8wlzhd8y7dfp","arb000000011701","USD"],["zmd5c2lr6xocqeq","arb000000012247","USD"],["zmd5c2lr6xocqeq","arb000000011107","USD"],["zmd5c2lr6xocqeq","arb000000004275","USD"],["zmd5c2lr6xocqeq","arb000000012339","USD"],["wt4csstgiyllhar","arb000000001205","USD"],["wt4csstgiyllhar","arb000000001917","USD"],["mdzji5sn6bap3n9","arb000000005747","USD"],["mdzji5sn6bap3n9","arb000000012711","USD"],["mdzji5sn6bap3n9","arb000000004513","USD"],["mdzji5sn6bap3n9","arb000000012679","USD"],["mdzji5sn6bap3n9","arl000000885607","USD"],["mdzji5sn6bap3n9","arb000000002255","USD"],["anzpt81yh4l984z","arb000000012889","USD"],["anzpt81yh4l984z","arb000000000849","USD"],["anzpt81yh4l984z","arb000000010075","USD"],["anzpt81yh4l984z","arb000000012797","USD"],["kxq3arqr84g72gu","arb000000010897","USD"],["kxq3arqr84g72gu","arb000000007291","USD"],["kxq3arqr84g72gu","arb000000001099","USD"],["8ekjx537rbh0are","arb000000012599","USD"],["8ekjx537rbh0are","arb000000006089","USD"],["8ekjx537rbh0are","arb000000004039","USD"],["8ekjx537rbh0are","arb000000001479","USD"],["yonvnm628set3g4","arb000000001091","USD"],["yonvnm628set3g4","arb000000006483","USD"],["yonvnm628set3g4","arb000000000859","USD"],["br6as3z3ouvzqg8","arl000000885581","USD"],["br6as3z3ouvzqg8","arb000000005443","USD"],["br6as3z3ouvzqg8","arb000000011631","USD"],["v5xvrsxvqm0x29b","arb000000009837","USD"],["v5xvrsxvqm0x29b","arl000000886583","USD"],["v5xvrsxvqm0x29b","arb000000007285","USD"],["52vp5rk3ytd83at","arb000000011111","USD"],["52vp5rk3ytd83at","arb000000012235","USD"],["l8a4b0a0t0tb4cv","arb000000005107","USD"],["l8a4b0a0t0tb4cv","arl000000885783","USD"],["l8a4b0a0t0tb4cv","arb000000004265","USD"],["ykxl12a0oa2zj6f","arb000000009079","USD"],["ykxl12a0oa2zj6f","arb000000006183","USD"],["ykxl12a0oa2zj6f","arb000000001535","USD"],["7u2qci7jd9rhc23","arl000000886847","USD"],["7u2qci7jd9rhc23","arl000000886657","USD"],["7u2qci7jd9rhc23","arb000000001433","USD"],["7u2qci7jd9rhc23","arb000000001703","USD"],["7u2qci7jd9rhc23","arb000000011219","USD"],["xmd22ww1ri4bo31","arl000000885627","USD"],["hj1qvolw3q0kh2e","arl000000885583","USD"],["hj1qvolw3q0kh2e","arb000000012397","USD"],["hj1qvolw3q0kh2e","arb000000005891","USD"],["hj1qvolw3q0kh2e","arb000000010225","USD"],["hj1qvolw3q0kh2e","arl000000886215","USD"],["hj1qvolw3q0kh2e","arb000000005543","USD"],["g9buqwioz6aft27","arc000000357358","USD"],["g9buqwioz6aft27","arb000000003239","USD"],["g9buqwioz6aft27","arb000000004857","USD"],["g9buqwioz6aft27","arb000000001123","USD"],["vc3j60fmxlbu8n0","arb000000007955","USD"],["vc3j60fmxlbu8n0","arb000000010813","USD"],["vc3j60fmxlbu8n0","arb000000011199","USD"],["vc3j60fmxlbu8n0","arb000000008591","USD"],["vc3j60fmxlbu8n0","arb000000005873","USD"],["vc3j60fmxlbu8n0","arc000000357706","USD"],["vc3j60fmxlbu8n0","arb000000003471","USD"],["vc3j60fmxlbu8n0","arl000000886191","USD"],["vc3j60fmxlbu8n0","arb000000009197","USD"],["vc3j60fmxlbu8n0","arb000000006677","USD"],["bg6zm8qx9rhja0r","arb000000008575","USD"],["01jyitwmsz80at2","arb000000005537","USD"],["01jyitwmsz80at2","arl000000885917","USD"],["01jyitwmsz80at2","arb000000001847","USD"],["01jyitwmsz80at2","arb000000008045","USD"],["01jyitwmsz80at2","arb000000006085","USD"],["01jyitwmsz80at2","arb000000005813","USD"],["b1ffhyus8ei9htp","arb000000006555","USD"],["b1ffhyus8ei9htp","arl000000885831","USD"],["b1ffhyus8ei9htp","arb000000009263","USD"],["b1ffhyus8ei9htp","arl000000887187","USD"],["b1ffhyus8ei9htp","arb000000005839","USD"],["b1ffhyus8ei9htp","arl000000886203","USD"],["1yc3iy8um70hshq","arb000000006665","USD"],["1yc3iy8um70hshq","arb000000002241","USD"],["1yc3iy8um70hshq","arb000000002395","USD"],["1yc3iy8um70hshq","arb000000011245","USD"],["1yc3iy8um70hshq","arb000000006989","USD"],["1yc3iy8um70hshq","arb000000001337","USD"],["cgdqq5xq2gc3s67","arb000000006759","USD"],["cgdqq5xq2gc3s67","arb000000002907","USD"],["cgdqq5xq2gc3s67","arb000000004689","USD"],["cgdqq5xq2gc3s67","arb000000010871","USD"],["cgdqq5xq2gc3s67","arb000000006257","USD"],["cgdqq5xq2gc3s67","arl000000886269","USD"],["cgdqq5xq2gc3s67","arb000000006391","USD"],["8jg8ycn3r568ccg","arb000000003115","USD"],["8jg8ycn3r568ccg","arc000000357172","USD"],["8jg8ycn3r568ccg","arb000000008941","USD"],["nkjbhsqv6r9dng6","arb000000011845","USD"],["68po5p6m38nn2cv","arb000000001717","USD"],["h114xfh6o4pt1jn","arb000000005861","USD"],["h114xfh6o4pt1jn","arl000000887273","USD"],["8tym3rmsy7lxedp","arc000000357850","USD"],["8tym3rmsy7lxedp","arb000000002743","USD"],["8tym3rmsy7lxedp","arb000000002687","USD"],["8tym3rmsy7lxedp","arb000000002135","USD"],["8tym3rmsy7lxedp","arb000000004131","USD"],["8tym3rmsy7lxedp","arb000000008923","USD"],["8tym3rmsy7lxedp","arb000000003567","USD"],["x5ma22rabl5zlao","arb000000003029","USD"],["x5ma22rabl5zlao","arb000000012627","USD"],["x5ma22rabl5zlao","arb000000008819","USD"],["x5ma22rabl5zlao","arc000000357043","USD"],["x5ma22rabl5zlao","arb000000010471","USD"],["if7cnarkn3oyfak","arb000000006249","USD"],["if7cnarkn3oyfak","arl000000885913","USD"],["if7cnarkn3oyfak","arb000000008867","USD"],["irzw8rzgxjylwof","arc000000357496","USD"],["irzw8rzgxjylwof","arb000000003331","USD"],["irzw8rzgxjylwof","arb000000002533","USD"],["irzw8rzgxjylwof","arb000000007919","USD"],["irzw8rzgxjylwof","arb000000006583","USD"],["je262fu467dbfr8","arb000000001707","USD"],["je262fu467dbfr8","arb000000005221","USD"],["je262fu467dbfr8","arb000000009531","USD"],["je262fu467dbfr8","arl000000885935","USD"],["qk9rmeoghj53wwd","arb000000006755","USD"],["qk9rmeoghj53wwd","arc000000358252","USD"],["qk9rmeoghj53wwd","arl000000886477","USD"],["qk9rmeoghj53wwd","arb000000011813","USD"],["qk9rmeoghj53wwd","arb000000003835","USD"],["qk9rmeoghj53wwd","arb000000009925","USD"],["qk9rmeoghj53wwd","arb000000006279","USD"],["jn4yg48fdrv1gpu","arb000000000841","USD"],["jn4yg48fdrv1gpu","arb000000002547","USD"],["jn4yg48fdrv1gpu","arb000000000937","USD"],["8gnxjhe9i5u262k","arb000000008461","USD"],["8gnxjhe9i5u262k","arb000000007885","USD"],["8gnxjhe9i5u262k","arb000000012561","USD"],["8gnxjhe9i5u262k","arb000000004483","USD"],["8gnxjhe9i5u262k","arc000000357742","USD"],["8gnxjhe9i5u262k","arb000000003495","USD"],["8gnxjhe9i5u262k","arb000000008175","USD"],["8gnxjhe9i5u262k","arb000000011715","USD"],["ydbjkq92bemddq0","arc000000358429","USD"],["ydbjkq92bemddq0","arb000000002963","USD"],["ydbjkq92bemddq0","arb000000004563","USD"],["ydbjkq92bemddq0","arb000000003953","USD"],["ydbjkq92bemddq0","arl000000886713","USD"],["ydbjkq92bemddq0","arb000000009793","USD"],["ydbjkq92bemddq0","arb000000006485","USD"],["kwtc0u2ixn3oasx","arl000000886395","USD"],["kwtc0u2ixn3oasx","arl000000886957","USD"],["kwtc0u2ixn3oasx","arb000000008453","USD"],["b3yzrepvwqe5dwv","arb000000011223","USD"],["b3yzrepvwqe5dwv","arb000000009165","USD"],["b3yzrepvwqe5dwv","arb000000010609","USD"],["b3yzrepvwqe5dwv","arb000000004045","USD"],["b3yzrepvwqe5dwv","arl000000885747","USD"],["nb7whxfltoz1l0d","arb000000001571","USD"],["nb7whxfltoz1l0d","arb000000012373","USD"],["uxe8ntfat5ndzfq","arb000000006627","USD"],["uxe8ntfat5ndzfq","arb000000004725","USD"],["uxe8ntfat5ndzfq","arb000000006821","USD"],["uxe8ntfat5ndzfq","arb000000012861","USD"],["uxe8ntfat5ndzfq","arb000000011413","USD"],["uxe8ntfat5ndzfq","arb000000009535","USD"],["b4ji7aorkgrjjtz","arl000000886365","USD"],["b4ji7aorkgrjjtz","arb000000011539","USD"],["b4ji7aorkgrjjtz","arb000000000851","USD"],["b4ji7aorkgrjjtz","arb000000007299","USD"],["qfuyehl9gbq6wd7","arb000000006967","USD"],["qfuyehl9gbq6wd7","arb000000007895","USD"],["qfuyehl9gbq6wd7","arb000000011391","USD"],["qfuyehl9gbq6wd7","arb000000009323","USD"],["qfuyehl9gbq6wd7","arb000000004077","USD"],["qfuyehl9gbq6wd7","arb000000009253","USD"],["qfuyehl9gbq6wd7","arb000000002819","USD"],["27b9gd6irq0x7hp","arc000000358291","USD"],["27b9gd6irq0x7hp","arb000000010899","USD"],["27b9gd6irq0x7hp","arl000000885557","USD"],["27b9gd6irq0x7hp","arb000000005633","USD"],["27b9gd6irq0x7hp","arb000000004193","USD"],["27b9gd6irq0x7hp","arb000000003861","USD"],["27b9gd6irq0x7hp","arl000000887157","USD"],["t07i5itdjy8kws3","arb000000006157","USD"],["t07i5itdjy8kws3","arb000000001843","USD"],["t07i5itdjy8kws3","arb000000006993","USD"],["t07i5itdjy8kws3","arb000000006973","USD"],["t07i5itdjy8kws3","arb000000012637","USD"],["hrleh5g9rjl6jdb","arb000000007561","USD"],["1z6zqbas2hcpazj","arb000000002793","USD"],["1z6zqbas2hcpazj","arb000000009273","USD"],["2gsn6cklf74mv28","arb000000004209","USD"],["2gsn6cklf74mv28","arb000000002005","USD"],["2gsn6cklf74mv28","arb000000008359","USD"],["fbz4efcafw578v8","arb000000001629","USD"],["fbz4efcafw578v8","arb000000012635","USD"],["fbz4efcafw578v8","arb000000007905","USD"],["zwnt2ucbnm4b1bm","arb000000001761","USD"],["zwnt2ucbnm4b1bm","arb000000007793","USD"],["zwnt2ucbnm4b1bm","arb000000006621","USD"],["zwnt2ucbnm4b1bm","arb000000006841","USD"],["zwnt2ucbnm4b1bm","arb000000012323","USD"],["ox0lsyk47qqm6l6","arl000000887305","USD"],["ox0lsyk47qqm6l6","arl000000886491","USD"],["ab35uljc98ur5dg","arb000000004997","USD"],["ab35uljc98ur5dg","arb000000011795","USD"],["ab35uljc98ur5dg","arl000000886921","USD"],["ab35uljc98ur5dg","arl000000886983","USD"],["ab35uljc98ur5dg","arb000000009549","USD"],["ab35uljc98ur5dg","arb000000002683","USD"],["1wb0tzk1vi6xpdf","arb000000004869","USD"],["1wb0tzk1vi6xpdf","arb000000005621","USD"],["1wb0tzk1vi6xpdf","arb000000008353","USD"],["1wb0tzk1vi6xpdf","arb000000008171","USD"],["a69b6wfo57u3qk0","arb000000004155","USD"],["a69b6wfo57u3qk0","arc000000357580","USD"],["a69b6wfo57u3qk0","arb000000003387","USD"],["a69b6wfo57u3qk0","arb000000009155","USD"],["a69b6wfo57u3qk0","arb000000008995","USD"],["8wnl8flj8eggo6n","arb000000011399","USD"],["8wnl8flj8eggo6n","arb000000005341","USD"],["8wnl8flj8eggo6n","arb000000004949","USD"],["8wnl8flj8eggo6n","arl000000886737","USD"],["qp7ynhbc8pocx8u","arb000000007433","USD"],["qp7ynhbc8pocx8u","arb000000005831","USD"],["qp7ynhbc8pocx8u","arb000000010045","USD"],["nqavn7k4ut8u23x","arc000000357394","USD"],["nqavn7k4ut8u23x","arb000000003263","USD"],["nqavn7k4ut8u23x","arb000000009201","USD"],["nqavn7k4ut8u23x","arb000000008281","USD"],["nqavn7k4ut8u23x","arb000000010773","USD"],["caqzlokxiljhylm","arb000000002913","USD"],["caqzlokxiljhylm","arb000000012197","USD"],["caqzlokxiljhylm","arb000000007843","USD"],["ie3pvpsbeha66oe","arb000000009301","USD"],["nnu5srlcb488nfw","arb000000007637","USD"],["nnu5srlcb488nfw","arb000000004691","USD"],["nnu5srlcb488nfw","arb000000002075","USD"],["nnu5srlcb488nfw","arb000000001281","USD"],["yjc4f5dmeadnxyc","arb000000005699","USD"],["yjc4f5dmeadnxyc","arc000000358060","USD"],["yjc4f5dmeadnxyc","arb000000003707","USD"],["wj7o70n7kcrdmy2","arb000000007909","USD"],["wj7o70n7kcrdmy2","arb000000007809","USD"],["wj7o70n7kcrdmy2","arb000000008595","USD"],["wj7o70n7kcrdmy2","arb000000005695","USD"],["wj7o70n7kcrdmy2","arb000000009655","USD"],["wj7o70n7kcrdmy2","arb000000010207","USD"],["wj7o70n7kcrdmy2","arb000000002169","USD"],["z356qdhb3sw5b5v","arb000000011893","USD"],["z356qdhb3sw5b5v","arb000000006571","USD"],["1p2r97vfsziuo6k","arb000000005085","USD"],["1p2r97vfsziuo6k","arb000000002207","USD"],["1p2r97vfsziuo6k","arc000000358081","USD"],["1p2r97vfsziuo6k","arb000000003399","USD"],["1p2r97vfsziuo6k","arb000000004837","USD"],["1p2r97vfsziuo6k","arc000000357598","USD"],["1p2r97vfsziuo6k","arb000000003721","USD"],["1p2r97vfsziuo6k","arb000000001439","USD"],["1p2r97vfsziuo6k","arb000000009755","USD"],["1b5moiktehja30x","arb000000010567","USD"],["1b5moiktehja30x","arb000000000855","USD"],["1b5moiktehja30x","arb000000009063","USD"],["1b5moiktehja30x","arb000000011141","USD"],["1b5moiktehja30x","arb000000006359","USD"],["varrfilwkbw4lsz","arb000000008297","USD"],["varrfilwkbw4lsz","arb000000006265","USD"],["ewvx5fcvzi4ga7n","arl000000886851","USD"],["ewvx5fcvzi4ga7n","arb000000012535","USD"],["ewvx5fcvzi4ga7n","arc000000357382","USD"],["ewvx5fcvzi4ga7n","arb000000003255","USD"],["ewvx5fcvzi4ga7n","arl000000885829","USD"],["ewvx5fcvzi4ga7n","arb000000008483","USD"],["zwwredaqh7y8kwx","arb000000003591","USD"],["zwwredaqh7y8kwx","arl000000886843","USD"],["zwwredaqh7y8kwx","arb000000003775","USD"],["zwwredaqh7y8kwx","arl000000885537","USD"],["zwwredaqh7y8kwx","arc000000358162","USD"],["zwwredaqh7y8kwx","arc000000357886","USD"],["zwwredaqh7y8kwx","arb000000012573","USD"],["ep321gcuu9n9xtn","arb000000011237","USD"],["ep321gcuu9n9xtn","arb000000007805","USD"],["ep321gcuu9n9xtn","arb000000000731","USD"],["ep321gcuu9n9xtn","arb000000002317","USD"],["ep321gcuu9n9xtn","arb000000002587","USD"],["v8rk6dv805xao96","arb000000004675","USD"],["v8rk6dv805xao96","arb000000005937","USD"],["v8rk6dv805xao96","arb000000008567","USD"],["v8rk6dv805xao96","arl000000886887","USD"],["v8rk6dv805xao96","arb000000006563","USD"],["j10z8d8bmkb667o","arb000000010305","USD"],["j10z8d8bmkb667o","arb000000002221","USD"],["j10z8d8bmkb667o","arb000000002143","USD"],["whmh20rnzmdvb2f","arb000000012609","USD"],["whmh20rnzmdvb2f","arb000000004407","USD"],["v60ilk7soy48h46","arb000000010361","USD"],["v60ilk7soy48h46","arb000000003303","USD"],["v60ilk7soy48h46","arc000000357454","USD"],["v60ilk7soy48h46","arb000000007797","USD"],["v60ilk7soy48h46","arb000000001263","USD"],["v60ilk7soy48h46","arl000000887025","USD"],["v60ilk7soy48h46","arb000000002259","USD"],["efbhbhsomup54io","arb000000001457","USD"],["efbhbhsomup54io","arl000000886469","USD"],["efbhbhsomup54io","arb000000005989","USD"],["efbhbhsomup54io","arl000000885901","USD"],["efbhbhsomup54io","arb000000012715","USD"],["efbhbhsomup54io","arb000000008617","USD"],["efbhbhsomup54io","arb000000010111","USD"],["efbhbhsomup54io","arb000000011033","USD"],["dgdcloixvtfhc8c","arb000000006577","USD"],["dgdcloixvtfhc8c","arb000000007821","USD"],["dgdcloixvtfhc8c","arb000000006823","USD"],["dgdcloixvtfhc8c","arb000000007929","USD"],["d3g7i9irs9peebw","arb000000011523","USD"],["3a8g8l6vcr8ter5","arb000000007015","USD"],["3a8g8l6vcr8ter5","arb000000001045","USD"],["3a8g8l6vcr8ter5","arb000000009209","USD"],["gpzcjahq156p9lj","arb000000004961","USD"],["gpzcjahq156p9lj","arb000000005329","USD"],["ieb0sm759e8umsq","arb000000007199","USD"],["ieb0sm759e8umsq","arb000000000725","USD"],["ieb0sm759e8umsq","arb000000001845","USD"],["m1sw4kmu52lk9dk","arb000000008159","USD"],["m1sw4kmu52lk9dk","arb000000012075","USD"],["m1sw4kmu52lk9dk","arb000000008119","USD"],["bbpxk2udi5t368t","arb000000001365","USD"],["bbpxk2udi5t368t","arb000000005325","USD"],["bbpxk2udi5t368t","arc000000358132","USD"],["bbpxk2udi5t368t","arb000000003755","USD"],["bbpxk2udi5t368t","arb000000006407","USD"],["cvv2u0aopgc4mvr","arb000000006135","USD"],["cvv2u0aopgc4mvr","arc000000357361","USD"],["cvv2u0aopgc4mvr","arl000000887121","USD"],["cvv2u0aopgc4mvr","arb000000004589","USD"],["cvv2u0aopgc4mvr","arb000000003241","USD"],["bxyey275d3s9bpt","arb000000009569","USD"],["bxyey275d3s9bpt","arb000000002603","USD"],["bxyey275d3s9bpt","arb000000001959","USD"],["bxyey275d3s9bpt","arb000000012253","USD"],["bxyey275d3s9bpt","arb000000001153","USD"],["63mxb9p27qq6nb8","arb000000006395","USD"],["63mxb9p27qq6nb8","arb000000007629","USD"],["63mxb9p27qq6nb8","arb000000007867","USD"],["63mxb9p27qq6nb8","arb000000009471","USD"],["63mxb9p27qq6nb8","arb000000011433","USD"],["r5ftq7birdyvfaj","arl000000885931","USD"],["r5ftq7birdyvfaj","arb000000003831","USD"],["r5ftq7birdyvfaj","arb000000009701","USD"],["r5ftq7birdyvfaj","arb000000007529","USD"],["r5ftq7birdyvfaj","arb000000008269","USD"],["r5ftq7birdyvfaj","arb000000005705","USD"],["r5ftq7birdyvfaj","arb000000005677","USD"],["r5ftq7birdyvfaj","arl000000885721","USD"],["r5ftq7birdyvfaj","arb000000002803","USD"],["r5ftq7birdyvfaj","arc000000358246","USD"],["h5gqyhdbuosr8l6","arb000000012123","USD"],["r3sdcu00npky50t","arb000000008553","USD"],["85o2d0htsjypw5d","arb000000011449","USD"],["85o2d0htsjypw5d","arb000000004677","USD"],["85o2d0htsjypw5d","arb000000012537","USD"],["c9c1fmvjrdew2d5","arc000000357925","USD"],["c9c1fmvjrdew2d5","arb000000012667","USD"],["c9c1fmvjrdew2d5","arb000000003617","USD"],["aollh8glc56e4o4","arb000000009767","USD"],["aollh8glc56e4o4","arb000000007695","USD"],["aollh8glc56e4o4","arb000000004605","USD"],["aollh8glc56e4o4","arl000000887051","USD"],["6ve6bsey8t3vvu1","arb000000011039","USD"],["gz5zo6j7wvap7es","arb000000006615","USD"],["gz5zo6j7wvap7es","arb000000011269","USD"],["gz5zo6j7wvap7es","arl000000885687","USD"],["gz5zo6j7wvap7es","arl000000886271","USD"],["gz5zo6j7wvap7es","arb000000004985","USD"],["l5f6e5tp6bwxec6","arb000000008937","USD"],["4glfw42eysmv5z7","arb000000008619","USD"],["x4wuoddwc7susqu","arl000000886155","USD"],["wmsl6g1wbot0zgi","arb000000002763","USD"],["wmsl6g1wbot0zgi","arb000000012005","USD"],["wmsl6g1wbot0zgi","arb000000007277","USD"],["wmsl6g1wbot0zgi","arb000000001077","USD"],["22epqyudaxbj2yt","arb000000010089","USD"],["22epqyudaxbj2yt","arb000000009493","USD"],["22epqyudaxbj2yt","arb000000010163","USD"],["22epqyudaxbj2yt","arb000000006345","USD"],["22epqyudaxbj2yt","arb000000007567","USD"],["8l892kcgueco8k0","arb000000011317","USD"],["8l892kcgueco8k0","arb000000009105","USD"],["wp5tzkzi9taxu7s","arl000000885915","USD"],["wp5tzkzi9taxu7s","arb000000002109","USD"],["wp5tzkzi9taxu7s","arb000000001915","USD"],["wp5tzkzi9taxu7s","arb000000008023","USD"],["sua8tlyurpt3kzj","arc000000358489","USD"],["sua8tlyurpt3kzj","arb000000002953","USD"],["sua8tlyurpt3kzj","arb000000003993","USD"],["sua8tlyurpt3kzj","arb000000005967","USD"],["hjqfchwrtly9xvk","arb000000004411","USD"],["2gaqpzymwhddsfv","arc000000357568","USD"],["2gaqpzymwhddsfv","arb000000005483","USD"],["2gaqpzymwhddsfv","arb000000009037","USD"],["2gaqpzymwhddsfv","arb000000003379","USD"],["b1oz4m0wqsc5m4y","arb000000008173","USD"],["b1oz4m0wqsc5m4y","arb000000010267","USD"],["b1oz4m0wqsc5m4y","arl000000886227","USD"],["b1oz4m0wqsc5m4y","arl000000886323","USD"],["b1oz4m0wqsc5m4y","arb000000012857","USD"],["b1oz4m0wqsc5m4y","arb000000011825","USD"],["b1oz4m0wqsc5m4y","arb000000004173","USD"],["b1oz4m0wqsc5m4y","arb000000012455","USD"],["eozxp6zeskxclnk","arb000000008907","USD"],["r7vew9ot5cd3ofp","arb000000001909","USD"],["r7vew9ot5cd3ofp","arb000000008821","USD"],["r7vew9ot5cd3ofp","arb000000007025","USD"],["r7vew9ot5cd3ofp","arb000000003299","USD"],["r7vew9ot5cd3ofp","arl000000885633","USD"],["r7vew9ot5cd3ofp","arl000000886107","USD"],["r7vew9ot5cd3ofp","arc000000357448","USD"],["szdmb44lt61j5xn","arb000000006189","USD"],["szdmb44lt61j5xn","arb000000002299","USD"],["szdmb44lt61j5xn","arb000000008605","USD"],["d0g9nhiltseo279","arb000000009289","USD"],["d0g9nhiltseo279","arc000000358141","USD"],["d0g9nhiltseo279","arb000000012151","USD"],["d0g9nhiltseo279","arb000000010881","USD"],["d0g9nhiltseo279","arb000000003761","USD"],["wjlyc5vwxd642d7","arb000000010723","USD"],["wjlyc5vwxd642d7","arb000000012783","USD"],["wjlyc5vwxd642d7","arb000000008627","USD"],["oun396xc5pubv1z","arb000000007227","USD"],["oun396xc5pubv1z","arb000000006985","USD"],["oun396xc5pubv1z","arb000000011407","USD"],["bhplarzz8jcukvr","arb000000002513","USD"],["bhplarzz8jcukvr","arb000000006063","USD"],["bhplarzz8jcukvr","arb000000002119","USD"],["bhplarzz8jcukvr","arb000000002713","USD"],["bhplarzz8jcukvr","arc000000358075","USD"],["bhplarzz8jcukvr","arb000000003717","USD"],["38i5hoibi24d2es","arb000000005575","USD"],["38i5hoibi24d2es","arb000000001447","USD"],["38i5hoibi24d2es","arb000000007295","USD"],["38i5hoibi24d2es","arb000000009451","USD"],["vchd9t6yh0j7s4r","arb000000001583","USD"],["vchd9t6yh0j7s4r","arb000000001371","USD"],["vchd9t6yh0j7s4r","arl000000885909","USD"],["u75jvrrs43md82l","arb000000004805","USD"],["85ctmlc7ux7uiyv","arb000000003359","USD"],["85ctmlc7ux7uiyv","arb000000004801","USD"],["85ctmlc7ux7uiyv","arb000000010831","USD"],["85ctmlc7ux7uiyv","arc000000357538","USD"],["85ctmlc7ux7uiyv","arb000000010245","USD"],["85ctmlc7ux7uiyv","arb000000003289","USD"],["85ctmlc7ux7uiyv","arc000000357433","USD"],["e9h02y3htvzk24l","arb000000009515","USD"],["e9h02y3htvzk24l","arl000000885827","USD"],["e9h02y3htvzk24l","arb000000008981","USD"],["e9h02y3htvzk24l","arb000000006827","USD"],["e9h02y3htvzk24l","arb000000000873","USD"],["e9h02y3htvzk24l","arl000000887143","USD"],["e9h02y3htvzk24l","arb000000011753","USD"],["loeu41ewxn154x5","arb000000011771","USD"],["loeu41ewxn154x5","arc000000357289","USD"],["loeu41ewxn154x5","arb000000001633","USD"],["loeu41ewxn154x5","arb000000003127","USD"],["loeu41ewxn154x5","arl000000885613","USD"],["loeu41ewxn154x5","arb000000001941","USD"],["loeu41ewxn154x5","arb000000009243","USD"],["loeu41ewxn154x5","arc000000357190","USD"],["loeu41ewxn154x5","arb000000003193","USD"],["i1xvetff79da4up","arb000000002557","USD"],["i1xvetff79da4up","arb000000009057","USD"],["i1xvetff79da4up","arl000000886145","USD"],["i1xvetff79da4up","arb000000002991","USD"],["i1xvetff79da4up","arb000000008339","USD"],["i1xvetff79da4up","arb000000006153","USD"],["i1xvetff79da4up","arb000000006051","USD"],["gbe4bwvurn6yo28","arb000000010657","USD"],["gbe4bwvurn6yo28","arb000000009487","USD"],["jncvaoz3g7aze2u","arc000000357625","USD"],["jncvaoz3g7aze2u","arb000000003431","USD"],["jncvaoz3g7aze2u","arl000000886207","USD"],["jncvaoz3g7aze2u","arl000000887197","USD"],["jncvaoz3g7aze2u","arb000000011747","USD"],["jncvaoz3g7aze2u","arb000000002193","USD"],["jncvaoz3g7aze2u","arc000000357646","USD"],["jncvaoz3g7aze2u","arb000000003417","USD"],["dmgetozlomn6jta","arb000000008145","USD"],["dmgetozlomn6jta","arb000000006381","USD"],["bithga4hhg5kl0n","arb000000005841","USD"],["bithga4hhg5kl0n","arb000000001905","USD"],["bithga4hhg5kl0n","arl000000886045","USD"],["qud8thg780qte4z","arb000000005763","USD"],["qud8thg780qte4z","arb000000001993","USD"],["qud8thg780qte4z","arb000000005679","USD"],["qud8thg780qte4z","arb000000009269","USD"],["aq7b4eakhvla2yy","arb000000008355","USD"],["aq7b4eakhvla2yy","arb000000011581","USD"],["aq7b4eakhvla2yy","arb000000004177","USD"],["aq7b4eakhvla2yy","arb000000011315","USD"],["jb9vn847xwya28w","arc000000357760","USD"],["jb9vn847xwya28w","arb000000001481","USD"],["jb9vn847xwya28w","arl000000887431","USD"],["jb9vn847xwya28w","arb000000010959","USD"],["jb9vn847xwya28w","arb000000003507","USD"],["jb9vn847xwya28w","arb000000008155","USD"],["qo6038ql8k4q1q3","arl000000886727","USD"],["qo6038ql8k4q1q3","arb000000008959","USD"],["qo6038ql8k4q1q3","arb000000011623","USD"],["qo6038ql8k4q1q3","arb000000004323","USD"],["pu3dxy2xrqwswp5","arb000000005905","USD"],["pu3dxy2xrqwswp5","arb000000003189","USD"],["pu3dxy2xrqwswp5","arc000000357283","USD"],["pu3dxy2xrqwswp5","arb000000011089","USD"],["pu3dxy2xrqwswp5","arb000000001413","USD"],["d3nll0i4y8m4e9p","arb000000011495","USD"],["d3nll0i4y8m4e9p","arb000000012375","USD"],["d3nll0i4y8m4e9p","arb000000003517","USD"],["d3nll0i4y8m4e9p","arb000000009113","USD"],["d3nll0i4y8m4e9p","arc000000357775","USD"],["d3nll0i4y8m4e9p","arc000000357520","USD"],["d3nll0i4y8m4e9p","arb000000003347","USD"],["d3nll0i4y8m4e9p","arb000000007041","USD"],["fly11scx9uoprtg","arb000000006459","USD"],["fly11scx9uoprtg","arl000000886501","USD"],["fly11scx9uoprtg","arb000000004015","USD"],["gm956k4q3s6f5kp","arc000000357487","USD"],["gm956k4q3s6f5kp","arb000000005743","USD"],["gm956k4q3s6f5kp","arc000000357748","USD"],["gm956k4q3s6f5kp","arb000000003499","USD"],["gm956k4q3s6f5kp","arb000000010109","USD"],["gm956k4q3s6f5kp","arb000000006161","USD"],["gm956k4q3s6f5kp","arb000000008383","USD"],["gm956k4q3s6f5kp","arb000000012725","USD"],["gm956k4q3s6f5kp","arb000000003325","USD"],["78mv7yyd352l0eh","arl000000886031","USD"],["78mv7yyd352l0eh","arb000000011561","USD"],["dun302u2ddbzg6y","arc000000358414","USD"],["dun302u2ddbzg6y","arb000000012119","USD"],["dun302u2ddbzg6y","arb000000001899","USD"],["dun302u2ddbzg6y","arb000000002887","USD"],["dun302u2ddbzg6y","arb000000003943","USD"],["48btkzl2dxzii5o","arb000000010159","USD"],["s48g330top12pr1","arb000000000905","USD"],["s48g330top12pr1","arb000000006965","USD"],["s48g330top12pr1","arb000000001759","USD"],["s48g330top12pr1","arb000000005423","USD"],["s48g330top12pr1","arb000000006539","USD"],["hudttfhsa9wu8cz","arb000000001351","USD"],["hudttfhsa9wu8cz","arb000000002071","USD"],["eljoh0vh1y5topa","arb000000004053","USD"],["eljoh0vh1y5topa","arb000000004357","USD"],["iug83x4ljyv8i3b","arb000000010205","USD"],["iug83x4ljyv8i3b","arb000000011663","USD"],["q9xcz0wd0wt6mii","arb000000010137","USD"],["q9xcz0wd0wt6mii","arb000000012437","USD"],["q9xcz0wd0wt6mii","arb000000010847","USD"],["q9xcz0wd0wt6mii","arl000000886989","USD"],["gqs5cg93gs3vfzm","arc000000357175","USD"],["gqs5cg93gs3vfzm","arc000000357565","USD"],["gqs5cg93gs3vfzm","arb000000003377","USD"],["gqs5cg93gs3vfzm","arb000000009805","USD"],["gqs5cg93gs3vfzm","arb000000003117","USD"],["f6t1omy3j79avp7","arl000000886369","USD"],["f6t1omy3j79avp7","arb000000001531","USD"],["f6t1omy3j79avp7","arb000000010055","USD"],["f6t1omy3j79avp7","arb000000002979","USD"],["igx94xx52ha9wo2","arl000000885675","USD"],["igx94xx52ha9wo2","arb000000012851","USD"],["igx94xx52ha9wo2","arb000000001931","USD"],["4jv1splpllg7gk4","arl000000886945","USD"],["4jv1splpllg7gk4","arb000000006333","USD"],["4jv1splpllg7gk4","arl000000886589","USD"],["4jv1splpllg7gk4","arb000000007445","USD"],["4jv1splpllg7gk4","arb000000012019","USD"],["absrb3dq4w6czhy","arb000000009921","USD"],["absrb3dq4w6czhy","arb000000010675","USD"],["absrb3dq4w6czhy","arb000000004653","USD"],["absrb3dq4w6czhy","arb000000003341","USD"],["absrb3dq4w6czhy","arb000000005355","USD"],["absrb3dq4w6czhy","arc000000357511","USD"],["absrb3dq4w6czhy","arb000000006819","USD"],["absrb3dq4w6czhy","arb000000007967","USD"],["n6tvf8q8ts00dkv","arb000000003257","USD"],["n6tvf8q8ts00dkv","arc000000357385","USD"],["n6tvf8q8ts00dkv","arb000000008919","USD"],["ob6wkvy5h4cr1tk","arb000000007329","USD"],["ob6wkvy5h4cr1tk","arb000000008217","USD"],["ob6wkvy5h4cr1tk","arb000000005733","USD"],["ob6wkvy5h4cr1tk","arb000000012255","USD"],["aqtms8mn1b83ecz","arb000000009457","USD"],["aqtms8mn1b83ecz","arb000000006013","USD"],["aqtms8mn1b83ecz","arl000000887071","USD"],["aqtms8mn1b83ecz","arb000000001247","USD"],["aqtms8mn1b83ecz","arb000000010423","USD"],["ca3m33gnvcmrwrn","arb000000006971","USD"],["ca3m33gnvcmrwrn","arb000000002091","USD"],["ca3m33gnvcmrwrn","arb000000011901","USD"],["ca3m33gnvcmrwrn","arb000000004293","USD"],["ca3m33gnvcmrwrn","arb000000010497","USD"],["ca3m33gnvcmrwrn","arb000000001859","USD"],["h6mu3zk44m3slmp","arb000000009495","USD"],["h6mu3zk44m3slmp","arb000000005651","USD"],["g9rkn7uduv5s7sv","arc000000357733","USD"],["g9rkn7uduv5s7sv","arb000000003441","USD"],["g9rkn7uduv5s7sv","arb000000010637","USD"],["g9rkn7uduv5s7sv","arb000000003489","USD"],["g9rkn7uduv5s7sv","arb000000000925","USD"],["g9rkn7uduv5s7sv","arb000000001295","USD"],["g9rkn7uduv5s7sv","arc000000357661","USD"],["ps4we8yu5s9soi9","arl000000886905","USD"],["ps4we8yu5s9soi9","arb000000004713","USD"],["ps4we8yu5s9soi9","arl000000886073","USD"],["ps4we8yu5s9soi9","arc000000357010","USD"],["ps4we8yu5s9soi9","arb000000003007","USD"],["ps4we8yu5s9soi9","arb000000010439","USD"],["ps4we8yu5s9soi9","arl000000886125","USD"],["141as6h5c8feted","arb000000002825","USD"],["141as6h5c8feted","arb000000002529","USD"],["141as6h5c8feted","arl000000887409","USD"],["9t4flxl2df7ibbu","arb000000000919","USD"],["9t4flxl2df7ibbu","arb000000001043","USD"],["zmb2qyedvdb0lpr","arb000000006021","USD"],["zmb2qyedvdb0lpr","arb000000010541","USD"],["zmb2qyedvdb0lpr","arb000000002871","USD"],["zmb2qyedvdb0lpr","arb000000004481","USD"],["qjgpy4l10br5egd","arb000000011293","USD"],["qjgpy4l10br5egd","arb000000004583","USD"],["qjgpy4l10br5egd","arb000000011191","USD"],["qjgpy4l10br5egd","arb000000007431","USD"],["qjgpy4l10br5egd","arb000000007725","USD"],["qjgpy4l10br5egd","arb000000001085","USD"],["qjgpy4l10br5egd","arb000000001925","USD"],["qjgpy4l10br5egd","arb000000008287","USD"],["qjgpy4l10br5egd","arl000000886061","USD"],["fwlz3q049yt893f","arc000000357685","USD"],["fwlz3q049yt893f","arb000000008533","USD"],["fwlz3q049yt893f","arb000000003457","USD"],["fwlz3q049yt893f","arb000000002403","USD"],["vepi4uikpd6nqfv","arl000000886131","USD"],["vepi4uikpd6nqfv","arb000000005231","USD"],["4796urxpwd7mxyw","arl000000886441","USD"],["4796urxpwd7mxyw","arl000000885695","USD"],["4796urxpwd7mxyw","arb000000001191","USD"],["4796urxpwd7mxyw","arb000000006525","USD"],["q41a1554ictk6ly","arb000000003493","USD"],["q41a1554ictk6ly","arb000000009541","USD"],["q41a1554ictk6ly","arc000000357739","USD"],["q41a1554ictk6ly","arb000000009115","USD"],["m9xlyjflh03c11p","arb000000002849","USD"],["m9xlyjflh03c11p","arb000000009073","USD"],["m9xlyjflh03c11p","arb000000010261","USD"],["yriq5j1pjo8rvdn","arl000000886401","USD"],["yriq5j1pjo8rvdn","arl000000886725","USD"],["yriq5j1pjo8rvdn","arb000000001645","USD"],["yriq5j1pjo8rvdn","arl000000886049","USD"],["yriq5j1pjo8rvdn","arl000000886193","USD"],["z9b27hpqtdvojvk","arb000000001693","USD"],["z9b27hpqtdvojvk","arb000000001831","USD"],["z9b27hpqtdvojvk","arb000000006343","USD"],["z9b27hpqtdvojvk","arb000000001991","USD"],["bax7gc274rpd0ez","arb000000003473","USD"],["bax7gc274rpd0ez","arb000000008091","USD"],["bax7gc274rpd0ez","arc000000357709","USD"],["bax7gc274rpd0ez","arc000000358459","USD"],["bax7gc274rpd0ez","arb000000003973","USD"],["6rc74jb61nlw0rw","arb000000009303","USD"],["6rc74jb61nlw0rw","arb000000006643","USD"],["6rc74jb61nlw0rw","arb000000004399","USD"],["6rc74jb61nlw0rw","arb000000012941","USD"],["8u5f98uyfyawejr","arl000000886097","USD"],["8u5f98uyfyawejr","arb000000009043","USD"],["8u5f98uyfyawejr","arb000000012551","USD"],["8u5f98uyfyawejr","arb000000011259","USD"],["8p0oqy11s292ua4","arl000000886561","USD"],["8p0oqy11s292ua4","arb000000009865","USD"],["8p0oqy11s292ua4","arb000000012331","USD"],["8p0oqy11s292ua4","arb000000010579","USD"],["dowyk6k6xx1fzh6","arb000000009635","USD"],["dowyk6k6xx1fzh6","arb000000005113","USD"],["dowyk6k6xx1fzh6","arb000000012879","USD"],["wzz34lor19y8ee5","arb000000007393","USD"],["wzz34lor19y8ee5","arb000000001421","USD"],["ch81369qdmaaob1","arb000000001635","USD"],["ch81369qdmaaob1","arb000000001529","USD"],["58sox9g46hk416a","arb000000007185","USD"],["58sox9g46hk416a","arb000000006277","USD"],["qys3bxzgwnrj0hr","arb000000004627","USD"],["qys3bxzgwnrj0hr","arb000000003581","USD"],["qys3bxzgwnrj0hr","arb000000008579","USD"],["qys3bxzgwnrj0hr","arb000000012655","USD"],["qys3bxzgwnrj0hr","arc000000357871","USD"],["t6x998oac98aoe2","arl000000886941","USD"],["t6x998oac98aoe2","arb000000010121","USD"],["t6x998oac98aoe2","arb000000005823","USD"],["tmpmb7380hqrw0k","arb000000009985","USD"],["tmpmb7380hqrw0k","arb000000000799","USD"],["k56mk9h1wjiqv92","arb000000009083","USD"],["k56mk9h1wjiqv92","arb000000007093","USD"],["k56mk9h1wjiqv92","arb000000011725","USD"],["k56mk9h1wjiqv92","arb000000001813","USD"],["2uucu6klatr1xpi","arl000000887211","USD"],["2uucu6klatr1xpi","arb000000002945","USD"],["2uucu6klatr1xpi","arb000000001673","USD"],["2uucu6klatr1xpi","arb000000009059","USD"],["rqcqypkt7k3fw4m","arl000000885863","USD"],["rqcqypkt7k3fw4m","arb000000007017","USD"],["rqcqypkt7k3fw4m","arb000000008915","USD"],["rqcqypkt7k3fw4m","arb000000004085","USD"],["rqcqypkt7k3fw4m","arb000000001129","USD"],["rqcqypkt7k3fw4m","arb000000003719","USD"],["rqcqypkt7k3fw4m","arb000000007113","USD"],["rqcqypkt7k3fw4m","arc000000358078","USD"],["47j1e3ufi21tf8e","arl000000886587","USD"],["47j1e3ufi21tf8e","arb000000008671","USD"],["47j1e3ufi21tf8e","arc000000357517","USD"],["47j1e3ufi21tf8e","arb000000011733","USD"],["47j1e3ufi21tf8e","arb000000003345","USD"],["47j1e3ufi21tf8e","arb000000009013","USD"],["y35q62mkrh2gepc","arb000000006931","USD"],["y35q62mkrh2gepc","arb000000009727","USD"],["9wv9d5khcvn40be","arc000000357499","USD"],["9wv9d5khcvn40be","arb000000005669","USD"],["9wv9d5khcvn40be","arb000000001513","USD"],["9wv9d5khcvn40be","arb000000003333","USD"],["9wv9d5khcvn40be","arb000000007175","USD"],["9wv9d5khcvn40be","arb000000009989","USD"],["eydmfsdz3oyk10w","arb000000005871","USD"],["eydmfsdz3oyk10w","arb000000006059","USD"],["eydmfsdz3oyk10w","arl000000886101","USD"],["eydmfsdz3oyk10w","arb000000012287","USD"],["eydmfsdz3oyk10w","arb000000006351","USD"],["eydmfsdz3oyk10w","arl000000886405","USD"],["eydmfsdz3oyk10w","arb000000007777","USD"],["eydmfsdz3oyk10w","arb000000012817","USD"],["bus23s4yehsyjil","arb000000006781","USD"],["bus23s4yehsyjil","arb000000002101","USD"],["bus23s4yehsyjil","arl000000886511","USD"],["bus23s4yehsyjil","arb000000006463","USD"],["75mebzwr4ecpdn3","arc000000358492","USD"],["75mebzwr4ecpdn3","arb000000000889","USD"],["75mebzwr4ecpdn3","arb000000003995","USD"],["75mebzwr4ecpdn3","arb000000005293","USD"],["75mebzwr4ecpdn3","arb000000012265","USD"],["75mebzwr4ecpdn3","arb000000006647","USD"],["tr1bhsxc5iuhrgv","arb000000005425","USD"],["tr1bhsxc5iuhrgv","arb000000011973","USD"],["tr1bhsxc5iuhrgv","arb000000002609","USD"],["d7i7c2m6wctig9b","arl000000887009","USD"],["d7i7c2m6wctig9b","arb000000008489","USD"],["d7i7c2m6wctig9b","arb000000004719","USD"],["yq3aae0bwf6joaq","arb000000006011","USD"],["yq3aae0bwf6joaq","arb000000008509","USD"],["yq3aae0bwf6joaq","arb000000001547","USD"],["yq3aae0bwf6joaq","arb000000000719","USD"],["yq3aae0bwf6joaq","arb000000008665","USD"],["yr0ybz097g5pul7","arb000000007063","USD"],["smtxljs3g3arx17","arb000000005023","USD"],["smtxljs3g3arx17","arb000000011883","USD"],["221bpo5ydpvv5jg","arl000000886547","USD"],["vhuhfgam7poeviw","arb000000006203","USD"],["vhuhfgam7poeviw","arb000000001303","USD"],["vhuhfgam7poeviw","arl000000886985","USD"],["vhuhfgam7poeviw","arb000000011823","USD"],["vhuhfgam7poeviw","arb000000002629","USD"],["kx2c6qvpb5qhjnd","arb000000009781","USD"],["kx2c6qvpb5qhjnd","arb000000007497","USD"],["kx2c6qvpb5qhjnd","arb000000006473","USD"],["rxe83fxxfcww6zy","arb000000009095","USD"],["rxe83fxxfcww6zy","arl000000886135","USD"],["rxe83fxxfcww6zy","arl000000886783","USD"],["rxe83fxxfcww6zy","arl000000886243","USD"],["0ci7v4txv0uombm","arl000000885785","USD"],["0ci7v4txv0uombm","arc000000357523","USD"],["0ci7v4txv0uombm","arb000000002081","USD"],["0ci7v4txv0uombm","arb000000004073","USD"],["0ci7v4txv0uombm","arb000000003349","USD"],["p9tc0qhmu8s8xtp","arb000000012031","USD"],["p9tc0qhmu8s8xtp","arb000000009997","USD"],["p9tc0qhmu8s8xtp","arl000000886735","USD"],["uuheh1glclkzdtr","arb000000003923","USD"],["uuheh1glclkzdtr","arc000000358384","USD"],["uuheh1glclkzdtr","arb000000006115","USD"],["ik2x568n9kw2k6x","arb000000009557","USD"],["ik2x568n9kw2k6x","arb000000001501","USD"],["ik2x568n9kw2k6x","arl000000886701","USD"],["ik2x568n9kw2k6x","arb000000001829","USD"],["ik2x568n9kw2k6x","arb000000007523","USD"],["jnyq911d3alknrt","arb000000007273","USD"],["jnyq911d3alknrt","arb000000008239","USD"],["jnyq911d3alknrt","arb000000006811","USD"],["jnyq911d3alknrt","arb000000002527","USD"],["jnyq911d3alknrt","arb000000002709","USD"],["jnyq911d3alknrt","arb000000010677","USD"],["prpmpcs8uwv94ty","arb000000006491","USD"],["prpmpcs8uwv94ty","arb000000004741","USD"],["prpmpcs8uwv94ty","arb000000003497","USD"],["prpmpcs8uwv94ty","arb000000011281","USD"],["prpmpcs8uwv94ty","arc000000357745","USD"],["prpmpcs8uwv94ty","arb000000010803","USD"],["prpmpcs8uwv94ty","arb000000007889","USD"],["45uwetrdvkkb0iq","arb000000010537","USD"],["45uwetrdvkkb0iq","arb000000006325","USD"],["45uwetrdvkkb0iq","arb000000012927","USD"],["45uwetrdvkkb0iq","arb000000001041","USD"],["45uwetrdvkkb0iq","arb000000011101","USD"],["iv5dh7679x77rcp","arb000000006935","USD"],["iv5dh7679x77rcp","arb000000007727","USD"],["iv5dh7679x77rcp","arb000000008111","USD"],["iv5dh7679x77rcp","arb000000005289","USD"],["nynd050w758hzy4","arb000000009563","USD"],["nynd050w758hzy4","arb000000008415","USD"],["wa8j404nriy8rk2","arb000000011503","USD"],["wa8j404nriy8rk2","arl000000887161","USD"],["wa8j404nriy8rk2","arb000000002183","USD"],["wa8j404nriy8rk2","arb000000010673","USD"],["nmdi28dbdlrifct","arb000000006427","USD"],["s39oifazo5qsdqc","arb000000004955","USD"],["s39oifazo5qsdqc","arb000000003817","USD"],["s39oifazo5qsdqc","arc000000358225","USD"],["s39oifazo5qsdqc","arb000000003033","USD"],["s39oifazo5qsdqc","arc000000357049","USD"],["s39oifazo5qsdqc","arb000000004339","USD"],["h5nv61ltwr6hmlj","arb000000008245","USD"],["h5nv61ltwr6hmlj","arb000000005271","USD"],["h5nv61ltwr6hmlj","arb000000007173","USD"],["h5nv61ltwr6hmlj","arb000000012511","USD"],["h5nv61ltwr6hmlj","arb000000002879","USD"],["h5nv61ltwr6hmlj","arb000000009773","USD"],["h5nv61ltwr6hmlj","arb000000011489","USD"],["h5nv61ltwr6hmlj","arb000000004419","USD"],["h2guoymxwkp2vp9","arc000000358276","USD"],["h2guoymxwkp2vp9","arb000000005179","USD"],["h2guoymxwkp2vp9","arb000000003851","USD"],["pc045z7s6jj81id","arb000000004379","USD"],["pc045z7s6jj81id","arb000000011103","USD"],["pc045z7s6jj81id","arb000000012995","USD"],["pc045z7s6jj81id","arb000000011573","USD"],["884sq8rm73apjm9","arb000000012245","USD"],["884sq8rm73apjm9","arb000000009367","USD"],["884sq8rm73apjm9","arb000000011687","USD"],["884sq8rm73apjm9","arc000000358390","USD"],["884sq8rm73apjm9","arb000000003927","USD"],["884sq8rm73apjm9","arb000000001001","USD"],["6kpvhauw7l5g8wj","arb000000010143","USD"],["6kpvhauw7l5g8wj","arb000000006907","USD"],["6kpvhauw7l5g8wj","arb000000001895","USD"],["89mlmd4bqx9aj1r","arb000000005675","USD"],["89mlmd4bqx9aj1r","arb000000002449","USD"],["o3dxls31xovookz","arl000000886451","USD"],["o3dxls31xovookz","arb000000007211","USD"],["o3dxls31xovookz","arb000000003283","USD"],["o3dxls31xovookz","arb000000006697","USD"],["o3dxls31xovookz","arb000000008689","USD"],["o3dxls31xovookz","arl000000885969","USD"],["o3dxls31xovookz","arc000000357424","USD"],["o3dxls31xovookz","arl000000885837","USD"],["o3dxls31xovookz","arb000000008219","USD"],["nfm2azh4gy99gk3","arb000000005545","USD"],["2vvki02dg8vzvxw","arb000000000793","USD"],["2vvki02dg8vzvxw","arl000000885615","USD"],["2vvki02dg8vzvxw","arb000000002955","USD"],["2vvki02dg8vzvxw","arb000000008109","USD"],["2vvki02dg8vzvxw","arl000000886437","USD"],["2vvki02dg8vzvxw","arb000000003141","USD"],["2vvki02dg8vzvxw","arl000000886791","USD"],["2vvki02dg8vzvxw","arc000000357211","USD"],["2vvki02dg8vzvxw","arb000000007655","USD"],["2vvki02dg8vzvxw","arb000000005253","USD"],["z48ytq0jfr21u3n","arb000000012481","USD"],["z47cwzh7aw62mo0","arb000000002503","USD"],["z47cwzh7aw62mo0","arb000000012877","USD"],["z47cwzh7aw62mo0","arb000000011363","USD"],["tipnkax1pod4of5","arb000000008075","USD"],["tipnkax1pod4of5","arb000000002165","USD"],["tipnkax1pod4of5","arb000000007391","USD"],["tipnkax1pod4of5","arb000000003681","USD"],["tipnkax1pod4of5","arl000000886697","USD"],["tipnkax1pod4of5","arl000000887249","USD"],["tipnkax1pod4of5","arc000000358021","USD"],["tipnkax1pod4of5","arb000000011745","USD"],["tipnkax1pod4of5","arb000000008199","USD"],["agxl0gb0b0azgb4","arb000000000785","USD"],["agxl0gb0b0azgb4","arb000000007829","USD"],["agxl0gb0b0azgb4","arb000000009311","USD"],["agxl0gb0b0azgb4","arb000000008391","USD"],["agxl0gb0b0azgb4","arb000000005531","USD"],["35hzrj3tc4aip23","arb000000007569","USD"],["35hzrj3tc4aip23","arc000000357673","USD"],["35hzrj3tc4aip23","arb000000003449","USD"],["35hzrj3tc4aip23","arb000000008539","USD"],["35hzrj3tc4aip23","arb000000008615","USD"],["xqruyje64y5rnxr","arb000000008997","USD"],["kpxp3xtlllyfah7","arb000000005347","USD"],["kpxp3xtlllyfah7","arb000000005053","USD"],["kpxp3xtlllyfah7","arb000000000727","USD"],["kpxp3xtlllyfah7","arb000000005657","USD"],["kpxp3xtlllyfah7","arb000000008953","USD"],["une2qlqiqf73h11","arb000000012465","USD"],["une2qlqiqf73h11","arl000000886565","USD"],["une2qlqiqf73h11","arb000000010929","USD"],["xno0ujoafy18ux7","arb000000001689","USD"],["xno0ujoafy18ux7","arb000000002315","USD"],["xno0ujoafy18ux7","arb000000007547","USD"],["1gichty939rls0d","arb000000011855","USD"],["1gichty939rls0d","arb000000002903","USD"],["1gichty939rls0d","arb000000006143","USD"],["1gichty939rls0d","arb000000009841","USD"],["brb8a7msj574qwo","arb000000006611","USD"],["brb8a7msj574qwo","arb000000008465","USD"],["brb8a7msj574qwo","arb000000001773","USD"],["brb8a7msj574qwo","arb000000007701","USD"],["cpppax1rdaa4fih","arb000000004723","USD"],["cpppax1rdaa4fih","arb000000006123","USD"],["5pihcdgkqjpyxod","arb000000001691","USD"],["5pihcdgkqjpyxod","arb000000001417","USD"],["80ttnrog5obv2nl","arb000000000861","USD"],["80ttnrog5obv2nl","arb000000010511","USD"],["80ttnrog5obv2nl","arb000000001265","USD"],["80ttnrog5obv2nl","arb000000001057","USD"],["n0598f89nkmqsev","arb000000009651","USD"],["n0598f89nkmqsev","arb000000005019","USD"],["n0598f89nkmqsev","arb000000002621","USD"],["n0598f89nkmqsev","arb000000006417","USD"],["n0598f89nkmqsev","arl000000886861","USD"],["82wmrv66nbtdevb","arb000000003397","USD"],["82wmrv66nbtdevb","arb000000010971","USD"],["82wmrv66nbtdevb","arb000000011279","USD"],["82wmrv66nbtdevb","arb000000007947","USD"],["82wmrv66nbtdevb","arb000000012585","USD"],["82wmrv66nbtdevb","arb000000005439","USD"],["82wmrv66nbtdevb","arc000000357595","USD"],["6a6milhz96179o2","arb000000007271","USD"],["6a6milhz96179o2","arb000000005729","USD"],["6n0w8rdvpuqaec4","arb000000008377","USD"],["6n0w8rdvpuqaec4","arb000000009153","USD"],["6n0w8rdvpuqaec4","arl000000886927","USD"],["6n0w8rdvpuqaec4","arb000000005457","USD"],["bkwgaka9z8rqe3o","arb000000003843","USD"],["bkwgaka9z8rqe3o","arb000000003077","USD"],["bkwgaka9z8rqe3o","arc000000357115","USD"],["bkwgaka9z8rqe3o","arl000000887473","USD"],["bkwgaka9z8rqe3o","arb000000010303","USD"],["bkwgaka9z8rqe3o","arc000000358264","USD"],["bkwgaka9z8rqe3o","arb000000009449","USD"],["0z4fay16hj1tjrq","arl000000886607","USD"],["0z4fay16hj1tjrq","arb000000009533","USD"],["0z4fay16hj1tjrq","arb000000002723","USD"],["pd9uipba8zjy4n5","arb000000009287","USD"],["pd9uipba8zjy4n5","arb000000004455","USD"],["pd9uipba8zjy4n5","arb000000009373","USD"],["pd9uipba8zjy4n5","arb000000001881","USD"],["pd9uipba8zjy4n5","arb000000006681","USD"],["9ohat1b9hd071jg","arb000000012943","USD"],["9ohat1b9hd071jg","arl000000885777","USD"],["9ohat1b9hd071jg","arb000000007759","USD"],["rtpj37stsi3rxfs","arb000000007667","USD"],["rtpj37stsi3rxfs","arb000000006027","USD"],["0zdrjtnb6423tg3","arc000000358039","USD"],["0zdrjtnb6423tg3","arb000000002153","USD"],["0zdrjtnb6423tg3","arb000000003693","USD"],["0zdrjtnb6423tg3","arb000000008033","USD"],["p2lj2bwst6sulhw","arb000000008183","USD"],["p2lj2bwst6sulhw","arb000000010781","USD"],["p2lj2bwst6sulhw","arb000000009205","USD"],["p2lj2bwst6sulhw","arb000000002355","USD"],["k2g09x3iddaem9t","arb000000002111","USD"],["k2g09x3iddaem9t","arl000000885983","USD"],["k2g09x3iddaem9t","arb000000009615","USD"],["k2g09x3iddaem9t","arl000000887263","USD"],["rex7kzmtmlz0o58","arb000000006179","USD"],["rex7kzmtmlz0o58","arb000000010927","USD"],["rex7kzmtmlz0o58","arb000000008705","USD"],["rex7kzmtmlz0o58","arl000000885673","USD"],["rex7kzmtmlz0o58","arl000000885741","USD"],["yafuuaxr32ycl3n","arb000000003907","USD"],["yafuuaxr32ycl3n","arc000000358360","USD"],["yafuuaxr32ycl3n","arb000000007991","USD"],["pyfg3lnpqannuft","arb000000009679","USD"],["pyfg3lnpqannuft","arb000000001557","USD"],["pyfg3lnpqannuft","arb000000000865","USD"],["z539hndyi6ztxqj","arb000000010555","USD"],["z539hndyi6ztxqj","arb000000010645","USD"],["z539hndyi6ztxqj","arb000000012991","USD"],["c08l0t8crd3xk5i","arl000000887191","USD"],["l9m5p7gqr2mahvh","arb000000005321","USD"],["l9m5p7gqr2mahvh","arb000000003097","USD"],["l9m5p7gqr2mahvh","arc000000357145","USD"],["l9m5p7gqr2mahvh","arb000000009631","USD"],["l9m5p7gqr2mahvh","arb000000007485","USD"],["l9m5p7gqr2mahvh","arl000000886671","USD"],["e5i393v09ulwn0p","arb000000003759","USD"],["e5i393v09ulwn0p","arl000000886875","USD"],["e5i393v09ulwn0p","arc000000358138","USD"],["e5i393v09ulwn0p","arb000000001097","USD"],["e5i393v09ulwn0p","arb000000012727","USD"],["q8were0t0wv681y","arb000000004735","USD"],["q8were0t0wv681y","arb000000006663","USD"],["q8were0t0wv681y","arb000000001543","USD"],["6cblq0zn5gmh43g","arb000000004143","USD"],["6cblq0zn5gmh43g","arb000000001475","USD"],["6cblq0zn5gmh43g","arb000000007307","USD"],["6cblq0zn5gmh43g","arb000000011247","USD"],["bjlrplordf20ksj","arb000000005837","USD"],["bjlrplordf20ksj","arc000000358219","USD"],["bjlrplordf20ksj","arc000000358180","USD"],["bjlrplordf20ksj","arb000000003813","USD"],["bjlrplordf20ksj","arb000000003787","USD"],["bjlrplordf20ksj","arb000000001395","USD"],["ns11d35es20bot5","arb000000011657","USD"],["ns11d35es20bot5","arb000000001523","USD"],["ns11d35es20bot5","arb000000004237","USD"],["6mf0r8vdb53s9t2","arb000000011365","USD"],["y49ng0lj4a2scdc","arb000000008661","USD"],["y49ng0lj4a2scdc","arb000000001361","USD"],["y49ng0lj4a2scdc","arb000000007711","USD"],["y49ng0lj4a2scdc","arb000000012963","USD"],["90fka204vglw87n","arb000000004223","USD"],["90fka204vglw87n","arc000000357649","USD"],["90fka204vglw87n","arb000000009643","USD"],["90fka204vglw87n","arb000000003433","USD"],["90fka204vglw87n","arb000000012315","USD"],["su0gen48pmybir7","arb000000005115","USD"],["su0gen48pmybir7","arb000000002483","USD"],["su0gen48pmybir7","arb000000004877","USD"],["su0gen48pmybir7","arb000000001217","USD"],["ch0qwzgelzx1o3l","arb000000012365","USD"],["ch0qwzgelzx1o3l","arb000000007527","USD"],["ch0qwzgelzx1o3l","arb000000007019","USD"],["ch0qwzgelzx1o3l","arb000000008573","USD"],["ch0qwzgelzx1o3l","arb000000011937","USD"],["ch0qwzgelzx1o3l","arb000000011037","USD"],["dn6x4huhlzczatt","arb000000005043","USD"],["ul63zyr2qpucbfg","arb000000011723","USD"],["ul63zyr2qpucbfg","arb000000008259","USD"],["z5cfhl40cezr789","arb000000004609","USD"],["z5cfhl40cezr789","arb000000000729","USD"],["z5cfhl40cezr789","arb000000006273","USD"],["z5cfhl40cezr789","arl000000887077","USD"],["ahzthxxpwasd652","arl000000886733","USD"],["ahzthxxpwasd652","arb000000012447","USD"],["ahzthxxpwasd652","arb000000007849","USD"],["tjim6696gn3wv6p","arb000000006479","USD"],["tjim6696gn3wv6p","arb000000009239","USD"],["tjim6696gn3wv6p","arc000000357892","USD"],["tjim6696gn3wv6p","arb000000008769","USD"],["tjim6696gn3wv6p","arb000000006683","USD"],["tjim6696gn3wv6p","arb000000003595","USD"],["u85k9avklf4ivms","arb000000012489","USD"],["u85k9avklf4ivms","arb000000009555","USD"],["u85k9avklf4ivms","arb000000004219","USD"],["u85k9avklf4ivms","arb000000003363","USD"],["u85k9avklf4ivms","arb000000011109","USD"],["u85k9avklf4ivms","arc000000357544","USD"],["e9l8gq3k7ao2dq4","arl000000886751","USD"],["e9l8gq3k7ao2dq4","arb000000004971","USD"],["e9l8gq3k7ao2dq4","arb000000002597","USD"],["mpcftpcuehf3vtf","arl000000887083","USD"],["mpcftpcuehf3vtf","arb000000002211","USD"],["mpcftpcuehf3vtf","arb000000011241","USD"],["mpcftpcuehf3vtf","arb000000001975","USD"],["wmz34g0vd9ppjjh","arb000000006049","USD"],["wmz34g0vd9ppjjh","arb000000008707","USD"],["l38vxcrbre1yq5n","arc000000358057","USD"],["l38vxcrbre1yq5n","arb000000009409","USD"],["l38vxcrbre1yq5n","arb000000008677","USD"],["l38vxcrbre1yq5n","arb000000003705","USD"],["l38vxcrbre1yq5n","arb000000010083","USD"],["l38vxcrbre1yq5n","arb000000005523","USD"],["sed8jl7hn5ew11x","arl000000885667","USD"],["sed8jl7hn5ew11x","arb000000003291","USD"],["sed8jl7hn5ew11x","arc000000357436","USD"],["qx93sy30zk7ixf9","arb000000003733","USD"],["qx93sy30zk7ixf9","arc000000358099","USD"],["qx93sy30zk7ixf9","arb000000004819","USD"],["qx93sy30zk7ixf9","arb000000007039","USD"],["l1pk86tjv9s3q24","arb000000009657","USD"],["l1pk86tjv9s3q24","arb000000005793","USD"],["l1pk86tjv9s3q24","arb000000001541","USD"],["l1pk86tjv9s3q24","arl000000887429","USD"],["m5mfsm2joq5ha9z","arb000000006195","USD"],["m5mfsm2joq5ha9z","arb000000000853","USD"],["m5mfsm2joq5ha9z","arb000000004979","USD"],["qpxxvbp652znpph","arb000000008445","USD"],["qpxxvbp652znpph","arb000000001835","USD"],["qpxxvbp652znpph","arb000000012527","USD"],["qpxxvbp652znpph","arb000000006657","USD"],["seyd7cqbuj09byq","arb000000006271","USD"],["nf20n6wafryq9yb","arb000000008123","USD"],["nf20n6wafryq9yb","arb000000010457","USD"],["nf20n6wafryq9yb","arb000000012441","USD"],["9nr2lgf6jdelivo","arb000000001781","USD"],["9nr2lgf6jdelivo","arb000000003463","USD"],["9nr2lgf6jdelivo","arc000000357694","USD"],["mihtd9t8gk64wns","arl000000886885","USD"],["mihtd9t8gk64wns","arl000000886247","USD"],["mihtd9t8gk64wns","arb000000012915","USD"],["mihtd9t8gk64wns","arb000000010589","USD"],["b4cgjbds0rg6bw8","arl000000886111","USD"],["b4cgjbds0rg6bw8","arb000000001083","USD"],["fgzwab08p94b94u","arb000000001875","USD"],["i6rrhm94m5gn1zi","arb000000012381","USD"],["i6rrhm94m5gn1zi","arb000000008323","USD"],["i6rrhm94m5gn1zi","arl000000885635","USD"],["i6rrhm94m5gn1zi","arc000000357559","USD"],["i6rrhm94m5gn1zi","arb000000003373","USD"],["i6rrhm94m5gn1zi","arb000000004437","USD"],["i6rrhm94m5gn1zi","arb000000005515","USD"],["i6rrhm94m5gn1zi","arb000000006487","USD"],["gsx403rg4o99y04","arb000000005727","USD"],["gsx403rg4o99y04","arb000000004791","USD"],["gsx403rg4o99y04","arl000000886233","USD"],["gsx403rg4o99y04","arb000000001163","USD"],["gsx403rg4o99y04","arl000000886711","USD"],["gsx403rg4o99y04","arb000000008407","USD"],["gsx403rg4o99y04","arl000000886345","USD"],["qkytqwgzz5kv9eh","arc000000357967","USD"],["qkytqwgzz5kv9eh","arb000000004319","USD"],["qkytqwgzz5kv9eh","arl000000887223","USD"],["qkytqwgzz5kv9eh","arb000000003645","USD"],["haso17tiz7r6qzc","arb000000002025","USD"],["haso17tiz7r6qzc","arb000000010185","USD"],["haso17tiz7r6qzc","arb000000004105","USD"],["haso17tiz7r6qzc","arb000000005477","USD"],["haso17tiz7r6qzc","arb000000007709","USD"],["iqml5ue1muzo3zf","arl000000885697","USD"],["yxtxbtag7rc74f4","arl000000885905","USD"],["yxtxbtag7rc74f4","arb000000004277","USD"],["yxtxbtag7rc74f4","arl000000887185","USD"],["yxtxbtag7rc74f4","arb000000010251","USD"],["2fil4tp784mps6g","arl000000886703","USD"],["2fil4tp784mps6g","arc000000358066","USD"],["2fil4tp784mps6g","arb000000003711","USD"],["2fil4tp784mps6g","arb000000011727","USD"],["2fil4tp784mps6g","arb000000008695","USD"],["f9pv92p5bfncbln","arb000000007489","USD"],["f9pv92p5bfncbln","arb000000007817","USD"],["8bvtmqfd2vurn6b","arb000000009745","USD"],["8bvtmqfd2vurn6b","arb000000012107","USD"],["8bvtmqfd2vurn6b","arb000000004599","USD"],["8bvtmqfd2vurn6b","arb000000002461","USD"],["bdzgl8y7uw84ygo","arl000000886241","USD"],["bdzgl8y7uw84ygo","arb000000005377","USD"],["bdzgl8y7uw84ygo","arb000000001223","USD"],["06jyohq0h1e93pv","arb000000005357","USD"],["06jyohq0h1e93pv","arb000000004845","USD"],["hnasvvx4177yyw0","arb000000010487","USD"],["hnasvvx4177yyw0","arb000000005299","USD"],["fpam9encmkm53sz","arb000000001863","USD"],["fpam9encmkm53sz","arb000000011915","USD"],["5y972jajneityxt","arb000000000903","USD"],["5y972jajneityxt","arb000000003821","USD"],["5y972jajneityxt","arb000000001103","USD"],["5y972jajneityxt","arb000000008103","USD"],["5y972jajneityxt","arb000000012393","USD"],["5y972jajneityxt","arc000000358231","USD"],["quwx3qnrzxh2qai","arb000000008629","USD"],["quwx3qnrzxh2qai","arb000000011345","USD"],["quwx3qnrzxh2qai","arb000000008917","USD"],["quwx3qnrzxh2qai","arb000000010747","USD"],["huszw5fu3bsljs4","arb000000007389","USD"],["huszw5fu3bsljs4","arb000000001151","USD"],["huszw5fu3bsljs4","arb000000001585","USD"],["huszw5fu3bsljs4","arb000000006569","USD"],["huszw5fu3bsljs4","arb000000007437","USD"],["huszw5fu3bsljs4","arb000000004611","USD"],["h3sy71wrglpa6r2","arc000000357553","USD"],["h3sy71wrglpa6r2","arb000000003369","USD"],["h3sy71wrglpa6r2","arb000000007517","USD"],["h3sy71wrglpa6r2","arb000000000697","USD"],["h566w86sxum0pdu","arb000000009645","USD"],["h566w86sxum0pdu","arb000000005583","USD"],["bt6c0z09wamx5ia","arb000000008901","USD"],["bt6c0z09wamx5ia","arl000000886597","USD"],["x2gty70hr2rmrz1","arb000000012697","USD"],["kch6dmr86xdhd8o","arb000000006911","USD"],["kch6dmr86xdhd8o","arb000000011079","USD"],["kch6dmr86xdhd8o","arb000000012833","USD"],["kch6dmr86xdhd8o","arb000000012853","USD"],["kch6dmr86xdhd8o","arb000000012695","USD"],["o6dtgzs21ibesfk","arb000000011151","USD"],["o6dtgzs21ibesfk","arb000000008241","USD"],["o6dtgzs21ibesfk","arl000000887355","USD"],["o6dtgzs21ibesfk","arb000000009381","USD"],["o6dtgzs21ibesfk","arb000000005613","USD"],["o6dtgzs21ibesfk","arb000000010043","USD"],["n9ugscmrabe449w","arb000000006175","USD"],["n9ugscmrabe449w","arb000000011583","USD"],["n9ugscmrabe449w","arb000000000843","USD"],["n9ugscmrabe449w","arb000000009689","USD"],["n9ugscmrabe449w","arb000000010281","USD"],["bwvcftv2wh7kwlh","arb000000012217","USD"],["bwvcftv2wh7kwlh","arl000000886217","USD"],["bwvcftv2wh7kwlh","arb000000005373","USD"],["bwvcftv2wh7kwlh","arl000000887247","USD"],["jkhkk0mrazs3a32","arb000000001357","USD"],["jkhkk0mrazs3a32","arb000000012391","USD"],["jkhkk0mrazs3a32","arl000000886609","USD"],["jkhkk0mrazs3a32","arb000000008161","USD"],["rcntlhxwovecvqn","arb000000006773","USD"],["rcntlhxwovecvqn","arb000000000661","USD"],["rcntlhxwovecvqn","arb000000009613","USD"],["rcntlhxwovecvqn","arb000000010405","USD"],["rcntlhxwovecvqn","arb000000011923","USD"],["r7tq6tulhfla0kd","arb000000011499","USD"],["r7tq6tulhfla0kd","arl000000887147","USD"],["tt1mxkqo50r7zhu","arb000000004083","USD"],["tt1mxkqo50r7zhu","arb000000007771","USD"],["363iyys8h17wokc","arb000000001553","USD"],["363iyys8h17wokc","arb000000002997","USD"],["363iyys8h17wokc","arb000000005487","USD"],["363iyys8h17wokc","arb000000009927","USD"],["363iyys8h17wokc","arl000000886341","USD"],["ml52me6lb13ow3a","arb000000011649","USD"],["ml52me6lb13ow3a","arb000000008899","USD"],["n3667jrrrbaunt6","arb000000007067","USD"],["n3667jrrrbaunt6","arb000000001731","USD"],["n3667jrrrbaunt6","arb000000005327","USD"],["n3667jrrrbaunt6","arb000000008069","USD"],["n3667jrrrbaunt6","arb000000007943","USD"],["29qvqbhyc9d4gix","arb000000005409","USD"],["29qvqbhyc9d4gix","arb000000002059","USD"],["29qvqbhyc9d4gix","arb000000010301","USD"],["29qvqbhyc9d4gix","arb000000011349","USD"],["29qvqbhyc9d4gix","arb000000009207","USD"],["29qvqbhyc9d4gix","arb000000011959","USD"],["vkgs09lihe4xxig","arb000000012559","USD"],["vkgs09lihe4xxig","arb000000009787","USD"],["tlbtuvnr1jyr3zc","arb000000012755","USD"],["tlbtuvnr1jyr3zc","arb000000011021","USD"],["kte28tgh17empz7","arb000000004617","USD"],["kte28tgh17empz7","arb000000004189","USD"],["kte28tgh17empz7","arl000000886581","USD"],["kte28tgh17empz7","arb000000004279","USD"],["kte28tgh17empz7","arb000000008345","USD"],["kte28tgh17empz7","arb000000011303","USD"],["kte28tgh17empz7","arb000000005449","USD"],["756m1babzcwy7ab","arb000000006167","USD"],["756m1babzcwy7ab","arb000000005419","USD"],["756m1babzcwy7ab","arb000000006669","USD"],["756m1babzcwy7ab","arb000000010085","USD"],["zlkoztsi2k6z0qe","arb000000008163","USD"],["zlkoztsi2k6z0qe","arb000000002889","USD"],["zlkoztsi2k6z0qe","arb000000003435","USD"],["zlkoztsi2k6z0qe","arc000000357652","USD"],["zlkoztsi2k6z0qe","arb000000006125","USD"],["zlkoztsi2k6z0qe","arl000000885921","USD"],["n0vbmxdkugo1mh8","arb000000005827","USD"],["n0vbmxdkugo1mh8","arb000000010655","USD"],["n0vbmxdkugo1mh8","arb000000010411","USD"],["n0vbmxdkugo1mh8","arc000000357757","USD"],["n0vbmxdkugo1mh8","arb000000003505","USD"],["xsgy2x4n2ssgh1w","arb000000007089","USD"],["xsgy2x4n2ssgh1w","arb000000011497","USD"],["xsgy2x4n2ssgh1w","arb000000012705","USD"],["xsgy2x4n2ssgh1w","arb000000005249","USD"],["xsgy2x4n2ssgh1w","arb000000009075","USD"],["xsgy2x4n2ssgh1w","arb000000006133","USD"],["zm5j2bfmkpefma1","arb000000001005","USD"],["zm5j2bfmkpefma1","arl000000886495","USD"],["zm5j2bfmkpefma1","arb000000004909","USD"],["zm5j2bfmkpefma1","arb000000012395","USD"],["zm5j2bfmkpefma1","arb000000010653","USD"],["y7oknlwobzacwf7","arc000000357091","USD"],["y7oknlwobzacwf7","arb000000009887","USD"],["y7oknlwobzacwf7","arb000000008451","USD"],["y7oknlwobzacwf7","arb000000004451","USD"],["y7oknlwobzacwf7","arb000000007181","USD"],["y7oknlwobzacwf7","arb000000003061","USD"],["pwys72t7zpeemxk","arb000000009185","USD"],["pwys72t7zpeemxk","arb000000005039","USD"],["pwys72t7zpeemxk","arl000000886185","USD"],["pwys72t7zpeemxk","arb000000004771","USD"],["fhvupylox4mn6jc","arb000000002657","USD"],["fhvupylox4mn6jc","arb000000006495","USD"],["fhvupylox4mn6jc","arl000000886129","USD"],["fhvupylox4mn6jc","arb000000006347","USD"],["2fi784ilnqhojvx","arb000000005261","USD"],["2fi784ilnqhojvx","arb000000005269","USD"],["2fi784ilnqhojvx","arb000000011765","USD"],["vbcwi727s5zpn4v","arb000000007223","USD"],["vbcwi727s5zpn4v","arl000000885601","USD"],["vbcwi727s5zpn4v","arb000000006679","USD"],["vbcwi727s5zpn4v","arb000000011979","USD"],["vbcwi727s5zpn4v","arb000000005413","USD"],["vbcwi727s5zpn4v","arb000000012733","USD"],["uhmmpnhdt75il40","arb000000012593","USD"],["t08i97vyid47amy","arb000000009351","USD"],["t08i97vyid47amy","arb000000009017","USD"],["t08i97vyid47amy","arb000000010713","USD"],["udaas3p023jjlkt","arb000000010901","USD"],["udaas3p023jjlkt","arb000000010633","USD"],["udaas3p023jjlkt","arb000000012279","USD"],["dl4z0sfa9pzgenn","arl000000886567","USD"],["dl4z0sfa9pzgenn","arb000000003977","USD"],["dl4z0sfa9pzgenn","arc000000358465","USD"],["dl4z0sfa9pzgenn","arb000000002569","USD"],["dl4z0sfa9pzgenn","arb000000009169","USD"],["dl4z0sfa9pzgenn","arb000000000933","USD"],["uaouyfjza596bde","arb000000003529","USD"],["uaouyfjza596bde","arb000000006435","USD"],["uaouyfjza596bde","arb000000012645","USD"],["uaouyfjza596bde","arb000000005059","USD"],["uaouyfjza596bde","arc000000357793","USD"],["uaouyfjza596bde","arb000000008113","USD"],["okg6wp1d7yecizy","arb000000010837","USD"],["zpqtgyun1w31uxo","arb000000012163","USD"],["zpqtgyun1w31uxo","arb000000010047","USD"],["zpqtgyun1w31uxo","arb000000012541","USD"],["zpqtgyun1w31uxo","arb000000005345","USD"],["cincp3v8hwkc77a","arb000000011683","USD"],["cincp3v8hwkc77a","arb000000009653","USD"],["cincp3v8hwkc77a","arl000000886529","USD"],["cincp3v8hwkc77a","arb000000010133","USD"],["cincp3v8hwkc77a","arb000000008817","USD"],["cincp3v8hwkc77a","arl000000886803","USD"],["yumlp3z6myz6y41","arb000000000913","USD"],["yumlp3z6myz6y41","arc000000357337","USD"],["yumlp3z6myz6y41","arb000000010945","USD"],["yumlp3z6myz6y41","arb000000011229","USD"],["yumlp3z6myz6y41","arb000000007439","USD"],["yumlp3z6myz6y41","arb000000002147","USD"],["yumlp3z6myz6y41","arb000000003225","USD"],["yumlp3z6myz6y41","arb000000004417","USD"],["t0z1noe7tp4u8pk","arb000000009343","USD"],["t0z1noe7tp4u8pk","arb000000003919","USD"],["t0z1noe7tp4u8pk","arb000000004547","USD"],["t0z1noe7tp4u8pk","arl000000886631","USD"],["t0z1noe7tp4u8pk","arc000000358378","USD"],["t0z1noe7tp4u8pk","arb000000012231","USD"],["dcqjhp0tgjisabx","arb000000008889","USD"],["dcqjhp0tgjisabx","arb000000004375","USD"],["dcqjhp0tgjisabx","arb000000011181","USD"],["dcqjhp0tgjisabx","arb000000004061","USD"],["wns3656zaut5hwg","arb000000008811","USD"],["wns3656zaut5hwg","arb000000010825","USD"],["wns3656zaut5hwg","arb000000005653","USD"],["wns3656zaut5hwg","arb000000012519","USD"],["wns3656zaut5hwg","arb000000006269","USD"],["wns3656zaut5hwg","arl000000885765","USD"],["wns3656zaut5hwg","arb000000010973","USD"],["22wc25rbyt8uo5z","arb000000012223","USD"],["22wc25rbyt8uo5z","arb000000011195","USD"],["22wc25rbyt8uo5z","arb000000000909","USD"],["22wc25rbyt8uo5z","arb000000009753","USD"],["22wc25rbyt8uo5z","arb000000007251","USD"],["22wc25rbyt8uo5z","arb000000007949","USD"],["9eah467m6eo44yy","arb000000002045","USD"],["9eah467m6eo44yy","arb000000010669","USD"],["9eah467m6eo44yy","arb000000009607","USD"],["9eah467m6eo44yy","arb000000012185","USD"],["9eah467m6eo44yy","arb000000001383","USD"],["8e7rqaduz65m28t","arb000000009499","USD"],["8e7rqaduz65m28t","arb000000001491","USD"],["22y4gg72ow9d18j","arb000000003003","USD"],["22y4gg72ow9d18j","arb000000005407","USD"],["22y4gg72ow9d18j","arb000000011593","USD"],["22y4gg72ow9d18j","arb000000011333","USD"],["22y4gg72ow9d18j","arc000000357004","USD"],["22y4gg72ow9d18j","arb000000010309","USD"],["7wjxowkcc8rcrwx","arb000000000709","USD"],["7wjxowkcc8rcrwx","arb000000009945","USD"],["7wjxowkcc8rcrwx","arb000000010865","USD"],["7wjxowkcc8rcrwx","arb000000002371","USD"],["y7lh7a06zsrdtyr","arb000000006709","USD"],["y7lh7a06zsrdtyr","arb000000012905","USD"],["y7lh7a06zsrdtyr","arb000000012775","USD"],["y7lh7a06zsrdtyr","arb000000010935","USD"],["y7lh7a06zsrdtyr","arb000000004943","USD"],["b7wxhchjya34czw","arb000000011933","USD"],["b7wxhchjya34czw","arb000000001107","USD"],["pmioblgqm1gfkan","arb000000003913","USD"],["pmioblgqm1gfkan","arb000000012669","USD"],["pmioblgqm1gfkan","arb000000010891","USD"],["pmioblgqm1gfkan","arb000000004527","USD"],["pmioblgqm1gfkan","arb000000006991","USD"],["pmioblgqm1gfkan","arc000000358369","USD"],["de69v5iic9hzche","arb000000011961","USD"],["de69v5iic9hzche","arb000000005161","USD"],["de69v5iic9hzche","arb000000008877","USD"],["de69v5iic9hzche","arb000000008387","USD"],["b0g7thzr5olenkt","arb000000004445","USD"],["lzhtl73b72xiwz2","arb000000008871","USD"],["lzhtl73b72xiwz2","arl000000885717","USD"],["lzhtl73b72xiwz2","arb000000005313","USD"],["lzhtl73b72xiwz2","arb000000012767","USD"],["lzhtl73b72xiwz2","arb000000006951","USD"],["l9fe21ydccuafwh","arb000000005681","USD"],["l9fe21ydccuafwh","arb000000008349","USD"],["l9fe21ydccuafwh","arb000000002357","USD"],["l9fe21ydccuafwh","arb000000008013","USD"],["l9fe21ydccuafwh","arb000000007335","USD"],["l9fe21ydccuafwh","arb000000012611","USD"],["l9fe21ydccuafwh","arb000000004433","USD"],["emie3sklytmkuf6","arb000000010209","USD"],["emie3sklytmkuf6","arb000000007057","USD"],["pli6ilbh64xnvge","arb000000002555","USD"],["pli6ilbh64xnvge","arb000000002097","USD"],["pli6ilbh64xnvge","arl000000886601","USD"],["m9bcz38g64e6xcl","arb000000010129","USD"],["m9bcz38g64e6xcl","arb000000006137","USD"],["m9bcz38g64e6xcl","arb000000011459","USD"],["m9bcz38g64e6xcl","arl000000886371","USD"],["m9bcz38g64e6xcl","arb000000006897","USD"],["tbu2mkp0j2zuyhf","arb000000008315","USD"],["tbu2mkp0j2zuyhf","arb000000006131","USD"],["tbu2mkp0j2zuyhf","arb000000011307","USD"],["7g98t3se6eiv8f7","arb000000008925","USD"],["7g98t3se6eiv8f7","arb000000010719","USD"],["7g98t3se6eiv8f7","arb000000006761","USD"],["gjdo7587qqun556","arb000000007313","USD"],["gjdo7587qqun556","arb000000000723","USD"],["gjdo7587qqun556","arl000000886615","USD"],["gjdo7587qqun556","arb000000002427","USD"],["gjdo7587qqun556","arb000000006465","USD"],["gjdo7587qqun556","arb000000010327","USD"],["gjdo7587qqun556","arb000000007977","USD"],["49vzxgxi7rxqr19","arl000000887353","USD"],["49vzxgxi7rxqr19","arb000000012605","USD"],["49vzxgxi7rxqr19","arb000000011925","USD"],["49vzxgxi7rxqr19","arb000000003829","USD"],["49vzxgxi7rxqr19","arb000000006311","USD"],["49vzxgxi7rxqr19","arc000000358243","USD"],["49vzxgxi7rxqr19","arb000000006651","USD"],["44xv2mwsv6r260k","arb000000001963","USD"],["44xv2mwsv6r260k","arl000000887193","USD"],["44xv2mwsv6r260k","arb000000007237","USD"],["44xv2mwsv6r260k","arb000000008477","USD"],["44xv2mwsv6r260k","arb000000009251","USD"],["44xv2mwsv6r260k","arl000000886277","USD"],["uenbedlk4ox9zpt","arb000000007795","USD"],["2a4hp1um7hii8qb","arb000000004349","USD"],["2a4hp1um7hii8qb","arb000000007625","USD"],["2a4hp1um7hii8qb","arb000000002399","USD"],["2a4hp1um7hii8qb","arl000000885501","USD"],["c9pdlte38yy4elh","arb000000002141","USD"],["c9pdlte38yy4elh","arb000000005527","USD"],["8ev8moyrhmlovcc","arb000000008803","USD"],["po49dtt8ejldt6d","arl000000886293","USD"],["po49dtt8ejldt6d","arb000000005927","USD"],["po49dtt8ejldt6d","arb000000010231","USD"],["po49dtt8ejldt6d","arb000000006939","USD"],["po49dtt8ejldt6d","arb000000001027","USD"],["ocxb8t5wf7hci71","arb000000011767","USD"],["ocxb8t5wf7hci71","arb000000011343","USD"],["78gz0leolcd5qyb","arl000000887433","USD"],["78gz0leolcd5qyb","arb000000005799","USD"],["vqubuhl93a8nf7k","arb000000012501","USD"],["vqubuhl93a8nf7k","arb000000002785","USD"],["vqubuhl93a8nf7k","arl000000886641","USD"],["vqubuhl93a8nf7k","arb000000001867","USD"],["vqubuhl93a8nf7k","arb000000010069","USD"],["jxqn89775gwscs2","arb000000009743","USD"],["jxqn89775gwscs2","arb000000005993","USD"],["tsn8hkjmxp5y0qk","arb000000003367","USD"],["tsn8hkjmxp5y0qk","arl000000887067","USD"],["tsn8hkjmxp5y0qk","arb000000008095","USD"],["tsn8hkjmxp5y0qk","arc000000357550","USD"],["2a0dab08v8el5xz","arl000000886377","USD"],["2a0dab08v8el5xz","arc000000357343","USD"],["2a0dab08v8el5xz","arb000000003229","USD"],["2a0dab08v8el5xz","arb000000009883","USD"],["1drpi8cwo44m95m","arl000000886649","USD"],["1drpi8cwo44m95m","arb000000004285","USD"],["1drpi8cwo44m95m","arb000000005569","USD"],["nbdvqfhclcg39qi","arb000000008337","USD"],["nbdvqfhclcg39qi","arb000000010169","USD"],["nbdvqfhclcg39qi","arl000000886021","USD"],["nbdvqfhclcg39qi","arb000000002669","USD"],["nbdvqfhclcg39qi","arb000000004463","USD"],["mutamgxgu0vtg4o","arb000000012515","USD"],["mutamgxgu0vtg4o","arb000000005559","USD"],["xcz7tz0avrdjupj","arl000000885595","USD"],["xcz7tz0avrdjupj","arb000000002685","USD"],["xcz7tz0avrdjupj","arl000000887423","USD"],["xcz7tz0avrdjupj","arb000000012935","USD"],["xcz7tz0avrdjupj","arb000000011763","USD"],["1yke0y12a4izn2g","arb000000001025","USD"],["1yke0y12a4izn2g","arb000000002429","USD"],["l3y80kwbzj3kfqg","arb000000006733","USD"],["l3y80kwbzj3kfqg","arb000000011527","USD"],["l3y80kwbzj3kfqg","arb000000011153","USD"],["on8fjwi9r86yf0q","arb000000005535","USD"],["v1y3lvd4awnrgcs","arb000000000807","USD"],["80zwl74344ke9re","arb000000002351","USD"],["80zwl74344ke9re","arb000000002497","USD"],["80zwl74344ke9re","arb000000009611","USD"],["80zwl74344ke9re","arb000000001397","USD"],["qecif1strjpoks4","arb000000012059","USD"],["qecif1strjpoks4","arb000000011501","USD"],["uz2t6l161mp73l6","arb000000004695","USD"],["uz2t6l161mp73l6","arb000000005175","USD"],["uz2t6l161mp73l6","arb000000005593","USD"],["uz2t6l161mp73l6","arb000000001095","USD"],["a2auebibp7pf748","arl000000886913","USD"],["a2auebibp7pf748","arb000000000737","USD"],["arw5untcmbahluy","arl000000887207","USD"],["arw5untcmbahluy","arb000000008009","USD"],["arw5untcmbahluy","arb000000007663","USD"],["arw5untcmbahluy","arb000000004065","USD"],["db24sxa9iklfl2r","arb000000004751","USD"],["db24sxa9iklfl2r","arb000000011479","USD"],["db24sxa9iklfl2r","arb000000009909","USD"],["db24sxa9iklfl2r","arb000000007407","USD"],["db24sxa9iklfl2r","arb000000005165","USD"],["hes33n9nro5dj44","arb000000005915","USD"],["hes33n9nro5dj44","arl000000885911","USD"],["hes33n9nro5dj44","arb000000009347","USD"],["hes33n9nro5dj44","arb000000010947","USD"],["qm6h4c9zs63lhnt","arb000000003729","USD"],["qm6h4c9zs63lhnt","arb000000005417","USD"],["qm6h4c9zs63lhnt","arb000000006047","USD"],["qm6h4c9zs63lhnt","arb000000011473","USD"],["qm6h4c9zs63lhnt","arc000000358093","USD"],["ut89xp4u99yg58i","arb000000006899","USD"],["ut89xp4u99yg58i","arc000000358441","USD"],["ut89xp4u99yg58i","arl000000885649","USD"],["ut89xp4u99yg58i","arb000000003837","USD"],["ut89xp4u99yg58i","arb000000003961","USD"],["ut89xp4u99yg58i","arc000000358255","USD"],["ut89xp4u99yg58i","arb000000002875","USD"],["ocmeu5ajwttqzjj","arb000000009525","USD"],["ocmeu5ajwttqzjj","arb000000007501","USD"],["ocmeu5ajwttqzjj","arb000000006597","USD"],["ocmeu5ajwttqzjj","arb000000000685","USD"],["goxx9payllrlq9h","arb000000010791","USD"],["goxx9payllrlq9h","arb000000004099","USD"],["goxx9payllrlq9h","arb000000012409","USD"],["cru3lqg47ewx82m","arb000000005033","USD"],["cru3lqg47ewx82m","arb000000009801","USD"],["cru3lqg47ewx82m","arb000000006037","USD"],["cru3lqg47ewx82m","arb000000002721","USD"],["rn3v6h16gkmrwum","arc000000357415","USD"],["rn3v6h16gkmrwum","arb000000005151","USD"],["rn3v6h16gkmrwum","arb000000003277","USD"],["rn3v6h16gkmrwum","arl000000886363","USD"],["rn3v6h16gkmrwum","arb000000005049","USD"],["rn3v6h16gkmrwum","arb000000002811","USD"],["7gvkobdl1ak4j4e","arb000000001799","USD"],["7gvkobdl1ak4j4e","arl000000887215","USD"],["7gvkobdl1ak4j4e","arl000000887225","USD"],["yb5114iml0ivnb8","arl000000886027","USD"],["ol6ayfiv6rlzrka","arb000000007731","USD"],["ol6ayfiv6rlzrka","arb000000008883","USD"],["ol6ayfiv6rlzrka","arb000000009603","USD"],["ol6ayfiv6rlzrka","arb000000010397","USD"],["s3iq3n33l7k4rum","arb000000008875","USD"],["s3iq3n33l7k4rum","arl000000886771","USD"],["s3iq3n33l7k4rum","arb000000008059","USD"],["s3iq3n33l7k4rum","arb000000006019","USD"],["s3iq3n33l7k4rum","arb000000009551","USD"],["s3iq3n33l7k4rum","arb000000010013","USD"],["mj7oc6ghzi54lew","arl000000886853","USD"],["mj7oc6ghzi54lew","arb000000009391","USD"],["mj7oc6ghzi54lew","arb000000006739","USD"],["6oz1eefd8qp289i","arb000000012495","USD"],["6oz1eefd8qp289i","arb000000012305","USD"],["6oz1eefd8qp289i","arb000000007963","USD"],["6oz1eefd8qp289i","arb000000006947","USD"],["oqlpdjdxlab5gym","arb000000005605","USD"],["yzfffspkrodogmc","arb000000000817","USD"],["yzfffspkrodogmc","arl000000886833","USD"],["yzfffspkrodogmc","arb000000008833","USD"],["cb8zchv7sevmni1","arl000000886071","USD"],["cb8zchv7sevmni1","arl000000885637","USD"],["cb8zchv7sevmni1","arl000000885503","USD"],["475klacgm8yc80u","arb000000005629","USD"],["475klacgm8yc80u","arb000000010749","USD"],["475klacgm8yc80u","arc000000357118","USD"],["475klacgm8yc80u","arb000000003079","USD"],["475klacgm8yc80u","arb000000011535","USD"],["475klacgm8yc80u","arb000000009215","USD"],["dqkq6ff6gmcw4eg","arl000000886077","USD"],["dqkq6ff6gmcw4eg","arc000000357241","USD"],["dqkq6ff6gmcw4eg","arb000000003161","USD"],["8mlthtlc3j9a72s","arb000000010639","USD"],["8mlthtlc3j9a72s","arb000000010081","USD"],["8mlthtlc3j9a72s","arb000000012865","USD"],["8mlthtlc3j9a72s","arl000000885953","USD"],["8mlthtlc3j9a72s","arb000000008869","USD"],["8mlthtlc3j9a72s","arb000000001579","USD"],["8mlthtlc3j9a72s","arl000000886867","USD"],["8oaygu9fv6djhh6","arb000000004637","USD"],["8oaygu9fv6djhh6","arb000000008927","USD"],["8oaygu9fv6djhh6","arb000000011951","USD"],["8oaygu9fv6djhh6","arb000000005985","USD"],["8oaygu9fv6djhh6","arb000000010331","USD"],["8oaygu9fv6djhh6","arb000000004439","USD"],["q9lx35gzp2a36pb","arb000000004731","USD"],["q9lx35gzp2a36pb","arb000000005845","USD"],["8h7fgpn1uvetrjv","arl000000887177","USD"],["8h7fgpn1uvetrjv","arb000000007317","USD"],["fd4l6jhb5fr15fr","arb000000011737","USD"],["fd4l6jhb5fr15fr","arb000000011361","USD"],["zr07djp7x253xy8","arb000000008885","USD"],["zr07djp7x253xy8","arb000000007257","USD"],["zr07djp7x253xy8","arb000000007871","USD"],["zr07djp7x253xy8","arb000000011863","USD"],["zr07djp7x253xy8","arb000000007491","USD"],["eektmp00s17bow4","arb000000003137","USD"],["eektmp00s17bow4","arb000000000981","USD"],["eektmp00s17bow4","arb000000010527","USD"],["eektmp00s17bow4","arb000000002019","USD"],["eektmp00s17bow4","arc000000357205","USD"],["eektmp00s17bow4","arb000000008275","USD"],["4vxp8ffun7hrrf3","arb000000012193","USD"],["4vxp8ffun7hrrf3","arb000000007341","USD"],["4vxp8ffun7hrrf3","arl000000886973","USD"],["4vxp8ffun7hrrf3","arb000000011171","USD"],["4vxp8ffun7hrrf3","arb000000006629","USD"],["hnbg5rp571v63sp","arl000000885657","USD"],["hnbg5rp571v63sp","arb000000006415","USD"],["hnbg5rp571v63sp","arb000000003491","USD"],["hnbg5rp571v63sp","arb000000010017","USD"],["hnbg5rp571v63sp","arb000000001033","USD"],["hnbg5rp571v63sp","arc000000357736","USD"],["hh8msot3x63f906","arb000000000673","USD"],["hh8msot3x63f906","arb000000001251","USD"],["hh8msot3x63f906","arb000000001271","USD"],["hh8msot3x63f906","arb000000012977","USD"],["hh8msot3x63f906","arb000000007685","USD"],["86vfewzpyeyul1m","arb000000010941","USD"],["86vfewzpyeyul1m","arb000000012053","USD"],["86vfewzpyeyul1m","arb000000010451","USD"],["86vfewzpyeyul1m","arb000000002425","USD"],["3lal5ricd1s6bj4","arb000000008463","USD"],["3lal5ricd1s6bj4","arb000000006573","USD"],["3lal5ricd1s6bj4","arb000000008081","USD"],["3lal5ricd1s6bj4","arb000000004049","USD"],["g55g1723iva0vma","arb000000011097","USD"],["g55g1723iva0vma","arb000000004697","USD"],["g55g1723iva0vma","arb000000007559","USD"],["7t3ujfwe5ue5ldh","arb000000010735","USD"],["7t3ujfwe5ue5ldh","arb000000011949","USD"],["5bd9vsd8poq0pnl","arb000000008947","USD"],["q14gjjd5emscron","arb000000012349","USD"],["ijpjdi9buh6wpee","arb000000010887","USD"],["ijpjdi9buh6wpee","arb000000012071","USD"],["ijpjdi9buh6wpee","arb000000010269","USD"],["k5sj219ymt8ana1","arb000000000923","USD"],["k5sj219ymt8ana1","arc000000357154","USD"],["k5sj219ymt8ana1","arb000000003103","USD"],["k5sj219ymt8ana1","arb000000006919","USD"],["k5sj219ymt8ana1","arb000000004733","USD"],["k5sj219ymt8ana1","arc000000358156","USD"],["k5sj219ymt8ana1","arb000000003771","USD"],["yhlz8vo0lzh6e5a","arb000000007013","USD"],["yhlz8vo0lzh6e5a","arb000000006219","USD"],["zuvc138ddornohf","arb000000000775","USD"],["zuvc138ddornohf","arb000000001121","USD"],["zuvc138ddornohf","arb000000010141","USD"],["zuvc138ddornohf","arb000000007981","USD"],["zuvc138ddornohf","arb000000012661","USD"],["vio84io0go4sgz2","arb000000008933","USD"],["vio84io0go4sgz2","arb000000002753","USD"],["vio84io0go4sgz2","arb000000011139","USD"],["u5584usgfztfigu","arb000000001511","USD"],["u5584usgfztfigu","arb000000009427","USD"],["u5584usgfztfigu","arb000000009193","USD"],["u5584usgfztfigu","arb000000009833","USD"],["08xvjwrnj6d2166","arl000000885543","USD"],["08xvjwrnj6d2166","arb000000012683","USD"],["08xvjwrnj6d2166","arb000000007789","USD"],["08xvjwrnj6d2166","arb000000004759","USD"],["11k1fnvb86yyity","arb000000010437","USD"],["11k1fnvb86yyity","arb000000002157","USD"],["11k1fnvb86yyity","arb000000001335","USD"],["11k1fnvb86yyity","arb000000011781","USD"],["2aou58jcyhovvds","arb000000003625","USD"],["2aou58jcyhovvds","arc000000357937","USD"],["2aou58jcyhovvds","arb000000012317","USD"],["2aou58jcyhovvds","arb000000001051","USD"],["2aou58jcyhovvds","arb000000012189","USD"],["2aou58jcyhovvds","arb000000011463","USD"],["2aou58jcyhovvds","arb000000012589","USD"],["t6j4zshrng6yqdy","arb000000009971","USD"],["4lned51iifdiklf","arl000000887477","USD"],["k1abgjsfh425og9","arb000000009829","USD"],["k1abgjsfh425og9","arb000000006667","USD"],["np42ieqhg41liyq","arb000000000927","USD"],["np42ieqhg41liyq","arb000000003557","USD"],["np42ieqhg41liyq","arl000000887269","USD"],["np42ieqhg41liyq","arb000000009993","USD"],["np42ieqhg41liyq","arc000000357835","USD"],["np42ieqhg41liyq","arb000000010863","USD"],["tdxepol63081nua","arb000000011389","USD"],["tdxepol63081nua","arb000000008039","USD"],["tdxepol63081nua","arb000000011395","USD"],["tdxepol63081nua","arl000000885875","USD"],["wc0h2q21islcpdw","arb000000005711","USD"],["wc0h2q21islcpdw","arb000000001883","USD"],["wc0h2q21islcpdw","arc000000357502","USD"],["wc0h2q21islcpdw","arb000000003335","USD"],["2th5lggwyubp1oo","arb000000004817","USD"],["2th5lggwyubp1oo","arb000000002361","USD"],["2th5lggwyubp1oo","arb000000012033","USD"],["2th5lggwyubp1oo","arb000000006253","USD"],["2th5lggwyubp1oo","arb000000010671","USD"],["xws82zbzhbfm9z6","arb000000010931","USD"],["xws82zbzhbfm9z6","arb000000008229","USD"],["8l4z7lr0po56zcf","arb000000002189","USD"],["8l4z7lr0po56zcf","arb000000012215","USD"],["8l4z7lr0po56zcf","arc000000357946","USD"],["8l4z7lr0po56zcf","arb000000004559","USD"],["8l4z7lr0po56zcf","arb000000003631","USD"],["p1qdbsg8lh8bx85","arb000000009415","USD"],["p1qdbsg8lh8bx85","arb000000005945","USD"],["p1qdbsg8lh8bx85","arb000000009889","USD"],["p1qdbsg8lh8bx85","arb000000005197","USD"],["hozsnsbb89nq37f","arb000000003197","USD"],["hozsnsbb89nq37f","arc000000357295","USD"],["hozsnsbb89nq37f","arb000000008061","USD"],["hozsnsbb89nq37f","arb000000002947","USD"],["hozsnsbb89nq37f","arb000000002795","USD"],["hozsnsbb89nq37f","arb000000007519","USD"],["hozsnsbb89nq37f","arb000000012613","USD"],["hozsnsbb89nq37f","arb000000001719","USD"],["1rov2gwjnut074d","arb000000009119","USD"],["1rov2gwjnut074d","arb000000009823","USD"],["5vd68fl4cw1phvf","arb000000008589","USD"],["5vd68fl4cw1phvf","arb000000005195","USD"],["5vd68fl4cw1phvf","arb000000007703","USD"],["5vd68fl4cw1phvf","arb000000005941","USD"],["qo6h0z6p83nk42k","arb000000010625","USD"],["qo6h0z6p83nk42k","arb000000009513","USD"],["qo6h0z6p83nk42k","arb000000007083","USD"],["nyke0fxwy7m0vjo","arb000000006835","USD"],["nyke0fxwy7m0vjo","arl000000886675","USD"],["nyke0fxwy7m0vjo","arb000000002307","USD"],["nyke0fxwy7m0vjo","arb000000012161","USD"],["z1jhtcd3jr7z3jb","arb000000011533","USD"],["7hv5gcvavsk4hm3","arb000000012737","USD"],["2w1t0rtly567gfo","arc000000357079","USD"],["2w1t0rtly567gfo","arb000000012723","USD"],["2w1t0rtly567gfo","arl000000886047","USD"],["2w1t0rtly567gfo","arb000000005169","USD"],["2w1t0rtly567gfo","arb000000011935","USD"],["2w1t0rtly567gfo","arb000000003053","USD"],["2w1t0rtly567gfo","arb000000011607","USD"],["3oi0f69r4p387yf","arb000000001979","USD"],["0rok5dgykoj88yd","arc000000357169","USD"],["0rok5dgykoj88yd","arb000000011493","USD"],["0rok5dgykoj88yd","arb000000003113","USD"],["0rok5dgykoj88yd","arb000000008007","USD"],["0rok5dgykoj88yd","arb000000009277","USD"],["0rok5dgykoj88yd","arb000000010883","USD"],["pmq3itg0lme68qz","arb000000004833","USD"],["pmq3itg0lme68qz","arc000000357910","USD"],["pmq3itg0lme68qz","arb000000011007","USD"],["pmq3itg0lme68qz","arb000000002479","USD"],["pmq3itg0lme68qz","arb000000004919","USD"],["pmq3itg0lme68qz","arb000000008991","USD"],["pmq3itg0lme68qz","arb000000011699","USD"],["pmq3itg0lme68qz","arl000000887043","USD"],["pmq3itg0lme68qz","arb000000003607","USD"],["m996f66jm4lxx8w","arc000000357187","USD"],["m996f66jm4lxx8w","arb000000007427","USD"],["m996f66jm4lxx8w","arb000000003125","USD"],["8cm939zn3pjiipz","arb000000001747","USD"],["8cm939zn3pjiipz","arb000000008419","USD"],["8cm939zn3pjiipz","arb000000002471","USD"],["n1mzqicaf0y16fo","arl000000886273","USD"],["n1mzqicaf0y16fo","arb000000006659","USD"],["n1mzqicaf0y16fo","arb000000002177","USD"],["g8rtv7d6xo46qye","arb000000008781","USD"],["g8rtv7d6xo46qye","arb000000002591","USD"],["g8rtv7d6xo46qye","arl000000887003","USD"],["kkdvkb694n5yb7k","arb000000012135","USD"],["m4fuk4es51m5t3z","arb000000001985","USD"],["f3f74ov2d0drgsn","arc000000357367","USD"],["f3f74ov2d0drgsn","arb000000010197","USD"],["f3f74ov2d0drgsn","arb000000009917","USD"],["f3f74ov2d0drgsn","arb000000003245","USD"],["l9qoqeg9hc2xjhs","arl000000886353","USD"],["l9qoqeg9hc2xjhs","arb000000002195","USD"],["vqsybegiwsp0brs","arl000000885871","USD"],["vqsybegiwsp0brs","arb000000008735","USD"],["vqsybegiwsp0brs","arb000000004721","USD"],["vqsybegiwsp0brs","arb000000010491","USD"],["8g47q22of6qbp8u","arc000000357604","USD"],["8g47q22of6qbp8u","arb000000001113","USD"],["8g47q22of6qbp8u","arb000000001059","USD"],["8g47q22of6qbp8u","arb000000003403","USD"],["8g47q22of6qbp8u","arb000000006431","USD"],["jm9gc8j9tvuaw7v","arb000000011261","USD"],["jm9gc8j9tvuaw7v","arl000000886333","USD"],["jm9gc8j9tvuaw7v","arb000000005971","USD"],["jqan2tyy2vkrtn7","arl000000887069","USD"],["jqan2tyy2vkrtn7","arl000000885681","USD"],["jqan2tyy2vkrtn7","arb000000006849","USD"],["pskxcn46a2j66i9","arb000000007247","USD"],["pskxcn46a2j66i9","arb000000009929","USD"],["vcmm5nwy8y6qj08","arb000000009001","USD"],["vcmm5nwy8y6qj08","arb000000007043","USD"],["vcmm5nwy8y6qj08","arb000000004773","USD"],["0569yhzspil71at","arb000000001429","USD"],["0569yhzspil71at","arb000000009973","USD"],["0569yhzspil71at","arb000000005351","USD"],["0569yhzspil71at","arb000000001305","USD"],["0569yhzspil71at","arb000000010285","USD"],["dc4j5sjyayuzkq7","arb000000008321","USD"],["dc4j5sjyayuzkq7","arb000000001661","USD"],["rdyqtufj50tgiui","arb000000007337","USD"],["rdyqtufj50tgiui","arb000000005739","USD"],["rdyqtufj50tgiui","arb000000012103","USD"],["rdyqtufj50tgiui","arb000000012543","USD"],["rdyqtufj50tgiui","arb000000009007","USD"],["0r14a60imvusffs","arb000000007383","USD"],["0r14a60imvusffs","arb000000003343","USD"],["0r14a60imvusffs","arc000000357514","USD"],["0r14a60imvusffs","arb000000010165","USD"],["0r14a60imvusffs","arb000000004757","USD"],["helwqql1dhvnyyz","arb000000007235","USD"],["helwqql1dhvnyyz","arl000000887335","USD"],["helwqql1dhvnyyz","arb000000006223","USD"],["helwqql1dhvnyyz","arb000000012187","USD"],["bgvkv4mxzxp69ul","arb000000010995","USD"],["bgvkv4mxzxp69ul","arb000000010003","USD"],["bgvkv4mxzxp69ul","arl000000887055","USD"],["bgvkv4mxzxp69ul","arl000000886551","USD"],["ptisqbyvzlg70dr","arb000000004431","USD"],["ptisqbyvzlg70dr","arb000000009967","USD"],["ptisqbyvzlg70dr","arb000000003295","USD"],["ptisqbyvzlg70dr","arl000000887231","USD"],["ptisqbyvzlg70dr","arb000000007425","USD"],["ptisqbyvzlg70dr","arb000000000767","USD"],["ptisqbyvzlg70dr","arc000000357442","USD"],["ptisqbyvzlg70dr","arb000000011025","USD"],["vvb74p48e3blejj","arb000000005137","USD"],["vvb74p48e3blejj","arb000000008551","USD"],["vvb74p48e3blejj","arb000000006477","USD"],["vvb74p48e3blejj","arb000000010689","USD"],["vvb74p48e3blejj","arb000000002455","USD"],["uykdoq59mkg8afp","arb000000002631","USD"],["uykdoq59mkg8afp","arl000000887037","USD"],["uykdoq59mkg8afp","arl000000886755","USD"],["ahts8hvhno9dq7n","arb000000003089","USD"],["ahts8hvhno9dq7n","arc000000357133","USD"],["ahts8hvhno9dq7n","arb000000009141","USD"],["ahts8hvhno9dq7n","arb000000005303","USD"],["l0tdt34bc1vavhz","arb000000001003","USD"],["l0tdt34bc1vavhz","arb000000008955","USD"],["l0tdt34bc1vavhz","arb000000007747","USD"],["l0tdt34bc1vavhz","arb000000003983","USD"],["l0tdt34bc1vavhz","arc000000358474","USD"],["p7fni4y2xuoutol","arb000000003921","USD"],["p7fni4y2xuoutol","arb000000010145","USD"],["p7fni4y2xuoutol","arc000000358381","USD"],["p7fni4y2xuoutol","arb000000006211","USD"],["p7fni4y2xuoutol","arb000000011227","USD"],["p7fni4y2xuoutol","arb000000005907","USD"],["p7fni4y2xuoutol","arl000000886003","USD"],["s4z4z8nq3z097m1","arb000000010449","USD"],["s4z4z8nq3z097m1","arb000000008847","USD"],["s4z4z8nq3z097m1","arb000000008931","USD"],["vigtu06aed00esq","arb000000002877","USD"],["vigtu06aed00esq","arb000000000869","USD"],["vigtu06aed00esq","arl000000885847","USD"],["vigtu06aed00esq","arb000000004783","USD"],["xw0l6c3fmq6hv2u","arl000000887283","USD"],["xw0l6c3fmq6hv2u","arb000000004283","USD"],["xw0l6c3fmq6hv2u","arb000000002911","USD"],["5behxn85rjhj65i","arb000000006447","USD"],["5behxn85rjhj65i","arb000000008021","USD"],["5behxn85rjhj65i","arb000000001733","USD"],["5behxn85rjhj65i","arb000000012385","USD"],["5behxn85rjhj65i","arb000000002539","USD"],["5behxn85rjhj65i","arb000000006591","USD"],["l5dqj6hangq2csl","arb000000002333","USD"],["l5dqj6hangq2csl","arb000000003857","USD"],["l5dqj6hangq2csl","arb000000001569","USD"],["l5dqj6hangq2csl","arc000000358285","USD"],["l5dqj6hangq2csl","arb000000009851","USD"],["06r50k2x7q1bhpr","arb000000009827","USD"],["06r50k2x7q1bhpr","arb000000012745","USD"],["06r50k2x7q1bhpr","arb000000009969","USD"],["06r50k2x7q1bhpr","arb000000006703","USD"],["it5a7zv4a1erk15","arb000000002675","USD"],["it5a7zv4a1erk15","arb000000010949","USD"],["it5a7zv4a1erk15","arb000000002269","USD"],["it5a7zv4a1erk15","arb000000002197","USD"],["it5a7zv4a1erk15","arb000000002413","USD"],["9hf1gkca7lvehbd","arb000000008525","USD"],["9hf1gkca7lvehbd","arl000000887251","USD"],["9hf1gkca7lvehbd","arb000000001885","USD"],["9hf1gkca7lvehbd","arb000000002327","USD"],["9hf1gkca7lvehbd","arb000000007739","USD"],["9hf1gkca7lvehbd","arb000000011919","USD"],["9hf1gkca7lvehbd","arb000000012045","USD"],["9hf1gkca7lvehbd","arb000000005211","USD"],["0cslu4v7f4lnf2y","arb000000009797","USD"],["ozkjj5z3dnoztf1","arl000000886907","USD"],["ozkjj5z3dnoztf1","arb000000004789","USD"],["ozkjj5z3dnoztf1","arl000000887315","USD"],["ozkjj5z3dnoztf1","arb000000009481","USD"],["ozkjj5z3dnoztf1","arl000000886841","USD"],["ozkjj5z3dnoztf1","arb000000009431","USD"],["ozkjj5z3dnoztf1","arb000000007897","USD"],["6ngzhve98i98njk","arb000000012873","USD"],["6ngzhve98i98njk","arb000000004423","USD"],["6ngzhve98i98njk","arb000000006937","USD"],["zmh1kc8q4vqhupi","arb000000004295","USD"],["zmh1kc8q4vqhupi","arb000000012863","USD"],["zmh1kc8q4vqhupi","arb000000010223","USD"],["nupqaqz3qoe2x4w","arb000000010573","USD"],["3cs3n6ewapzx25x","arb000000008653","USD"],["3cs3n6ewapzx25x","arc000000357457","USD"],["3cs3n6ewapzx25x","arb000000001399","USD"],["3cs3n6ewapzx25x","arb000000004447","USD"],["3cs3n6ewapzx25x","arb000000007853","USD"],["3cs3n6ewapzx25x","arb000000003305","USD"],["3cs3n6ewapzx25x","arb000000001575","USD"],["1tlsnnxqwdbmdya","arb000000012191","USD"],["k2nj360ggbsugdx","arb000000012285","USD"],["k2nj360ggbsugdx","arb000000003339","USD"],["k2nj360ggbsugdx","arb000000003933","USD"],["k2nj360ggbsugdx","arb000000007033","USD"],["k2nj360ggbsugdx","arc000000358399","USD"],["k2nj360ggbsugdx","arb000000004453","USD"],["k2nj360ggbsugdx","arb000000007241","USD"],["k2nj360ggbsugdx","arc000000357508","USD"],["k2nj360ggbsugdx","arb000000002601","USD"],["rz2hgvrkwwr1zes","arb000000012739","USD"],["rz2hgvrkwwr1zes","arb000000008643","USD"],["rz2hgvrkwwr1zes","arb000000005011","USD"],["rz2hgvrkwwr1zes","arl000000886901","USD"],["rz2hgvrkwwr1zes","arl000000887041","USD"],["rz2hgvrkwwr1zes","arl000000886789","USD"],["rz2hgvrkwwr1zes","arb000000002261","USD"],["rz2hgvrkwwr1zes","arb000000011457","USD"],["rz2hgvrkwwr1zes","arb000000004765","USD"],["rz2hgvrkwwr1zes","arb000000006853","USD"],["rz2hgvrkwwr1zes","arb000000006547","USD"],["jawtfaepl65fgz1","arb000000007123","USD"],["a811r4yj54817oi","arb000000003905","USD"],["a811r4yj54817oi","arc000000358357","USD"],["a811r4yj54817oi","arb000000009693","USD"],["a811r4yj54817oi","arb000000006113","USD"],["a811r4yj54817oi","arb000000009125","USD"],["a811r4yj54817oi","arb000000009453","USD"],["e8nq2z7ucsvr3en","arb000000012415","USD"],["e8nq2z7ucsvr3en","arb000000004305","USD"],["gkcj7u4440vgin3","arb000000004409","USD"],["gkcj7u4440vgin3","arb000000007353","USD"],["gkcj7u4440vgin3","arb000000005287","USD"],["gkcj7u4440vgin3","arb000000002831","USD"],["ynpi0rvuen9now0","arc000000357379","USD"],["ynpi0rvuen9now0","arb000000012479","USD"],["ynpi0rvuen9now0","arb000000005513","USD"],["ynpi0rvuen9now0","arb000000004415","USD"],["ynpi0rvuen9now0","arb000000004743","USD"],["ynpi0rvuen9now0","arb000000003253","USD"],["mba6211op81oe4d","arb000000010199","USD"],["mba6211op81oe4d","arb000000009947","USD"],["mba6211op81oe4d","arb000000011375","USD"],["mba6211op81oe4d","arb000000012035","USD"],["nwwve7pkb3pjpbg","arb000000004317","USD"],["nwwve7pkb3pjpbg","arb000000004711","USD"],["nwwve7pkb3pjpbg","arb000000004823","USD"],["nwwve7pkb3pjpbg","arb000000012021","USD"],["2ci5iq80vsiskhs","arb000000004541","USD"],["ssh2v3v9onytnep","arb000000006453","USD"],["ssh2v3v9onytnep","arb000000006111","USD"],["ssh2v3v9onytnep","arc000000357805","USD"],["ssh2v3v9onytnep","arb000000003537","USD"],["nk025uhtt3dnonf","arb000000008715","USD"],["nk025uhtt3dnonf","arb000000008471","USD"],["nk025uhtt3dnonf","arl000000887377","USD"],["k3n48krg92e31sn","arb000000011335","USD"],["k3n48krg92e31sn","arb000000004243","USD"],["k3n48krg92e31sn","arc000000358108","USD"],["k3n48krg92e31sn","arb000000003739","USD"],["k3n48krg92e31sn","arb000000004259","USD"],["k3n48krg92e31sn","arb000000010721","USD"],["wgiq63whs3gv24a","arb000000007785","USD"],["wgiq63whs3gv24a","arb000000011443","USD"],["wgiq63whs3gv24a","arb000000002465","USD"],["wgiq63whs3gv24a","arb000000006077","USD"],["a30zd8oe6m0ibrc","arl000000887089","USD"],["a30zd8oe6m0ibrc","arb000000010983","USD"],["a30zd8oe6m0ibrc","arb000000010365","USD"],["a30zd8oe6m0ibrc","arb000000002637","USD"],["0z8jv376jc0bj41","arb000000011565","USD"],["0z8jv376jc0bj41","arl000000886001","USD"],["8oautghl4ah6klp","arc000000357217","USD"],["8oautghl4ah6klp","arb000000003145","USD"],["8oautghl4ah6klp","arb000000011691","USD"],["8oautghl4ah6klp","arb000000008409","USD"],["37ytlp7p3t1p9dv","arb000000009647","USD"],["37ytlp7p3t1p9dv","arb000000008903","USD"],["37ytlp7p3t1p9dv","arb000000002549","USD"],["37ytlp7p3t1p9dv","arl000000885943","USD"],["37ytlp7p3t1p9dv","arb000000009081","USD"],["bz4ghabq4ofi3s4","arb000000008277","USD"],["bz4ghabq4ofi3s4","arb000000008019","USD"],["bz4ghabq4ofi3s4","arb000000002089","USD"],["bz4ghabq4ofi3s4","arb000000008209","USD"],["bz4ghabq4ofi3s4","arb000000001607","USD"],["gr2nbwd6yu9ci7a","arb000000006251","USD"],["gr2nbwd6yu9ci7a","arb000000001897","USD"],["gr2nbwd6yu9ci7a","arb000000011215","USD"],["gr2nbwd6yu9ci7a","arb000000005055","USD"],["gr2nbwd6yu9ci7a","arb000000000689","USD"],["di6pp5k5ptmns5d","arb000000002749","USD"],["di6pp5k5ptmns5d","arb000000012435","USD"],["di6pp5k5ptmns5d","arl000000885623","USD"],["di6pp5k5ptmns5d","arb000000010215","USD"],["di6pp5k5ptmns5d","arb000000008299","USD"],["i17rze25xid2nvh","arb000000003133","USD"],["i17rze25xid2nvh","arb000000010531","USD"],["i17rze25xid2nvh","arc000000357199","USD"],["lpy64im66pc7uup","arb000000004579","USD"],["lpy64im66pc7uup","arc000000358195","USD"],["lpy64im66pc7uup","arb000000007319","USD"],["lpy64im66pc7uup","arb000000003797","USD"],["lpy64im66pc7uup","arc000000357481","USD"],["lpy64im66pc7uup","arb000000003321","USD"],["d1fcge8tsarxnl2","arb000000004441","USD"],["ehz4yz3hl7jfnkf","arb000000010293","USD"],["2c822y0oklzmy8u","arb000000007639","USD"],["2c822y0oklzmy8u","arb000000011137","USD"],["2c822y0oklzmy8u","arb000000007913","USD"],["2c822y0oklzmy8u","arb000000000993","USD"],["wnc3vkfldlu8wkf","arb000000003177","USD"],["wnc3vkfldlu8wkf","arb000000008631","USD"],["wnc3vkfldlu8wkf","arc000000357265","USD"],["onr05oyumcop8p9","arl000000886309","USD"],["onr05oyumcop8p9","arb000000004111","USD"],["onr05oyumcop8p9","arb000000002117","USD"],["onr05oyumcop8p9","arb000000009003","USD"],["onr05oyumcop8p9","arb000000001127","USD"],["onr05oyumcop8p9","arb000000007545","USD"],["onr05oyumcop8p9","arb000000005519","USD"],["onr05oyumcop8p9","arb000000007495","USD"],["pk6ozr1qbryo4ow","arb000000006281","USD"],["pk6ozr1qbryo4ow","arb000000003273","USD"],["pk6ozr1qbryo4ow","arc000000357409","USD"],["pk6ozr1qbryo4ow","arb000000009891","USD"],["ipzk1mtyqmqchqx","arb000000007903","USD"],["ipzk1mtyqmqchqx","arl000000886533","USD"],["r67tkly7oaa5vui","arb000000007923","USD"],["r67tkly7oaa5vui","arb000000011211","USD"],["r67tkly7oaa5vui","arb000000001319","USD"],["r67tkly7oaa5vui","arb000000012211","USD"],["pvldnhmz1u6pwji","arb000000007877","USD"],["pvldnhmz1u6pwji","arb000000012379","USD"],["pvldnhmz1u6pwji","arb000000006741","USD"],["fibvlutcpjrnh51","arb000000005691","USD"],["fibvlutcpjrnh51","arb000000005765","USD"],["fibvlutcpjrnh51","arb000000004401","USD"],["fibvlutcpjrnh51","arb000000008435","USD"],["fibvlutcpjrnh51","arb000000004633","USD"],["c7uqlvyio2oblgl","arb000000005579","USD"],["c7uqlvyio2oblgl","arb000000000907","USD"],["c7uqlvyio2oblgl","arb000000009313","USD"],["c7uqlvyio2oblgl","arb000000007983","USD"],["c7uqlvyio2oblgl","arl000000886975","USD"],["in9bdvobxitf658","arb000000008005","USD"],["in9bdvobxitf658","arb000000008667","USD"],["in9bdvobxitf658","arb000000000771","USD"],["in9bdvobxitf658","arb000000011041","USD"],["7qtk8ky5oxqqbta","arb000000005965","USD"],["7qtk8ky5oxqqbta","arb000000007961","USD"],["7qtk8ky5oxqqbta","arb000000009033","USD"],["7qtk8ky5oxqqbta","arl000000886253","USD"],["7qtk8ky5oxqqbta","arb000000003043","USD"],["7qtk8ky5oxqqbta","arc000000357064","USD"],["keq7c2btnliukqn","arb000000009723","USD"],["keq7c2btnliukqn","arb000000005685","USD"],["keq7c2btnliukqn","arb000000011543","USD"],["keq7c2btnliukqn","arb000000005697","USD"],["qdv04743nnvs1b2","arb000000001277","USD"],["qdv04743nnvs1b2","arb000000005497","USD"],["qdv04743nnvs1b2","arb000000008697","USD"],["qdv04743nnvs1b2","arb000000006243","USD"],["qdv04743nnvs1b2","arb000000008191","USD"],["8m24qk3drq4hfey","arb000000002421","USD"],["8m24qk3drq4hfey","arb000000010479","USD"],["8m24qk3drq4hfey","arb000000001353","USD"],["8m24qk3drq4hfey","arb000000010879","USD"],["m9pi3fhepvjsd8j","arc000000357220","USD"],["m9pi3fhepvjsd8j","arb000000003147","USD"],["m9pi3fhepvjsd8j","arl000000887073","USD"],["8v4oatdc1jozm51","arb000000009803","USD"],["8v4oatdc1jozm51","arl000000886823","USD"],["8v4oatdc1jozm51","arb000000006869","USD"],["8v4oatdc1jozm51","arb000000012825","USD"],["8v4oatdc1jozm51","arb000000011849","USD"],["8v4oatdc1jozm51","arb000000001957","USD"],["8v4oatdc1jozm51","arb000000004359","USD"],["zuf3sg71gjo97i7","arb000000010369","USD"],["zuf3sg71gjo97i7","arb000000011991","USD"],["zuf3sg71gjo97i7","arl000000885813","USD"],["zuf3sg71gjo97i7","arl000000886291","USD"],["ni4k6nw8v4270xj","arb000000007623","USD"],["68t4xuar0nczoza","arb000000010867","USD"],["68t4xuar0nczoza","arb000000010049","USD"],["68t4xuar0nczoza","arb000000006147","USD"],["n7mr33k94vxtgh1","arb000000006505","USD"],["n7mr33k94vxtgh1","arb000000001349","USD"],["n7mr33k94vxtgh1","arb000000007761","USD"],["icl4x2yfprmz2ad","arb000000004229","USD"],["icl4x2yfprmz2ad","arb000000000897","USD"],["rvuxsvix6rhqba5","arl000000886029","USD"],["rvuxsvix6rhqba5","arb000000011861","USD"],["sbs3byv4amyi3wh","arb000000009283","USD"],["sbs3byv4amyi3wh","arb000000012345","USD"],["sbs3byv4amyi3wh","arl000000887457","USD"],["sbs3byv4amyi3wh","arl000000886463","USD"],["sbs3byv4amyi3wh","arb000000007303","USD"],["gmbjbatmlyqrwax","arb000000012081","USD"],["gmbjbatmlyqrwax","arb000000008325","USD"],["gmbjbatmlyqrwax","arb000000004255","USD"],["gmbjbatmlyqrwax","arb000000011719","USD"],["gmbjbatmlyqrwax","arb000000011575","USD"],["6m7ntdit92q5vst","arb000000012459","USD"],["6m7ntdit92q5vst","arb000000007837","USD"],["guk46v4eyloua09","arb000000011309","USD"],["guk46v4eyloua09","arb000000000667","USD"],["sb256466a3d3wkf","arb000000003673","USD"],["sb256466a3d3wkf","arc000000358009","USD"],["sb256466a3d3wkf","arl000000886181","USD"],["sb256466a3d3wkf","arl000000886513","USD"],["sb256466a3d3wkf","arb000000004841","USD"],["sb256466a3d3wkf","arb000000005095","USD"],["8vqf59qstpfl90q","arb000000003735","USD"],["8vqf59qstpfl90q","arc000000358102","USD"],["8vqf59qstpfl90q","arl000000885513","USD"],["7vs491u35bszw5h","arb000000000809","USD"],["7vs491u35bszw5h","arb000000001069","USD"],["7vs491u35bszw5h","arb000000006141","USD"],["7vs491u35bszw5h","arb000000002419","USD"],["7vs491u35bszw5h","arb000000007635","USD"],["ecu5gbqlmz5v2ou","arb000000007509","USD"],["ecu5gbqlmz5v2ou","arb000000005631","USD"],["ecu5gbqlmz5v2ou","arb000000011755","USD"],["ecu5gbqlmz5v2ou","arb000000008815","USD"],["qo8a9s5xq8jdda8","arb000000009821","USD"],["qo8a9s5xq8jdda8","arb000000002599","USD"],["qo8a9s5xq8jdda8","arl000000887385","USD"],["qo8a9s5xq8jdda8","arb000000011381","USD"],["g2evfzpugj5omgf","arb000000011717","USD"],["g2evfzpugj5omgf","arb000000001171","USD"],["g2evfzpugj5omgf","arb000000012295","USD"],["g2evfzpugj5omgf","arb000000007779","USD"],["g2evfzpugj5omgf","arb000000008503","USD"],["s1q6evt2sbyb9b0","arc000000358396","USD"],["s1q6evt2sbyb9b0","arb000000006105","USD"],["s1q6evt2sbyb9b0","arb000000007857","USD"],["s1q6evt2sbyb9b0","arb000000003931","USD"],["s1q6evt2sbyb9b0","arb000000002347","USD"],["c2hcj7gbhzbk3c7","arb000000009267","USD"],["c2hcj7gbhzbk3c7","arb000000009629","USD"],["c2hcj7gbhzbk3c7","arb000000006327","USD"],["nlmy0c3lc3qg9ih","arb000000008555","USD"],["nlmy0c3lc3qg9ih","arb000000008529","USD"],["nlmy0c3lc3qg9ih","arb000000012303","USD"],["nlmy0c3lc3qg9ih","arb000000005879","USD"],["nlmy0c3lc3qg9ih","arb000000011401","USD"],["0iwzyczonfmu3v0","arb000000005815","USD"],["d9imumbx5z63lug","arb000000012671","USD"],["d9imumbx5z63lug","arl000000886873","USD"],["d9imumbx5z63lug","arb000000001363","USD"],["d9imumbx5z63lug","arb000000011659","USD"],["d9imumbx5z63lug","arb000000006071","USD"],["dl609ly5oxtligr","arl000000885693","USD"],["dl609ly5oxtligr","arc000000358432","USD"],["dl609ly5oxtligr","arb000000003955","USD"],["dl609ly5oxtligr","arb000000010349","USD"],["ymnjyvkb8dkcuwx","arb000000002561","USD"],["ymnjyvkb8dkcuwx","arb000000001409","USD"],["ymnjyvkb8dkcuwx","arb000000002941","USD"],["ymnjyvkb8dkcuwx","arb000000007069","USD"],["ymnjyvkb8dkcuwx","arb000000006067","USD"],["a0pxk5jbv6okqx9","arb000000003963","USD"],["a0pxk5jbv6okqx9","arl000000885805","USD"],["a0pxk5jbv6okqx9","arb000000011541","USD"],["a0pxk5jbv6okqx9","arc000000358444","USD"],["nwt9aip703k9ibv","arb000000011339","USD"],["nwt9aip703k9ibv","arl000000885853","USD"],["nwt9aip703k9ibv","arb000000006857","USD"],["c8a1yut9o4pdmqx","arb000000003875","USD"],["c8a1yut9o4pdmqx","arc000000358312","USD"],["c8a1yut9o4pdmqx","arb000000005797","USD"],["c8a1yut9o4pdmqx","arb000000010155","USD"],["ewztyolgk3gz4y5","arb000000010969","USD"],["ewztyolgk3gz4y5","arb000000009479","USD"],["ewztyolgk3gz4y5","arb000000009305","USD"],["dtq6wo6as2uhtdc","arb000000006625","USD"],["dtq6wo6as2uhtdc","arb000000011941","USD"],["dtq6wo6as2uhtdc","arb000000004335","USD"],["giij52uoqctmjdg","arb000000010661","USD"],["giij52uoqctmjdg","arb000000010381","USD"],["giij52uoqctmjdg","arl000000887281","USD"],["giij52uoqctmjdg","arb000000008141","USD"],["8adcv2z29ebuas5","arb000000006581","USD"],["8adcv2z29ebuas5","arb000000003405","USD"],["8adcv2z29ebuas5","arc000000357607","USD"],["8adcv2z29ebuas5","arb000000001601","USD"],["urvy8hdbs9re5kv","arb000000006975","USD"],["urvy8hdbs9re5kv","arb000000007541","USD"],["urvy8hdbs9re5kv","arb000000007429","USD"],["qpwml5lg8szbeog","arb000000009711","USD"],["qpwml5lg8szbeog","arb000000012973","USD"],["qpwml5lg8szbeog","arb000000009233","USD"],["qpwml5lg8szbeog","arb000000001655","USD"],["qpwml5lg8szbeog","arb000000000801","USD"],["qpwml5lg8szbeog","arb000000006619","USD"],["btfx1cuav138cbe","arl000000885841","USD"],["btfx1cuav138cbe","arl000000886963","USD"],["btfx1cuav138cbe","arb000000001869","USD"],["btfx1cuav138cbe","arb000000004659","USD"],["btfx1cuav138cbe","arl000000885793","USD"],["btfx1cuav138cbe","arl000000886573","USD"],["piuk2axp96px10h","arb000000009511","USD"],["piuk2axp96px10h","arb000000010833","USD"],["piuk2axp96px10h","arb000000005667","USD"],["qp5bagj8m7awpql","arb000000009255","USD"],["qp5bagj8m7awpql","arb000000000951","USD"],["qp5bagj8m7awpql","arb000000012049","USD"],["qp5bagj8m7awpql","arb000000004803","USD"],["tu5r8wwfvhfsxj4","arb000000004363","USD"],["tu5r8wwfvhfsxj4","arb000000006235","USD"],["tu5r8wwfvhfsxj4","arb000000005361","USD"],["tu5r8wwfvhfsxj4","arl000000887293","USD"],["tu5r8wwfvhfsxj4","arb000000011783","USD"],["m4ov3fh8i32xux3","arb000000003805","USD"],["m4ov3fh8i32xux3","arb000000005953","USD"],["m4ov3fh8i32xux3","arb000000003985","USD"],["m4ov3fh8i32xux3","arb000000009447","USD"],["m4ov3fh8i32xux3","arc000000358207","USD"],["m4ov3fh8i32xux3","arc000000358477","USD"],["m4ov3fh8i32xux3","arl000000887325","USD"],["m4ov3fh8i32xux3","arb000000007503","USD"],["t1l264b8wseuo4s","arc000000358153","USD"],["t1l264b8wseuo4s","arb000000003769","USD"],["t1l264b8wseuo4s","arb000000008215","USD"],["agh6ee5907csps3","arb000000005665","USD"],["agh6ee5907csps3","arb000000008227","USD"],["iarzc6gu4gu7l7u","arb000000004537","USD"],["iarzc6gu4gu7l7u","arb000000009077","USD"],["iarzc6gu4gu7l7u","arl000000885653","USD"],["iarzc6gu4gu7l7u","arl000000886541","USD"],["6vl08jbjis3iwqs","arb000000001243","USD"],["6vl08jbjis3iwqs","arb000000004981","USD"],["ai6448e2phfdnc1","arl000000886881","USD"],["ai6448e2phfdnc1","arb000000001887","USD"],["ai6448e2phfdnc1","arb000000003541","USD"],["ai6448e2phfdnc1","arl000000887027","USD"],["ai6448e2phfdnc1","arb000000011873","USD"],["ai6448e2phfdnc1","arc000000357811","USD"],["etvdm5pzxfyh37h","arb000000008523","USD"],["etvdm5pzxfyh37h","arb000000002611","USD"],["xdursdmhlz0c76q","arb000000005405","USD"],["zb9ybsq8covx9uh","arl000000886515","USD"],["zb9ybsq8covx9uh","arb000000010273","USD"],["zb9ybsq8covx9uh","arb000000002011","USD"],["6v0vsa39bsaelko","arb000000007641","USD"],["6v0vsa39bsaelko","arb000000001809","USD"],["6v0vsa39bsaelko","arb000000001157","USD"],["6v0vsa39bsaelko","arb000000007543","USD"],["6v0vsa39bsaelko","arb000000001555","USD"],["rk7otc5vv8kcf9u","arc000000358282","USD"],["rk7otc5vv8kcf9u","arb000000006777","USD"],["rk7otc5vv8kcf9u","arb000000002949","USD"],["rk7otc5vv8kcf9u","arb000000003855","USD"],["rk7otc5vv8kcf9u","arc000000358315","USD"],["rk7otc5vv8kcf9u","arb000000003877","USD"],["rk7otc5vv8kcf9u","arb000000001471","USD"],["rk7otc5vv8kcf9u","arb000000001189","USD"],["x27gjgnj56ijva2","arb000000012771","USD"],["x27gjgnj56ijva2","arb000000003429","USD"],["x27gjgnj56ijva2","arb000000006411","USD"],["x27gjgnj56ijva2","arl000000887455","USD"],["x27gjgnj56ijva2","arb000000007059","USD"],["x27gjgnj56ijva2","arb000000008237","USD"],["x27gjgnj56ijva2","arc000000357643","USD"],["x27gjgnj56ijva2","arb000000008063","USD"],["pcsyfx8tr2817fo","arb000000010087","USD"],["pcsyfx8tr2817fo","arl000000886831","USD"],["o5kxwyghkxnwt0w","arb000000008381","USD"],["o5kxwyghkxnwt0w","arb000000001949","USD"],["o5kxwyghkxnwt0w","arb000000006245","USD"],["7fwa8ij8vjutl3i","arb000000005881","USD"],["7fwa8ij8vjutl3i","arb000000009955","USD"],["7fwa8ij8vjutl3i","arb000000010987","USD"],["7fwa8ij8vjutl3i","arb000000002673","USD"],["7fwa8ij8vjutl3i","arb000000001851","USD"],["7fwa8ij8vjutl3i","arb000000004113","USD"],["7fwa8ij8vjutl3i","arb000000002239","USD"],["colb89zn96xqlz7","arb000000001115","USD"],["colb89zn96xqlz7","arb000000010029","USD"],["25hebdsbf5m9kpg","arb000000005751","USD"],["25hebdsbf5m9kpg","arb000000012221","USD"],["25hebdsbf5m9kpg","arb000000008963","USD"],["25hebdsbf5m9kpg","arb000000004995","USD"],["ia50qntrgp78mrs","arb000000010761","USD"],["ia50qntrgp78mrs","arl000000886429","USD"],["ia50qntrgp78mrs","arb000000000879","USD"],["ia50qntrgp78mrs","arb000000004233","USD"],["scpw0ko1e3zwplm","arb000000001325","USD"],["scpw0ko1e3zwplm","arb000000006635","USD"],["scpw0ko1e3zwplm","arb000000001203","USD"],["scpw0ko1e3zwplm","arl000000886503","USD"],["scpw0ko1e3zwplm","arb000000009673","USD"],["scpw0ko1e3zwplm","arb000000011545","USD"],["g4yykmlywng8ikj","arb000000012001","USD"],["g4yykmlywng8ikj","arb000000012407","USD"],["oo9xuod4udsaug0","arc000000357799","USD"],["oo9xuod4udsaug0","arb000000003533","USD"],["uuahx3bofgdtaw2","arb000000005173","USD"],["uuahx3bofgdtaw2","arb000000003247","USD"],["uuahx3bofgdtaw2","arc000000357370","USD"],["uuahx3bofgdtaw2","arb000000007745","USD"],["uuahx3bofgdtaw2","arb000000008987","USD"],["wtc0bpnxx0olkai","arb000000012545","USD"],["wtc0bpnxx0olkai","arb000000006871","USD"],["wtc0bpnxx0olkai","arb000000002271","USD"],["wtc0bpnxx0olkai","arb000000002729","USD"],["wtc0bpnxx0olkai","arb000000006421","USD"],["wtc0bpnxx0olkai","arc000000357571","USD"],["wtc0bpnxx0olkai","arb000000003381","USD"],["wtc0bpnxx0olkai","arl000000887275","USD"],["vwc9ik9oqxzxmrz","arb000000004927","USD"],["vwc9ik9oqxzxmrz","arb000000011643","USD"],["vwc9ik9oqxzxmrz","arb000000012127","USD"],["7s2qs0rldjh55hf","arb000000009661","USD"],["7s2qs0rldjh55hf","arb000000008655","USD"],["7s2qs0rldjh55hf","arb000000008097","USD"],["7s2qs0rldjh55hf","arb000000002755","USD"],["pfdppnp804psv5m","arb000000012171","USD"],["pfdppnp804psv5m","arb000000000675","USD"],["pg0cw4tsokuap2r","arb000000007349","USD"],["pg0cw4tsokuap2r","arb000000007401","USD"],["pg0cw4tsokuap2r","arl000000887023","USD"],["pg0cw4tsokuap2r","arb000000008549","USD"],["pg0cw4tsokuap2r","arb000000006493","USD"],["0gyavkrj4wlg7lr","arc000000358192","USD"],["0gyavkrj4wlg7lr","arb000000003691","USD"],["0gyavkrj4wlg7lr","arb000000005805","USD"],["0gyavkrj4wlg7lr","arb000000003795","USD"],["0gyavkrj4wlg7lr","arc000000358036","USD"],["0gyavkrj4wlg7lr","arl000000887049","USD"],["0gyavkrj4wlg7lr","arb000000010627","USD"],["ieh4qd61nnnjpil","arb000000008233","USD"],["ieh4qd61nnnjpil","arl000000886221","USD"],["ieh4qd61nnnjpil","arb000000007573","USD"],["ch7e0i4wqgh372s","arb000000006895","USD"],["ch7e0i4wqgh372s","arb000000010917","USD"],["ch7e0i4wqgh372s","arb000000010443","USD"],["dfbm3ejff6x6356","arb000000002115","USD"],["dfbm3ejff6x6356","arb000000010229","USD"],["dfbm3ejff6x6356","arb000000009601","USD"],["b6dowm3teiumtw2","arb000000008197","USD"],["b6dowm3teiumtw2","arb000000004041","USD"],["b6dowm3teiumtw2","arb000000007011","USD"],["ht308wrw2xmzteh","arc000000357841","USD"],["ht308wrw2xmzteh","arb000000006515","USD"],["ht308wrw2xmzteh","arb000000003561","USD"],["ht308wrw2xmzteh","arb000000005455","USD"],["ht308wrw2xmzteh","arb000000005435","USD"],["ht308wrw2xmzteh","arb000000007411","USD"],["ht308wrw2xmzteh","arb000000002651","USD"],["983x78fbhg411k4","arl000000887255","USD"],["pzhpds9ro839e8o","arl000000886465","USD"],["pzhpds9ro839e8o","arb000000007811","USD"],["pzhpds9ro839e8o","arb000000007201","USD"],["cgoiw3x9j00a0u4","arb000000008099","USD"],["cgoiw3x9j00a0u4","arb000000007521","USD"],["cgoiw3x9j00a0u4","arb000000005277","USD"],["nx9fsijt9uz5fp3","arb000000011373","USD"],["nx9fsijt9uz5fp3","arb000000005979","USD"],["nx9fsijt9uz5fp3","arb000000012569","USD"],["a8g870873zm0jkr","arc000000357223","USD"],["a8g870873zm0jkr","arb000000003149","USD"],["a8g870873zm0jkr","arb000000007493","USD"],["a8g870873zm0jkr","arb000000005275","USD"],["6yhuuh5hjamdegv","arb000000000967","USD"],["6yhuuh5hjamdegv","arb000000001769","USD"],["6yhuuh5hjamdegv","arb000000011537","USD"],["6yhuuh5hjamdegv","arb000000007699","USD"],["dfzyb5epqgzffmo","arb000000002821","USD"],["dfzyb5epqgzffmo","arb000000002563","USD"],["dfzyb5epqgzffmo","arb000000012201","USD"],["dfzyb5epqgzffmo","arb000000006433","USD"],["dfzyb5epqgzffmo","arb000000009831","USD"],["dfzyb5epqgzffmo","arb000000000945","USD"],["vrutvo7x6u7g5i9","arb000000002123","USD"],["vrutvo7x6u7g5i9","arc000000357034","USD"],["vrutvo7x6u7g5i9","arb000000001463","USD"],["vrutvo7x6u7g5i9","arb000000004479","USD"],["vrutvo7x6u7g5i9","arb000000010731","USD"],["vrutvo7x6u7g5i9","arb000000003023","USD"],["vrutvo7x6u7g5i9","arb000000010247","USD"],["vrutvo7x6u7g5i9","arl000000886173","USD"],["vrutvo7x6u7g5i9","arl000000885569","USD"],["svb5724iffo8bkw","arl000000886103","USD"],["svb5724iffo8bkw","arb000000011415","USD"],["4c6rtc56xghs485","arb000000010717","USD"],["4c6rtc56xghs485","arb000000001213","USD"],["1fx37iu8fdqudsh","arb000000006439","USD"],["1fx37iu8fdqudsh","arb000000011015","USD"],["1fx37iu8fdqudsh","arb000000008499","USD"],["1fx37iu8fdqudsh","arb000000009359","USD"],["1fx37iu8fdqudsh","arb000000010213","USD"],["mcjcxi69wjqgmt3","arb000000000971","USD"],["mcjcxi69wjqgmt3","arb000000011633","USD"],["mcjcxi69wjqgmt3","arb000000001279","USD"],["mcjcxi69wjqgmt3","arl000000887347","USD"],["vothvnkuc4rtzen","arl000000887365","USD"],["vothvnkuc4rtzen","arb000000001695","USD"],["vothvnkuc4rtzen","arb000000001955","USD"],["vothvnkuc4rtzen","arb000000001659","USD"],["pajcknqd6kkbs7b","arb000000000931","USD"],["pajcknqd6kkbs7b","arb000000005399","USD"],["pajcknqd6kkbs7b","arb000000010877","USD"],["pajcknqd6kkbs7b","arb000000007149","USD"],["pajcknqd6kkbs7b","arb000000001309","USD"],["k338vjwu3zbirzi","arb000000004883","USD"],["rwjp56s4udeps3y","arb000000007155","USD"],["rwjp56s4udeps3y","arb000000005863","USD"],["rwjp56s4udeps3y","arb000000001735","USD"],["rwjp56s4udeps3y","arb000000011997","USD"],["rwjp56s4udeps3y","arb000000001989","USD"],["85kcck20f4k8r13","arb000000000741","USD"],["85kcck20f4k8r13","arb000000005311","USD"],["85kcck20f4k8r13","arb000000002733","USD"],["85kcck20f4k8r13","arb000000005125","USD"],["85kcck20f4k8r13","arb000000012659","USD"],["8tccznu04614thi","arb000000000829","USD"],["8tccznu04614thi","arb000000012701","USD"],["8tccznu04614thi","arc000000358471","USD"],["8tccznu04614thi","arb000000003981","USD"],["8tccznu04614thi","arl000000887345","USD"],["juedxos4li8r6yz","arb000000009361","USD"],["juedxos4li8r6yz","arb000000007609","USD"],["juedxos4li8r6yz","arl000000886965","USD"],["juedxos4li8r6yz","arb000000012801","USD"],["2z7t4ra8v5yw9wu","arb000000004683","USD"],["2z7t4ra8v5yw9wu","arb000000005753","USD"],["2z7t4ra8v5yw9wu","arb000000004007","USD"],["o6gcf15h36dpt1i","arb000000011193","USD"],["o6gcf15h36dpt1i","arl000000886915","USD"],["o6gcf15h36dpt1i","arb000000010697","USD"],["o6gcf15h36dpt1i","arb000000004923","USD"],["8ei1em1kl423dgm","arb000000009867","USD"],["8ei1em1kl423dgm","arb000000005561","USD"],["8ei1em1kl423dgm","arb000000008181","USD"],["8ei1em1kl423dgm","arl000000887363","USD"],["8ei1em1kl423dgm","arb000000008485","USD"],["8ei1em1kl423dgm","arl000000885671","USD"],["1tk9ht1fnwb9kov","arb000000009041","USD"],["1tk9ht1fnwb9kov","arb000000009225","USD"],["1tk9ht1fnwb9kov","arb000000011943","USD"],["yvdhhk8cu7ocfu2","arb000000005307","USD"],["yvdhhk8cu7ocfu2","arb000000011159","USD"],["2ges72lbbd40m9l","arb000000012371","USD"],["2ges72lbbd40m9l","arb000000005101","USD"],["2ges72lbbd40m9l","arb000000008543","USD"],["2ges72lbbd40m9l","arl000000885809","USD"],["xkiwghvxmsslkz0","arb000000002447","USD"],["xkiwghvxmsslkz0","arl000000887113","USD"],["xkiwghvxmsslkz0","arb000000010937","USD"],["wq03k7cmzevogp0","arl000000887213","USD"],["wq03k7cmzevogp0","arb000000005481","USD"],["wq03k7cmzevogp0","arb000000011439","USD"],["nkdr2zuqwiplmay","arl000000887329","USD"],["nkdr2zuqwiplmay","arb000000006839","USD"],["nkdr2zuqwiplmay","arl000000887229","USD"],["nkdr2zuqwiplmay","arb000000006301","USD"],["nkdr2zuqwiplmay","arb000000012225","USD"],["u1vpvm0u38o4rbb","arb000000002439","USD"],["u1vpvm0u38o4rbb","arb000000006801","USD"],["d6084dajx3cv9qc","arb000000008051","USD"],["d6084dajx3cv9qc","arb000000004859","USD"],["d6084dajx3cv9qc","arb000000000935","USD"],["4y1tm23q9kd8bpw","arb000000010453","USD"],["4y1tm23q9kd8bpw","arb000000009791","USD"],["4y1tm23q9kd8bpw","arl000000885515","USD"],["4y1tm23q9kd8bpw","arb000000001865","USD"],["ll5ah1j13narm20","arb000000007613","USD"],["ll5ah1j13narm20","arb000000010419","USD"],["ll5ah1j13narm20","arb000000001591","USD"],["zdxv6o1nyd2f2xc","arb000000000655","USD"],["zdxv6o1nyd2f2xc","arb000000010535","USD"],["zdxv6o1nyd2f2xc","arl000000886123","USD"],["qt2vplc16u70kld","arb000000009135","USD"],["4b4jc3n3ge6oyw4","arb000000010753","USD"],["4b4jc3n3ge6oyw4","arl000000887407","USD"],["4b4jc3n3ge6oyw4","arb000000002329","USD"],["ra8sphjuoi88bw8","arb000000004191","USD"],["ra8sphjuoi88bw8","arb000000006783","USD"],["ra8sphjuoi88bw8","arb000000007593","USD"],["ra8sphjuoi88bw8","arb000000012597","USD"],["ra8sphjuoi88bw8","arb000000010767","USD"],["1sc5hqsswaiz7kh","arb000000012913","USD"],["1sc5hqsswaiz7kh","arl000000887395","USD"],["hrbv40uv87hqmia","arb000000002237","USD"],["hrbv40uv87hqmia","arb000000006155","USD"],["hrbv40uv87hqmia","arl000000885689","USD"],["4n3kkiyxizzkw23","arb000000001721","USD"],["4n3kkiyxizzkw23","arb000000006145","USD"],["4n3kkiyxizzkw23","arb000000006723","USD"],["4n3kkiyxizzkw23","arb000000012663","USD"],["4n3kkiyxizzkw23","arb000000006881","USD"],["4n3kkiyxizzkw23","arb000000000713","USD"],["gifggswqaj75hsw","arb000000011217","USD"],["do93u6h4qom2das","arl000000885801","USD"],["do93u6h4qom2das","arb000000008801","USD"],["do93u6h4qom2das","arb000000007139","USD"],["do93u6h4qom2das","arb000000008827","USD"],["do93u6h4qom2das","arl000000886389","USD"],["do93u6h4qom2das","arb000000007847","USD"],["siydgnnrwg9oyvg","arb000000010905","USD"],["siydgnnrwg9oyvg","arl000000887313","USD"],["siydgnnrwg9oyvg","arb000000007603","USD"],["siydgnnrwg9oyvg","arb000000011323","USD"],["42w7bvfk3aa41ta","arb000000009465","USD"],["42w7bvfk3aa41ta","arl000000885807","USD"],["42w7bvfk3aa41ta","arb000000001767","USD"],["kccu73wtdgdg37q","arb000000001805","USD"],["kccu73wtdgdg37q","arb000000009211","USD"],["rrnw8yc5r1lt5nv","arb000000012109","USD"],["rrnw8yc5r1lt5nv","arb000000002789","USD"],["rrnw8yc5r1lt5nv","arl000000886545","USD"],["yfig64wb7jhonpf","arb000000004835","USD"],["yfig64wb7jhonpf","arb000000000711","USD"],["yfig64wb7jhonpf","arb000000003391","USD"],["yfig64wb7jhonpf","arc000000357586","USD"],["12jv9lnrrim4eaa","arb000000010447","USD"],["12jv9lnrrim4eaa","arb000000012949","USD"],["axpek1qoc1kpieb","arb000000004947","USD"],["axpek1qoc1kpieb","arb000000012427","USD"],["axpek1qoc1kpieb","arb000000009257","USD"],["axpek1qoc1kpieb","arb000000012931","USD"],["axpek1qoc1kpieb","arb000000002381","USD"],["axpek1qoc1kpieb","arb000000001239","USD"],["iy5r43u03ypu4dc","arb000000010149","USD"],["iy5r43u03ypu4dc","arb000000005855","USD"],["sy5fgvo95sznknz","arb000000002301","USD"],["rbqdd5u9exo3f4y","arb000000005981","USD"],["it71i584fbqa3yp","arc000000358198","USD"],["it71i584fbqa3yp","arb000000003799","USD"],["it71i584fbqa3yp","arl000000885663","USD"],["it71i584fbqa3yp","arb000000004035","USD"],["it71i584fbqa3yp","arl000000885753","USD"],["it71i584fbqa3yp","arc000000357664","USD"],["it71i584fbqa3yp","arb000000003443","USD"],["it71i584fbqa3yp","arb000000008333","USD"],["e5nlzklgy3rdqte","arb000000011505","USD"],["e5nlzklgy3rdqte","arb000000000899","USD"],["e5nlzklgy3rdqte","arb000000005761","USD"],["7xnl1xaf70vkcnl","arb000000010135","USD"],["7xnl1xaf70vkcnl","arb000000008027","USD"],["n8496wcn2n9zpwx","arb000000010659","USD"],["n8496wcn2n9zpwx","arb000000012467","USD"],["n8496wcn2n9zpwx","arb000000010317","USD"],["n8496wcn2n9zpwx","arb000000010615","USD"],["1jlkfnx0e27l7sz","arb000000007865","USD"],["1jlkfnx0e27l7sz","arb000000004581","USD"],["1jlkfnx0e27l7sz","arb000000007995","USD"],["1jlkfnx0e27l7sz","arb000000012309","USD"],["1jlkfnx0e27l7sz","arb000000006831","USD"],["1jlkfnx0e27l7sz","arb000000005241","USD"],["1jlkfnx0e27l7sz","arb000000011635","USD"],["c6d0uoja7uchp5g","arb000000011469","USD"],["c6d0uoja7uchp5g","arb000000009591","USD"],["97e54be8ko09lax","arl000000886305","USD"],["97e54be8ko09lax","arb000000001225","USD"],["tvxbc7cmdprqxkg","arb000000002867","USD"],["tvxbc7cmdprqxkg","arb000000012087","USD"],["tvxbc7cmdprqxkg","arb000000004565","USD"],["ytqcst73omsq3pi","arb000000001559","USD"],["ytqcst73omsq3pi","arb000000003897","USD"],["ytqcst73omsq3pi","arl000000886317","USD"],["ytqcst73omsq3pi","arb000000012383","USD"],["ytqcst73omsq3pi","arc000000358345","USD"],["9c8hs7b7gb12soe","arb000000008639","USD"],["9c8hs7b7gb12soe","arl000000885975","USD"],["9c8hs7b7gb12soe","arb000000002377","USD"],["9c8hs7b7gb12soe","arb000000012719","USD"],["9c8hs7b7gb12soe","arb000000008691","USD"],["9c8hs7b7gb12soe","arb000000007355","USD"],["9c8hs7b7gb12soe","arb000000008207","USD"],["9c8hs7b7gb12soe","arb000000005611","USD"],["9c8hs7b7gb12soe","arb000000008787","USD"],["9c8hs7b7gb12soe","arb000000012291","USD"],["9c8hs7b7gb12soe","arb000000000863","USD"],["tbl5fl0cv3w406r","arl000000887045","USD"],["tbl5fl0cv3w406r","arb000000008767","USD"],["tbl5fl0cv3w406r","arb000000006545","USD"],["tbl5fl0cv3w406r","arl000000886373","USD"],["vxz72ea5t1olfzw","arb000000002181","USD"],["vxz72ea5t1olfzw","arb000000010041","USD"],["vxz72ea5t1olfzw","arb000000001329","USD"],["vxz72ea5t1olfzw","arb000000010827","USD"],["lkqwblirjmry4qj","arb000000009353","USD"],["lkqwblirjmry4qj","arb000000010715","USD"],["lkqwblirjmry4qj","arb000000009177","USD"],["yxwn9zb68lmwhbv","arb000000003319","USD"],["yxwn9zb68lmwhbv","arb000000003951","USD"],["yxwn9zb68lmwhbv","arb000000011073","USD"],["yxwn9zb68lmwhbv","arb000000003049","USD"],["yxwn9zb68lmwhbv","arc000000357073","USD"],["yxwn9zb68lmwhbv","arb000000006081","USD"],["yxwn9zb68lmwhbv","arc000000358426","USD"],["yxwn9zb68lmwhbv","arc000000357478","USD"],["wjk8zy8xo6xq033","arb000000005447","USD"],["g11twqdxt1q39xg","arb000000004011","USD"],["tnkufdchv6u1jjr","arl000000887075","USD"],["tnkufdchv6u1jjr","arb000000002985","USD"],["tnkufdchv6u1jjr","arb000000002565","USD"],["d509t2z2d8yhhpm","arb000000010779","USD"],["d509t2z2d8yhhpm","arb000000009187","USD"],["d509t2z2d8yhhpm","arb000000009595","USD"],["d509t2z2d8yhhpm","arl000000885677","USD"],["d509t2z2d8yhhpm","arb000000005381","USD"],["6mffyfd8ujzi7la","arb000000003315","USD"],["6mffyfd8ujzi7la","arb000000003477","USD"],["6mffyfd8ujzi7la","arb000000005003","USD"],["6mffyfd8ujzi7la","arc000000357472","USD"],["6mffyfd8ujzi7la","arc000000357715","USD"],["6mffyfd8ujzi7la","arb000000006909","USD"],["6mffyfd8ujzi7la","arl000000887401","USD"],["2ws06qaz6dmpu1c","arb000000008853","USD"],["2ws06qaz6dmpu1c","arb000000009371","USD"],["2ws06qaz6dmpu1c","arb000000003575","USD"],["2ws06qaz6dmpu1c","arc000000357862","USD"],["2ws06qaz6dmpu1c","arl000000886445","USD"],["2ws06qaz6dmpu1c","arb000000006589","USD"],["a5rx9d903enf3qt","arb000000006501","USD"],["a5rx9d903enf3qt","arb000000006567","USD"],["a5rx9d903enf3qt","arb000000002463","USD"],["om5e7a862azo21d","arb000000002417","USD"],["om5e7a862azo21d","arb000000011821","USD"],["ufrfinrtur1amsd","arb000000001469","USD"],["ufrfinrtur1amsd","arb000000011787","USD"],["ufrfinrtur1amsd","arb000000006083","USD"],["bfm5eq2sgjndgd2","arl000000886897","USD"],["a4gr7y95bxero67","arb000000006173","USD"],["a4gr7y95bxero67","arb000000009855","USD"],["uyb661tkddhqxjr","arb000000000835","USD"],["uyb661tkddhqxjr","arb000000001911","USD"],["uyb661tkddhqxjr","arb000000005771","USD"],["uyb661tkddhqxjr","arb000000011467","USD"],["ffqi96v5xcuvl1d","arb000000001373","USD"],["ffqi96v5xcuvl1d","arb000000007511","USD"],["ffqi96v5xcuvl1d","arb000000001267","USD"],["ffqi96v5xcuvl1d","arb000000004727","USD"],["u1yeinyt3liyq1s","arb000000004365","USD"],["u1yeinyt3liyq1s","arl000000886085","USD"],["u1yeinyt3liyq1s","arb000000001235","USD"],["a6tj4ynt9qiemvo","arb000000005075","USD"],["a6tj4ynt9qiemvo","arb000000011403","USD"],["a6tj4ynt9qiemvo","arb000000005865","USD"],["a6tj4ynt9qiemvo","arb000000010221","USD"],["a6tj4ynt9qiemvo","arb000000006879","USD"],["a6tj4ynt9qiemvo","arb000000009729","USD"],["ooqp7y9apmzm0ec","arb000000012849","USD"],["ooqp7y9apmzm0ec","arb000000005803","USD"],["z679h3r3iqfebjx","arb000000004781","USD"],["z679h3r3iqfebjx","arb000000006231","USD"],["z679h3r3iqfebjx","arb000000001285","USD"],["l909cx8qg92icmj","arb000000004119","USD"],["dnsx2u0tqw05d5a","arb000000007917","USD"],["dnsx2u0tqw05d5a","arb000000003629","USD"],["dnsx2u0tqw05d5a","arb000000001317","USD"],["dnsx2u0tqw05d5a","arc000000357943","USD"],["nfa0a4qqf9ovpin","arb000000006883","USD"],["nfa0a4qqf9ovpin","arb000000006535","USD"],["nfa0a4qqf9ovpin","arb000000012753","USD"],["nfa0a4qqf9ovpin","arb000000004369","USD"],["jmpspn1nbwwnr3q","arl000000886335","USD"],["jmpspn1nbwwnr3q","arl000000885617","USD"],["jmpspn1nbwwnr3q","arb000000007409","USD"],["jmpspn1nbwwnr3q","arl000000885585","USD"],["r4jhqs85p3xh8no","arl000000886523","USD"],["r4jhqs85p3xh8no","arb000000001879","USD"],["r4jhqs85p3xh8no","arb000000011183","USD"],["r4jhqs85p3xh8no","arb000000001933","USD"],["f28c6y5f2euswhg","arb000000012449","USD"],["f28c6y5f2euswhg","arb000000001803","USD"],["f28c6y5f2euswhg","arb000000002083","USD"],["q7bv766azhriwpy","arb000000002487","USD"],["q7bv766azhriwpy","arb000000011135","USD"],["q7bv766azhriwpy","arb000000011729","USD"],["q7bv766azhriwpy","arb000000003153","USD"],["q7bv766azhriwpy","arb000000001927","USD"],["q7bv766azhriwpy","arc000000357229","USD"],["gql9eotf0u4iwqb","arb000000007581","USD"],["gql9eotf0u4iwqb","arl000000886575","USD"],["gql9eotf0u4iwqb","arb000000006873","USD"],["6ozzde4w5pz6hal","arl000000887011","USD"],["xnkv5kzn4kxjtqw","arb000000011155","USD"],["xnkv5kzn4kxjtqw","arb000000008611","USD"],["xnkv5kzn4kxjtqw","arl000000887323","USD"],["xnkv5kzn4kxjtqw","arb000000010265","USD"],["xnkv5kzn4kxjtqw","arb000000005103","USD"],["gmf64oqztih43ln","arb000000000887","USD"],["gmf64oqztih43ln","arb000000010611","USD"],["33x0dhn1h6rjh8v","arl000000886005","USD"],["33x0dhn1h6rjh8v","arb000000004181","USD"],["33x0dhn1h6rjh8v","arb000000010583","USD"],["sqw8c8gx87n35fr","arl000000886685","USD"],["sqw8c8gx87n35fr","arb000000003057","USD"],["sqw8c8gx87n35fr","arc000000357085","USD"],["l5vp98hyv3szkk0","arb000000004707","USD"],["l5vp98hyv3szkk0","arb000000004253","USD"],["l5vp98hyv3szkk0","arb000000010027","USD"],["pb7jdm7tau67zwn","arb000000006069","USD"],["pb7jdm7tau67zwn","arb000000007813","USD"],["pb7jdm7tau67zwn","arb000000007351","USD"],["pb7jdm7tau67zwn","arb000000006441","USD"],["p42swtxjpmc56pe","arb000000005929","USD"],["p42swtxjpmc56pe","arb000000012791","USD"],["p42swtxjpmc56pe","arl000000885857","USD"],["p42swtxjpmc56pe","arb000000009307","USD"],["p42swtxjpmc56pe","arb000000005295","USD"],["p42swtxjpmc56pe","arb000000011681","USD"],["80xzoabsxp48w4c","arb000000002933","USD"],["80xzoabsxp48w4c","arl000000886167","USD"],["80xzoabsxp48w4c","arl000000886141","USD"],["80xzoabsxp48w4c","arl000000885571","USD"],["80xzoabsxp48w4c","arb000000008569","USD"],["05a10bvvnjjw4qg","arb000000012869","USD"],["05a10bvvnjjw4qg","arl000000887417","USD"],["05a10bvvnjjw4qg","arb000000001519","USD"],["05a10bvvnjjw4qg","arb000000009813","USD"],["9ln96hhczbzsg1m","arb000000009649","USD"],["9ln96hhczbzsg1m","arb000000003679","USD"],["9ln96hhczbzsg1m","arc000000358018","USD"],["9ln96hhczbzsg1m","arb000000002281","USD"],["9ln96hhczbzsg1m","arb000000005469","USD"],["9ln96hhczbzsg1m","arb000000011311","USD"],["kisoxcen9rxcwxc","arb000000008703","USD"],["kisoxcen9rxcwxc","arb000000011277","USD"],["p6ldcdvmyj46w0j","arb000000005121","USD"],["p6ldcdvmyj46w0j","arc000000357829","USD"],["p6ldcdvmyj46w0j","arb000000003553","USD"],["4o956b319ohl327","arl000000886449","USD"],["4o956b319ohl327","arb000000001179","USD"],["4o956b319ohl327","arb000000009521","USD"],["4o956b319ohl327","arb000000002431","USD"],["wq5dhiw333f0uvs","arb000000007481","USD"],["wq5dhiw333f0uvs","arb000000004585","USD"],["wq5dhiw333f0uvs","arb000000012677","USD"],["wq5dhiw333f0uvs","arb000000004937","USD"],["wq5dhiw333f0uvs","arb000000007781","USD"],["gu0nxq9f24inh2e","arb000000002641","USD"],["gu0nxq9f24inh2e","arb000000011669","USD"],["ez1otfynjulczlt","arb000000008507","USD"],["ez1otfynjulczlt","arb000000009543","USD"],["ez1otfynjulczlt","arb000000012911","USD"],["1vsvkinjdmcw940","arb000000012367","USD"],["1vsvkinjdmcw940","arb000000007309","USD"],["1vsvkinjdmcw940","arb000000011817","USD"],["1vsvkinjdmcw940","arb000000006543","USD"],["izf8hlwf25nwq1m","arb000000010823","USD"],["izf8hlwf25nwq1m","arb000000003467","USD"],["izf8hlwf25nwq1m","arb000000005145","USD"],["izf8hlwf25nwq1m","arb000000010853","USD"],["izf8hlwf25nwq1m","arc000000357700","USD"],["izf8hlwf25nwq1m","arb000000005893","USD"],["6wc433u1hu5ozwb","arb000000001437","USD"],["6wc433u1hu5ozwb","arb000000012169","USD"],["6wc433u1hu5ozwb","arb000000007941","USD"],["dewhzhx4nifco9r","arb000000009845","USD"],["dewhzhx4nifco9r","arb000000010333","USD"],["dewhzhx4nifco9r","arb000000005599","USD"],["dewhzhx4nifco9r","arb000000007081","USD"],["dewhzhx4nifco9r","arb000000009517","USD"],["gzd2t0lew2zsxni","arb000000012565","USD"],["gzd2t0lew2zsxni","arb000000010131","USD"],["gzd2t0lew2zsxni","arb000000011385","USD"],["xuqy4ncpjhf929v","arb000000008329","USD"],["xuqy4ncpjhf929v","arl000000886475","USD"],["xuqy4ncpjhf929v","arb000000011579","USD"],["sko2k7v3ql3deis","arb000000008679","USD"],["sko2k7v3ql3deis","arc000000357355","USD"],["sko2k7v3ql3deis","arb000000003237","USD"],["sko2k7v3ql3deis","arl000000887141","USD"],["6cjuf43prest5ng","arb000000007077","USD"],["6cjuf43prest5ng","arb000000007151","USD"],["6cjuf43prest5ng","arc000000357658","USD"],["6cjuf43prest5ng","arb000000008153","USD"],["6cjuf43prest5ng","arb000000001687","USD"],["6cjuf43prest5ng","arb000000012529","USD"],["6cjuf43prest5ng","arb000000003439","USD"],["6cjuf43prest5ng","arb000000006367","USD"],["6cjuf43prest5ng","arb000000002325","USD"],["txftu3nde44lqcy","arb000000001143","USD"],["txftu3nde44lqcy","arb000000005801","USD"],["08t1occbv2n6kp3","arb000000002663","USD"],["tqnksw154wvbs78","arb000000005065","USD"],["tqnksw154wvbs78","arb000000000659","USD"],["tqnksw154wvbs78","arl000000886535","USD"],["tqnksw154wvbs78","arb000000003725","USD"],["tqnksw154wvbs78","arb000000007855","USD"],["tqnksw154wvbs78","arc000000358087","USD"],["atsqqymqx9mwq9m","arb000000006609","USD"],["atsqqymqx9mwq9m","arb000000007697","USD"],["atsqqymqx9mwq9m","arl000000886895","USD"],["atsqqymqx9mwq9m","arb000000009869","USD"],["dz9hii9j0u2k9lk","arb000000012311","USD"],["dz9hii9j0u2k9lk","arb000000007801","USD"],["dz9hii9j0u2k9lk","arb000000000683","USD"],["dz9hii9j0u2k9lk","arb000000002537","USD"],["3y2fe7igz2crbcs","arl000000885509","USD"],["3y2fe7igz2crbcs","arb000000011853","USD"],["3y2fe7igz2crbcs","arb000000008795","USD"],["3y2fe7igz2crbcs","arb000000012785","USD"],["oxros6mqea5x0zz","arb000000009317","USD"],["oxros6mqea5x0zz","arb000000008127","USD"],["oxros6mqea5x0zz","arl000000885523","USD"],["oxros6mqea5x0zz","arb000000006757","USD"],["unc5qq80l33eyl6","arb000000009847","USD"],["unc5qq80l33eyl6","arc000000357490","USD"],["unc5qq80l33eyl6","arb000000012209","USD"],["unc5qq80l33eyl6","arb000000003327","USD"],["unc5qq80l33eyl6","arb000000006041","USD"],["lvsna4df0pi6yk0","arb000000000997","USD"],["lvsna4df0pi6yk0","arb000000003765","USD"],["lvsna4df0pi6yk0","arc000000357847","USD"],["lvsna4df0pi6yk0","arb000000010409","USD"],["lvsna4df0pi6yk0","arl000000887373","USD"],["lvsna4df0pi6yk0","arc000000358147","USD"],["lvsna4df0pi6yk0","arb000000003565","USD"],["ppfbjcsr90ne7ja","arb000000008797","USD"],["ppfbjcsr90ne7ja","arb000000001637","USD"],["3rz630ynyh9e6cw","arl000000887181","USD"],["3rz630ynyh9e6cw","arc000000357754","USD"],["3rz630ynyh9e6cw","arb000000010287","USD"],["3rz630ynyh9e6cw","arb000000008357","USD"],["3rz630ynyh9e6cw","arl000000885553","USD"],["3rz630ynyh9e6cw","arb000000003503","USD"],["pqk0xzmw75eq4t9","arb000000007447","USD"],["fh9ggpn6nbacnx0","arb000000000783","USD"],["fh9ggpn6nbacnx0","arb000000010771","USD"],["dqbzero0kuux891","arc000000358483","USD"],["dqbzero0kuux891","arb000000010507","USD"],["dqbzero0kuux891","arb000000001929","USD"],["dqbzero0kuux891","arb000000003989","USD"],["dqbzero0kuux891","arb000000004769","USD"],["rmkt360iikc9ysd","arb000000010219","USD"],["rmkt360iikc9ysd","arc000000357235","USD"],["rmkt360iikc9ysd","arl000000885525","USD"],["rmkt360iikc9ysd","arb000000003157","USD"],["jil030vwer2g9vl","arb000000010103","USD"],["66lcmbjrok7dp7m","arl000000887053","USD"],["66lcmbjrok7dp7m","arb000000006527","USD"],["66lcmbjrok7dp7m","arb000000008775","USD"],["66lcmbjrok7dp7m","arb000000011405","USD"],["09a8w77myokgzs9","arl000000887145","USD"],["09a8w77myokgzs9","arb000000001073","USD"],["09a8w77myokgzs9","arb000000011233","USD"],["09a8w77myokgzs9","arb000000012061","USD"],["09a8w77myokgzs9","arb000000004343","USD"],["6owptax197othyp","arb000000009737","USD"],["6owptax197othyp","arb000000002897","USD"],["6owptax197othyp","arb000000004887","USD"],["6owptax197othyp","arb000000002783","USD"],["6owptax197othyp","arb000000000875","USD"],["1x7d3jma660rvqn","arb000000008921","USD"],["1x7d3jma660rvqn","arb000000010313","USD"],["1x7d3jma660rvqn","arb000000004315","USD"],["1x7d3jma660rvqn","arb000000004299","USD"],["tvt5381s7crclxx","arb000000002859","USD"],["tvt5381s7crclxx","arb000000009747","USD"],["tvt5381s7crclxx","arb000000001995","USD"],["tvt5381s7crclxx","arb000000010765","USD"],["tvt5381s7crclxx","arl000000886115","USD"],["nc4f52ia2iil5a1","arb000000002809","USD"],["nc4f52ia2iil5a1","arl000000886577","USD"],["yjz01wbuhmpegy7","arb000000005415","USD"],["ylzmvb7gwwip4de","arb000000000691","USD"],["tg8p9bgp796sine","arb000000008431","USD"],["tg8p9bgp796sine","arb000000012077","USD"],["tg8p9bgp796sine","arl000000886303","USD"],["tg8p9bgp796sine","arb000000010979","USD"],["lg0juit1g965a5k","arb000000004221","USD"],["lg0juit1g965a5k","arl000000885791","USD"],["lg0juit1g965a5k","arb000000001105","USD"],["lg0juit1g965a5k","arb000000012003","USD"],["lg0juit1g965a5k","arl000000886557","USD"],["ji6ueffobyw6o0f","arc000000357994","USD"],["ji6ueffobyw6o0f","arb000000003663","USD"],["xqs55fu47u7ung1","arb000000011163","USD"],["09yknd4gdxxwyxl","arb000000008307","USD"],["09yknd4gdxxwyxl","arb000000010241","USD"],["09yknd4gdxxwyxl","arb000000004881","USD"],["y3ouuza8eynubxe","arb000000011517","USD"],["y3ouuza8eynubxe","arb000000004785","USD"],["y3ouuza8eynubxe","arb000000011295","USD"],["y3ouuza8eynubxe","arb000000010631","USD"],["y3ouuza8eynubxe","arl000000887253","USD"],["y3ouuza8eynubxe","arb000000009585","USD"],["274jq1uyz0twe4p","arb000000003413","USD"],["274jq1uyz0twe4p","arb000000010885","USD"],["274jq1uyz0twe4p","arb000000004969","USD"],["274jq1uyz0twe4p","arc000000357619","USD"],["274jq1uyz0twe4p","arb000000009901","USD"],["7abhioeussc2yte","arl000000887289","USD"],["7abhioeussc2yte","arb000000002225","USD"],["7abhioeussc2yte","arb000000007197","USD"],["7abhioeussc2yte","arb000000010775","USD"],["oa0fcz7i9kirke2","arl000000886767","USD"],["oa0fcz7i9kirke2","arb000000010033","USD"],["oa0fcz7i9kirke2","arb000000012041","USD"],["oa0fcz7i9kirke2","arb000000001967","USD"],["oa0fcz7i9kirke2","arb000000006319","USD"],["hkn1yb5lut7cnlo","arb000000010191","USD"],["hkn1yb5lut7cnlo","arl000000886421","USD"],["hkn1yb5lut7cnlo","arb000000002129","USD"],["9yoagm03xghymye","arb000000006191","USD"],["9yoagm03xghymye","arb000000008255","USD"],["9yoagm03xghymye","arb000000012341","USD"],["9yoagm03xghymye","arb000000011977","USD"],["9yoagm03xghymye","arb000000008469","USD"],["9yoagm03xghymye","arb000000010091","USD"],["9yoagm03xghymye","arl000000886261","USD"],["1xos3fk01kyyfl1","arb000000007047","USD"],["1xos3fk01kyyfl1","arb000000012811","USD"],["1xos3fk01kyyfl1","arl000000885823","USD"],["1xos3fk01kyyfl1","arb000000009957","USD"],["1xos3fk01kyyfl1","arb000000012219","USD"],["mn2nk6l0f2kox1y","arb000000004235","USD"],["mn2nk6l0f2kox1y","arb000000008531","USD"],["mn2nk6l0f2kox1y","arb000000009299","USD"],["emj34ta4gudgzre","arb000000010357","USD"],["emj34ta4gudgzre","arb000000003221","USD"],["emj34ta4gudgzre","arb000000004393","USD"],["emj34ta4gudgzre","arc000000357331","USD"],["utirdlb1985zy52","arb000000010553","USD"],["utirdlb1985zy52","arb000000007121","USD"],["utirdlb1985zy52","arb000000011685","USD"],["utirdlb1985zy52","arb000000012981","USD"],["jha29nuw8t59gaz","arb000000001117","USD"],["jha29nuw8t59gaz","arb000000005305","USD"],["jha29nuw8t59gaz","arb000000011421","USD"],["jha29nuw8t59gaz","arb000000005587","USD"],["jha29nuw8t59gaz","arl000000887449","USD"],["bnutiquj444ff06","arb000000004973","USD"],["bnutiquj444ff06","arl000000886681","USD"],["bnutiquj444ff06","arb000000009765","USD"],["bnutiquj444ff06","arb000000005563","USD"],["dbicd17unor07xo","arl000000887463","USD"],["w90y7rfvfo11lug","arb000000002275","USD"],["w90y7rfvfo11lug","arb000000006119","USD"],["swmmab028h02vyf","arb000000010739","USD"],["swmmab028h02vyf","arb000000006999","USD"],["swmmab028h02vyf","arb000000002287","USD"],["swmmab028h02vyf","arb000000001169","USD"],["oguo89ylirl2twu","arb000000011589","USD"],["oguo89ylirl2twu","arb000000011133","USD"],["oguo89ylirl2twu","arl000000886381","USD"],["oguo89ylirl2twu","arl000000886981","USD"],["oguo89ylirl2twu","arb000000002719","USD"],["netlnr1uzc9qewv","arb000000012691","USD"],["netlnr1uzc9qewv","arb000000010769","USD"],["netlnr1uzc9qewv","arb000000008633","USD"],["sw0r02z1egozyuw","arb000000003307","USD"],["sw0r02z1egozyuw","arc000000357460","USD"],["sw0r02z1egozyuw","arb000000004475","USD"],["au2fylljq5hz6vo","arb000000002703","USD"],["au2fylljq5hz6vo","arb000000004391","USD"],["au2fylljq5hz6vo","arb000000011569","USD"],["z2ky34l5da9b575","arb000000004843","USD"],["z2ky34l5da9b575","arb000000007551","USD"],["z2ky34l5da9b575","arb000000000797","USD"],["usck2g046tkmank","arb000000008711","USD"],["usck2g046tkmank","arb000000002695","USD"],["zjwz55bhfbfjs0c","arb000000009281","USD"],["zjwz55bhfbfjs0c","arb000000008779","USD"],["zjwz55bhfbfjs0c","arl000000886331","USD"],["zjwz55bhfbfjs0c","arb000000005961","USD"],["1p4sr1q6qgsk6ja","arc000000357535","USD"],["1p4sr1q6qgsk6ja","arb000000007443","USD"],["1p4sr1q6qgsk6ja","arb000000007833","USD"],["1p4sr1q6qgsk6ja","arb000000003357","USD"],["1p4sr1q6qgsk6ja","arb000000012989","USD"],["hi5uxd8nd33t8ct","arb000000003859","USD"],["hi5uxd8nd33t8ct","arb000000007371","USD"],["hi5uxd8nd33t8ct","arb000000012099","USD"],["hi5uxd8nd33t8ct","arc000000358288","USD"],["hi5uxd8nd33t8ct","arl000000886627","USD"],["hi5uxd8nd33t8ct","arl000000885631","USD"],["es2qi7gryz9ppn1","arb000000002353","USD"],["es2qi7gryz9ppn1","arb000000001023","USD"],["vo8rq7t7jek4ch0","arb000000003129","USD"],["vo8rq7t7jek4ch0","arb000000003395","USD"],["vo8rq7t7jek4ch0","arc000000357592","USD"],["vo8rq7t7jek4ch0","arc000000357193","USD"],["vo8rq7t7jek4ch0","arb000000009819","USD"],["vo8rq7t7jek4ch0","arb000000000921","USD"],["vo8rq7t7jek4ch0","arb000000009857","USD"],["vo8rq7t7jek4ch0","arb000000009375","USD"],["vo8rq7t7jek4ch0","arb000000009949","USD"],["vo8rq7t7jek4ch0","arl000000886595","USD"],["54jsdckr34vga1o","arb000000012453","USD"],["54jsdckr34vga1o","arb000000011833","USD"],["54jsdckr34vga1o","arb000000005025","USD"],["92fvclcdxip8u3i","arb000000006673","USD"],["92fvclcdxip8u3i","arb000000008771","USD"],["92fvclcdxip8u3i","arb000000011913","USD"],["92fvclcdxip8u3i","arb000000011455","USD"],["92fvclcdxip8u3i","arb000000004249","USD"],["92fvclcdxip8u3i","arc000000358330","USD"],["92fvclcdxip8u3i","arb000000003887","USD"],["6j59x2fol65qty5","arb000000002839","USD"],["zz402m4ma6x3ydd","arb000000009811","USD"],["zz402m4ma6x3ydd","arc000000357958","USD"],["zz402m4ma6x3ydd","arb000000002243","USD"],["zz402m4ma6x3ydd","arb000000003639","USD"],["zz402m4ma6x3ydd","arb000000007633","USD"],["r85bi3lqh90vd71","arb000000010401","USD"],["mkywe4f6ssvwhru","arb000000001181","USD"],["mkywe4f6ssvwhru","arb000000006225","USD"],["mkywe4f6ssvwhru","arb000000005609","USD"],["re8o9mjhw12fq2p","arb000000005647","USD"],["re8o9mjhw12fq2p","arb000000001517","USD"],["re8o9mjhw12fq2p","arl000000887285","USD"],["re8o9mjhw12fq2p","arb000000004745","USD"],["re8o9mjhw12fq2p","arb000000011081","USD"],["eeumjaaau384al1","arb000000004361","USD"],["eeumjaaau384al1","arb000000007823","USD"],["eeumjaaau384al1","arl000000886205","USD"],["eeumjaaau384al1","arb000000008427","USD"],["bsw237o5xdk7pii","arb000000007965","USD"],["bsw237o5xdk7pii","arb000000005959","USD"],["sh87oiu2wqlocng","arb000000001347","USD"],["sh87oiu2wqlocng","arb000000008929","USD"],["sh87oiu2wqlocng","arb000000010051","USD"],["sh87oiu2wqlocng","arb000000003785","USD"],["sh87oiu2wqlocng","arb000000000653","USD"],["sh87oiu2wqlocng","arb000000004477","USD"],["sh87oiu2wqlocng","arc000000358177","USD"],["gw2i7lx22x9x33u","arb000000000995","USD"],["gw2i7lx22x9x33u","arb000000012947","USD"],["gw2i7lx22x9x33u","arb000000001483","USD"],["5t6mvwg8q4tah9m","arb000000011273","USD"],["5t6mvwg8q4tah9m","arb000000008401","USD"],["5t6mvwg8q4tah9m","arl000000886357","USD"],["4pi7chqmrciejww","arb000000001807","USD"],["4pi7chqmrciejww","arl000000886617","USD"],["4pi7chqmrciejww","arl000000886447","USD"],["31ss3xmg355san3","arl000000886497","USD"],["zs1648p8zlf8mjz","arl000000885589","USD"],["zs1648p8zlf8mjz","arb000000009895","USD"],["zs1648p8zlf8mjz","arb000000010057","USD"],["zs1648p8zlf8mjz","arb000000001961","USD"],["fz3wemmuwu49p71","arb000000000773","USD"],["fz3wemmuwu49p71","arb000000009383","USD"],["fz3wemmuwu49p71","arb000000009565","USD"],["fz3wemmuwu49p71","arl000000885561","USD"],["fz3wemmuwu49p71","arb000000012483","USD"],["ppihxsv8ml8uzvf","arl000000886797","USD"],["ppihxsv8ml8uzvf","arb000000000699","USD"],["ppihxsv8ml8uzvf","arb000000009703","USD"],["bi9pfandhl85y6h","arl000000885621","USD"],["bi9pfandhl85y6h","arb000000004999","USD"],["bi9pfandhl85y6h","arl000000886743","USD"],["bi9pfandhl85y6h","arl000000886407","USD"],["bi9pfandhl85y6h","arb000000008129","USD"],["bi9pfandhl85y6h","arl000000886283","USD"],["bi9pfandhl85y6h","arb000000006329","USD"],["d0r4km8tilbpebx","arl000000886109","USD"],["d0r4km8tilbpebx","arb000000010565","USD"],["d0r4km8tilbpebx","arb000000002891","USD"],["d0r4km8tilbpebx","arb000000006015","USD"],["d0r4km8tilbpebx","arb000000005607","USD"],["3b5xizcbput21rh","arb000000009913","USD"],["3b5xizcbput21rh","arc000000357820","USD"],["3b5xizcbput21rh","arb000000008675","USD"],["3b5xizcbput21rh","arb000000001823","USD"],["3b5xizcbput21rh","arb000000003547","USD"],["0qz89y9ialg1hgd","arb000000000751","USD"],["0qz89y9ialg1hgd","arb000000011899","USD"],["0qz89y9ialg1hgd","arb000000009559","USD"],["0qz89y9ialg1hgd","arb000000011641","USD"],["0qz89y9ialg1hgd","arb000000000845","USD"],["k79y1jyyycg7m9r","arb000000007465","USD"],["k79y1jyyycg7m9r","arb000000009237","USD"],["k79y1jyyycg7m9r","arb000000001795","USD"],["jr785oaqkxw9mlt","arb000000010695","USD"],["jr785oaqkxw9mlt","arb000000008911","USD"],["jr785oaqkxw9mlt","arb000000000745","USD"],["y6mfppo5pvvlxlb","arl000000887371","USD"],["y6mfppo5pvvlxlb","arb000000008385","USD"],["78sdkguhuwpiht0","arb000000008785","USD"],["78sdkguhuwpiht0","arb000000004117","USD"],["78sdkguhuwpiht0","arb000000012899","USD"],["78sdkguhuwpiht0","arl000000886863","USD"],["78sdkguhuwpiht0","arb000000006711","USD"],["sp2yk7ypxbmzph3","arb000000004367","USD"],["sp2yk7ypxbmzph3","arb000000006955","USD"],["sp2yk7ypxbmzph3","arl000000886127","USD"],["ycu469w06sm853l","arl000000887369","USD"],["ycu469w06sm853l","arb000000007327","USD"],["ycu469w06sm853l","arb000000001749","USD"],["ycu469w06sm853l","arb000000005773","USD"],["ycu469w06sm853l","arb000000000955","USD"],["ycu469w06sm853l","arb000000006637","USD"],["fsspt96ever25ei","arb000000006511","USD"],["99dndlohso1dt33","arb000000001241","USD"],["99dndlohso1dt33","arb000000001087","USD"],["99dndlohso1dt33","arb000000008783","USD"],["99dndlohso1dt33","arb000000011841","USD"],["99dndlohso1dt33","arb000000010417","USD"],["99dndlohso1dt33","arb000000004499","USD"],["qgjoxm9ys0u3lm4","arl000000886093","USD"],["qgjoxm9ys0u3lm4","arb000000001951","USD"],["k78az9u4742o26h","arl000000887007","USD"],["k78az9u4742o26h","arb000000007365","USD"],["k78az9u4742o26h","arb000000008649","USD"],["k78az9u4742o26h","arb000000004203","USD"],["k78az9u4742o26h","arl000000885683","USD"],["k78az9u4742o26h","arb000000004901","USD"],["k78az9u4742o26h","arb000000003889","USD"],["k78az9u4742o26h","arb000000002967","USD"],["k78az9u4742o26h","arc000000358333","USD"],["k78az9u4742o26h","arb000000010399","USD"],["5n6k8k58k1t9rnk","arb000000010991","USD"],["5n6k8k58k1t9rnk","arb000000007131","USD"],["5n6k8k58k1t9rnk","arb000000008845","USD"],["1q9vfouut83sl23","arb000000002553","USD"],["1q9vfouut83sl23","arb000000007363","USD"],["ethclkaiewq6258","arb000000001449","USD"],["ethclkaiewq6258","arb000000010177","USD"],["ethclkaiewq6258","arb000000012959","USD"],["ethclkaiewq6258","arb000000005153","USD"],["ethclkaiewq6258","arb000000004199","USD"],["kcsrdfzhcmvku7s","arb000000010463","USD"],["kcsrdfzhcmvku7s","arb000000007053","USD"],["kcsrdfzhcmvku7s","arb000000003675","USD"],["kcsrdfzhcmvku7s","arc000000358012","USD"],["kcsrdfzhcmvku7s","arb000000007707","USD"],["kcsrdfzhcmvku7s","arb000000008311","USD"],["kcsrdfzhcmvku7s","arl000000885971","USD"],["ljbwl5u177xuifp","arb000000007973","USD"],["ljbwl5u177xuifp","arb000000005509","USD"],["94hl16z67xo6rs1","arb000000008909","USD"],["94hl16z67xo6rs1","arb000000003513","USD"],["94hl16z67xo6rs1","arb000000005877","USD"],["94hl16z67xo6rs1","arc000000357769","USD"],["3bq6n55js159yf5","arb000000006715","USD"],["3bq6n55js159yf5","arb000000002507","USD"],["3bq6n55js159yf5","arb000000001343","USD"],["ratpqj4uz9w80lv","arb000000002007","USD"],["ratpqj4uz9w80lv","arb000000010325","USD"],["ratpqj4uz9w80lv","arb000000010061","USD"],["ratpqj4uz9w80lv","arb000000002285","USD"],["ratpqj4uz9w80lv","arb000000001685","USD"],["84ddqq5mx8rwkxf","arb000000009663","USD"],["84ddqq5mx8rwkxf","arl000000887189","USD"],["84ddqq5mx8rwkxf","arl000000885993","USD"],["84ddqq5mx8rwkxf","arb000000012539","USD"],["84ddqq5mx8rwkxf","arl000000887175","USD"],["ohw4q2ykn9q0os1","arb000000002893","USD"],["ohw4q2ykn9q0os1","arb000000007553","USD"],["ohw4q2ykn9q0os1","arb000000006743","USD"],["ohw4q2ykn9q0os1","arb000000010619","USD"],["vhmk9s8odz1050m","arb000000005281","USD"],["vhmk9s8odz1050m","arb000000004709","USD"],["vhmk9s8odz1050m","arb000000006023","USD"],["vhmk9s8odz1050m","arb000000008271","USD"],["nmuopjk7hvku5at","arb000000004915","USD"],["nmuopjk7hvku5at","arb000000009959","USD"],["nmuopjk7hvku5at","arb000000002029","USD"],["87y67klmqdb26gr","arb000000008035","USD"],["87y67klmqdb26gr","arb000000006309","USD"],["87y67klmqdb26gr","arb000000012155","USD"],["87y67klmqdb26gr","arl000000885927","USD"],["87y67klmqdb26gr","arb000000002799","USD"],["osnpi1ya8i34x6n","arb000000010461","USD"],["osnpi1ya8i34x6n","arb000000001431","USD"],["osnpi1ya8i34x6n","arb000000011117","USD"],["osnpi1ya8i34x6n","arb000000010759","USD"],["osnpi1ya8i34x6n","arb000000011971","USD"],["osnpi1ya8i34x6n","arb000000003219","USD"],["osnpi1ya8i34x6n","arc000000357328","USD"],["199hn5w3pa5l9kx","arc000000357838","USD"],["199hn5w3pa5l9kx","arb000000012933","USD"],["199hn5w3pa5l9kx","arb000000003559","USD"],["199hn5w3pa5l9kx","arb000000006731","USD"],["6ejs7kfbzwdr9zh","arc000000357103","USD"],["6ejs7kfbzwdr9zh","arb000000003069","USD"],["6ejs7kfbzwdr9zh","arl000000887153","USD"],["6ejs7kfbzwdr9zh","arb000000005265","USD"],["8zn0sn9gyhm2jqh","arb000000006763","USD"],["8zn0sn9gyhm2jqh","arb000000008467","USD"],["8zn0sn9gyhm2jqh","arb000000002647","USD"],["8zn0sn9gyhm2jqh","arb000000008273","USD"],["8zn0sn9gyhm2jqh","arb000000001505","USD"],["gz56lej7rqu77df","arb000000012577","USD"],["gz56lej7rqu77df","arb000000011557","USD"],["gz56lej7rqu77df","arb000000007385","USD"],["gz56lej7rqu77df","arb000000001487","USD"],["gz56lej7rqu77df","arb000000000893","USD"],["gz56lej7rqu77df","arb000000004187","USD"],["055na6vkqw5zlqq","arb000000004787","USD"],["055na6vkqw5zlqq","arb000000002773","USD"],["mh2gx9c2hn2y219","arl000000886987","USD"],["mh2gx9c2hn2y219","arb000000004899","USD"],["mh2gx9c2hn2y219","arb000000007971","USD"],["mh2gx9c2hn2y219","arb000000005567","USD"],["xxrrf28xebw2013","arb000000009685","USD"],["xxrrf28xebw2013","arb000000005071","USD"],["xxrrf28xebw2013","arb000000010543","USD"],["xxrrf28xebw2013","arb000000012997","USD"],["3aszxsci3sscium","arb000000009275","USD"],["3aszxsci3sscium","arb000000001921","USD"],["3aszxsci3sscium","arl000000887383","USD"],["3aszxsci3sscium","arb000000012779","USD"],["hb76r68gztdbndi","arb000000009047","USD"],["hb76r68gztdbndi","arb000000007321","USD"],["hb76r68gztdbndi","arb000000000847","USD"],["30rda2sbxhsvpdy","arb000000001893","USD"],["30rda2sbxhsvpdy","arb000000001355","USD"],["30rda2sbxhsvpdy","arb000000011885","USD"],["uv38wxm7b5ve8mq","arb000000006795","USD"],["uv38wxm7b5ve8mq","arb000000002051","USD"],["uv38wxm7b5ve8mq","arb000000008891","USD"],["uv38wxm7b5ve8mq","arb000000007677","USD"],["uv38wxm7b5ve8mq","arb000000002771","USD"],["mibbap2r95a5ui8","arb000000007591","USD"],["mibbap2r95a5ui8","arb000000008851","USD"],["mibbap2r95a5ui8","arb000000009991","USD"],["mibbap2r95a5ui8","arl000000886355","USD"],["mibbap2r95a5ui8","arl000000886413","USD"],["mibbap2r95a5ui8","arb000000005969","USD"],["mibbap2r95a5ui8","arb000000012121","USD"],["loj1n36fnhrln6v","arb000000000929","USD"],["loj1n36fnhrln6v","arl000000885985","USD"],["loj1n36fnhrln6v","arb000000012055","USD"],["loj1n36fnhrln6v","arb000000004799","USD"],["bj1fvwvig4y7mdi","arb000000009709","USD"],["bj1fvwvig4y7mdi","arb000000001849","USD"],["bj1fvwvig4y7mdi","arb000000007191","USD"],["bj1fvwvig4y7mdi","arb000000011613","USD"],["a6tacxbkmbhromo","arb000000001525","USD"],["g7w9lkjszx8fyts","arb000000001259","USD"],["g7w9lkjszx8fyts","arb000000001549","USD"],["g7w9lkjszx8fyts","arb000000012157","USD"],["uiiedpxgtrfvuo9","arb000000009151","USD"],["uiiedpxgtrfvuo9","arb000000000911","USD"],["uiiedpxgtrfvuo9","arb000000010705","USD"],["uiiedpxgtrfvuo9","arl000000886613","USD"],["576ng79n8pz4pep","arl000000886997","USD"],["576ng79n8pz4pep","arb000000002277","USD"],["576ng79n8pz4pep","arb000000002541","USD"],["576ng79n8pz4pep","arb000000003845","USD"],["576ng79n8pz4pep","arc000000358267","USD"],["576ng79n8pz4pep","arb000000012293","USD"],["576ng79n8pz4pep","arb000000007743","USD"],["ijmr7652g33cvr7","arb000000002445","USD"],["ijmr7652g33cvr7","arb000000010415","USD"],["okgtave5alc502t","arb000000007841","USD"],["okgtave5alc502t","arb000000009853","USD"],["okgtave5alc502t","arb000000004739","USD"],["vzpmfevzx3eh7no","arb000000011113","USD"],["vzpmfevzx3eh7no","arl000000885575","USD"],["vzpmfevzx3eh7no","arb000000001715","USD"],["vzpmfevzx3eh7no","arb000000004003","USD"],["vzpmfevzx3eh7no","arb000000001663","USD"],["vzpmfevzx3eh7no","arb000000004853","USD"],["vzpmfevzx3eh7no","arb000000010571","USD"],["ql8w7os51yprn6x","arb000000008041","USD"],["ql8w7os51yprn6x","arb000000008257","USD"],["x2vn43pjetthap7","arb000000007323","USD"],["x2vn43pjetthap7","arb000000006633","USD"],["x2vn43pjetthap7","arb000000000715","USD"],["9tc8xrf8o6broj3","arb000000003243","USD"],["9tc8xrf8o6broj3","arb000000003415","USD"],["9tc8xrf8o6broj3","arb000000009455","USD"],["9tc8xrf8o6broj3","arc000000357364","USD"],["9tc8xrf8o6broj3","arc000000357622","USD"],["9tc8xrf8o6broj3","arb000000001877","USD"],["yilrwtpe09l33nb","arb000000002777","USD"],["yilrwtpe09l33nb","arb000000007001","USD"],["yilrwtpe09l33nb","arb000000001667","USD"],["yilrwtpe09l33nb","arb000000006489","USD"],["3iipz5ito42xkkb","arb000000007207","USD"],["3iipz5ito42xkkb","arb000000002645","USD"],["3iipz5ito42xkkb","arb000000005389","USD"],["aoiw9nqe280hrks","arl000000885893","USD"],["aoiw9nqe280hrks","arb000000010021","USD"],["aoiw9nqe280hrks","arc000000357259","USD"],["aoiw9nqe280hrks","arb000000003173","USD"],["aoiw9nqe280hrks","arb000000005887","USD"],["snt80d0s2yqjl82","arb000000003643","USD"],["snt80d0s2yqjl82","arb000000006531","USD"],["snt80d0s2yqjl82","arc000000357964","USD"],["snt80d0s2yqjl82","arb000000002063","USD"],["snt80d0s2yqjl82","arb000000001029","USD"],["snt80d0s2yqjl82","arb000000009799","USD"],["snt80d0s2yqjl82","arb000000005785","USD"],["6tv86lq3xighdjp","arl000000886229","USD"],["b9ozfvxi3kv4f21","arb000000001907","USD"],["b9ozfvxi3kv4f21","arb000000012257","USD"],["b9ozfvxi3kv4f21","arb000000005131","USD"],["8wsrh7o0cvjpkia","arl000000887115","USD"],["8wsrh7o0cvjpkia","arb000000009897","USD"],["8wsrh7o0cvjpkia","arb000000010117","USD"],["8wsrh7o0cvjpkia","arb000000009467","USD"],["ct2vngmlejc3vlv","arb000000003447","USD"],["ct2vngmlejc3vlv","arb000000011475","USD"],["ct2vngmlejc3vlv","arb000000006241","USD"],["ct2vngmlejc3vlv","arc000000357670","USD"],["ct2vngmlejc3vlv","arl000000887397","USD"],["ct2vngmlejc3vlv","arb000000008015","USD"],["rmi3iprn3e1aca7","arb000000007051","USD"],["rmi3iprn3e1aca7","arb000000000677","USD"],["nrgjqldc7pkahce","arb000000009977","USD"],["thwzoc471yxbevv","arb000000006239","USD"],["thwzoc471yxbevv","arb000000005215","USD"],["thwzoc471yxbevv","arl000000886361","USD"],["thwzoc471yxbevv","arc000000357121","USD"],["thwzoc471yxbevv","arb000000003081","USD"],["thwzoc471yxbevv","arb000000004037","USD"],["thwzoc471yxbevv","arb000000009293","USD"],["thwzoc471yxbevv","arb000000001425","USD"],["d20334iinzrtasy","arb000000003935","USD"],["d20334iinzrtasy","arb000000009941","USD"],["d20334iinzrtasy","arc000000358402","USD"],["d20334iinzrtasy","arb000000003389","USD"],["d20334iinzrtasy","arc000000357583","USD"],["d20334iinzrtasy","arb000000010101","USD"],["d20334iinzrtasy","arb000000008647","USD"],["d20334iinzrtasy","arb000000012793","USD"],["d20334iinzrtasy","arb000000006375","USD"],["d20334iinzrtasy","arb000000006517","USD"],["d20334iinzrtasy","arb000000005375","USD"],["d20334iinzrtasy","arb000000004471","USD"],["d20334iinzrtasy","arb000000004153","USD"],["8god3w4w1t240qn","arb000000012837","USD"],["8god3w4w1t240qn","arb000000011249","USD"],["vib8tv8257chzr8","arb000000009789","USD"],["vib8tv8257chzr8","arl000000886455","USD"],["vib8tv8257chzr8","arb000000011705","USD"],["8eciio67yrfd2tt","arb000000005721","USD"],["8eciio67yrfd2tt","arb000000001201","USD"],["8eciio67yrfd2tt","arb000000003365","USD"],["8eciio67yrfd2tt","arc000000357547","USD"],["8eciio67yrfd2tt","arb000000006859","USD"],["irxhk83q9xnzkop","arb000000003901","USD"],["irxhk83q9xnzkop","arl000000886507","USD"],["irxhk83q9xnzkop","arb000000001615","USD"],["irxhk83q9xnzkop","arb000000007379","USD"],["irxhk83q9xnzkop","arc000000358351","USD"],["2mjhcixocygh4jn","arb000000007515","USD"],["2mjhcixocygh4jn","arb000000006719","USD"],["2mjhcixocygh4jn","arb000000007737","USD"],["2mjhcixocygh4jn","arl000000886081","USD"],["2mjhcixocygh4jn","arb000000002155","USD"],["0y5xclh3ybehaza","arb000000004473","USD"],["x53751qp2junrie","arb000000009587","USD"],["x53751qp2junrie","arb000000002041","USD"],["x53751qp2junrie","arb000000006867","USD"],["x53751qp2junrie","arb000000005323","USD"],["w47x0ymtwj4kwlk","arb000000004737","USD"],["w47x0ymtwj4kwlk","arl000000887483","USD"],["w47x0ymtwj4kwlk","arb000000002145","USD"],["w47x0ymtwj4kwlk","arb000000002989","USD"],["w47x0ymtwj4kwlk","arb000000008813","USD"],["w47x0ymtwj4kwlk","arl000000886489","USD"],["w47x0ymtwj4kwlk","arb000000011651","USD"],["6uuy95ieptzbux5","arb000000000687","USD"],["6uuy95ieptzbux5","arb000000008267","USD"],["6uuy95ieptzbux5","arb000000004133","USD"],["6uuy95ieptzbux5","arl000000886665","USD"],["6uuy95ieptzbux5","arb000000008773","USD"],["eypkmrm82hagk0r","arb000000005051","USD"],["eypkmrm82hagk0r","arb000000001725","USD"],["eypkmrm82hagk0r","arb000000007331","USD"],["lp6tk13ajpiitkv","arl000000887391","USD"],["lp6tk13ajpiitkv","arb000000011887","USD"],["lp6tk13ajpiitkv","arb000000002577","USD"],["lp6tk13ajpiitkv","arl000000885843","USD"],["lp6tk13ajpiitkv","arb000000011225","USD"],["sttexibb6nwurkc","arb000000004425","USD"],["sttexibb6nwurkc","arb000000008117","USD"],["sttexibb6nwurkc","arb000000004247","USD"],["6xld2o5lm6gzz3r","arb000000001891","USD"],["6xld2o5lm6gzz3r","arb000000003191","USD"],["6xld2o5lm6gzz3r","arb000000001639","USD"],["6xld2o5lm6gzz3r","arb000000006977","USD"],["6xld2o5lm6gzz3r","arc000000357286","USD"],["zotwkng00be7268","arb000000009219","USD"],["zotwkng00be7268","arb000000010679","USD"],["zotwkng00be7268","arb000000004983","USD"],["zotwkng00be7268","arl000000887317","USD"],["zotwkng00be7268","arb000000002701","USD"],["zotwkng00be7268","arb000000006735","USD"],["zotwkng00be7268","arb000000009223","USD"],["zotwkng00be7268","arb000000004389","USD"],["zotwkng00be7268","arb000000008753","USD"],["kkjzbaw0i69vrva","arb000000006389","USD"],["kkjzbaw0i69vrva","arb000000006095","USD"],["kkjzbaw0i69vrva","arb000000002003","USD"],["v50lmoz8mowm07x","arb000000003957","USD"],["v50lmoz8mowm07x","arc000000358435","USD"],["v50lmoz8mowm07x","arb000000009423","USD"],["36jjw6623tiythm","arb000000004465","USD"],["36jjw6623tiythm","arb000000006551","USD"],["36jjw6623tiythm","arb000000006233","USD"],["nk1098szay6n1bs","arb000000011377","USD"],["sxkaivskx7oksuq","arb000000008193","USD"],["sxkaivskx7oksuq","arb000000002099","USD"],["sxkaivskx7oksuq","arb000000008403","USD"],["wp5sdrcwc38smei","arb000000011911","USD"],["wp5sdrcwc38smei","arb000000007073","USD"],["wp5sdrcwc38smei","arb000000006717","USD"],["wp5sdrcwc38smei","arb000000004017","USD"],["wp5sdrcwc38smei","arb000000009863","USD"],["wp5sdrcwc38smei","arb000000007979","USD"],["tirqgk5by5v3l21","arb000000000823","USD"],["tirqgk5by5v3l21","arb000000012827","USD"],["tirqgk5by5v3l21","arb000000001289","USD"],["tirqgk5by5v3l21","arb000000011857","USD"],["j44t9ccaom2g704","arb000000003979","USD"],["j44t9ccaom2g704","arb000000009333","USD"],["j44t9ccaom2g704","arc000000358468","USD"],["j44t9ccaom2g704","arb000000010501","USD"],["dnhltn7smobens4","arb000000010549","USD"],["dnhltn7smobens4","arb000000005397","USD"],["dnhltn7smobens4","arl000000885981","USD"],["a6k6g7h7gy41gc3","arc000000358204","USD"],["a6k6g7h7gy41gc3","arb000000003803","USD"],["a6k6g7h7gy41gc3","arb000000003135","USD"],["a6k6g7h7gy41gc3","arc000000357202","USD"],["a6k6g7h7gy41gc3","arb000000004879","USD"],["a6k6g7h7gy41gc3","arb000000002205","USD"],["a6k6g7h7gy41gc3","arb000000007347","USD"],["20p31nebhw1vpoo","arb000000000747","USD"],["20p31nebhw1vpoo","arb000000009023","USD"],["ej1f4a18fjvjpxe","arb000000010911","USD"],["ej1f4a18fjvjpxe","arb000000011351","USD"],["ej1f4a18fjvjpxe","arb000000009189","USD"],["553zapos0etcwby","arb000000012401","USD"],["553zapos0etcwby","arb000000005433","USD"],["553zapos0etcwby","arb000000006541","USD"],["553zapos0etcwby","arb000000009757","USD"],["brdp8fdbxxi64fz","arb000000007071","USD"],["byy5nefskvvpcnn","arl000000887375","USD"],["byy5nefskvvpcnn","arb000000011939","USD"],["byy5nefskvvpcnn","arb000000005343","USD"],["byy5nefskvvpcnn","arb000000002491","USD"],["i5kadxyb6wk6pkg","arb000000007125","USD"],["i5kadxyb6wk6pkg","arb000000008133","USD"],["i5kadxyb6wk6pkg","arl000000886013","USD"],["rqf1bkqkv4f8umn","arb000000007647","USD"],["rqf1bkqkv4f8umn","arb000000002363","USD"],["rqf1bkqkv4f8umn","arb000000002853","USD"],["6c84t8vxpa4u5cj","arl000000886917","USD"],["6c84t8vxpa4u5cj","arb000000010107","USD"],["6c84t8vxpa4u5cj","arb000000009875","USD"],["6c84t8vxpa4u5cj","arb000000012149","USD"],["bpiy9x1qec6iiaf","arb000000001739","USD"],["bpiy9x1qec6iiaf","arb000000002159","USD"],["bpiy9x1qec6iiaf","arb000000000989","USD"],["fltn96ktlxo7fuh","arc000000358408","USD"],["fltn96ktlxo7fuh","arl000000887351","USD"],["fltn96ktlxo7fuh","arb000000002767","USD"],["fltn96ktlxo7fuh","arb000000008511","USD"],["fltn96ktlxo7fuh","arb000000011127","USD"],["fltn96ktlxo7fuh","arb000000011019","USD"],["fltn96ktlxo7fuh","arb000000003939","USD"],["450t0itna3a6erd","arb000000010985","USD"],["450t0itna3a6erd","arb000000010915","USD"],["450t0itna3a6erd","arb000000010499","USD"],["450t0itna3a6erd","arb000000007749","USD"],["450t0itna3a6erd","arb000000002813","USD"],["450t0itna3a6erd","arb000000009839","USD"],["x6593oee2u2yf9x","arb000000003815","USD"],["x6593oee2u2yf9x","arb000000008341","USD"],["x6593oee2u2yf9x","arb000000005057","USD"],["x6593oee2u2yf9x","arc000000358222","USD"],["opojbnq22u418am","arb000000006923","USD"],["opojbnq22u418am","arl000000886113","USD"],["opojbnq22u418am","arl000000887257","USD"],["1wtgcvf7d56st7y","arb000000012337","USD"],["1wtgcvf7d56st7y","arb000000001063","USD"],["1wtgcvf7d56st7y","arb000000007807","USD"],["1wtgcvf7d56st7y","arb000000003171","USD"],["1wtgcvf7d56st7y","arc000000357256","USD"],["bw30tbzjo2ighio","arb000000006685","USD"],["f3svaxspcp6gmsc","arb000000010383","USD"],["f6ltv2szt0izmjc","arb000000007887","USD"],["f6ltv2szt0izmjc","arb000000012965","USD"],["bud3yxfr7xpcsxc","arb000000006705","USD"],["bud3yxfr7xpcsxc","arb000000011567","USD"],["rac4cqigu1vsfwy","arb000000004593","USD"],["rac4cqigu1vsfwy","arb000000007413","USD"],["kuqqvnolx8jynlu","arb000000003873","USD"],["kuqqvnolx8jynlu","arb000000009675","USD"],["kuqqvnolx8jynlu","arb000000005585","USD"],["kuqqvnolx8jynlu","arb000000010279","USD"],["kuqqvnolx8jynlu","arb000000004489","USD"],["kuqqvnolx8jynlu","arb000000002441","USD"],["kuqqvnolx8jynlu","arb000000009425","USD"],["kuqqvnolx8jynlu","arc000000358309","USD"],["kuqqvnolx8jynlu","arb000000006745","USD"],["5yh7wr5ld4vbmnp","arb000000008429","USD"],["5yh7wr5ld4vbmnp","arb000000005913","USD"],["5yh7wr5ld4vbmnp","arb000000012521","USD"],["5yh7wr5ld4vbmnp","arl000000887065","USD"],["05n51kmts9do0f4","arb000000008975","USD"],["05n51kmts9do0f4","arb000000005475","USD"],["05n51kmts9do0f4","arb000000011441","USD"],["05n51kmts9do0f4","arb000000005557","USD"],["46v46haes4w86wf","arl000000886055","USD"],["46v46haes4w86wf","arb000000003655","USD"],["46v46haes4w86wf","arc000000357982","USD"],["46v46haes4w86wf","arb000000005777","USD"],["46v46haes4w86wf","arb000000008289","USD"],["g8dqiwcu02j1nd4","arb000000002107","USD"],["g8dqiwcu02j1nd4","arc000000357142","USD"],["g8dqiwcu02j1nd4","arb000000003095","USD"],["g8dqiwcu02j1nd4","arb000000012487","USD"],["l9jbymlnnvir3ca","arb000000004921","USD"],["l9jbymlnnvir3ca","arb000000005731","USD"],["l9jbymlnnvir3ca","arb000000003865","USD"],["l9jbymlnnvir3ca","arc000000358297","USD"],["l87i9g9vpk2xt9s","arb000000005975","USD"],["l87i9g9vpk2xt9s","arb000000009459","USD"],["l87i9g9vpk2xt9s","arb000000002151","USD"],["l87i9g9vpk2xt9s","arb000000006607","USD"],["l87i9g9vpk2xt9s","arl000000886091","USD"],["o51pgtk6z9sdwoi","arc000000357076","USD"],["o51pgtk6z9sdwoi","arb000000012271","USD"],["o51pgtk6z9sdwoi","arb000000003051","USD"],["djmqq1i7m8ofqma","arb000000008397","USD"],["djmqq1i7m8ofqma","arb000000005897","USD"],["djmqq1i7m8ofqma","arb000000001013","USD"],["m5e92pdotekxe3d","arb000000012875","USD"],["m5e92pdotekxe3d","arb000000011053","USD"],["m5e92pdotekxe3d","arb000000004001","USD"],["m5e92pdotekxe3d","arb000000002715","USD"],["snbfii7fofyf0hx","arb000000004867","USD"],["snbfii7fofyf0hx","arb000000005017","USD"],["snbfii7fofyf0hx","arb000000006805","USD"],["ek4efb5dsivp202","arb000000008293","USD"],["ek4efb5dsivp202","arb000000009067","USD"],["67us1k3lnanb1ok","arb000000008301","USD"],["67us1k3lnanb1ok","arb000000006887","USD"],["67us1k3lnanb1ok","arb000000007691","USD"],["k51agv8g97q2jk2","arb000000002509","USD"],["k51agv8g97q2jk2","arb000000002209","USD"],["k51agv8g97q2jk2","arb000000007645","USD"],["k51agv8g97q2jk2","arb000000006129","USD"],["k51agv8g97q2jk2","arb000000006385","USD"],["x2m1rjuwp6v1nf7","arl000000887081","USD"],["x2m1rjuwp6v1nf7","arl000000887393","USD"],["x2m1rjuwp6v1nf7","arb000000007253","USD"],["x2m1rjuwp6v1nf7","arb000000008319","USD"],["x2m1rjuwp6v1nf7","arb000000009403","USD"],["mza2ku0aet87zk0","arb000000010233","USD"],["mza2ku0aet87zk0","arb000000012891","USD"],["mza2ku0aet87zk0","arl000000886307","USD"],["mza2ku0aet87zk0","arl000000885715","USD"],["mza2ku0aet87zk0","arb000000012419","USD"],["rmoa7ztg04emhu7","arb000000011301","USD"],["mcm04tz5ga44eit","arb000000005223","USD"],["mcm04tz5ga44eit","arb000000012939","USD"],["mcm04tz5ga44eit","arb000000012387","USD"],["poozydw8zue1cax","arl000000887123","USD"],["poozydw8zue1cax","arl000000885997","USD"],["poozydw8zue1cax","arb000000005809","USD"],["poozydw8zue1cax","arb000000008641","USD"],["poozydw8zue1cax","arb000000007183","USD"],["poozydw8zue1cax","arb000000006423","USD"],["wo5j2ilfqcxzplc","arc000000358387","USD"],["wo5j2ilfqcxzplc","arb000000002857","USD"],["wo5j2ilfqcxzplc","arb000000012067","USD"],["wo5j2ilfqcxzplc","arb000000003925","USD"],["wo5j2ilfqcxzplc","arb000000010963","USD"],["524u1ff4qw2jqht","arb000000011609","USD"],["3e5tup5i7t00zm1","arb000000012177","USD"],["3e5tup5i7t00zm1","arb000000007487","USD"],["3e5tup5i7t00zm1","arb000000004021","USD"],["pt54lldvyw4ls2c","arl000000885751","USD"],["pt54lldvyw4ls2c","arb000000009327","USD"],["pt54lldvyw4ls2c","arb000000006513","USD"],["pt54lldvyw4ls2c","arb000000008135","USD"],["pt54lldvyw4ls2c","arb000000001705","USD"],["pt54lldvyw4ls2c","arc000000357817","USD"],["pt54lldvyw4ls2c","arb000000009417","USD"],["pt54lldvyw4ls2c","arl000000886149","USD"],["pt54lldvyw4ls2c","arb000000003545","USD"],["xg7t06isim3n9e0","arb000000008037","USD"],["xg7t06isim3n9e0","arb000000005493","USD"],["xg7t06isim3n9e0","arb000000008651","USD"],["xg7t06isim3n9e0","arb000000010353","USD"],["xg7t06isim3n9e0","arb000000001617","USD"],["12lwu1fu3gx4m2o","arb000000005353","USD"],["12lwu1fu3gx4m2o","arb000000012533","USD"],["7fn4cunbxote66l","arb000000009133","USD"],["7fn4cunbxote66l","arb000000011047","USD"],["ffwv6afb62tvxcb","arb000000003569","USD"],["ffwv6afb62tvxcb","arb000000003749","USD"],["ffwv6afb62tvxcb","arb000000008487","USD"],["ffwv6afb62tvxcb","arc000000357853","USD"],["ffwv6afb62tvxcb","arb000000007137","USD"],["ffwv6afb62tvxcb","arc000000358123","USD"],["ffwv6afb62tvxcb","arb000000012629","USD"],["szcu3xzl5int0pv","arb000000002759","USD"],["szcu3xzl5int0pv","arb000000002595","USD"],["szcu3xzl5int0pv","arb000000004487","USD"],["szcu3xzl5int0pv","arb000000009009","USD"],["szcu3xzl5int0pv","arb000000007827","USD"],["vqwf8ow33wxk1dl","arb000000002787","USD"],["vqwf8ow33wxk1dl","arb000000009349","USD"],["vqwf8ow33wxk1dl","arb000000012325","USD"],["t17omkeeysgl10a","arb000000007451","USD"],["t17omkeeysgl10a","arb000000009015","USD"],["t17omkeeysgl10a","arb000000005159","USD"],["t17omkeeysgl10a","arb000000002273","USD"],["t17omkeeysgl10a","arb000000012029","USD"],["t17omkeeysgl10a","arb000000007397","USD"],["npxnxxtoihhjuln","arb000000002121","USD"],["jcb7yat6eivf2kc","arb000000009279","USD"],["jcb7yat6eivf2kc","arb000000003633","USD"],["jcb7yat6eivf2kc","arl000000886889","USD"],["jcb7yat6eivf2kc","arb000000004951","USD"],["jcb7yat6eivf2kc","arb000000002583","USD"],["jcb7yat6eivf2kc","arc000000357949","USD"],["gzd15a4m89e9ivq","arb000000001841","USD"],["gzd15a4m89e9ivq","arb000000005935","USD"],["gzd15a4m89e9ivq","arl000000885629","USD"],["gzd15a4m89e9ivq","arc000000357388","USD"],["gzd15a4m89e9ivq","arb000000009265","USD"],["gzd15a4m89e9ivq","arb000000003259","USD"],["gzd15a4m89e9ivq","arb000000008879","USD"],["gzd15a4m89e9ivq","arb000000005067","USD"],["s11fqpexqz6ll97","arb000000004957","USD"],["mppfscit3e7szkf","arb000000007819","USD"],["6b4apsmlbrt7ogh","arb000000012069","USD"],["dedzpcemo4gj29k","arb000000004161","USD"],["dedzpcemo4gj29k","arb000000012377","USD"],["21gkwgbnjcq8tmw","arb000000008943","USD"],["21gkwgbnjcq8tmw","arb000000011837","USD"],["j9n2y86k17ilmvn","arb000000002607","USD"],["j9n2y86k17ilmvn","arb000000001789","USD"],["j9n2y86k17ilmvn","arc000000357136","USD"],["j9n2y86k17ilmvn","arb000000006509","USD"],["j9n2y86k17ilmvn","arb000000003091","USD"],["a2s70qued4akutg","arb000000009309","USD"],["a2s70qued4akutg","arb000000002023","USD"],["a2s70qued4akutg","arb000000006285","USD"],["a2s70qued4akutg","arb000000003311","USD"],["a2s70qued4akutg","arb000000012131","USD"],["a2s70qued4akutg","arb000000002359","USD"],["a2s70qued4akutg","arb000000007483","USD"],["a2s70qued4akutg","arb000000011321","USD"],["a2s70qued4akutg","arb000000011829","USD"],["a2s70qued4akutg","arc000000357466","USD"],["a2s70qued4akutg","arb000000008393","USD"],["a2s70qued4akutg","arb000000001451","USD"],["liz080oxov88f09","arb000000005349","USD"],["liz080oxov88f09","arb000000010755","USD"],["liz080oxov88f09","arl000000885787","USD"],["liz080oxov88f09","arb000000009785","USD"],["liz080oxov88f09","arb000000002761","USD"],["60d8ffg3q558tsy","arl000000886883","USD"],["60d8ffg3q558tsy","arb000000007195","USD"],["3ubbjsp5ojuea93","arb000000002739","USD"],["352qhnhc12z806p","arb000000010079","USD"],["71y5yb26lji8fqo","arb000000006587","USD"],["71y5yb26lji8fqo","arb000000005687","USD"],["71y5yb26lji8fqo","arb000000002133","USD"],["71y5yb26lji8fqo","arb000000008861","USD"],["71y5yb26lji8fqo","arb000000004977","USD"],["71y5yb26lji8fqo","arb000000011867","USD"],["blvp7hs0k9wny6o","arb000000008025","USD"],["blvp7hs0k9wny6o","arb000000004523","USD"],["yqt28ug9h9dztto","arb000000004149","USD"],["yqt28ug9h9dztto","arl000000886231","USD"],["yqt28ug9h9dztto","arb000000004245","USD"],["yqt28ug9h9dztto","arb000000004179","USD"],["yqt28ug9h9dztto","arb000000004197","USD"],["dye3jhz8ak9z6g1","arb000000008983","USD"],["dye3jhz8ak9z6g1","arb000000008017","USD"],["dye3jhz8ak9z6g1","arb000000001411","USD"],["dye3jhz8ak9z6g1","arb000000008745","USD"],["b8u6ii82x0eo9kl","arb000000011299","USD"],["b8u6ii82x0eo9kl","arl000000886067","USD"],["b8u6ii82x0eo9kl","arb000000010789","USD"],["b8u6ii82x0eo9kl","arb000000004081","USD"],["mmt0xrpxkqntx5v","arc000000357298","USD"],["mmt0xrpxkqntx5v","arb000000003199","USD"],["mmt0xrpxkqntx5v","arb000000005479","USD"],["mmt0xrpxkqntx5v","arb000000007233","USD"],["mmt0xrpxkqntx5v","arb000000001901","USD"],["plw7ipyg98t8auv","arb000000007259","USD"],["plw7ipyg98t8auv","arb000000003757","USD"],["plw7ipyg98t8auv","arc000000358135","USD"],["plw7ipyg98t8auv","arb000000006291","USD"],["ht28vucbz9ugmgj","arb000000006151","USD"],["ht28vucbz9ugmgj","arb000000012207","USD"],["ht28vucbz9ugmgj","arb000000001101","USD"],["ht28vucbz9ugmgj","arb000000009171","USD"],["ht28vucbz9ugmgj","arb000000004185","USD"],["uqevrh4jdr4p5g1","arb000000000885","USD"],["uqevrh4jdr4p5g1","arb000000009441","USD"],["uqevrh4jdr4p5g1","arb000000005157","USD"],["op4gdau7m1951o9","arb000000003827","USD"],["op4gdau7m1951o9","arb000000002137","USD"],["op4gdau7m1951o9","arb000000007901","USD"],["op4gdau7m1951o9","arc000000358240","USD"],["op4gdau7m1951o9","arb000000011807","USD"],["uynq11ht3skz86k","arb000000001071","USD"],["6kozb70pw9sd2rg","arl000000886687","USD"],["6kozb70pw9sd2rg","arb000000006521","USD"],["6kozb70pw9sd2rg","arb000000000833","USD"],["6kozb70pw9sd2rg","arl000000887135","USD"],["6kozb70pw9sd2rg","arl000000886177","USD"],["6kozb70pw9sd2rg","arb000000010467","USD"],["e2196gvluqk4q73","arb000000004681","USD"],["e2196gvluqk4q73","arc000000358321","USD"],["e2196gvluqk4q73","arb000000003881","USD"],["bg667l8cjcj8oae","arb000000007555","USD"],["bg667l8cjcj8oae","arb000000012819","USD"],["bg667l8cjcj8oae","arb000000005619","USD"],["yzf159f0tkqnw3o","arb000000006997","USD"],["yzf159f0tkqnw3o","arl000000886431","USD"],["yzf159f0tkqnw3o","arb000000010421","USD"],["p9andbw6yt2iwiv","arb000000008673","USD"],["p9andbw6yt2iwiv","arb000000004405","USD"],["p9andbw6yt2iwiv","arb000000005857","USD"],["p9andbw6yt2iwiv","arb000000005795","USD"],["p9andbw6yt2iwiv","arl000000886409","USD"],["p9andbw6yt2iwiv","arb000000007767","USD"],["s5frb6nwe11e33t","arb000000004871","USD"],["rw0azzuvz3cvo9e","arl000000886761","USD"],["rw0azzuvz3cvo9e","arb000000002369","USD"],["rw0azzuvz3cvo9e","arb000000010613","USD"],["rw0azzuvz3cvo9e","arb000000009961","USD"],["rw0azzuvz3cvo9e","arl000000886037","USD"],["rw0azzuvz3cvo9e","arb000000011075","USD"],["rw0azzuvz3cvo9e","arl000000886471","USD"],["rw0azzuvz3cvo9e","arb000000007851","USD"],["rw0azzuvz3cvo9e","arl000000885925","USD"],["e1wuqummcwlcbuu","arl000000886871","USD"],["e1wuqummcwlcbuu","arb000000008965","USD"],["e1wuqummcwlcbuu","arb000000010473","USD"],["e1wuqummcwlcbuu","arb000000005627","USD"],["2kpgx03urn079xs","arb000000007141","USD"],["2kpgx03urn079xs","arl000000885609","USD"],["2kpgx03urn079xs","arb000000007193","USD"],["2kpgx03urn079xs","arb000000005885","USD"],["2kpgx03urn079xs","arb000000006529","USD"],["s5s43jozxfcbsmb","arb000000006193","USD"],["s5s43jozxfcbsmb","arb000000008607","USD"],["s5s43jozxfcbsmb","arb000000001261","USD"],["s5s43jozxfcbsmb","arb000000010591","USD"],["s5s43jozxfcbsmb","arl000000886187","USD"],["hgoftbqp1guzxwy","arb000000007997","USD"],["hgoftbqp1guzxwy","arb000000004163","USD"],["hgoftbqp1guzxwy","arb000000005843","USD"],["28rmjg7667lxggz","arb000000007189","USD"],["28rmjg7667lxggz","arb000000001755","USD"],["28rmjg7667lxggz","arc000000358168","USD"],["28rmjg7667lxggz","arb000000008057","USD"],["28rmjg7667lxggz","arl000000886865","USD"],["28rmjg7667lxggz","arb000000002305","USD"],["28rmjg7667lxggz","arb000000003779","USD"],["hex5u21v7dh7qbh","arb000000002625","USD"],["hex5u21v7dh7qbh","arb000000009199","USD"],["hex5u21v7dh7qbh","arb000000007669","USD"],["hex5u21v7dh7qbh","arb000000006915","USD"],["hex5u21v7dh7qbh","arb000000001299","USD"],["cfm7a69i2ncqg57","arb000000005233","USD"],["cfm7a69i2ncqg57","arl000000887265","USD"],["cfm7a69i2ncqg57","arb000000007585","USD"],["ym250s4obmphmfc","arb000000009835","USD"],["ym250s4obmphmfc","arl000000885995","USD"],["ym250s4obmphmfc","arb000000000973","USD"],["ym250s4obmphmfc","arb000000002033","USD"],["ym250s4obmphmfc","arb000000002349","USD"],["ym250s4obmphmfc","arb000000004703","USD"],["qkijqejhbpt8vvs","arb000000007921","USD"],["qkijqejhbpt8vvs","arb000000001177","USD"],["qkijqejhbpt8vvs","arb000000002319","USD"],["qkijqejhbpt8vvs","arb000000008367","USD"],["qkijqejhbpt8vvs","arb000000010429","USD"],["fgbher5s7obj7mu","arb000000010693","USD"],["fgbher5s7obj7mu","arb000000009931","USD"],["fgbher5s7obj7mu","arb000000008957","USD"],["bdxnd475yillzu1","arb000000006815","USD"],["bdxnd475yillzu1","arb000000008285","USD"],["bdxnd475yillzu1","arb000000001741","USD"],["fp0gxwoix6hujqt","arb000000001589","USD"],["fp0gxwoix6hujqt","arb000000002039","USD"],["fp0gxwoix6hujqt","arb000000010965","USD"],["qo0mzfqbms1qse2","arb000000009433","USD"],["qo0mzfqbms1qse2","arl000000887057","USD"],["qo0mzfqbms1qse2","arb000000006229","USD"],["qo0mzfqbms1qse2","arb000000010435","USD"],["qo0mzfqbms1qse2","arb000000010585","USD"],["qo0mzfqbms1qse2","arb000000005883","USD"],["qo0mzfqbms1qse2","arb000000009733","USD"],["qo0mzfqbms1qse2","arb000000012141","USD"],["pw188rni8jzss5n","arb000000003025","USD"],["pw188rni8jzss5n","arl000000886397","USD"],["pw188rni8jzss5n","arb000000005213","USD"],["pw188rni8jzss5n","arb000000008585","USD"],["pw188rni8jzss5n","arl000000886821","USD"],["pw188rni8jzss5n","arc000000357037","USD"],["idfl94ip59cl0z1","arb000000003419","USD"],["idfl94ip59cl0z1","arb000000009315","USD"],["idfl94ip59cl0z1","arb000000004553","USD"],["idfl94ip59cl0z1","arb000000002619","USD"],["idfl94ip59cl0z1","arb000000008049","USD"],["idfl94ip59cl0z1","arc000000357628","USD"],["idfl94ip59cl0z1","arb000000010023","USD"],["idfl94ip59cl0z1","arb000000007111","USD"],["idfl94ip59cl0z1","arb000000011471","USD"],["idfl94ip59cl0z1","arb000000001455","USD"],["745cm8i4suce25f","arb000000001533","USD"],["745cm8i4suce25f","arb000000011451","USD"],["r8jn10kiu9ctq30","arl000000886949","USD"],["r8jn10kiu9ctq30","arb000000005031","USD"],["r8jn10kiu9ctq30","arb000000008513","USD"],["r8jn10kiu9ctq30","arb000000002199","USD"],["r8jn10kiu9ctq30","arb000000007287","USD"],["r8jn10kiu9ctq30","arb000000010599","USD"],["a1e1mw1ywhs9dbl","arb000000010299","USD"],["a1e1mw1ywhs9dbl","arb000000008557","USD"],["a1e1mw1ywhs9dbl","arl000000886301","USD"],["a1e1mw1ywhs9dbl","arl000000886325","USD"],["a1e1mw1ywhs9dbl","arb000000004587","USD"],["9xh95d3l479wwtv","arb000000002049","USD"],["9xh95d3l479wwtv","arl000000887125","USD"],["9xh95d3l479wwtv","arb000000009501","USD"],["9xh95d3l479wwtv","arb000000008003","USD"],["9xh95d3l479wwtv","arb000000001971","USD"],["9xh95d3l479wwtv","arb000000005257","USD"],["n4lzbcqr7n1pbas","arb000000009461","USD"],["n4lzbcqr7n1pbas","arb000000007925","USD"],["41jkcqyqrhoxlaf","arb000000002613","USD"],["41jkcqyqrhoxlaf","arb000000011859","USD"],["4m5dc8zq98xd3mg","arb000000005471","USD"],["4m5dc8zq98xd3mg","arb000000010817","USD"],["4m5dc8zq98xd3mg","arb000000009665","USD"],["4m5dc8zq98xd3mg","arc000000357991","USD"],["4m5dc8zq98xd3mg","arb000000003661","USD"],["j8wmi08hn23gz7n","arb000000012557","USD"],["j8wmi08hn23gz7n","arc000000357724","USD"],["j8wmi08hn23gz7n","arb000000007293","USD"],["j8wmi08hn23gz7n","arb000000003483","USD"],["lg2nor2elqf3zpj","arb000000006807","USD"],["lg2nor2elqf3zpj","arb000000008521","USD"],["lg2nor2elqf3zpj","arl000000886893","USD"],["joqp6e4pp33ska8","arb000000009161","USD"],["joqp6e4pp33ska8","arb000000012721","USD"],["joqp6e4pp33ska8","arb000000008659","USD"],["5oad3xpqub2gfgc","arc000000358339","USD"],["5oad3xpqub2gfgc","arc000000357346","USD"],["5oad3xpqub2gfgc","arb000000011263","USD"],["5oad3xpqub2gfgc","arb000000003893","USD"],["5oad3xpqub2gfgc","arb000000003231","USD"],["5oad3xpqub2gfgc","arb000000001791","USD"],["f5bt3xaqu806lcu","arb000000005849","USD"],["f5bt3xaqu806lcu","arb000000009011","USD"],["f5bt3xaqu806lcu","arb000000011875","USD"],["d6sd0tt5e7xicjh","arb000000003677","USD"],["d6sd0tt5e7xicjh","arl000000885957","USD"],["d6sd0tt5e7xicjh","arb000000011445","USD"],["d6sd0tt5e7xicjh","arl000000887129","USD"],["d6sd0tt5e7xicjh","arb000000006007","USD"],["d6sd0tt5e7xicjh","arc000000358015","USD"],["sqwssegqdfrwrtb","arb000000001671","USD"],["sqwssegqdfrwrtb","arb000000007557","USD"],["sqwssegqdfrwrtb","arb000000002219","USD"],["sqwssegqdfrwrtb","arb000000012685","USD"],["40u92une22n8r21","arb000000011447","USD"],["40u92une22n8r21","arl000000887415","USD"],["40u92une22n8r21","arb000000007475","USD"],["3jda2tz6vj11f3f","arb000000004071","USD"],["3jda2tz6vj11f3f","arb000000012117","USD"],["f58nu4b40baabt3","arb000000001745","USD"],["f58nu4b40baabt3","arb000000010725","USD"],["f58nu4b40baabt3","arl000000887149","USD"],["f58nu4b40baabt3","arb000000008077","USD"],["bw3qbflpnv74r72","arl000000886967","USD"],["bw3qbflpnv74r72","arb000000005177","USD"],["bw3qbflpnv74r72","arb000000004129","USD"],["bw3qbflpnv74r72","arb000000007165","USD"],["vakmyeaapowvcs3","arb000000004569","USD"],["vakmyeaapowvcs3","arb000000009893","USD"],["vakmyeaapowvcs3","arb000000007147","USD"],["vakmyeaapowvcs3","arb000000011379","USD"],["8c4cc33jzcmiiut","arb000000003847","USD"],["8c4cc33jzcmiiut","arc000000358270","USD"],["8c4cc33jzcmiiut","arb000000011177","USD"],["8c4cc33jzcmiiut","arb000000004501","USD"],["jlbnmy8mt48m7ys","arb000000008493","USD"],["jlbnmy8mt48m7ys","arl000000886065","USD"],["jlbnmy8mt48m7ys","arb000000007825","USD"],["jlbnmy8mt48m7ys","arb000000002575","USD"],["t3z82au7mluzm66","arb000000011805","USD"],["t3z82au7mluzm66","arl000000886525","USD"],["9ip2krrvtsyeiv7","arb000000001489","USD"],["9ip2krrvtsyeiv7","arc000000357940","USD"],["9ip2krrvtsyeiv7","arb000000003627","USD"],["5yhvjj3tylyuiuv","arb000000008855","USD"],["5yhvjj3tylyuiuv","arb000000010259","USD"],["5yhvjj3tylyuiuv","arl000000885709","USD"],["ueonigcj3eareq2","arb000000004517","USD"],["iy4wjsr63vwvl6k","arb000000010989","USD"],["iy4wjsr63vwvl6k","arb000000007899","USD"],["iy4wjsr63vwvl6k","arb000000010621","USD"],["n53mvihes9ptil2","arb000000005117","USD"],["n53mvihes9ptil2","arb000000005741","USD"],["n53mvihes9ptil2","arb000000009127","USD"],["n53mvihes9ptil2","arb000000005123","USD"],["ehd4f3hyvfrncpa","arb000000007157","USD"],["ehd4f3hyvfrncpa","arb000000010015","USD"],["ehd4f3hyvfrncpa","arl000000886225","USD"],["vjc5ormh8bsqfk9","arb000000008303","USD"],["vjc5ormh8bsqfk9","arb000000011897","USD"],["vjc5ormh8bsqfk9","arb000000000777","USD"],["ijbctpw5x5466bb","arb000000004395","USD"],["ijbctpw5x5466bb","arb000000006215","USD"],["ijbctpw5x5466bb","arb000000005047","USD"],["5803skg35a1viwt","arb000000001713","USD"],["5803skg35a1viwt","arl000000887343","USD"],["5803skg35a1viwt","arb000000011661","USD"],["c3sf01yf2spljgr","arb000000009191","USD"],["mw0cosns76sf14l","arb000000008793","USD"],["0cvb63gwtnqtpw3","arb000000006593","USD"],["0cvb63gwtnqtpw3","arb000000005851","USD"],["mnq8ifjx5axmfyy","arb000000010699","USD"],["mnq8ifjx5axmfyy","arb000000011425","USD"],["mnq8ifjx5axmfyy","arb000000007469","USD"],["1f9zx3qyvcoa0i3","arb000000007951","USD"],["1f9zx3qyvcoa0i3","arb000000008725","USD"],["gslxzju8bxq5rom","arb000000000681","USD"],["gslxzju8bxq5rom","arb000000001211","USD"],["gslxzju8bxq5rom","arc000000358348","USD"],["gslxzju8bxq5rom","arb000000003899","USD"],["gslxzju8bxq5rom","arb000000001067","USD"],["vxezyy0d5cdxc9f","arb000000001187","USD"],["vxezyy0d5cdxc9f","arb000000005201","USD"],["vxezyy0d5cdxc9f","arb000000004123","USD"],["g6ucsmj7vpesxba","arb000000001007","USD"],["g6ucsmj7vpesxba","arb000000012821","USD"],["g6ucsmj7vpesxba","arb000000011975","USD"],["g6ucsmj7vpesxba","arb000000008221","USD"],["sgumu2mj7ip3qsk","arb000000009779","USD"],["sgumu2mj7ip3qsk","arb000000005623","USD"],["sgumu2mj7ip3qsk","arb000000008967","USD"],["8xy2eo6yhneuxyy","arb000000001233","USD"],["8xy2eo6yhneuxyy","arl000000886161","USD"],["8xy2eo6yhneuxyy","arl000000885625","USD"],["8xy2eo6yhneuxyy","arb000000004381","USD"],["8xy2eo6yhneuxyy","arl000000887085","USD"],["8xy2eo6yhneuxyy","arb000000003309","USD"],["8xy2eo6yhneuxyy","arc000000357463","USD"],["8t2ghtl15b1hbcf","arl000000887167","USD"],["9nics5eskqv5ju7","arb000000004089","USD"],["9nics5eskqv5ju7","arb000000012353","USD"],["9nics5eskqv5ju7","arb000000002737","USD"],["9nics5eskqv5ju7","arb000000006903","USD"],["flzmyz844am36ig","arb000000002843","USD"],["flzmyz844am36ig","arb000000010395","USD"],["flzmyz844am36ig","arb000000012883","USD"],["flzmyz844am36ig","arb000000006165","USD"],["flzmyz844am36ig","arb000000012985","USD"],["s5zb8vfnihtgmyr","arb000000001657","USD"],["s5zb8vfnihtgmyr","arb000000011055","USD"],["s5zb8vfnihtgmyr","arb000000011023","USD"],["s5zb8vfnihtgmyr","arb000000007719","USD"],["kh8c2oy1wltlrmj","arb000000010071","USD"],["kh8c2oy1wltlrmj","arb000000002245","USD"],["kh8c2oy1wltlrmj","arb000000011877","USD"],["kh8c2oy1wltlrmj","arb000000007153","USD"],["x4sb5sy8bn0zmwd","arb000000004591","USD"],["x4sb5sy8bn0zmwd","arl000000886263","USD"],["x4sb5sy8bn0zmwd","arb000000011371","USD"],["zflme4lszbd8ubt","arb000000004525","USD"],["zflme4lszbd8ubt","arb000000011605","USD"],["zflme4lszbd8ubt","arb000000009103","USD"],["zflme4lszbd8ubt","arb000000010557","USD"],["zflme4lszbd8ubt","arb000000001947","USD"],["tmocib3zcsbp3uw","arb000000001581","USD"],["tmocib3zcsbp3uw","arb000000008973","USD"],["5yjrkk4kwxn7s7g","arb000000006457","USD"],["5yjrkk4kwxn7s7g","arb000000012269","USD"],["5yjrkk4kwxn7s7g","arb000000009491","USD"],["5yjrkk4kwxn7s7g","arb000000010575","USD"],["5yjrkk4kwxn7s7g","arb000000008125","USD"],["5yjrkk4kwxn7s7g","arb000000005021","USD"],["5yjrkk4kwxn7s7g","arb000000002639","USD"],["ue3xy6a66l7yvs7","arb000000007839","USD"],["ue3xy6a66l7yvs7","arl000000887425","USD"],["tlwx51ipw27iahs","arb000000001855","USD"],["tlwx51ipw27iahs","arb000000002187","USD"],["987wexeacif6ngw","arb000000001391","USD"],["987wexeacif6ngw","arb000000006695","USD"],["987wexeacif6ngw","arb000000002965","USD"],["rpue4a4esc9275a","arb000000011611","USD"],["rpue4a4esc9275a","arb000000007339","USD"],["rpue4a4esc9275a","arb000000010561","USD"],["rpue4a4esc9275a","arb000000010703","USD"],["eorf0rtwye6dc6a","arb000000012063","USD"],["eorf0rtwye6dc6a","arb000000002185","USD"],["eorf0rtwye6dc6a","arb000000007145","USD"],["g3hv1qzky8h8iq9","arl000000886009","USD"],["g3hv1qzky8h8iq9","arc000000358105","USD"],["g3hv1qzky8h8iq9","arb000000005141","USD"],["g3hv1qzky8h8iq9","arb000000012251","USD"],["g3hv1qzky8h8iq9","arb000000003737","USD"],["g6nly3lgzzfj5rt","arb000000011547","USD"],["g6nly3lgzzfj5rt","arb000000012525","USD"],["37ouh0wgrkpl512","arb000000003019","USD"],["37ouh0wgrkpl512","arb000000010481","USD"],["37ouh0wgrkpl512","arb000000003731","USD"],["37ouh0wgrkpl512","arc000000357028","USD"],["37ouh0wgrkpl512","arb000000011265","USD"],["37ouh0wgrkpl512","arc000000358096","USD"],["xt2jdzr3dqi6xem","arb000000006099","USD"],["xt2jdzr3dqi6xem","arb000000008313","USD"],["xt2jdzr3dqi6xem","arb000000003715","USD"],["xt2jdzr3dqi6xem","arb000000001255","USD"],["xt2jdzr3dqi6xem","arb000000011639","USD"],["xt2jdzr3dqi6xem","arc000000358072","USD"],["w6p6x5ukd8ypsne","arb000000006785","USD"],["w6p6x5ukd8ypsne","arb000000005853","USD"],["nc4tpxxueytfxkv","arl000000886403","USD"],["nc4tpxxueytfxkv","arb000000003445","USD"],["nc4tpxxueytfxkv","arc000000357667","USD"],["6jcue9p8tstsu34","arb000000006847","USD"],["6jcue9p8tstsu34","arb000000012649","USD"],["6jcue9p8tstsu34","arb000000007115","USD"],["6jcue9p8tstsu34","arb000000011843","USD"],["gldxfllsmehxx4c","arb000000008437","USD"],["gldxfllsmehxx4c","arb000000004661","USD"],["gldxfllsmehxx4c","arb000000008143","USD"],["gldxfllsmehxx4c","arl000000886095","USD"],["gldxfllsmehxx4c","arb000000005995","USD"],["gldxfllsmehxx4c","arb000000003599","USD"],["gldxfllsmehxx4c","arc000000357274","USD"],["gldxfllsmehxx4c","arb000000003183","USD"],["gldxfllsmehxx4c","arc000000357898","USD"],["35diiuubxbiki7m","arb000000007091","USD"],["35diiuubxbiki7m","arb000000011319","USD"],["2qcqzpno4nq2pip","arb000000005923","USD"],["2qcqzpno4nq2pip","arb000000012179","USD"],["h7gum5eq1gm9kyv","arb000000006321","USD"],["h7gum5eq1gm9kyv","arb000000007959","USD"],["h7gum5eq1gm9kyv","arb000000012763","USD"],["h7gum5eq1gm9kyv","arl000000887237","USD"],["sspstm66gbeiqoi","arb000000010893","USD"],["sspstm66gbeiqoi","arb000000012765","USD"],["a9aw3shaf9a7087","arb000000002667","USD"],["a9aw3shaf9a7087","arb000000009859","USD"],["a9aw3shaf9a7087","arb000000001919","USD"],["a9aw3shaf9a7087","arb000000005079","USD"],["fc0uvjvfiuec74e","arl000000887331","USD"],["fc0uvjvfiuec74e","arb000000004261","USD"],["fc0uvjvfiuec74e","arb000000010839","USD"],["fc0uvjvfiuec74e","arb000000000763","USD"],["fc0uvjvfiuec74e","arb000000009053","USD"],["fc0uvjvfiuec74e","arb000000007783","USD"],["eix856ibjx7tlwt","arb000000009051","USD"],["eix856ibjx7tlwt","arb000000011931","USD"],["f927z3ml55nm9ai","arb000000009489","USD"],["f927z3ml55nm9ai","arl000000886347","USD"],["f927z3ml55nm9ai","arb000000009691","USD"],["f927z3ml55nm9ai","arb000000000805","USD"],["7xhzj4id6waut19","arb000000004079","USD"],["7xhzj4id6waut19","arb000000001313","USD"],["xgze5ntwkd2oh1j","arb000000010203","USD"],["xgze5ntwkd2oh1j","arb000000001515","USD"],["xgze5ntwkd2oh1j","arb000000011595","USD"],["xgze5ntwkd2oh1j","arb000000002855","USD"],["xgze5ntwkd2oh1j","arb000000008139","USD"],["xgze5ntwkd2oh1j","arb000000006445","USD"],["xgze5ntwkd2oh1j","arb000000002247","USD"],["xgze5ntwkd2oh1j","arb000000009903","USD"],["woztlgrifo7unht","arb000000007421","USD"],["woztlgrifo7unht","arb000000012351","USD"],["woztlgrifo7unht","arb000000002725","USD"],["woztlgrifo7unht","arb000000009935","USD"],["woztlgrifo7unht","arb000000009717","USD"],["6dpjlseuy4nxn3l","arl000000886157","USD"],["6dpjlseuy4nxn3l","arb000000005267","USD"],["6dpjlseuy4nxn3l","arb000000008473","USD"],["1m4627ctqwxwno5","arb000000001609","USD"],["1m4627ctqwxwno5","arb000000010295","USD"],["mt2vj06i6get84x","arb000000007179","USD"],["mt2vj06i6get84x","arb000000008195","USD"],["bpuwobcrm3v0y1c","arb000000001035","USD"],["bpuwobcrm3v0y1c","arl000000886549","USD"],["bpuwobcrm3v0y1c","arb000000006675","USD"],["jz7emikfry2c62y","arb000000004597","USD"],["3sieulxpkmbhp5j","arb000000005601","USD"],["3sieulxpkmbhp5j","arl000000886527","USD"],["3sieulxpkmbhp5j","arb000000001647","USD"],["3sieulxpkmbhp5j","arb000000007009","USD"],["3sieulxpkmbhp5j","arb000000006371","USD"],["d0zvl3d1hgmbxab","arb000000004207","USD"],["d0zvl3d1hgmbxab","arb000000002735","USD"],["d0zvl3d1hgmbxab","arl000000886715","USD"],["wjoi4p1urqm93ri","arb000000010375","USD"],["4m0dv1xdvydrnn4","arb000000004557","USD"],["4m0dv1xdvydrnn4","arb000000009235","USD"],["9tvadslslvav4yq","arb000000010577","USD"],["9tvadslslvav4yq","arb000000005427","USD"],["9tvadslslvav4yq","arb000000009519","USD"],["m426epdh9vmczox","arb000000001119","USD"],["m426epdh9vmczox","arb000000007661","USD"],["m426epdh9vmczox","arb000000009579","USD"],["m426epdh9vmczox","arb000000007343","USD"],["w88hez90xksrgmf","arb000000002485","USD"],["w88hez90xksrgmf","arb000000010485","USD"],["520e5jsq90lxvf0","arb000000002047","USD"],["520e5jsq90lxvf0","arl000000885811","USD"],["520e5jsq90lxvf0","arb000000001467","USD"],["520e5jsq90lxvf0","arb000000004267","USD"],["520e5jsq90lxvf0","arb000000002263","USD"],["520e5jsq90lxvf0","arb000000003163","USD"],["520e5jsq90lxvf0","arb000000005461","USD"],["520e5jsq90lxvf0","arc000000357244","USD"],["520e5jsq90lxvf0","arb000000005783","USD"],["mggxcm3n2hmg0h9","arb000000003261","USD"],["mggxcm3n2hmg0h9","arc000000357391","USD"],["mggxcm3n2hmg0h9","arb000000007243","USD"],["mggxcm3n2hmg0h9","arb000000003421","USD"],["mggxcm3n2hmg0h9","arc000000357631","USD"],["mggxcm3n2hmg0h9","arl000000886923","USD"],["mggxcm3n2hmg0h9","arb000000006623","USD"],["cx0rnoor7punpgr","arb000000004931","USD"],["cx0rnoor7punpgr","arb000000004205","USD"],["cx0rnoor7punpgr","arb000000001679","USD"],["cx0rnoor7punpgr","arb000000003601","USD"],["cx0rnoor7punpgr","arc000000357901","USD"],["sosqa2zcympvie8","arb000000009377","USD"],["sosqa2zcympvie8","arb000000010173","USD"],["sosqa2zcympvie8","arb000000005817","USD"],["sosqa2zcympvie8","arb000000010667","USD"],["sosqa2zcympvie8","arb000000011437","USD"],["sosqa2zcympvie8","arb000000002409","USD"],["sosqa2zcympvie8","arb000000005789","USD"],["8bu7bel1izj7p38","arb000000007055","USD"],["8bu7bel1izj7p38","arb000000007395","USD"],["8bu7bel1izj7p38","arl000000885877","USD"],["8bu7bel1izj7p38","arb000000009335","USD"],["06g9xz89opfwpas","arb000000006523","USD"],["06g9xz89opfwpas","arb000000012847","USD"],["06g9xz89opfwpas","arb000000004461","USD"],["06g9xz89opfwpas","arb000000005371","USD"],["ji14bhll6z5y3x5","arb000000005467","USD"],["ji14bhll6z5y3x5","arb000000007457","USD"],["d2wl8gw80xiaxwe","arb000000005723","USD"],["d2wl8gw80xiaxwe","arb000000007471","USD"],["d2wl8gw80xiaxwe","arb000000005499","USD"],["d2wl8gw80xiaxwe","arb000000011839","USD"],["d2wl8gw80xiaxwe","arb000000001139","USD"],["d2wl8gw80xiaxwe","arb000000010943","USD"],["uimoakvpils9fu9","arb000000007203","USD"],["uimoakvpils9fu9","arb000000012553","USD"],["uimoakvpils9fu9","arb000000005315","USD"],["uimoakvpils9fu9","arb000000001473","USD"],["wk3zegc8pxeg48o","arl000000886943","USD"],["wk3zegc8pxeg48o","arb000000012509","USD"],["wk3zegc8pxeg48o","arb000000009919","USD"],["fyfz7nkct3vucj2","arb000000000769","USD"],["haa47il1cflmi6c","arb000000012993","USD"],["haa47il1cflmi6c","arb000000005507","USD"],["haa47il1cflmi6c","arb000000002069","USD"],["njbmi5hfvm5p9pb","arb000000008223","USD"],["njbmi5hfvm5p9pb","arb000000005199","USD"],["njbmi5hfvm5p9pb","arb000000001453","USD"],["njbmi5hfvm5p9pb","arb000000005999","USD"],["njbmi5hfvm5p9pb","arb000000008433","USD"],["gk0y99434km26g2","arb000000006289","USD"],["gk0y99434km26g2","arb000000001507","USD"],["gk0y99434km26g2","arb000000001545","USD"],["gk0y99434km26g2","arb000000010343","USD"],["gk0y99434km26g2","arc000000357637","USD"],["gk0y99434km26g2","arb000000007657","USD"],["gk0y99434km26g2","arb000000003317","USD"],["gk0y99434km26g2","arc000000357475","USD"],["gk0y99434km26g2","arb000000003425","USD"],["x84g7fdejv566wf","arl000000887127","USD"],["x84g7fdejv566wf","arb000000004641","USD"],["x84g7fdejv566wf","arl000000885611","USD"],["x84g7fdejv566wf","arb000000008475","USD"],["4qvi2aqx5b4x1m9","arb000000009173","USD"],["4qvi2aqx5b4x1m9","arb000000011327","USD"],["4qvi2aqx5b4x1m9","arb000000012181","USD"],["x96zw6pz93dh1ob","arl000000886089","USD"],["x96zw6pz93dh1ob","arb000000012709","USD"],["x96zw6pz93dh1ob","arb000000004649","USD"],["x96zw6pz93dh1ob","arb000000008361","USD"],["x96zw6pz93dh1ob","arb000000007461","USD"],["e6ko8da02ufx2s4","arb000000010355","USD"],["e6ko8da02ufx2s4","arb000000011275","USD"],["38bf6bxpwaoc62d","arb000000008089","USD"],["38bf6bxpwaoc62d","arb000000007357","USD"],["38bf6bxpwaoc62d","arb000000002943","USD"],["38bf6bxpwaoc62d","arb000000000915","USD"],["ulnmgxzku21zvpq","arb000000011653","USD"],["biyme7tcmsrdtw8","arb000000011757","USD"],["biyme7tcmsrdtw8","arb000000006645","USD"],["o1srjxfnpd0kaa1","arb000000001011","USD"],["o1srjxfnpd0kaa1","arb000000010623","USD"],["o1srjxfnpd0kaa1","arb000000009005","USD"],["o1srjxfnpd0kaa1","arb000000001981","USD"],["o1srjxfnpd0kaa1","arb000000004171","USD"],["u0sozfjvvy5bf8f","arb000000007213","USD"],["u0sozfjvvy5bf8f","arl000000886537","USD"],["hxrnatmnxj8uleo","arl000000887427","USD"],["hxrnatmnxj8uleo","arb000000009249","USD"],["f3j8gzs691yyf3l","arl000000886201","USD"],["f3j8gzs691yyf3l","arb000000001593","USD"],["f3j8gzs691yyf3l","arb000000000975","USD"],["f3j8gzs691yyf3l","arb000000011689","USD"],["j103icwt2pqu2n7","arb000000011827","USD"],["j103icwt2pqu2n7","arb000000003361","USD"],["j103icwt2pqu2n7","arc000000357541","USD"],["j103icwt2pqu2n7","arb000000005709","USD"],["j103icwt2pqu2n7","arb000000012025","USD"],["wk64iopa5glmd6i","arb000000001821","USD"],["wk64iopa5glmd6i","arb000000009881","USD"],["wk64iopa5glmd6i","arb000000004127","USD"],["wk64iopa5glmd6i","arl000000886591","USD"],["wk64iopa5glmd6i","arb000000008295","USD"],["wk64iopa5glmd6i","arb000000010009","USD"],["wk64iopa5glmd6i","arb000000001039","USD"],["thnlwd8qi81thn5","arb000000003891","USD"],["thnlwd8qi81thn5","arb000000001403","USD"],["thnlwd8qi81thn5","arb000000011003","USD"],["thnlwd8qi81thn5","arc000000358336","USD"],["thnlwd8qi81thn5","arb000000009507","USD"],["thnlwd8qi81thn5","arb000000006771","USD"],["r92xscoxpr2h36x","arl000000886023","USD"],["r92xscoxpr2h36x","arb000000010785","USD"],["kns6y1hb7hbtmco","arb000000008413","USD"],["kns6y1hb7hbtmco","arb000000001065","USD"],["kns6y1hb7hbtmco","arb000000004889","USD"],["kns6y1hb7hbtmco","arb000000011647","USD"],["kns6y1hb7hbtmco","arb000000010063","USD"],["kns6y1hb7hbtmco","arb000000003211","USD"],["kns6y1hb7hbtmco","arc000000357316","USD"],["smt4j93mnt2xa6s","arc000000358258","USD"],["smt4j93mnt2xa6s","arb000000012361","USD"],["smt4j93mnt2xa6s","arb000000012425","USD"],["smt4j93mnt2xa6s","arb000000003839","USD"],["smt4j93mnt2xa6s","arc000000357778","USD"],["smt4j93mnt2xa6s","arb000000003519","USD"],["m6tqmv0tuhfzznz","arb000000002389","USD"],["m6tqmv0tuhfzznz","arb000000005111","USD"],["m6tqmv0tuhfzznz","arb000000004715","USD"],["m6tqmv0tuhfzznz","arl000000886845","USD"],["er6wty9clc8n4lv","arl000000885851","USD"],["er6wty9clc8n4lv","arb000000008727","USD"],["er6wty9clc8n4lv","arb000000010335","USD"],["er6wty9clc8n4lv","arb000000010869","USD"],["er6wty9clc8n4lv","arb000000004169","USD"],["er6wty9clc8n4lv","arb000000012471","USD"],["7pzg7imxi3jepq0","arb000000011519","USD"],["q5w0a0qiiws6ohq","arl000000885713","USD"],["q5w0a0qiiws6ohq","arb000000007607","USD"],["fs57sa4leciz883","arb000000004263","USD"],["fs57sa4leciz883","arb000000001599","USD"],["xd7it7ywir3cq6u","arb000000012777","USD"],["xd7it7ywir3cq6u","arb000000011599","USD"],["xd7it7ywir3cq6u","arl000000886731","USD"],["xd7it7ywir3cq6u","arb000000005835","USD"],["xd7it7ywir3cq6u","arb000000001503","USD"],["3kx3il9wvzjcaxh","arb000000007775","USD"],["3kx3il9wvzjcaxh","arb000000008805","USD"],["3kx3il9wvzjcaxh","arb000000008737","USD"],["3kx3il9wvzjcaxh","arb000000002055","USD"],["3kx3il9wvzjcaxh","arb000000012505","USD"],["3kx3il9wvzjcaxh","arc000000357556","USD"],["3kx3il9wvzjcaxh","arb000000003371","USD"],["rzghxdu8obe07w2","arb000000001291","USD"],["rzghxdu8obe07w2","arl000000886951","USD"],["rzghxdu8obe07w2","arb000000007615","USD"],["8qb4q1anptp2e73","arb000000009329","USD"],["8qb4q1anptp2e73","arl000000886453","USD"],["8qb4q1anptp2e73","arb000000012009","USD"],["jt6vcxfd2nbowe8","arc000000357895","USD"],["jt6vcxfd2nbowe8","arb000000003597","USD"],["jt6vcxfd2nbowe8","arl000000886287","USD"],["li23tcrlh5eo985","arb000000012547","USD"],["li23tcrlh5eo985","arb000000011027","USD"],["li23tcrlh5eo985","arb000000002163","USD"],["li23tcrlh5eo985","arc000000357412","USD"],["li23tcrlh5eo985","arb000000003275","USD"],["li23tcrlh5eo985","arb000000005247","USD"],["li23tcrlh5eo985","arl000000886857","USD"],["b1cemxka1rddmf3","arb000000012921","USD"],["b1cemxka1rddmf3","arl000000887033","USD"],["b1cemxka1rddmf3","arb000000011759","USD"],["b1cemxka1rddmf3","arb000000007957","USD"],["jaqkxikr8wim0z5","arb000000010431","USD"],["jaqkxikr8wim0z5","arb000000009387","USD"],["jaqkxikr8wim0z5","arb000000007163","USD"],["jaqkxikr8wim0z5","arb000000001321","USD"],["jaqkxikr8wim0z5","arb000000004103","USD"],["jaqkxikr8wim0z5","arb000000011521","USD"],["wadkloycp258f5f","arb000000005453","USD"],["wadkloycp258f5f","arb000000007751","USD"],["vg0crgr6adruxbe","arb000000004645","USD"],["vg0crgr6adruxbe","arl000000885527","USD"],["vg0crgr6adruxbe","arb000000004201","USD"],["vg0crgr6adruxbe","arb000000009589","USD"],["vg0crgr6adruxbe","arb000000012261","USD"],["zu1g0lxl6lcrz5a","arb000000001753","USD"],["arv7d0wk7rlbr4d","arb000000011143","USD"],["ltcmkhzzh3cl33s","arb000000011175","USD"],["ltcmkhzzh3cl33s","arl000000886367","USD"],["ltcmkhzzh3cl33s","arb000000007869","USD"],["2sjugijmcxzxsa0","arl000000886351","USD"],["f01w74jvzx4h85l","arc000000358051","USD"],["f01w74jvzx4h85l","arc000000358144","USD"],["f01w74jvzx4h85l","arc000000357421","USD"],["f01w74jvzx4h85l","arb000000003701","USD"],["f01w74jvzx4h85l","arb000000003281","USD"],["f01w74jvzx4h85l","arb000000003763","USD"],["f01w74jvzx4h85l","arb000000007617","USD"],["f01w74jvzx4h85l","arb000000011981","USD"],["f01w74jvzx4h85l","arb000000006159","USD"],["f01w74jvzx4h85l","arb000000011095","USD"],["ewf06ku319p0l2y","arc000000358114","USD"],["ewf06ku319p0l2y","arb000000005689","USD"],["ewf06ku319p0l2y","arl000000886773","USD"],["ewf06ku319p0l2y","arb000000007187","USD"],["ewf06ku319p0l2y","arb000000008635","USD"],["ewf06ku319p0l2y","arb000000003743","USD"],["ewf06ku319p0l2y","arb000000005703","USD"],["ewf06ku319p0l2y","arb000000004705","USD"],["ewf06ku319p0l2y","arb000000011713","USD"],["1qtvakdtfo3csu4","arb000000007377","USD"],["1qtvakdtfo3csu4","arl000000885733","USD"],["1qtvakdtfo3csu4","arb000000012431","USD"],["1qtvakdtfo3csu4","arb000000001401","USD"],["1qtvakdtfo3csu4","arb000000006335","USD"],["1qtvakdtfo3csu4","arb000000002915","USD"],["1qtvakdtfo3csu4","arb000000005437","USD"],["iqjbnkvc6lnpykn","arb000000002015","USD"],["iqjbnkvc6lnpykn","arb000000003201","USD"],["iqjbnkvc6lnpykn","arb000000006851","USD"],["iqjbnkvc6lnpykn","arc000000357301","USD"],["y8r67slwe95pb8k","arb000000010529","USD"],["y8r67slwe95pb8k","arb000000004539","USD"],["y8r67slwe95pb8k","arb000000011353","USD"],["y8r67slwe95pb8k","arb000000011731","USD"],["y8r67slwe95pb8k","arb000000010307","USD"],["y8r67slwe95pb8k","arb000000012595","USD"],["748t10btwn0b9q8","arb000000011121","USD"],["748t10btwn0b9q8","arb000000002559","USD"],["748t10btwn0b9q8","arb000000008741","USD"],["748t10btwn0b9q8","arb000000006953","USD"],["748t10btwn0b9q8","arb000000000891","USD"],["748t10btwn0b9q8","arb000000004809","USD"],["vchavfv71h48tk7","arb000000001221","USD"],["vchavfv71h48tk7","arb000000001649","USD"],["vchavfv71h48tk7","arb000000001131","USD"],["vchavfv71h48tk7","arl000000887015","USD"],["vchavfv71h48tk7","arb000000000791","USD"],["vchavfv71h48tk7","arb000000004993","USD"],["yd064u3zo212stm","arb000000002689","USD"],["yd064u3zo212stm","arb000000012243","USD"],["yd064u3zo212stm","arl000000886033","USD"],["sm4yuvi1in4f77m","arl000000886275","USD"],["sm4yuvi1in4f77m","arb000000004855","USD"],["sm4yuvi1in4f77m","arb000000002665","USD"],["bj5hbzl7rz8mus1","arl000000886251","USD"],["bj5hbzl7rz8mus1","arb000000007893","USD"],["bj5hbzl7rz8mus1","arb000000006769","USD"],["bj5hbzl7rz8mus1","arb000000008411","USD"],["640jbz5yk8bu61b","arb000000011677","USD"],["640jbz5yk8bu61b","arb000000009873","USD"],["640jbz5yk8bu61b","arb000000012807","USD"],["640jbz5yk8bu61b","arb000000002817","USD"],["640jbz5yk8bu61b","arb000000002467","USD"],["ytrzk3whbc2vb4z","arb000000000753","USD"],["ytrzk3whbc2vb4z","arb000000008247","USD"],["ytrzk3whbc2vb4z","arb000000007159","USD"],["59g6vfr54izq5ia","arb000000000721","USD"],["59g6vfr54izq5ia","arb000000010441","USD"],["kndm816fynhnwid","arl000000885655","USD"],["kndm816fynhnwid","arb000000009571","USD"],["kndm816fynhnwid","arb000000008717","USD"],["ws0xgxs382de0l2","arb000000010211","USD"],["ws0xgxs382de0l2","arb000000001567","USD"],["ws0xgxs382de0l2","arb000000011305","USD"],["ffpn2dx3wg75f50","arc000000357025","USD"],["ffpn2dx3wg75f50","arb000000010119","USD"],["ffpn2dx3wg75f50","arb000000007975","USD"],["ffpn2dx3wg75f50","arl000000887349","USD"],["ffpn2dx3wg75f50","arb000000004865","USD"],["ffpn2dx3wg75f50","arb000000003017","USD"],["ffpn2dx3wg75f50","arb000000008837","USD"],["ffpn2dx3wg75f50","arb000000007169","USD"],["8aw4b2vdncdzo6j","arb000000003065","USD"],["8aw4b2vdncdzo6j","arb000000001293","USD"],["8aw4b2vdncdzo6j","arb000000002925","USD"],["8aw4b2vdncdzo6j","arc000000357097","USD"],["8aw4b2vdncdzo6j","arb000000009097","USD"],["8aw4b2vdncdzo6j","arb000000000749","USD"],["nrwdwy7liie5ic4","arl000000886063","USD"],["nrwdwy7liie5ic4","arb000000011491","USD"],["gj4kbdy64i2ebc3","arb000000011419","USD"],["gj4kbdy64i2ebc3","arb000000011735","USD"],["gj4kbdy64i2ebc3","arl000000886189","USD"],["gj4kbdy64i2ebc3","arb000000010521","USD"],["gj4kbdy64i2ebc3","arb000000009707","USD"],["gj4kbdy64i2ebc3","arb000000001331","USD"],["p823xuwcaoxe62y","arb000000009877","USD"],["p823xuwcaoxe62y","arb000000006061","USD"],["p823xuwcaoxe62y","arb000000010711","USD"],["p823xuwcaoxe62y","arb000000011667","USD"],["sz1448zehd0kast","arb000000006599","USD"],["sz1448zehd0kast","arl000000886757","USD"],["sz1448zehd0kast","arb000000012619","USD"],["sz1448zehd0kast","arb000000005365","USD"],["sz1448zehd0kast","arb000000012871","USD"],["50c026huo6cukoi","arb000000012945","USD"],["50c026huo6cukoi","arb000000001709","USD"],["50c026huo6cukoi","arb000000008371","USD"],["50c026huo6cukoi","arb000000006787","USD"],["ksy0celll01iqef","arb000000009159","USD"],["ksy0celll01iqef","arb000000008031","USD"],["ksy0celll01iqef","arb000000000953","USD"],["r6465m0lrjb2go4","arb000000005553","USD"],["r6465m0lrjb2go4","arb000000006941","USD"],["r6465m0lrjb2go4","arb000000007525","USD"],["r6465m0lrjb2go4","arb000000008047","USD"],["3qh21fws9zaddf4","arc000000357904","USD"],["3qh21fws9zaddf4","arb000000004575","USD"],["3qh21fws9zaddf4","arb000000003603","USD"],["3qh21fws9zaddf4","arb000000004797","USD"],["3qh21fws9zaddf4","arb000000012405","USD"],["ujgywpmtufad2yu","arb000000012065","USD"],["ujgywpmtufad2yu","arb000000002093","USD"],["ujgywpmtufad2yu","arb000000010967","USD"],["khut24hk5t9bvpd","arb000000009905","USD"],["khut24hk5t9bvpd","arb000000001493","USD"],["khut24hk5t9bvpd","arb000000012153","USD"],["oc5cmsw5sztbsgo","arb000000003287","USD"],["oc5cmsw5sztbsgo","arb000000010025","USD"],["oc5cmsw5sztbsgo","arl000000885887","USD"],["oc5cmsw5sztbsgo","arc000000357430","USD"],["x1mkg3mapw5zs2h","arb000000012743","USD"],["x1mkg3mapw5zs2h","arl000000886787","USD"],["x1mkg3mapw5zs2h","arb000000001627","USD"],["x1mkg3mapw5zs2h","arl000000887451","USD"],["x1mkg3mapw5zs2h","arb000000004967","USD"],["x1mkg3mapw5zs2h","arb000000002741","USD"],["x1mkg3mapw5zs2h","arb000000010849","USD"],["zli4yc6t7edp8jy","arb000000008365","USD"],["r7a72bbbxx2wf66","arb000000008363","USD"],["r7a72bbbxx2wf66","arl000000886011","USD"],["r7a72bbbxx2wf66","arb000000004301","USD"],["r7a72bbbxx2wf66","arl000000887105","USD"],["r7a72bbbxx2wf66","arl000000886593","USD"],["r7a72bbbxx2wf66","arb000000010321","USD"],["r7a72bbbxx2wf66","arb000000002585","USD"],["yosja855qfo60om","arl000000886007","USD"],["yosja855qfo60om","arc000000358048","USD"],["yosja855qfo60om","arb000000003699","USD"],["yosja855qfo60om","arb000000005119","USD"],["yosja855qfo60om","arb000000010907","USD"],["kyzvcoirsdljchq","arb000000000857","USD"],["kyzvcoirsdljchq","arb000000001675","USD"],["kyzvcoirsdljchq","arb000000004519","USD"],["mxj51uf7w7cdiul","arb000000011797","USD"],["mxj51uf7w7cdiul","arb000000011297","USD"],["mxj51uf7w7cdiul","arb000000005859","USD"],["lqtl3g6ljtynu79","arb000000007045","USD"],["lqtl3g6ljtynu79","arb000000001833","USD"],["1rbe9uu38b95fmf","arl000000886809","USD"],["1rbe9uu38b95fmf","arb000000009577","USD"],["1rbe9uu38b95fmf","arb000000008225","USD"],["1rbe9uu38b95fmf","arb000000012183","USD"],["1rbe9uu38b95fmf","arb000000002009","USD"],["5tvpz1jjewu63fh","arb000000002981","USD"],["5tvpz1jjewu63fh","arb000000002643","USD"],["5tvpz1jjewu63fh","arb000000002519","USD"],["5tvpz1jjewu63fh","arb000000004935","USD"],["5tvpz1jjewu63fh","arb000000009911","USD"],["x36qb9krffbmqe7","arb000000006293","USD"],["x36qb9krffbmqe7","arl000000887097","USD"],["x36qb9krffbmqe7","arb000000002895","USD"],["x36qb9krffbmqe7","arb000000002397","USD"],["x36qb9krffbmqe7","arb000000011815","USD"],["x36qb9krffbmqe7","arb000000012641","USD"],["4j7h0f9passvv7n","arb000000004511","USD"],["4j7h0f9passvv7n","arb000000007419","USD"],["kvb1wj7x3mvarlw","arb000000012283","USD"],["kvb1wj7x3mvarlw","arc000000357763","USD"],["kvb1wj7x3mvarlw","arb000000003509","USD"],["rxr5dhxcb1th6vd","arb000000009331","USD"],["rxr5dhxcb1th6vd","arb000000009553","USD"],["giq58mhd2daubks","arb000000006917","USD"],["giq58mhd2daubks","arb000000006001","USD"],["rj64c9lfmlcgb9i","arb000000008491","USD"],["rj64c9lfmlcgb9i","arb000000009849","USD"],["xcdtc2qz6l61pd9","arb000000006377","USD"],["xcdtc2qz6l61pd9","arb000000006877","USD"],["xcdtc2qz6l61pd9","arc000000357250","USD"],["xcdtc2qz6l61pd9","arb000000003167","USD"],["gdrscmv58yp96j4","arb000000002079","USD"],["9arhsjnpjht4v4n","arb000000007453","USD"],["9arhsjnpjht4v4n","arb000000000757","USD"],["9arhsjnpjht4v4n","arb000000012549","USD"],["x5gt946j3e9zt3r","arl000000887481","USD"],["x5gt946j3e9zt3r","arb000000007065","USD"],["26kd4slfvuyssia","arb000000001785","USD"],["lit4ldbkzz75y1f","arb000000002699","USD"],["lit4ldbkzz75y1f","arb000000012919","USD"],["lit4ldbkzz75y1f","arb000000008157","USD"],["lit4ldbkzz75y1f","arb000000005027","USD"],["1j2obckwfcl7c8a","arb000000002037","USD"],["1j2obckwfcl7c8a","arb000000007099","USD"],["1j2obckwfcl7c8a","arb000000008265","USD"],["1j2obckwfcl7c8a","arb000000011945","USD"],["1j2obckwfcl7c8a","arb000000011963","USD"],["l98nblp4ibo6gj1","arb000000001903","USD"],["l98nblp4ibo6gj1","arl000000886775","USD"],["l98nblp4ibo6gj1","arl000000886315","USD"],["5lqegw0wnkgzzey","arb000000010385","USD"],["5lqegw0wnkgzzey","arb000000008559","USD"],["no0jxsqaz2j7uf5","arl000000886057","USD"],["no0jxsqaz2j7uf5","arb000000006961","USD"],["no0jxsqaz2j7uf5","arc000000357832","USD"],["no0jxsqaz2j7uf5","arb000000003427","USD"],["no0jxsqaz2j7uf5","arb000000010519","USD"],["no0jxsqaz2j7uf5","arc000000357640","USD"],["no0jxsqaz2j7uf5","arb000000010841","USD"],["no0jxsqaz2j7uf5","arb000000003555","USD"],["rcz4izfc7thuvfs","arl000000885903","USD"],["6xttvs9rmrbcwxw","arb000000001275","USD"],["6xttvs9rmrbcwxw","arb000000001407","USD"],["cxop94o6c59skzm","arl000000886645","USD"],["cxop94o6c59skzm","arb000000012355","USD"],["cxop94o6c59skzm","arl000000886383","USD"],["cxop94o6c59skzm","arb000000001537","USD"],["cxop94o6c59skzm","arb000000010077","USD"],["z41lrphpi21dqnj","arb000000012829","USD"],["z41lrphpi21dqnj","arb000000002291","USD"],["z41lrphpi21dqnj","arb000000012457","USD"],["dmk1uosyceacifw","arb000000007373","USD"],["dmk1uosyceacifw","arb000000011847","USD"],["dmk1uosyceacifw","arl000000886255","USD"],["zxv6if5dv6k1snn","arb000000006707","USD"],["zxv6if5dv6k1snn","arb000000002927","USD"],["zxv6if5dv6k1snn","arb000000001987","USD"],["zxv6if5dv6k1snn","arb000000000983","USD"],["zoe0x5gm0u7tjcv","arb000000012125","USD"],["zoe0x5gm0u7tjcv","arb000000001871","USD"],["zoe0x5gm0u7tjcv","arl000000886869","USD"],["zoe0x5gm0u7tjcv","arl000000886337","USD"],["zoe0x5gm0u7tjcv","arb000000007531","USD"],["zoe0x5gm0u7tjcv","arb000000011591","USD"],["zoe0x5gm0u7tjcv","arl000000885647","USD"],["za79j8z1chx1h23","arb000000006073","USD"],["za79j8z1chx1h23","arl000000885941","USD"],["j9h13rt62qs51v2","arb000000005925","USD"],["j9h13rt62qs51v2","arb000000002679","USD"],["j9h13rt62qs51v2","arb000000005367","USD"],["lz4j1owbddcppfi","arl000000886653","USD"],["lz4j1owbddcppfi","arb000000012249","USD"],["lz4j1owbddcppfi","arb000000001815","USD"],["lz4j1owbddcppfi","arb000000009933","USD"],["lz4j1owbddcppfi","arb000000012175","USD"],["vr95keib0acz8r4","arb000000004685","USD"],["vr95keib0acz8r4","arb000000001465","USD"],["vr95keib0acz8r4","arb000000005983","USD"],["vr95keib0acz8r4","arb000000011985","USD"],["vr95keib0acz8r4","arl000000885737","USD"],["vr95keib0acz8r4","arl000000885891","USD"],["yzx5zf2h5drwkwc","arb000000007705","USD"],["yzx5zf2h5drwkwc","arb000000005555","USD"],["yzx5zf2h5drwkwc","arc000000358117","USD"],["yzx5zf2h5drwkwc","arb000000003745","USD"],["nv7n7cndd392urd","arb000000004337","USD"],["nv7n7cndd392urd","arb000000011999","USD"],["cg2b7idkr2uqdpt","arb000000011775","USD"],["cg2b7idkr2uqdpt","arb000000007953","USD"],["cg2b7idkr2uqdpt","arb000000006355","USD"],["cg2b7idkr2uqdpt","arb000000007367","USD"],["cg2b7idkr2uqdpt","arb000000010745","USD"],["cg2b7idkr2uqdpt","arb000000004917","USD"],["cg2b7idkr2uqdpt","arb000000009965","USD"],["915pyuk7p336siv","arl000000887107","USD"],["915pyuk7p336siv","arb000000007109","USD"],["915pyuk7p336siv","arb000000008351","USD"],["z3dmfs1v8a0sn3v","arc000000357253","USD"],["z3dmfs1v8a0sn3v","arb000000011953","USD"],["z3dmfs1v8a0sn3v","arb000000003385","USD"],["z3dmfs1v8a0sn3v","arb000000003169","USD"],["z3dmfs1v8a0sn3v","arc000000357577","USD"],["z3dmfs1v8a0sn3v","arl000000887367","USD"],["g3kjoufohfakx43","arc000000357406","USD"],["g3kjoufohfakx43","arb000000003271","USD"],["g3kjoufohfakx43","arb000000012699","USD"],["8pio8l4b5fctezj","arl000000886935","USD"],["8pio8l4b5fctezj","arb000000012091","USD"],["8pio8l4b5fctezj","arb000000006605","USD"],["9qyqwxc69tzyp33","arb000000009407","USD"],["9qyqwxc69tzyp33","arb000000005099","USD"],["7mrrd1tjqije2vc","arb000000005539","USD"],["7mrrd1tjqije2vc","arb000000008893","USD"],["7mrrd1tjqije2vc","arb000000001423","USD"],["7mrrd1tjqije2vc","arb000000006749","USD"],["7mrrd1tjqije2vc","arb000000005819","USD"],["pwgk2pftkp5okxf","arb000000012983","USD"],["pwgk2pftkp5okxf","arb000000002617","USD"],["pwgk2pftkp5okxf","arb000000009379","USD"],["pwgk2pftkp5okxf","arb000000008515","USD"],["i70dtll5rj3jf4i","arb000000003945","USD"],["i70dtll5rj3jf4i","arb000000002267","USD"],["i70dtll5rj3jf4i","arb000000004895","USD"],["i70dtll5rj3jf4i","arc000000358417","USD"],["i70dtll5rj3jf4i","arb000000003165","USD"],["i70dtll5rj3jf4i","arb000000006557","USD"],["i70dtll5rj3jf4i","arb000000009175","USD"],["i70dtll5rj3jf4i","arb000000005411","USD"],["i70dtll5rj3jf4i","arc000000357247","USD"],["qxc5fcozfesjsvm","arb000000002881","USD"],["qxc5fcozfesjsvm","arb000000011209","USD"],["qxc5fcozfesjsvm","arb000000003267","USD"],["qxc5fcozfesjsvm","arc000000357400","USD"],["n2mjf46iu5fjc96","arb000000010737","USD"],["n2mjf46iu5fjc96","arb000000011173","USD"],["2tcjy34q9de2row","arb000000010793","USD"],["2tcjy34q9de2row","arl000000885645","USD"],["2tcjy34q9de2row","arb000000007773","USD"],["2tcjy34q9de2row","arb000000002375","USD"],["bpp6re78m7mcat0","arb000000008637","USD"],["bpp6re78m7mcat0","arb000000001443","USD"],["bpp6re78m7mcat0","arb000000004165","USD"],["wqbo99rmdcz5pgk","arb000000002747","USD"],["wqbo99rmdcz5pgk","arb000000010509","USD"],["wqbo99rmdcz5pgk","arb000000010795","USD"],["wqbo99rmdcz5pgk","arb000000010799","USD"],["vocoad1jhoist10","arb000000007675","USD"],["vocoad1jhoist10","arb000000005081","USD"],["uovbnboscijiude","arb000000009203","USD"],["87p0arepnzz5m6i","arc000000357859","USD"],["87p0arepnzz5m6i","arl000000886571","USD"],["87p0arepnzz5m6i","arb000000003573","USD"],["y1yglavrqtevyxt","arb000000002815","USD"],["y1yglavrqtevyxt","arb000000008479","USD"],["y1yglavrqtevyxt","arb000000012027","USD"],["1rtc85g8yuam4np","arb000000008151","USD"],["1rtc85g8yuam4np","arb000000008613","USD"],["1rtc85g8yuam4np","arb000000001161","USD"],["1rtc85g8yuam4np","arb000000011253","USD"],["1rtc85g8yuam4np","arl000000885815","USD"],["oiqjmn30m1pc9wy","arb000000006373","USD"],["oiqjmn30m1pc9wy","arb000000009623","USD"],["l510lk814kcgo26","arb000000008621","USD"],["l510lk814kcgo26","arb000000012823","USD"],["l510lk814kcgo26","arb000000010387","USD"],["l510lk814kcgo26","arb000000010687","USD"],["l510lk814kcgo26","arb000000002919","USD"],["l510lk814kcgo26","arb000000005203","USD"],["v84rnufsebhxj3r","arb000000002043","USD"],["v84rnufsebhxj3r","arb000000002649","USD"],["v84rnufsebhxj3r","arb000000009475","USD"],["v84rnufsebhxj3r","arb000000011231","USD"],["v84rnufsebhxj3r","arb000000011065","USD"],["h8ihsqe0343lydg","arb000000010835","USD"],["h8ihsqe0343lydg","arb000000010701","USD"],["h8ihsqe0343lydg","arc000000357493","USD"],["h8ihsqe0343lydg","arb000000003329","USD"],["t4cad7taj4akrk5","arb000000000669","USD"],["t4cad7taj4akrk5","arb000000012089","USD"],["t4cad7taj4akrk5","arb000000011665","USD"],["t4cad7taj4akrk5","arb000000009405","USD"],["t4cad7taj4akrk5","arl000000886795","USD"],["t4cad7taj4akrk5","arb000000006817","USD"],["857kd7hhbi4dqv5","arc000000358000","USD"],["857kd7hhbi4dqv5","arl000000885987","USD"],["857kd7hhbi4dqv5","arb000000003667","USD"],["857kd7hhbi4dqv5","arb000000009625","USD"],["857kd7hhbi4dqv5","arb000000011283","USD"],["857kd7hhbi4dqv5","arb000000011967","USD"],["x6dpa0n25065zmk","arb000000002851","USD"],["x6dpa0n25065zmk","arl000000886171","USD"],["x6dpa0n25065zmk","arb000000004851","USD"],["x6dpa0n25065zmk","arb000000008577","USD"],["ixfwfouyam7a63y","arb000000000959","USD"],["ixfwfouyam7a63y","arb000000004813","USD"],["ixfwfouyam7a63y","arb000000006825","USD"],["ixfwfouyam7a63y","arb000000008375","USD"],["aqut9z9uxo043e1","arb000000004457","USD"],["aqut9z9uxo043e1","arb000000001009","USD"],["aqut9z9uxo043e1","arb000000012433","USD"],["aqut9z9uxo043e1","arl000000887435","USD"],["aqut9z9uxo043e1","arl000000886165","USD"],["o62msq6z2it1lly","arb000000009899","USD"],["o62msq6z2it1lly","arl000000885743","USD"],["j8t0x5s94ju8yq4","arb000000001311","USD"],["j8t0x5s94ju8yq4","arl000000887441","USD"],["j8t0x5s94ju8yq4","arb000000000717","USD"],["j8t0x5s94ju8yq4","arb000000009715","USD"],["qye7q9vq7ay178o","arb000000002149","USD"],["qye7q9vq7ay178o","arc000000357952","USD"],["qye7q9vq7ay178o","arb000000010851","USD"],["qye7q9vq7ay178o","arb000000008985","USD"],["qye7q9vq7ay178o","arb000000003635","USD"],["o1tinmedr8n2c8a","arb000000000735","USD"],["sziprlwjsosq1ia","arb000000012615","USD"],["sziprlwjsosq1ia","arb000000010635","USD"],["vkrf3yn7yjp9aul","arc000000357325","USD"],["vkrf3yn7yjp9aul","arb000000006617","USD"],["vkrf3yn7yjp9aul","arb000000003217","USD"],["25nz01fgep35mv9","arb000000009761","USD"],["25nz01fgep35mv9","arb000000006945","USD"],["25nz01fgep35mv9","arb000000002337","USD"],["25nz01fgep35mv9","arb000000001665","USD"],["o5gsplqlhtlhrdn","arb000000003475","USD"],["o5gsplqlhtlhrdn","arb000000010787","USD"],["o5gsplqlhtlhrdn","arb000000011357","USD"],["o5gsplqlhtlhrdn","arc000000357712","USD"],["o5gsplqlhtlhrdn","arl000000886481","USD"],["jth5ewa64kfjket","arb000000005129","USD"],["jth5ewa64kfjket","arb000000012643","USD"],["r6s9enima2k9yry","arb000000012147","USD"],["r6s9enima2k9yry","arl000000887475","USD"],["qrh7audh3dz3yrh","arb000000011397","USD"],["qrh7audh3dz3yrh","arb000000009167","USD"],["qrh7audh3dz3yrh","arb000000004093","USD"],["foycjifz0gecjek","arb000000011799","USD"],["lwltl3a4567uluc","arb000000010951","USD"],["lwltl3a4567uluc","arb000000010093","USD"],["wx8ph1vkda683fk","arl000000885577","USD"],["wx8ph1vkda683fk","arb000000006889","USD"],["wx8ph1vkda683fk","arb000000010681","USD"],["wx8ph1vkda683fk","arc000000357058","USD"],["wx8ph1vkda683fk","arb000000011213","USD"],["wx8ph1vkda683fk","arb000000003039","USD"],["1oiwekr8yzx4hes","arb000000006789","USD"],["1oiwekr8yzx4hes","arb000000010237","USD"],["1oiwekr8yzx4hes","arb000000005009","USD"],["n6lyjflmrs9fn20","arc000000357046","USD"],["n6lyjflmrs9fn20","arb000000003083","USD"],["n6lyjflmrs9fn20","arb000000003031","USD"],["n6lyjflmrs9fn20","arc000000357124","USD"],["qbm1b4sy7abo3lb","arb000000002869","USD"],["qbm1b4sy7abo3lb","arb000000004459","USD"],["qbm1b4sy7abo3lb","arb000000000827","USD"],["qbm1b4sy7abo3lb","arb000000001185","USD"],["qbm1b4sy7abo3lb","arb000000002191","USD"],["j7foz500kear11o","arb000000012475","USD"],["71w4aqhkzz8qg37","arb000000010035","USD"],["71w4aqhkzz8qg37","arl000000887217","USD"],["71w4aqhkzz8qg37","arb000000001231","USD"],["71w4aqhkzz8qg37","arb000000010903","USD"],["4d1bz10xvilptf0","arb000000005109","USD"],["4d1bz10xvilptf0","arb000000010641","USD"],["4d1bz10xvilptf0","arb000000001197","USD"],["4d1bz10xvilptf0","arb000000009593","USD"],["4d1bz10xvilptf0","arb000000006413","USD"],["ulg4luc7isr650x","arb000000006449","USD"],["tqeg1gmp54qei46","arb000000004669","USD"],["tqeg1gmp54qei46","arb000000005991","USD"],["tqeg1gmp54qei46","arb000000007583","USD"],["tqeg1gmp54qei46","arb000000007279","USD"],["9j3euza7vjnb1ok","arl000000887277","USD"],["9j3euza7vjnb1ok","arb000000008231","USD"],["9j3euza7vjnb1ok","arc000000357907","USD"],["9j3euza7vjnb1ok","arb000000003605","USD"],["m3cyyunl39nkilz","arb000000003727","USD"],["m3cyyunl39nkilz","arc000000358090","USD"],["m3cyyunl39nkilz","arl000000887381","USD"],["m3cyyunl39nkilz","arb000000012567","USD"],["m3cyyunl39nkilz","arb000000003249","USD"],["m3cyyunl39nkilz","arb000000006003","USD"],["m3cyyunl39nkilz","arc000000357373","USD"],["m3cyyunl39nkilz","arb000000011271","USD"],["x0c1zlwsuvma3b4","arb000000001441","USD"],["x0c1zlwsuvma3b4","arb000000002635","USD"],["x0c1zlwsuvma3b4","arb000000007215","USD"],["x0c1zlwsuvma3b4","arb000000001641","USD"],["aenkq1243rzw1pm","arb000000006163","USD"],["aenkq1243rzw1pm","arc000000357934","USD"],["aenkq1243rzw1pm","arb000000003623","USD"],["aenkq1243rzw1pm","arb000000002367","USD"],["aenkq1243rzw1pm","arb000000006043","USD"],["5jtimbjhfdtc9vq","arb000000008405","USD"],["5jtimbjhfdtc9vq","arb000000005403","USD"],["rnl85yvzw2gcgs1","arb000000001983","USD"],["rnl85yvzw2gcgs1","arb000000000755","USD"],["kt50tfri4sl6lnp","arb000000007463","USD"],["kt50tfri4sl6lnp","arb000000011057","USD"],["kt50tfri4sl6lnp","arb000000004331","USD"],["vi2lp0vxo49f9mf","arc000000357052","USD"],["vi2lp0vxo49f9mf","arb000000003035","USD"],["vi2lp0vxo49f9mf","arb000000011077","USD"],["d07hugmtrbstk2d","arb000000012689","USD"],["d07hugmtrbstk2d","arb000000005073","USD"],["d07hugmtrbstk2d","arb000000002323","USD"],["d07hugmtrbstk2d","arb000000001763","USD"],["a8p7uis59lfhlpc","arb000000001561","USD"],["p7pyw9dy2bf3ar6","arb000000001125","USD"],["p7pyw9dy2bf3ar6","arb000000008331","USD"],["p7pyw9dy2bf3ar6","arb000000000803","USD"],["7majury5n693sng","arb000000004761","USD"],["7majury5n693sng","arb000000009687","USD"],["7majury5n693sng","arb000000008481","USD"],["801nuxqn03znxkp","arb000000001551","USD"],["801nuxqn03znxkp","arb000000003647","USD"],["801nuxqn03znxkp","arb000000002017","USD"],["801nuxqn03znxkp","arb000000004959","USD"],["801nuxqn03znxkp","arb000000004377","USD"],["801nuxqn03znxkp","arb000000005163","USD"],["801nuxqn03znxkp","arc000000357970","USD"],["801nuxqn03znxkp","arb000000004413","USD"],["ietlvd0e5yv5abk","arb000000008561","USD"],["ietlvd0e5yv5abk","arb000000008761","USD"],["ietlvd0e5yv5abk","arb000000007753","USD"],["ietlvd0e5yv5abk","arb000000002383","USD"],["ietlvd0e5yv5abk","arb000000007075","USD"],["obxgb2ypgli050e","arb000000003459","USD"],["obxgb2ypgli050e","arb000000003947","USD"],["obxgb2ypgli050e","arb000000003085","USD"],["obxgb2ypgli050e","arc000000358420","USD"],["obxgb2ypgli050e","arc000000357127","USD"],["obxgb2ypgli050e","arc000000357688","USD"],["y1sl6lwhum31gf2","arl000000887021","USD"],["y1sl6lwhum31gf2","arb000000011889","USD"],["xb8412zvnook5ex","arb000000008083","USD"],["xb8412zvnook5ex","arb000000002215","USD"],["xb8412zvnook5ex","arb000000006357","USD"],["xb8412zvnook5ex","arb000000002457","USD"],["xb8412zvnook5ex","arb000000012095","USD"],["xb8412zvnook5ex","arl000000885817","USD"],["xiffmnlabvm83py","arb000000008073","USD"],["xiffmnlabvm83py","arb000000003205","USD"],["xiffmnlabvm83py","arb000000010743","USD"],["xiffmnlabvm83py","arc000000357307","USD"],["xiffmnlabvm83py","arb000000012275","USD"],["xiffmnlabvm83py","arl000000886603","USD"],["62gf260nlksliiu","arl000000886993","USD"],["62gf260nlksliiu","arl000000885705","USD"],["62gf260nlksliiu","arb000000010923","USD"],["na7dn9pdensn94b","arc000000358294","USD"],["na7dn9pdensn94b","arb000000004939","USD"],["na7dn9pdensn94b","arl000000886637","USD"],["na7dn9pdensn94b","arb000000003863","USD"],["na7dn9pdensn94b","arb000000004311","USD"],["dflu2h6o6ruvf2h","arb000000008961","USD"],["dflu2h6o6ruvf2h","arb000000006737","USD"],["dflu2h6o6ruvf2h","arb000000005333","USD"],["n3m2x0axtrp52bq","arb000000008945","USD"],["n3m2x0axtrp52bq","arc000000358186","USD"],["n3m2x0axtrp52bq","arb000000006187","USD"],["n3m2x0axtrp52bq","arb000000004097","USD"],["n3m2x0axtrp52bq","arb000000003791","USD"],["eer5bb3fnc72kul","arb000000009241","USD"],["eer5bb3fnc72kul","arb000000005401","USD"],["eer5bb3fnc72kul","arb000000012165","USD"],["eer5bb3fnc72kul","arc000000357157","USD"],["eer5bb3fnc72kul","arl000000885563","USD"],["eer5bb3fnc72kul","arb000000009091","USD"],["eer5bb3fnc72kul","arc000000358054","USD"],["eer5bb3fnc72kul","arb000000011125","USD"],["eer5bb3fnc72kul","arb000000003105","USD"],["eer5bb3fnc72kul","arb000000003703","USD"],["izymntjazn6kxue","arc000000358318","USD"],["izymntjazn6kxue","arb000000004847","USD"],["izymntjazn6kxue","arb000000003879","USD"],["izymntjazn6kxue","arb000000004811","USD"],["izymntjazn6kxue","arb000000006603","USD"],["izymntjazn6kxue","arb000000001999","USD"],["izymntjazn6kxue","arb000000011329","USD"],["vt14uz8mek9qxp6","arb000000012043","USD"],["vt14uz8mek9qxp6","arb000000008369","USD"],["ccbzhb4rw3lg30a","arb000000005529","USD"],["ccbzhb4rw3lg30a","arb000000005931","USD"],["ccbzhb4rw3lg30a","arb000000007315","USD"],["rshk6hy2fy7v077","arl000000887309","USD"],["rshk6hy2fy7v077","arb000000009987","USD"],["rshk6hy2fy7v077","arl000000885727","USD"],["j1q395y3c6n1ukn","arb000000005133","USD"],["j1q395y3c6n1ukn","arb000000005641","USD"],["j1q395y3c6n1ukn","arb000000002249","USD"],["j1q395y3c6n1ukn","arb000000009545","USD"],["nh5jdxvvzt2r4vk","arl000000885573","USD"],["nh5jdxvvzt2r4vk","arb000000010311","USD"],["nh5jdxvvzt2r4vk","arl000000887203","USD"],["nh5jdxvvzt2r4vk","arb000000006959","USD"],["nh5jdxvvzt2r4vk","arb000000001527","USD"],["nh5jdxvvzt2r4vk","arl000000886691","USD"],["8qr0o7il7ulunux","arb000000006033","USD"],["8qr0o7il7ulunux","arl000000885605","USD"],["kyyawrmts748ad8","arb000000003777","USD"],["kyyawrmts748ad8","arl000000887137","USD"],["kyyawrmts748ad8","arl000000886643","USD"],["kyyawrmts748ad8","arl000000886629","USD"],["kyyawrmts748ad8","arc000000358165","USD"],["kyyawrmts748ad8","arb000000011481","USD"],["rrr7jktijxxkkuv","arb000000010603","USD"],["rrr7jktijxxkkuv","arl000000886931","USD"],["rrr7jktijxxkkuv","arb000000001873","USD"],["rrr7jktijxxkkuv","arb000000001219","USD"],["rrr7jktijxxkkuv","arb000000005565","USD"],["fxqcdnkg5fd2aec","arb000000007831","USD"],["fxqcdnkg5fd2aec","arl000000886321","USD"],["fxqcdnkg5fd2aec","arb000000009045","USD"],["fxqcdnkg5fd2aec","arl000000886483","USD"],["fxqcdnkg5fd2aec","arb000000010257","USD"],["fxqcdnkg5fd2aec","arb000000011325","USD"],["fxqcdnkg5fd2aec","arb000000004671","USD"],["fxqcdnkg5fd2aec","arb000000008993","USD"],["fxqcdnkg5fd2aec","arb000000006791","USD"],["hreurrvzmfjawph","arb000000003009","USD"],["hreurrvzmfjawph","arl000000887327","USD"],["hreurrvzmfjawph","arc000000357013","USD"],["hreurrvzmfjawph","arb000000004341","USD"],["hreurrvzmfjawph","arl000000885929","USD"],["hreurrvzmfjawph","arb000000007239","USD"],["hreurrvzmfjawph","arb000000004643","USD"],["3qn7onchlszvrn3","arb000000003123","USD"],["3qn7onchlszvrn3","arb000000000819","USD"],["3qn7onchlszvrn3","arc000000357184","USD"],["yn71zjy35tgxv50","arl000000886837","USD"],["yn71zjy35tgxv50","arb000000001737","USD"],["yn71zjy35tgxv50","arb000000000825","USD"],["yn71zjy35tgxv50","arb000000010179","USD"],["yn71zjy35tgxv50","arl000000885511","USD"],["vbhh8whn71yv35q","arb000000005337","USD"],["vbhh8whn71yv35q","arb000000000901","USD"],["oktpfa6t93xdy8u","arb000000009477","USD"],["oktpfa6t93xdy8u","arb000000000831","USD"],["oktpfa6t93xdy8u","arb000000005235","USD"],["oktpfa6t93xdy8u","arb000000009695","USD"],["oktpfa6t93xdy8u","arb000000012587","USD"],["oktpfa6t93xdy8u","arb000000005369","USD"],["8t6e6erkkbp8n8j","arb000000007873","USD"],["8t6e6erkkbp8n8j","arb000000010581","USD"],["0d5d228oetqum1x","arb000000003781","USD"],["0d5d228oetqum1x","arb000000001287","USD"],["0d5d228oetqum1x","arl000000886163","USD"],["0d5d228oetqum1x","arc000000358171","USD"],["0d5d228oetqum1x","arl000000887291","USD"],["0d5d228oetqum1x","arc000000357751","USD"],["0d5d228oetqum1x","arl000000885789","USD"],["0d5d228oetqum1x","arb000000003501","USD"],["09393ea6huwb15w","arb000000010993","USD"],["0gpywn0rkda54fk","arb000000011987","USD"],["aodtq8jgan60n9f","arb000000009505","USD"],["aodtq8jgan60n9f","arb000000003401","USD"],["aodtq8jgan60n9f","arc000000357601","USD"],["wa83iyczmj91ti3","arb000000010059","USD"],["wa83iyczmj91ti3","arb000000010939","USD"],["wa83iyczmj91ti3","arb000000011029","USD"],["wa83iyczmj91ti3","arb000000010593","USD"],["k9yi9nx1s8ld6ob","arb000000007907","USD"],["k9yi9nx1s8ld6ob","arb000000004273","USD"],["k9yi9nx1s8ld6ob","arb000000006837","USD"],["rkp05ix7323ex6r","arb000000012017","USD"],["rkp05ix7323ex6r","arl000000885551","USD"],["rkp05ix7323ex6r","arb000000002661","USD"],["rkp05ix7323ex6r","arb000000002231","USD"],["rkp05ix7323ex6r","arb000000009627","USD"],["o4ilhu4mg5895fj","arl000000886195","USD"],["o4ilhu4mg5895fj","arb000000012281","USD"],["o4ilhu4mg5895fj","arb000000012429","USD"],["o4ilhu4mg5895fj","arl000000886267","USD"],["o4ilhu4mg5895fj","arb000000011119","USD"],["048pz8s0qs48iml","arb000000005291","USD"],["048pz8s0qs48iml","arb000000012681","USD"],["048pz8s0qs48iml","arb000000011835","USD"],["mthxjv0q39fw0qg","arc000000357931","USD"],["mthxjv0q39fw0qg","arb000000003621","USD"],["mthxjv0q39fw0qg","arb000000006729","USD"],["wgfxj4fl1b1k6xp","arb000000010125","USD"],["royeu31m89zbb8x","arb000000001793","USD"],["royeu31m89zbb8x","arb000000011411","USD"],["royeu31m89zbb8x","arb000000003087","USD"],["royeu31m89zbb8x","arb000000012237","USD"],["royeu31m89zbb8x","arc000000357130","USD"],["royeu31m89zbb8x","arb000000011461","USD"],["slz0aqwkx0w0vjv","arb000000003223","USD"],["slz0aqwkx0w0vjv","arb000000003685","USD"],["slz0aqwkx0w0vjv","arb000000006139","USD"],["slz0aqwkx0w0vjv","arc000000358027","USD"],["slz0aqwkx0w0vjv","arc000000357334","USD"],["3fessaogzsm0uz6","arl000000887133","USD"],["3fessaogzsm0uz6","arb000000010605","USD"],["3fessaogzsm0uz6","arb000000004815","USD"],["3fessaogzsm0uz6","arb000000007265","USD"],["ogj31gg1f6xnfgq","arb000000005901","USD"],["ogj31gg1f6xnfgq","arb000000011881","USD"],["ogj31gg1f6xnfgq","arc000000357001","USD"],["ogj31gg1f6xnfgq","arb000000003001","USD"],["ogj31gg1f6xnfgq","arl000000886929","USD"],["s6qrj8zd9unr7ie","arb000000004325","USD"],["hxd3pye2clwx21m","arl000000885691","USD"],["hxd3pye2clwx21m","arb000000007599","USD"],["hxd3pye2clwx21m","arb000000008743","USD"],["hxd3pye2clwx21m","arb000000000943","USD"],["hxd3pye2clwx21m","arl000000886457","USD"],["hxd3pye2clwx21m","arb000000008625","USD"],["qyjjecnra5rq2da","arb000000012313","USD"],["qyjjecnra5rq2da","arb000000004385","USD"],["qyjjecnra5rq2da","arb000000012411","USD"],["lu94gam52nbwlsr","arl000000886717","USD"],["lu94gam52nbwlsr","arb000000011793","USD"],["57h0lzvfcqdez7o","arb000000010709","USD"],["57h0lzvfcqdez7o","arl000000885597","USD"],["57h0lzvfcqdez7o","arb000000010811","USD"],["nfcdp67243qj4v0","arl000000886169","USD"],["nfcdp67243qj4v0","arb000000007627","USD"],["nfcdp67243qj4v0","arc000000357808","USD"],["nfcdp67243qj4v0","arb000000009229","USD"],["nfcdp67243qj4v0","arb000000006039","USD"],["nfcdp67243qj4v0","arb000000003539","USD"],["tt022l4m7g4ktth","arl000000885825","USD"],["tt022l4m7g4ktth","arb000000005505","USD"],["tt022l4m7g4ktth","arb000000005489","USD"],["rvn3dbgapejh323","arb000000001183","USD"],["cly2rx6ft1iztxk","arb000000002321","USD"],["cly2rx6ft1iztxk","arb000000010957","USD"],["cly2rx6ft1iztxk","arb000000011513","USD"],["cly2rx6ft1iztxk","arb000000009071","USD"],["cly2rx6ft1iztxk","arb000000006117","USD"],["cly2rx6ft1iztxk","arb000000012167","USD"],["20t1kjbfbpk7491","arb000000005143","USD"],["20t1kjbfbpk7491","arb000000012831","USD"],["20t1kjbfbpk7491","arl000000887235","USD"],["20t1kjbfbpk7491","arb000000004373","USD"],["r01saod3b2hbdbj","arl000000885531","USD"],["r01saod3b2hbdbj","arb000000011625","USD"],["r01saod3b2hbdbj","arb000000002707","USD"],["fepj9n2dysyipoe","arl000000886015","USD"],["fepj9n2dysyipoe","arl000000886505","USD"],["fepj9n2dysyipoe","arb000000010123","USD"],["38gbi1o45gbjhlg","arb000000012113","USD"],["38gbi1o45gbjhlg","arb000000006537","USD"],["38gbi1o45gbjhlg","arb000000007879","USD"],["38gbi1o45gbjhlg","arb000000009099","USD"],["2rtqupw6x40d3zn","arb000000001111","USD"],["b8zt66xk3n8pyh3","arb000000004567","USD"],["b8zt66xk3n8pyh3","arb000000004059","USD"],["yu8er9ltgd679ue","arb000000000961","USD"],["yu8er9ltgd679ue","arb000000012051","USD"],["7zsxitwdwl05qjw","arl000000886311","USD"],["7zsxitwdwl05qjw","arb000000008065","USD"],["7zsxitwdwl05qjw","arb000000004863","USD"],["7zsxitwdwl05qjw","arb000000007931","USD"],["7zsxitwdwl05qjw","arb000000012085","USD"],["e4qybfra13qb42m","arb000000008663","USD"],["e4qybfra13qb42m","arb000000004333","USD"],["e4qybfra13qb42m","arb000000012961","USD"],["e4qybfra13qb42m","arb000000008599","USD"],["xcy6iwqhqmezkh0","arc000000357268","USD"],["xcy6iwqhqmezkh0","arb000000009231","USD"],["xcy6iwqhqmezkh0","arb000000003179","USD"],["xcy6iwqhqmezkh0","arb000000011741","USD"],["xcy6iwqhqmezkh0","arb000000009149","USD"],["xcy6iwqhqmezkh0","arb000000009659","USD"],["xcy6iwqhqmezkh0","arb000000012083","USD"],["xcy6iwqhqmezkh0","arb000000007229","USD"],["714z3l5bowz8cq6","arb000000001711","USD"],["714z3l5bowz8cq6","arb000000004755","USD"],["714z3l5bowz8cq6","arb000000004241","USD"],["vz63y1lbq3wg6u6","arb000000011697","USD"],["vz63y1lbq3wg6u6","arb000000012617","USD"],["yhqa1s8igmt1o88","arb000000009087","USD"],["yhqa1s8igmt1o88","arb000000004047","USD"],["5si7s79rtab0rnb","arb000000002861","USD"],["5si7s79rtab0rnb","arb000000001405","USD"],["5si7s79rtab0rnb","arb000000006553","USD"],["5si7s79rtab0rnb","arb000000005589","USD"],["5si7s79rtab0rnb","arb000000001173","USD"],["5si7s79rtab0rnb","arb000000008857","USD"],["dpgstpiu6uzauso","arc000000357196","USD"],["dpgstpiu6uzauso","arb000000011711","USD"],["dpgstpiu6uzauso","arb000000003131","USD"],["dpgstpiu6uzauso","arb000000007311","USD"],["acse77jm089azmt","arb000000005715","USD"],["8vg6wofhpe3a002","arl000000886327","USD"],["8vg6wofhpe3a002","arb000000002807","USD"],["8vg6wofhpe3a002","arb000000011427","USD"],["t750ixyz70ox2ry","arb000000009397","USD"],["t750ixyz70ox2ry","arb000000011621","USD"],["t750ixyz70ox2ry","arb000000008497","USD"],["jf32awtopmulk08","arb000000003301","USD"],["jf32awtopmulk08","arb000000008149","USD"],["jf32awtopmulk08","arc000000357451","USD"],["jf32awtopmulk08","arb000000012647","USD"],["jf32awtopmulk08","arb000000011511","USD"],["jf32awtopmulk08","arb000000012485","USD"],["r13gvjb3s9v5hkn","arb000000011811","USD"],["r13gvjb3s9v5hkn","arl000000887001","USD"],["r13gvjb3s9v5hkn","arb000000002339","USD"],["r13gvjb3s9v5hkn","arb000000002251","USD"],["r13gvjb3s9v5hkn","arl000000887171","USD"],["r13gvjb3s9v5hkn","arb000000011291","USD"],["r13gvjb3s9v5hkn","arb000000008669","USD"],["pcz155nqxgqcivn","arb000000002801","USD"],["pcz155nqxgqcivn","arb000000009699","USD"],["pcz155nqxgqcivn","arb000000010171","USD"],["gk6jsiind0bxm7w","arb000000001817","USD"],["gk6jsiind0bxm7w","arb000000005077","USD"],["0zistesm3iq05u4","arl000000886673","USD"],["0zistesm3iq05u4","arb000000005301","USD"],["0zistesm3iq05u4","arb000000008747","USD"],["ll1u9h2bm5poy87","arb000000012901","USD"],["ll1u9h2bm5poy87","arb000000010283","USD"],["ll1u9h2bm5poy87","arb000000010875","USD"],["ll1u9h2bm5poy87","arb000000002781","USD"],["e82p7lp438u1o7q","arb000000011831","USD"],["e82p7lp438u1o7q","arb000000012601","USD"],["e82p7lp438u1o7q","arb000000004043","USD"],["e82p7lp438u1o7q","arb000000004749","USD"],["hx3xp5aeqn94onv","arb000000006455","USD"],["hx3xp5aeqn94onv","arb000000012903","USD"],["hx3xp5aeqn94onv","arl000000885963","USD"],["hx3xp5aeqn94onv","arb000000011869","USD"],["hhssm2z2ixyo8ar","arb000000000733","USD"],["hhssm2z2ixyo8ar","arb000000007597","USD"],["11zk714wom3nv0r","arb000000003589","USD"],["11zk714wom3nv0r","arb000000007375","USD"],["11zk714wom3nv0r","arl000000886245","USD"],["11zk714wom3nv0r","arb000000004225","USD"],["11zk714wom3nv0r","arb000000003965","USD"],["11zk714wom3nv0r","arb000000010629","USD"],["11zk714wom3nv0r","arb000000010183","USD"],["11zk714wom3nv0r","arc000000358447","USD"],["11zk714wom3nv0r","arc000000357883","USD"],["11zk714wom3nv0r","arb000000006813","USD"],["91u68jfripdtgfe","arb000000012133","USD"],["91u68jfripdtgfe","arb000000008989","USD"],["royr2tg7fo22p2k","arb000000002335","USD"],["royr2tg7fo22p2k","arb000000008757","USD"],["royr2tg7fo22p2k","arb000000005655","USD"],["k74qdrzlvd3bxec","arb000000006045","USD"],["q2wtnja6akewt8r","arb000000010249","USD"],["q2wtnja6akewt8r","arb000000002469","USD"],["q2wtnja6akewt8r","arb000000012137","USD"],["q2wtnja6akewt8r","arb000000007037","USD"],["2vb9o3reyzivs15","arb000000005391","USD"],["9bd8z2alpcgrpov","arb000000006399","USD"],["9bd8z2alpcgrpov","arb000000002993","USD"],["qkxuudquxbn0vgr","arb000000004027","USD"],["qkxuudquxbn0vgr","arb000000006305","USD"],["qkxuudquxbn0vgr","arb000000012015","USD"],["7fda3a2mebacukj","arb000000009439","USD"],["7fda3a2mebacukj","arb000000002797","USD"],["neq58epj120sqt0","arb000000009401","USD"],["neq58epj120sqt0","arb000000011871","USD"],["neq58epj120sqt0","arb000000008261","USD"],["neq58epj120sqt0","arb000000009705","USD"],["neq58epj120sqt0","arb000000010683","USD"],["neq58epj120sqt0","arb000000008789","USD"],["cbzn31geb317472","arb000000009639","USD"],["cbzn31geb317472","arb000000008455","USD"],["cbzn31geb317472","arl000000886017","USD"],["cbzn31geb317472","arb000000008905","USD"],["cbzn31geb317472","arb000000008379","USD"],["cbzn31geb317472","arb000000004281","USD"],["cbzn31geb317472","arb000000005503","USD"],["cbzn31geb317472","arb000000006793","USD"],["qsfuns3dlj9fst0","arb000000006579","USD"],["qsfuns3dlj9fst0","arb000000000779","USD"],["qsfuns3dlj9fst0","arb000000008825","USD"],["qsfuns3dlj9fst0","arb000000000679","USD"],["l1093eewamn3xg3","arb000000004109","USD"],["l1093eewamn3xg3","arc000000357823","USD"],["l1093eewamn3xg3","arb000000003549","USD"],["l1093eewamn3xg3","arb000000012491","USD"],["l1093eewamn3xg3","arb000000000877","USD"],["l1093eewamn3xg3","arb000000008971","USD"],["l1093eewamn3xg3","arb000000005637","USD"],["l1093eewamn3xg3","arb000000008291","USD"],["0of43ylip8gy4q0","arb000000006927","USD"],["coqgu6zcgoo8027","arl000000885731","USD"],["coqgu6zcgoo8027","arb000000006393","USD"],["coqgu6zcgoo8027","arb000000004013","USD"],["coqgu6zcgoo8027","arc000000357181","USD"],["coqgu6zcgoo8027","arb000000003121","USD"],["fkkxl1nkuqfok2w","arb000000006029","USD"],["fkkxl1nkuqfok2w","arb000000004505","USD"],["fkkxl1nkuqfok2w","arb000000012579","USD"],["zi41aasfm579qw1","arb000000009195","USD"],["zi41aasfm579qw1","arb000000009285","USD"],["zi41aasfm579qw1","arb000000005167","USD"],["o4g2e6590zlikf5","arb000000012097","USD"],["o4g2e6590zlikf5","arb000000006087","USD"],["o4g2e6590zlikf5","arb000000009355","USD"],["o4g2e6590zlikf5","arb000000010483","USD"],["o4g2e6590zlikf5","arb000000002265","USD"],["2i0auioggzzrec3","arb000000002697","USD"],["2i0auioggzzrec3","arb000000008263","USD"],["2i0auioggzzrec3","arb000000012023","USD"],["2i0auioggzzrec3","arb000000005155","USD"],["2i0auioggzzrec3","arb000000007993","USD"],["6kkc3ik7q97t7we","arb000000002391","USD"],["6kkc3ik7q97t7we","arb000000005147","USD"],["6kkc3ik7q97t7we","arb000000002437","USD"],["6kkc3ik7q97t7we","arb000000012173","USD"],["bg8156qoedpnusf","arb000000006337","USD"],["bg8156qoedpnusf","arb000000004485","USD"],["bg8156qoedpnusf","arb000000012803","USD"],["bg8156qoedpnusf","arb000000004069","USD"],["bg8156qoedpnusf","arl000000886805","USD"],["q93qmd1q66js2id","arb000000012729","USD"],["q93qmd1q66js2id","arl000000886621","USD"],["q93qmd1q66js2id","arl000000887271","USD"],["q93qmd1q66js2id","arb000000007587","USD"],["q93qmd1q66js2id","arl000000887131","USD"],["hd0foh9cut6cwb2","arb000000002233","USD"],["hd0foh9cut6cwb2","arb000000007031","USD"],["4lvbvnh7tlu8cxj","arb000000012417","USD"],["zh50vll4ke84daq","arb000000003811","USD"],["zh50vll4ke84daq","arc000000358366","USD"],["zh50vll4ke84daq","arb000000004371","USD"],["zh50vll4ke84daq","arc000000358216","USD"],["zh50vll4ke84daq","arb000000004491","USD"],["zh50vll4ke84daq","arc000000357313","USD"],["zh50vll4ke84daq","arb000000003209","USD"],["zh50vll4ke84daq","arb000000003911","USD"],["zh50vll4ke84daq","arb000000008283","USD"],["gk76lj8vp3au744","arl000000886801","USD"],["8fgw0fyhz8z7okz","arb000000007579","USD"],["8fgw0fyhz8z7okz","arb000000009509","USD"],["8fgw0fyhz8z7okz","arl000000885775","USD"],["8fgw0fyhz8z7okz","arb000000000957","USD"],["8fgw0fyhz8z7okz","arb000000007735","USD"],["yv6o1kp21iqs2b4","arb000000008719","USD"],["yv6o1kp21iqs2b4","arb000000005963","USD"],["yv6o1kp21iqs2b4","arb000000009291","USD"],["yv6o1kp21iqs2b4","arb000000000979","USD"],["yv6o1kp21iqs2b4","arb000000005041","USD"],["yv6o1kp21iqs2b4","arb000000011149","USD"],["yv6o1kp21iqs2b4","arb000000007087","USD"],["yv6o1kp21iqs2b4","arb000000012517","USD"],["yv6o1kp21iqs2b4","arb000000010019","USD"],["yv6o1kp21iqs2b4","arb000000012687","USD"],["z3fhpx3zluwgqlw","arb000000012575","USD"],["z3fhpx3zluwgqlw","arb000000007423","USD"],["z3fhpx3zluwgqlw","arl000000886707","USD"],["z3fhpx3zluwgqlw","arb000000000991","USD"],["z3fhpx3zluwgqlw","arb000000012953","USD"],["z3fhpx3zluwgqlw","arl000000886693","USD"],["z3fhpx3zluwgqlw","arb000000009385","USD"],["3eo583as4z8ojue","arb000000005063","USD"],["3eo583as4z8ojue","arl000000886825","USD"],["3eo583as4z8ojue","arb000000003833","USD"],["3eo583as4z8ojue","arc000000358249","USD"],["s0b93l5thww2p4s","arl000000886485","USD"],["s0b93l5thww2p4s","arb000000007473","USD"],["s0b93l5thww2p4s","arb000000004091","USD"],["s0b93l5thww2p4s","arb000000010921","USD"],["s0b93l5thww2p4s","arb000000007681","USD"],["zrxxkaih7ibpja3","arb000000000821","USD"],["zrxxkaih7ibpja3","arb000000002105","USD"],["zrxxkaih7ibpja3","arb000000012631","USD"],["w7nof1zaztq7p2t","arb000000007305","USD"],["psskwx8luvbh487","arl000000886669","USD"],["psskwx8luvbh487","arb000000010889","USD"],["32eahe7f4x6m0hx","arb000000006875","USD"],["32eahe7f4x6m0hx","arl000000887493","USD"],["xavbninbg3yw6o9","arb000000008597","USD"],["xavbninbg3yw6o9","arb000000002899","USD"],["v3zc8fk49pb6k4t","arc000000357814","USD"],["v3zc8fk49pb6k4t","arb000000003543","USD"],["v3zc8fk49pb6k4t","arb000000002013","USD"],["v3zc8fk49pb6k4t","arb000000007171","USD"],["v3zc8fk49pb6k4t","arl000000885521","USD"],["v3zc8fk49pb6k4t","arb000000009131","USD"],["v3zc8fk49pb6k4t","arb000000005317","USD"],["458hakfkvvnonfr","arb000000000917","USD"],["458hakfkvvnonfr","arb000000006865","USD"],["458hakfkvvnonfr","arb000000008699","USD"],["458hakfkvvnonfr","arb000000005749","USD"],["458hakfkvvnonfr","arb000000003999","USD"],["458hakfkvvnonfr","arb000000006317","USD"],["458hakfkvvnonfr","arc000000358498","USD"],["b9baovrriw8hfrf","arb000000000939","USD"],["b9baovrriw8hfrf","arb000000006177","USD"],["b9baovrriw8hfrf","arb000000004629","USD"],["rq43z7t32dwecd0","arb000000010053","USD"],["9nbd5q5vg98rc8s","arb000000011043","USD"],["9nbd5q5vg98rc8s","arc000000357703","USD"],["9nbd5q5vg98rc8s","arc000000357988","USD"],["9nbd5q5vg98rc8s","arb000000003469","USD"],["9nbd5q5vg98rc8s","arb000000003659","USD"],["2pyabreuqs7nj27","arb000000010073","USD"],["2pyabreuqs7nj27","arb000000002977","USD"],["gjinokaft8k2qgx","arb000000002605","USD"],["gjinokaft8k2qgx","arb000000009879","USD"],["gjinokaft8k2qgx","arb000000001677","USD"],["70t4izkmizjt8zg","arb000000006963","USD"],["70t4izkmizjt8zg","arb000000010001","USD"],["70t4izkmizjt8zg","arb000000007733","USD"],["70t4izkmizjt8zg","arb000000001621","USD"],["ebfnx2h1z0gemtk","arb000000005533","USD"],["ebfnx2h1z0gemtk","arb000000007863","USD"],["ebfnx2h1z0gemtk","arl000000885761","USD"],["ebfnx2h1z0gemtk","arb000000002711","USD"],["ebfnx2h1z0gemtk","arl000000886781","USD"],["ebfnx2h1z0gemtk","arb000000001777","USD"],["41y9h35d5j7zbhv","arc000000358486","USD"],["41y9h35d5j7zbhv","arb000000008731","USD"],["41y9h35d5j7zbhv","arb000000003393","USD"],["41y9h35d5j7zbhv","arb000000004321","USD"],["41y9h35d5j7zbhv","arc000000357589","USD"],["41y9h35d5j7zbhv","arb000000003991","USD"],["41y9h35d5j7zbhv","arl000000887091","USD"],["mb94mvtqrtlbyu8","arc000000357727","USD"],["mb94mvtqrtlbyu8","arb000000003485","USD"],["bpyd1jotk57m004","arb000000011257","USD"],["bpyd1jotk57m004","arb000000005069","USD"],["bpyd1jotk57m004","arb000000006691","USD"],["m81gkv5jrvmu7nf","arb000000004873","USD"],["m81gkv5jrvmu7nf","arl000000886075","USD"],["m81gkv5jrvmu7nf","arb000000006601","USD"],["m81gkv5jrvmu7nf","arb000000005015","USD"],["rilyeo1l8ql07w8","arb000000010477","USD"],["rilyeo1l8ql07w8","arb000000009419","USD"],["rilyeo1l8ql07w8","arb000000007403","USD"],["8b23fgp8lkdj87q","arc000000358342","USD"],["8b23fgp8lkdj87q","arb000000006379","USD"],["8b23fgp8lkdj87q","arb000000003895","USD"],["8b23fgp8lkdj87q","arb000000010763","USD"],["8b23fgp8lkdj87q","arb000000005625","USD"],["8b23fgp8lkdj87q","arb000000012757","USD"],["8b23fgp8lkdj87q","arb000000010523","USD"],["wiziv0o47r2dj54","arb000000001945","USD"],["wiziv0o47r2dj54","arb000000008029","USD"],["wiziv0o47r2dj54","arb000000012499","USD"],["wiziv0o47r2dj54","arb000000004631","USD"],["7o4vcj0h4kyolx8","arb000000005673","USD"],["7o4vcj0h4kyolx8","arb000000009609","USD"],["7o4vcj0h4kyolx8","arb000000009619","USD"],["7o4vcj0h4kyolx8","arl000000886937","USD"],["7o4vcj0h4kyolx8","arb000000006499","USD"],["3oipfequ37w1bll","arb000000010647","USD"],["3oipfequ37w1bll","arl000000886257","USD"],["3oipfequ37w1bll","arb000000001819","USD"],["g0ykpqaqjwyupio","arc000000357040","USD"],["g0ykpqaqjwyupio","arb000000003027","USD"],["g0ykpqaqjwyupio","arb000000006987","USD"],["g0ykpqaqjwyupio","arb000000005919","USD"],["g0ykpqaqjwyupio","arb000000011239","USD"],["g0ykpqaqjwyupio","arb000000010389","USD"],["g0ykpqaqjwyupio","arb000000009731","USD"],["3myu38z63vxiarq","arb000000005719","USD"],["3myu38z63vxiarq","arb000000004573","USD"],["3myu38z63vxiarq","arc000000357178","USD"],["3myu38z63vxiarq","arb000000003119","USD"],["vrdb8aumva2fpht","arb000000010691","USD"],["vrdb8aumva2fpht","arb000000011011","USD"],["vrdb8aumva2fpht","arb000000000999","USD"],["vrdb8aumva2fpht","arb000000001577","USD"],["vrdb8aumva2fpht","arb000000004351","USD"],["n12qoysoi5rq9n2","arb000000002593","USD"],["n12qoysoi5rq9n2","arb000000006127","USD"],["n12qoysoi5rq9n2","arb000000005181","USD"],["n12qoysoi5rq9n2","arb000000006079","USD"],["n12qoysoi5rq9n2","arb000000001155","USD"],["tmve1uz7hvf1ima","arb000000009031","USD"],["tmve1uz7hvf1ima","arb000000002103","USD"],["tmve1uz7hvf1ima","arc000000357922","USD"],["tmve1uz7hvf1ima","arb000000003615","USD"],["tmve1uz7hvf1ima","arl000000887413","USD"],["tmve1uz7hvf1ima","arb000000006149","USD"],["tmve1uz7hvf1ima","arl000000886211","USD"],["tmve1uz7hvf1ima","arb000000002873","USD"],["tmve1uz7hvf1ima","arb000000011587","USD"],["dj65ltpvi31487d","arl000000887287","USD"],["dj65ltpvi31487d","arb000000005821","USD"],["dj65ltpvi31487d","arb000000012731","USD"],["w6e9iovturykysn","arb000000001135","USD"],["w6e9iovturykysn","arb000000008249","USD"],["w6e9iovturykysn","arb000000002543","USD"],["wuuxcrnzhabmoz9","arb000000012145","USD"],["wuuxcrnzhabmoz9","arl000000886785","USD"],["wuuxcrnzhabmoz9","arb000000001093","USD"],["wuuxcrnzhabmoz9","arb000000001521","USD"],["wuuxcrnzhabmoz9","arb000000001565","USD"],["b3pijx7k11ewqxc","arb000000010239","USD"],["b3pijx7k11ewqxc","arb000000010175","USD"],["b3pijx7k11ewqxc","arl000000885507","USD"],["b3pijx7k11ewqxc","arb000000001757","USD"],["b3pijx7k11ewqxc","arl000000887267","USD"],["7by3yp533qhd4me","arb000000008071","USD"],["7by3yp533qhd4me","arb000000004875","USD"],["h7rg0efs8dw309f","arb000000007787","USD"],["h7rg0efs8dw309f","arb000000007763","USD"],["h7rg0efs8dw309f","arb000000009777","USD"],["h7rg0efs8dw309f","arb000000009735","USD"],["dw68sqpkrjazv4g","arc000000357112","USD"],["dw68sqpkrjazv4g","arb000000011465","USD"],["dw68sqpkrjazv4g","arb000000003075","USD"],["tlwcs71ldw7f1if","arb000000012769","USD"],["tlwcs71ldw7f1if","arb000000006017","USD"],["tlwcs71ldw7f1if","arc000000357070","USD"],["tlwcs71ldw7f1if","arb000000003047","USD"],["3kod7w5e9ocveyp","arc000000357616","USD"],["3kod7w5e9ocveyp","arb000000003411","USD"],["3kod7w5e9ocveyp","arb000000002477","USD"],["hyvr6pnvgm4zcz3","arc000000357526","USD"],["hyvr6pnvgm4zcz3","arb000000008755","USD"],["hyvr6pnvgm4zcz3","arb000000003351","USD"],["hyvr6pnvgm4zcz3","arb000000011563","USD"],["kfwjjx3dpm1nhl8","arb000000004647","USD"],["kfwjjx3dpm1nhl8","arb000000001147","USD"],["kfwjjx3dpm1nhl8","arc000000357574","USD"],["kfwjjx3dpm1nhl8","arb000000008977","USD"],["kfwjjx3dpm1nhl8","arb000000006913","USD"],["kfwjjx3dpm1nhl8","arb000000005947","USD"],["kfwjjx3dpm1nhl8","arb000000003383","USD"],["21h1zv0wwgstdg9","arb000000011115","USD"],["21h1zv0wwgstdg9","arb000000001079","USD"],["21h1zv0wwgstdg9","arb000000007217","USD"],["ebqh44bxtsoe64h","arb000000001861","USD"],["ebqh44bxtsoe64h","arl000000886925","USD"],["gkf6cl9wyr7qq9p","arb000000002385","USD"],["gkf6cl9wyr7qq9p","arb000000012443","USD"],["gkf6cl9wyr7qq9p","arb000000010391","USD"],["tw7ens9jlflnk8n","arb000000010503","USD"],["tw7ens9jlflnk8n","arb000000011069","USD"],["tw7ens9jlflnk8n","arl000000885781","USD"],["y21yw24k13jg7gd","arb000000007029","USD"],["y21yw24k13jg7gd","arb000000000761","USD"],["1ohyee5okg2wj6z","arb000000011341","USD"],["1ohyee5okg2wj6z","arl000000886329","USD"],["1ohyee5okg2wj6z","arl000000886197","USD"],["1ohyee5okg2wj6z","arb000000008101","USD"],["onttyoga4mjum8y","arb000000004903","USD"],["onttyoga4mjum8y","arb000000008373","USD"],["onttyoga4mjum8y","arb000000003101","USD"],["onttyoga4mjum8y","arc000000357151","USD"],["gf4ecvkh0zvckzm","arb000000000665","USD"],["gf4ecvkh0zvckzm","arb000000007455","USD"],["wgmq4i20etqxmt5","arb000000012493","USD"],["wgmq4i20etqxmt5","arl000000887087","USD"],["wgmq4i20etqxmt5","arb000000008343","USD"],["mbr6k92qp8pr53d","arb000000012703","USD"],["mbr6k92qp8pr53d","arb000000007859","USD"],["mbr6k92qp8pr53d","arb000000001765","USD"],["hfcvu4rnispyztk","arl000000886105","USD"],["hfcvu4rnispyztk","arb000000004087","USD"],["hfcvu4rnispyztk","arb000000005205","USD"],["hfcvu4rnispyztk","arb000000012773","USD"],["hfcvu4rnispyztk","arb000000006005","USD"],["aw3v622oy92k58p","arl000000887031","USD"],["aw3v622oy92k58p","arb000000008399","USD"],["aw3v622oy92k58p","arb000000005597","USD"],["jk7q5n5m7llf8jt","arb000000004139","USD"],["jk7q5n5m7llf8jt","arb000000002365","USD"],["jk7q5n5m7llf8jt","arb000000011201","USD"],["jk7q5n5m7llf8jt","arb000000011515","USD"],["57rxvcfhahfzotk","arb000000010797","USD"],["57rxvcfhahfzotk","arb000000011251","USD"],["57rxvcfhahfzotk","arb000000010255","USD"],["57rxvcfhahfzotk","arb000000002453","USD"],["57rxvcfhahfzotk","arb000000009771","USD"],["53n66ottyhzwrm4","arb000000012845","USD"],["53n66ottyhzwrm4","arb000000009633","USD"],["53n66ottyhzwrm4","arb000000012937","USD"],["e5t7hwueh7q915u","arb000000006585","USD"],["e5t7hwueh7q915u","arb000000007209","USD"],["e5t7hwueh7q915u","arb000000001837","USD"],["e5t7hwueh7q915u","arb000000006101","USD"],["e5t7hwueh7q915u","arc000000357397","USD"],["e5t7hwueh7q915u","arb000000003265","USD"],["e5t7hwueh7q915u","arb000000009245","USD"],["ab7xmepwry37orr","arb000000008347","USD"],["ab7xmepwry37orr","arl000000886427","USD"],["ab7xmepwry37orr","arl000000887117","USD"],["ab7xmepwry37orr","arb000000001195","USD"],["8qdsywaerhrx4pl","arb000000003233","USD"],["8qdsywaerhrx4pl","arb000000011131","USD"],["8qdsywaerhrx4pl","arc000000357349","USD"],["8qdsywaerhrx4pl","arb000000002531","USD"],["epq7t2tso4njo8x","arc000000358480","USD"],["epq7t2tso4njo8x","arb000000011359","USD"],["epq7t2tso4njo8x","arb000000010099","USD"],["epq7t2tso4njo8x","arb000000003535","USD"],["epq7t2tso4njo8x","arb000000003987","USD"],["epq7t2tso4njo8x","arb000000008441","USD"],["epq7t2tso4njo8x","arl000000886677","USD"],["epq7t2tso4njo8x","arc000000357802","USD"],["a38gy2rzh1ub9o7","arb000000001021","USD"],["a38gy2rzh1ub9o7","arb000000004503","USD"],["0kcolbik5le6fez","arb000000012897","USD"],["0kcolbik5le6fez","arl000000886745","USD"],["0kcolbik5le6fez","arb000000008583","USD"],["0kcolbik5le6fez","arb000000011789","USD"],["0kcolbik5le6fez","arb000000003909","USD"],["0kcolbik5le6fez","arc000000358456","USD"],["0kcolbik5le6fez","arc000000358363","USD"],["0kcolbik5le6fez","arb000000003971","USD"],["kvw0io5f1foor7f","arb000000008309","USD"],["kvw0io5f1foor7f","arb000000004555","USD"],["ajkzae7uwm8d423","arl000000885989","USD"],["ajkzae7uwm8d423","arb000000002573","USD"],["1avtf9dn7w5ll6t","arb000000006983","USD"],["1avtf9dn7w5ll6t","arl000000886213","USD"],["8ctgr7wtp17hfdx","arl000000886289","USD"],["8ctgr7wtp17hfdx","arb000000005833","USD"],["8ctgr7wtp17hfdx","arb000000007729","USD"],["8ctgr7wtp17hfdx","arb000000004403","USD"],["8ctgr7wtp17hfdx","arb000000010371","USD"],["s3q5sl5q47erzbo","arb000000000811","USD"],["9d3q4gv0oc85bf2","arb000000011085","USD"],["9d3q4gv0oc85bf2","arl000000885661","USD"],["9d3q4gv0oc85bf2","arb000000006885","USD"],["9d3q4gv0oc85bf2","arb000000005183","USD"],["9d3q4gv0oc85bf2","arl000000885685","USD"],["etnpdpn6h9vy2iz","arb000000009815","USD"],["etnpdpn6h9vy2iz","arl000000886343","USD"],["etnpdpn6h9vy2iz","arb000000003695","USD"],["etnpdpn6h9vy2iz","arb000000002451","USD"],["etnpdpn6h9vy2iz","arc000000358042","USD"],["etnpdpn6h9vy2iz","arb000000007563","USD"],["1pe22w4xbwzcka1","arb000000003669","USD"],["1pe22w4xbwzcka1","arc000000358003","USD"],["1pe22w4xbwzcka1","arb000000005383","USD"],["1pe22w4xbwzcka1","arl000000885703","USD"],["l0kr9ln9vaxoryt","arb000000002393","USD"],["l0kr9ln9vaxoryt","arb000000006221","USD"],["l0kr9ln9vaxoryt","arb000000006981","USD"],["l0kr9ln9vaxoryt","arb000000002373","USD"],["l0kr9ln9vaxoryt","arl000000886555","USD"],["l0kr9ln9vaxoryt","arb000000005093","USD"],["fomiumnykn3tfl4","arb000000005359","USD"],["fomiumnykn3tfl4","arb000000010189","USD"],["fomiumnykn3tfl4","arb000000002501","USD"],["fomiumnykn3tfl4","arb000000004057","USD"],["fomiumnykn3tfl4","arl000000887361","USD"],["fomiumnykn3tfl4","arb000000008395","USD"],["fomiumnykn3tfl4","arb000000002939","USD"],["ivnmnh7d103gzwe","arl000000885949","USD"],["ivnmnh7d103gzwe","arb000000004345","USD"],["ivnmnh7d103gzwe","arl000000887163","USD"],["ivnmnh7d103gzwe","arb000000004383","USD"],["ivnmnh7d103gzwe","arb000000005037","USD"],["ivnmnh7d103gzwe","arb000000010909","USD"],["ivnmnh7d103gzwe","arb000000005135","USD"],["n4l4y3czaa5uonk","arb000000010517","USD"],["n4l4y3czaa5uonk","arl000000886265","USD"],["yici0o7wfkvto0l","arb000000006217","USD"],["yici0o7wfkvto0l","arb000000001089","USD"],["y7djwivz1fawrar","arb000000012327","USD"],["y7djwivz1fawrar","arb000000006199","USD"],["y7djwivz1fawrar","arl000000886035","USD"],["y7djwivz1fawrar","arb000000008895","USD"],["ewbbv3mrbegxbpj","arl000000886623","USD"],["ewbbv3mrbegxbpj","arb000000003687","USD"],["ewbbv3mrbegxbpj","arc000000358030","USD"],["ewbbv3mrbegxbpj","arb000000008443","USD"],["ewbbv3mrbegxbpj","arb000000002681","USD"],["ewbbv3mrbegxbpj","arb000000005957","USD"],["fo398shhkmpfpcf","arb000000004975","USD"],["k5garwbv80cqhi9","arc000000358024","USD"],["k5garwbv80cqhi9","arb000000003683","USD"],["k5garwbv80cqhi9","arb000000009089","USD"],["z2bggfahbdkyfsm","arb000000008535","USD"],["z2bggfahbdkyfsm","arl000000886793","USD"],["usgxxzmli2ngfdo","arb000000002407","USD"],["usgxxzmli2ngfdo","arb000000012603","USD"],["usgxxzmli2ngfdo","arb000000009261","USD"],["usgxxzmli2ngfdo","arb000000005463","USD"],["ynmo2iu4qon2sbx","arb000000009749","USD"],["ynmo2iu4qon2sbx","arb000000006779","USD"],["x0815qs5bp4n5w6","arl000000887301","USD"],["x0815qs5bp4n5w6","arb000000005517","USD"],["6uotm2oa21nd8kr","arb000000012423","USD"],["6uotm2oa21nd8kr","arb000000011721","USD"],["6uotm2oa21nd8kr","arb000000012507","USD"],["6uotm2oa21nd8kr","arb000000006383","USD"],["6uotm2oa21nd8kr","arb000000004429","USD"],["azy5pq3rbml01pp","arc000000358201","USD"],["azy5pq3rbml01pp","arb000000003801","USD"],["azy5pq3rbml01pp","arb000000007757","USD"],["on5s3k4ieuqzloo","arb000000011549","USD"],["on5s3k4ieuqzloo","arb000000011059","USD"],["on5s3k4ieuqzloo","arb000000007245","USD"],["on5s3k4ieuqzloo","arb000000008683","USD"],["on5s3k4ieuqzloo","arb000000007915","USD"],["5dm31rutobj9nfz","arb000000007533","USD"],["5dm31rutobj9nfz","arb000000004231","USD"],["5dm31rutobj9nfz","arb000000009871","USD"],["5dm31rutobj9nfz","arb000000011005","USD"],["5dm31rutobj9nfz","arb000000009217","USD"],["oald87bcnttzf1q","arb000000000963","USD"],["oald87bcnttzf1q","arb000000009503","USD"],["7zwzlholapdbk0d","arb000000012319","USD"],["7zwzlholapdbk0d","arb000000011083","USD"],["7zwzlholapdbk0d","arb000000012653","USD"],["7zwzlholapdbk0d","arl000000887195","USD"],["7zwzlholapdbk0d","arb000000004651","USD"],["02a08zuivk8yurb","arb000000004795","USD"],["02a08zuivk8yurb","arb000000004625","USD"],["02a08zuivk8yurb","arb000000012749","USD"],["2hoqu8pnrdo99kv","arb000000010193","USD"],["hct9ruy750poomc","arb000000009357","USD"],["hct9ruy750poomc","arb000000009039","USD"],["hct9ruy750poomc","arb000000001375","USD"],["hct9ruy750poomc","arb000000010587","USD"],["hct9ruy750poomc","arb000000003651","USD"],["hct9ruy750poomc","arc000000357976","USD"],["6v00ko9ed4rfedr","arb000000001199","USD"],["ggopuit47g2ke49","arb000000001573","USD"],["ggopuit47g2ke49","arb000000010919","USD"],["ggopuit47g2ke49","arb000000007987","USD"],["ggopuit47g2ke49","arb000000005781","USD"],["f8zkg0plqzuilcp","arb000000009065","USD"],["ffno4zz45ovgcs4","arb000000005811","USD"],["ffno4zz45ovgcs4","arb000000001047","USD"],["ffno4zz45ovgcs4","arl000000887497","USD"],["16vkaocxjqfgwsp","arb000000007649","USD"],["zm9u4rknv9uwzau","arb000000008645","USD"],["8ytfr8npjk4kcvj","arb000000012639","USD"],["8ytfr8npjk4kcvj","arb000000011749","USD"],["8ytfr8npjk4kcvj","arl000000886473","USD"],["8ytfr8npjk4kcvj","arl000000886151","USD"],["8ytfr8npjk4kcvj","arb000000011597","USD"],["wyeix55lpjxmeht","arb000000006247","USD"],["wyeix55lpjxmeht","arb000000006979","USD"],["wyeix55lpjxmeht","arb000000009319","USD"],["wyeix55lpjxmeht","arl000000887201","USD"],["orfw70mlx3tjzpw","arb000000009437","USD"],["orfw70mlx3tjzpw","arb000000005451","USD"],["orfw70mlx3tjzpw","arb000000012971","USD"],["2zwpra1iuvfeqmi","arl000000886423","USD"],["2zwpra1iuvfeqmi","arb000000012159","USD"],["0bvmeoxl0tjknva","arb000000006613","USD"],["0bvmeoxl0tjknva","arl000000886807","USD"],["0bvmeoxl0tjknva","arb000000007049","USD"],["0bvmeoxl0tjknva","arb000000007933","USD"],["0bvmeoxl0tjknva","arl000000886747","USD"],["0bvmeoxl0tjknva","arb000000007369","USD"],["jpq8obnb992jtad","arb000000003849","USD"],["jpq8obnb992jtad","arb000000010037","USD"],["jpq8obnb992jtad","arc000000358273","USD"],["jpq8obnb992jtad","arb000000006689","USD"],["la1sil57avpfup0","arb000000004767","USD"],["la1sil57avpfup0","arb000000008449","USD"],["iscqyv4zwlsdsp3","arb000000009259","USD"],["iscqyv4zwlsdsp3","arb000000012469","USD"],["fa0epsp2zwbn2y0","arl000000885549","USD"],["fa0epsp2zwbn2y0","arb000000006843","USD"],["fa0epsp2zwbn2y0","arb000000012583","USD"],["fa0epsp2zwbn2y0","arb000000004893","USD"],["qiduj4z3cbfu3hg","arl000000886605","USD"],["i5965f4h017qsz4","arb000000007755","USD"],["i5965f4h017qsz4","arb000000007651","USD"],["i5965f4h017qsz4","arb000000004025","USD"],["8lwnlb4il311w3v","arb000000006103","USD"],["8lwnlb4il311w3v","arb000000009435","USD"],["8lwnlb4il311w3v","arb000000008517","USD"],["pfcutezppw2282t","arb000000002021","USD"],["pfcutezppw2282t","arl000000887061","USD"],["pfcutezppw2282t","arl000000886295","USD"],["ptjim5afr7cufjp","arl000000887095","USD"],["ptjim5afr7cufjp","arb000000007939","USD"],["ptjim5afr7cufjp","arl000000887233","USD"],["ptjim5afr7cufjp","arc000000357655","USD"],["ptjim5afr7cufjp","arb000000003437","USD"],["ptjim5afr7cufjp","arb000000006055","USD"],["ptjim5afr7cufjp","arl000000887241","USD"],["ptjim5afr7cufjp","arb000000009393","USD"],["klpe448pvn8rgq8","arb000000011051","USD"],["ft86z0js7s01g2b","arb000000002203","USD"],["uck9i523b7n0kn1","arb000000012503","USD"],["uck9i523b7n0kn1","arb000000005895","USD"],["uck9i523b7n0kn1","arb000000007713","USD"],["uck9i523b7n0kn1","arb000000008687","USD"],["uck9i523b7n0kn1","arb000000005987","USD"],["5vm35cl2rtgenyi","arb000000001889","USD"],["5vm35cl2rtgenyi","arb000000005591","USD"],["b0dx776ao6nwhr6","arc000000357277","USD"],["b0dx776ao6nwhr6","arb000000000663","USD"],["b0dx776ao6nwhr6","arb000000003185","USD"],["b0dx776ao6nwhr6","arb000000004141","USD"],["b0dx776ao6nwhr6","arb000000006701","USD"],["cajcpy5agz2gmai","arb000000002691","USD"],["cajcpy5agz2gmai","arb000000006949","USD"],["cajcpy5agz2gmai","arb000000012841","USD"],["cajcpy5agz2gmai","arb000000006275","USD"],["cajcpy5agz2gmai","arb000000004621","USD"],["cajcpy5agz2gmai","arb000000008713","USD"],["8phc2hwqnlboskz","arl000000885641","USD"],["8phc2hwqnlboskz","arb000000010181","USD"],["8phc2hwqnlboskz","arb000000006261","USD"],["jszu8i2j3b4jqhp","arb000000007589","USD"],["m9scvwydmjrq23q","arb000000008693","USD"],["m9scvwydmjrq23q","arb000000009341","USD"],["m9scvwydmjrq23q","arb000000009547","USD"],["m9scvwydmjrq23q","arb000000006925","USD"],["l34ljlfrfkymfer","arb000000010005","USD"],["l34ljlfrfkymfer","arb000000004529","USD"],["l34ljlfrfkymfer","arb000000007281","USD"],["uyjzx4biau2dfcx","arb000000005089","USD"],["max2mtqwq1mqq2l","arb000000006093","USD"],["max2mtqwq1mqq2l","arb000000011423","USD"],["08rh8exrqrxd2wu","arb000000010097","USD"],["08rh8exrqrxd2wu","arb000000006565","USD"],["08rh8exrqrxd2wu","arb000000009739","USD"],["08rh8exrqrxd2wu","arb000000009597","USD"],["08rh8exrqrxd2wu","arb000000005227","USD"],["08rh8exrqrxd2wu","arb000000007275","USD"],["j3mt2to3paxfhfj","arc000000357445","USD"],["j3mt2to3paxfhfj","arb000000009975","USD"],["j3mt2to3paxfhfj","arb000000003297","USD"],["j3mt2to3paxfhfj","arb000000006349","USD"],["m8083u4cpv1jin8","arl000000886297","USD"],["m8083u4cpv1jin8","arl000000887461","USD"],["ur21jdrcvfstza2","arb000000007415","USD"],["v9la4qx4u7c73ac","arb000000000837","USD"],["v9la4qx4u7c73ac","arb000000002053","USD"],["c41pt1y26t14grp","arb000000009529","USD"],["7obf8jxbnevrey8","arb000000007097","USD"],["7obf8jxbnevrey8","arl000000886147","USD"],["rirdtfbi8dljwgm","arb000000002499","USD"],["rirdtfbi8dljwgm","arb000000006185","USD"],["rirdtfbi8dljwgm","arb000000001333","USD"],["rirdtfbi8dljwgm","arb000000006237","USD"],["rirdtfbi8dljwgm","arb000000007891","USD"],["rirdtfbi8dljwgm","arb000000011187","USD"],["rirdtfbi8dljwgm","arb000000004327","USD"],["rirdtfbi8dljwgm","arb000000011751","USD"],["53x9xrx5w4s9pgm","arc000000358303","USD"],["53x9xrx5w4s9pgm","arb000000003869","USD"],["53x9xrx5w4s9pgm","arb000000009325","USD"],["bdpsd647s2t66g7","arb000000008623","USD"],["bdpsd647s2t66g7","arb000000004701","USD"],["bdpsd647s2t66g7","arb000000010459","USD"],["bdpsd647s2t66g7","arb000000007535","USD"],["bdpsd647s2t66g7","arb000000009117","USD"],["323it39d0ss3icd","arb000000009769","USD"],["323it39d0ss3icd","arb000000008439","USD"],["323it39d0ss3icd","arb000000006725","USD"],["323it39d0ss3icd","arb000000010413","USD"],["twa2aoa35rm69cg","arc000000357418","USD"],["twa2aoa35rm69cg","arl000000887295","USD"],["twa2aoa35rm69cg","arb000000003279","USD"],["bc0mlke2wq9nu6w","arb000000006369","USD"],["al4attso3jc08y7","arb000000002791","USD"],["al4attso3jc08y7","arb000000008739","USD"],["al4attso3jc08y7","arl000000887411","USD"],["al4attso3jc08y7","arb000000002125","USD"],["al4attso3jc08y7","arb000000012969","USD"],["al4attso3jc08y7","arb000000000969","USD"],["s0hjgqcjivbytnv","arb000000010217","USD"],["s0hjgqcjivbytnv","arb000000008949","USD"],["s0hjgqcjivbytnv","arl000000887467","USD"],["jf20cdgcvy9qmaz","arb000000006845","USD"],["jf20cdgcvy9qmaz","arb000000007861","USD"],["jf20cdgcvy9qmaz","arb000000007359","USD"],["jf20cdgcvy9qmaz","arb000000009085","USD"],["jf20cdgcvy9qmaz","arb000000008085","USD"],["jf20cdgcvy9qmaz","arb000000012105","USD"],["jf20cdgcvy9qmaz","arb000000006361","USD"],["h4llh334hyscytd","arb000000002235","USD"],["h4llh334hyscytd","arb000000012037","USD"],["h4llh334hyscytd","arb000000009429","USD"],["r81hgvq91vsz098","arb000000005643","USD"],["r81hgvq91vsz098","arb000000006341","USD"],["r81hgvq91vsz098","arb000000004297","USD"],["r81hgvq91vsz098","arb000000004849","USD"],["sc2q5imqtdf3rae","arb000000002433","USD"],["dzftd5ltpy72ebr","arb000000012199","USD"],["dzftd5ltpy72ebr","arb000000006057","USD"],["629ql98bxc2g4we","arb000000006699","USD"],["629ql98bxc2g4we","arb000000008203","USD"],["vgtrcr9xezq12xk","arc000000357682","USD"],["vgtrcr9xezq12xk","arc000000357262","USD"],["vgtrcr9xezq12xk","arb000000003175","USD"],["vgtrcr9xezq12xk","arb000000003455","USD"],["g8u3xqpzcoaxfjg","arb000000003005","USD"],["g8u3xqpzcoaxfjg","arb000000009221","USD"],["g8u3xqpzcoaxfjg","arc000000357007","USD"],["g8u3xqpzcoaxfjg","arb000000010347","USD"],["g8u3xqpzcoaxfjg","arb000000009445","USD"],["g8u3xqpzcoaxfjg","arb000000004167","USD"],["vgj8kajoglay625","arl000000886349","USD"],["vgj8kajoglay625","arb000000002983","USD"],["vgj8kajoglay625","arl000000886749","USD"],["mpuzv04eyl54stw","arb000000005185","USD"],["mpuzv04eyl54stw","arb000000011235","USD"],["mpuzv04eyl54stw","arb000000010393","USD"],["mpuzv04eyl54stw","arl000000886777","USD"],["mpuzv04eyl54stw","arb000000001389","USD"],["5ev8plbmw4xhufx","arb000000011067","USD"],["5ev8plbmw4xhufx","arb000000006363","USD"],["r5dkpuui84qqyqr","arl000000886855","USD"],["r5dkpuui84qqyqr","arb000000009741","USD"],["r5dkpuui84qqyqr","arb000000010271","USD"],["r5dkpuui84qqyqr","arb000000004115","USD"],["dfr2gnf4kh9cfc9","arb000000006929","USD"],["dfr2gnf4kh9cfc9","arb000000002481","USD"],["2808uxigbglbxwo","arb000000009575","USD"],["2808uxigbglbxwo","arb000000008421","USD"],["82iaricf5gf6gnu","arb000000003853","USD"],["82iaricf5gf6gnu","arl000000887151","USD"],["82iaricf5gf6gnu","arb000000008389","USD"],["82iaricf5gf6gnu","arc000000358279","USD"],["82iaricf5gf6gnu","arb000000004929","USD"],["82iaricf5gf6gnu","arb000000011287","USD"],["ic304tcf7av9z71","arb000000005459","USD"],["ic304tcf7av9z71","arb000000001977","USD"],["ic304tcf7av9z71","arb000000007505","USD"],["1xw4dvbp8zdt2fo","arb000000002883","USD"],["1xw4dvbp8zdt2fo","arb000000011891","USD"],["1xw4dvbp8zdt2fo","arb000000010187","USD"],["1xw4dvbp8zdt2fo","arb000000010263","USD"],["bz8csa4nk6kyr9q","arb000000004055","USD"],["bz8csa4nk6kyr9q","arb000000012625","USD"],["bz8csa4nk6kyr9q","arb000000008459","USD"],["bz8csa4nk6kyr9q","arb000000005005","USD"],["bz8csa4nk6kyr9q","arb000000009915","USD"],["bz8csa4nk6kyr9q","arb000000010913","USD"],["bz8csa4nk6kyr9q","arb000000011487","USD"],["6n94krqd3v850se","arb000000012843","USD"],["6n94krqd3v850se","arb000000010427","USD"],["6n94krqd3v850se","arl000000887471","USD"],["6n94krqd3v850se","arb000000011703","USD"],["oa3qacii0suo8z6","arb000000007449","USD"],["au0t5lnzt2s94tw","arb000000001943","USD"],["au0t5lnzt2s94tw","arb000000010153","USD"],["rw62tw279iz5jk7","arb000000008685","USD"],["rw62tw279iz5jk7","arl000000886721","USD"],["n6klsc1dfmsq311","arb000000001137","USD"],["n6klsc1dfmsq311","arb000000010977","USD"],["n6klsc1dfmsq311","arb000000012233","USD"],["n6klsc1dfmsq311","arb000000009019","USD"],["n6klsc1dfmsq311","arb000000000813","USD"],["n6klsc1dfmsq311","arb000000012623","USD"],["yr0uiewrp8lz3hw","arb000000010469","USD"],["yr0uiewrp8lz3hw","arb000000009389","USD"],["yr0uiewrp8lz3hw","arb000000008765","USD"],["yr0uiewrp8lz3hw","arb000000001227","USD"],["yr0uiewrp8lz3hw","arb000000008001","USD"],["yr0uiewrp8lz3hw","arb000000005573","USD"],["yr0uiewrp8lz3hw","arb000000012761","USD"],["yr0uiewrp8lz3hw","arb000000005191","USD"],["g3fm4akbrxh1z9e","arb000000001269","USD"],["5pa491rgmya1tqx","arb000000009363","USD"],["5pa491rgmya1tqx","arl000000887029","USD"],["97gc2e9wvi645la","arb000000007061","USD"],["t9n2mo0olo4vbsm","arb000000011525","USD"],["tfp57cm30umxamj","arb000000011035","USD"],["tfp57cm30umxamj","arb000000011001","USD"],["tfp57cm30umxamj","arb000000007103","USD"],["tfp57cm30umxamj","arb000000007441","USD"],["tfp57cm30umxamj","arb000000008603","USD"],["tfp57cm30umxamj","arb000000006425","USD"],["wo5y9wqy5dqta2r","arb000000012975","USD"],["wo5y9wqy5dqta2r","arb000000005549","USD"],["wo5y9wqy5dqta2r","arl000000885897","USD"],["wo5y9wqy5dqta2r","arb000000004827","USD"],["v11e1thsh7r12cr","arb000000003093","USD"],["v11e1thsh7r12cr","arc000000357139","USD"],["v11e1thsh7r12cr","arb000000009605","USD"],["v11e1thsh7r12cr","arl000000887333","USD"],["nw919qnrr8k698q","arl000000886647","USD"],["nw919qnrr8k698q","arb000000004687","USD"],["nw919qnrr8k698q","arb000000010513","USD"],["nw919qnrr8k698q","arb000000008093","USD"],["nw919qnrr8k698q","arb000000005909","USD"],["3kf1a0f6y1ivik5","arb000000002127","USD"],["3kf1a0f6y1ivik5","arb000000010161","USD"],["3kf1a0f6y1ivik5","arb000000007999","USD"],["3kf1a0f6y1ivik5","arb000000004665","USD"],["3kf1a0f6y1ivik5","arb000000001061","USD"],["3kf1a0f6y1ivik5","arb000000005385","USD"],["46vmxjil85clrtf","arb000000000739","USD"],["8j8fz88zsajabhb","arb000000012887","USD"],["8j8fz88zsajabhb","arb000000003021","USD"],["8j8fz88zsajabhb","arl000000887035","USD"],["8j8fz88zsajabhb","arc000000357031","USD"],["8j8fz88zsajabhb","arb000000002745","USD"],["8j8fz88zsajabhb","arb000000008545","USD"],["a5go4ntz1phhwif","arb000000004443","USD"],["a5go4ntz1phhwif","arc000000358405","USD"],["a5go4ntz1phhwif","arl000000886083","USD"],["a5go4ntz1phhwif","arb000000011851","USD"],["a5go4ntz1phhwif","arb000000003937","USD"],["a5go4ntz1phhwif","arb000000000759","USD"],["a5go4ntz1phhwif","arb000000008167","USD"],["a5go4ntz1phhwif","arb000000011693","USD"],["f7f5prkesgsioxa","arb000000011207","USD"],["f7f5prkesgsioxa","arb000000008729","USD"],["f7f5prkesgsioxa","arb000000005217","USD"],["f7f5prkesgsioxa","arb000000012809","USD"],["sdzvmwg3hbz3xg4","arb000000009719","USD"],["sdzvmwg3hbz3xg4","arb000000009143","USD"],["3eg3qvbp13duw06","arb000000005083","USD"],["3eg3qvbp13duw06","arb000000000881","USD"],["eevopmozanxq93h","arb000000008087","USD"],["eevopmozanxq93h","arl000000887495","USD"],["eevopmozanxq93h","arb000000008335","USD"],["eevopmozanxq93h","arb000000009027","USD"],["eevopmozanxq93h","arb000000011453","USD"],["eevopmozanxq93h","arl000000885723","USD"],["eevopmozanxq93h","arb000000005127","USD"],["q5k9d5e0yz58jzl","arb000000011431","USD"],["q5k9d5e0yz58jzl","arb000000010455","USD"],["q5k9d5e0yz58jzl","arb000000004825","USD"],["tqgj354miduenf5","arb000000005755","USD"],["tqgj354miduenf5","arb000000006559","USD"],["tqgj354miduenf5","arb000000009677","USD"],["tqgj354miduenf5","arb000000005501","USD"],["acpo1b6vyddd6jj","arb000000004493","USD"],["acpo1b6vyddd6jj","arb000000011383","USD"],["acpo1b6vyddd6jj","arb000000001913","USD"],["acpo1b6vyddd6jj","arb000000002659","USD"],["7y6w0uot5ilj31r","arb000000008417","USD"],["7y6w0uot5ilj31r","arl000000887405","USD"],["7y6w0uot5ilj31r","arb000000002633","USD"],["cnj1sb09yi2diha","arb000000004607","USD"],["cnj1sb09yi2diha","arb000000002653","USD"],["uwt3y26eyzhzab2","arb000000012229","USD"],["t6oechadfa9eb7z","arb000000001697","USD"],["t6oechadfa9eb7z","arb000000001379","USD"],["t6oechadfa9eb7z","arc000000357061","USD"],["t6oechadfa9eb7z","arb000000003041","USD"],["t6oechadfa9eb7z","arb000000002179","USD"],["7jkaxcni4tdrinc","arb000000008841","USD"],["7jkaxcni4tdrinc","arb000000009295","USD"],["7jkaxcni4tdrinc","arl000000886723","USD"],["7jkaxcni4tdrinc","arb000000011313","USD"],["u78rinsd05dx6dx","arc000000358111","USD"],["u78rinsd05dx6dx","arb000000003741","USD"],["t9iaymrhiojsbdy","arb000000009025","USD"],["t9iaymrhiojsbdy","arb000000003823","USD"],["t9iaymrhiojsbdy","arb000000006213","USD"],["t9iaymrhiojsbdy","arc000000358234","USD"],["t9iaymrhiojsbdy","arb000000011619","USD"],["ocg27zbh3mmk4n8","arb000000010007","USD"],["ocg27zbh3mmk4n8","arb000000004147","USD"],["ocg27zbh3mmk4n8","arb000000005087","USD"],["ssyovhlkhjm72d9","arb000000001701","USD"],["ssyovhlkhjm72d9","arb000000004075","USD"],["ssyovhlkhjm72d9","arb000000009497","USD"],["ssyovhlkhjm72d9","arb000000005297","USD"],["ssyovhlkhjm72d9","arb000000010105","USD"],["1kxn6er6lia9ygm","arb000000002921","USD"],["1kxn6er6lia9ygm","arb000000012461","USD"],["1kxn6er6lia9ygm","arb000000010147","USD"],["1kxn6er6lia9ygm","arb000000011531","USD"],["1kxn6er6lia9ygm","arb000000002957","USD"],["1kxn6er6lia9ygm","arb000000011921","USD"],["nxtmuylrs6xzzed","arb000000008177","USD"],["nxtmuylrs6xzzed","arb000000010227","USD"],["nxtmuylrs6xzzed","arc000000357403","USD"],["nxtmuylrs6xzzed","arb000000003269","USD"],["nxtmuylrs6xzzed","arb000000012741","USD"],["nxtmuylrs6xzzed","arb000000012563","USD"],["ogc1eulzdkkjqq9","arb000000006921","USD"],["ogc1eulzdkkjqq9","arb000000007467","USD"],["ogc1eulzdkkjqq9","arb000000003525","USD"],["ogc1eulzdkkjqq9","arl000000887437","USD"],["ogc1eulzdkkjqq9","arc000000357787","USD"],["ogc1eulzdkkjqq9","arl000000886117","USD"],["ehrufue3zrl09m9","arb000000011553","USD"],["ehrufue3zrl09m9","arb000000003355","USD"],["ehrufue3zrl09m9","arc000000357532","USD"],["ehrufue3zrl09m9","arb000000007881","USD"],["ehrufue3zrl09m9","arb000000011071","USD"],["o02fzr13zc1htcj","arb000000011671","USD"],["o02fzr13zc1htcj","arb000000005875","USD"],["07s7qg7aedg2z8e","arb000000000895","USD"],["07s7qg7aedg2z8e","arb000000002073","USD"],["07s7qg7aedg2z8e","arb000000005061","USD"],["ltb1wtlo61tpmfu","arb000000005421","USD"],["ltb1wtlo61tpmfu","arb000000002057","USD"],["ltb1wtlo61tpmfu","arb000000003063","USD"],["ltb1wtlo61tpmfu","arb000000007269","USD"],["ltb1wtlo61tpmfu","arc000000357094","USD"],["ltb1wtlo61tpmfu","arb000000007835","USD"],["3rfv57cbb0lbm0p","arb000000000947","USD"],["3rfv57cbb0lbm0p","arb000000011045","USD"],["3rfv57cbb0lbm0p","arb000000001771","USD"],["3rfv57cbb0lbm0p","arb000000006403","USD"],["3rfv57cbb0lbm0p","arb000000010665","USD"],["3rfv57cbb0lbm0p","arb000000005829","USD"],["3rfv57cbb0lbm0p","arb000000005693","USD"],["3rfv57cbb0lbm0p","arb000000007659","USD"],["xqwpg9dinf4bcdw","arc000000357868","USD"],["xqwpg9dinf4bcdw","arb000000003579","USD"],["xqwpg9dinf4bcdw","arb000000000787","USD"],["xqwpg9dinf4bcdw","arb000000010727","USD"],["9qbils33x8fl75m","arb000000009093","USD"],["9qbils33x8fl75m","arl000000887101","USD"],["9qbils33x8fl75m","arb000000011185","USD"],["sx1su4cqistay9r","arb000000004497","USD"],["sx1su4cqistay9r","arb000000006283","USD"],["kb4uglfqpfrdwpf","arb000000001419","USD"],["kb4uglfqpfrdwpf","arb000000012273","USD"],["kb4uglfqpfrdwpf","arb000000008243","USD"],["kb4uglfqpfrdwpf","arb000000007601","USD"],["kb4uglfqpfrdwpf","arl000000886753","USD"],["1au2rdf9b83p1d1","arb000000007263","USD"],["1au2rdf9b83p1d1","arb000000007671","USD"],["1au2rdf9b83p1d1","arb000000009599","USD"],["1au2rdf9b83p1d1","arb000000012581","USD"],["njnxs99wldt2f0y","arb000000004435","USD"],["njnxs99wldt2f0y","arb000000004427","USD"],["njnxs99wldt2f0y","arb000000010403","USD"],["njnxs99wldt2f0y","arb000000012497","USD"],["njnxs99wldt2f0y","arb000000001345","USD"],["njnxs99wldt2f0y","arb000000008723","USD"],["932rvsls1i13l4a","arc000000357874","USD"],["932rvsls1i13l4a","arb000000004747","USD"],["932rvsls1i13l4a","arb000000003583","USD"],["932rvsls1i13l4a","arb000000012693","USD"],["zjdn6wf3hqvyy9w","arb000000006295","USD"],["zjdn6wf3hqvyy9w","arb000000007721","USD"],["zjdn6wf3hqvyy9w","arb000000001751","USD"],["bv4mm6i3k4w8ynd","arl000000885835","USD"],["bv4mm6i3k4w8ynd","arl000000886425","USD"],["bv4mm6i3k4w8ynd","arb000000004329","USD"],["u8af1xuifqswii0","arc000000357865","USD"],["u8af1xuifqswii0","arb000000003577","USD"],["u8af1xuifqswii0","arl000000886651","USD"],["odjgtulkboe3gj3","arb000000010167","USD"],["odjgtulkboe3gj3","arb000000001019","USD"],["odjgtulkboe3gj3","arb000000007005","USD"],["odjgtulkboe3gj3","arb000000012925","USD"],["0g5o9w2dw5bt3ot","arb000000009035","USD"],["0g5o9w2dw5bt3ot","arb000000008863","USD"],["0g5o9w2dw5bt3ot","arb000000010685","USD"],["0g5o9w2dw5bt3ot","arb000000001953","USD"],["0g5o9w2dw5bt3ot","arb000000004603","USD"],["0g5o9w2dw5bt3ot","arl000000885861","USD"],["lx1tfp8xdyycjf1","arb000000004227","USD"],["5sgv3i4od0q468w","arb000000006109","USD"],["5sgv3i4od0q468w","arb000000002835","USD"],["5sgv3i4od0q468w","arb000000004495","USD"],["5sgv3i4od0q468w","arb000000004793","USD"],["s7vawxr3bpqjvw1","arb000000005645","USD"],["s7vawxr3bpqjvw1","arb000000010707","USD"],["s7vawxr3bpqjvw1","arb000000011791","USD"],["s7vawxr3bpqjvw1","arb000000006469","USD"],["s7vawxr3bpqjvw1","arb000000004549","USD"],["s7vawxr3bpqjvw1","arb000000001427","USD"],["s7vawxr3bpqjvw1","arb000000009621","USD"],["s7vawxr3bpqjvw1","arb000000008305","USD"],["faorftlt9ia11zy","arl000000886667","USD"],["faorftlt9ia11zy","arb000000011907","USD"],["faorftlt9ia11zy","arb000000009321","USD"],["faorftlt9ia11zy","arb000000009681","USD"],["faorftlt9ia11zy","arb000000010953","USD"],["faorftlt9ia11zy","arb000000012951","USD"],["jbr6qosrkzs0t6b","arb000000010975","USD"],["jbr6qosrkzs0t6b","arb000000007267","USD"],["jbr6qosrkzs0t6b","arb000000003531","USD"],["jbr6qosrkzs0t6b","arb000000012139","USD"],["jbr6qosrkzs0t6b","arb000000003807","USD"],["jbr6qosrkzs0t6b","arb000000001367","USD"],["jbr6qosrkzs0t6b","arc000000358210","USD"],["jbr6qosrkzs0t6b","arc000000357796","USD"],["jbr6qosrkzs0t6b","arb000000012673","USD"],["jbr6qosrkzs0t6b","arb000000008447","USD"],["ygj3lngqq24an1k","arb000000004507","USD"],["ygj3lngqq24an1k","arc000000357319","USD"],["ygj3lngqq24an1k","arl000000886385","USD"],["ygj3lngqq24an1k","arb000000009183","USD"],["ygj3lngqq24an1k","arb000000003213","USD"],["ygj3lngqq24an1k","arb000000003967","USD"],["ygj3lngqq24an1k","arc000000358450","USD"],["hbthag0dmimfj5t","arb000000011347","USD"],["m68xr0axyqgzour","arb000000007249","USD"],["uu47w8c3xoxj9tr","arb000000002551","USD"],["uu47w8c3xoxj9tr","arb000000003045","USD"],["uu47w8c3xoxj9tr","arb000000010475","USD"],["uu47w8c3xoxj9tr","arc000000357067","USD"],["86xejjgj2fkm4jd","arb000000009807","USD"],["86xejjgj2fkm4jd","arb000000001015","USD"],["86xejjgj2fkm4jd","arb000000010425","USD"],["86xejjgj2fkm4jd","arb000000009181","USD"],["vhy6oo23hkneu2i","arl000000886611","USD"],["vhy6oo23hkneu2i","arb000000007883","USD"],["vhy6oo23hkneu2i","arb000000012735","USD"],["vhy6oo23hkneu2i","arb000000011655","USD"],["ozgnhjl2a95dcjg","arb000000001159","USD"],["ozgnhjl2a95dcjg","arb000000002627","USD"],["ozgnhjl2a95dcjg","arb000000010329","USD"],["vbdf14vbpfxswy0","arb000000007143","USD"],["vbdf14vbpfxswy0","arl000000886695","USD"],["vbdf14vbpfxswy0","arb000000010757","USD"],["vbdf14vbpfxswy0","arb000000008593","USD"],["vbdf14vbpfxswy0","arb000000011777","USD"],["vbdf14vbpfxswy0","arb000000011809","USD"],["vbdf14vbpfxswy0","arb000000005209","USD"],["oy2aa1jwu1cb65u","arb000000009817","USD"],["rzmphfikk0j06gp","arb000000001435","USD"],["rzmphfikk0j06gp","arl000000886741","USD"],["rr998baki1ep4zt","arb000000002297","USD"],["rr998baki1ep4zt","arb000000005319","USD"],["1ddl8aby3jfzrmg","arb000000003465","USD"],["1ddl8aby3jfzrmg","arc000000357697","USD"],["rttoeku8tuzwcxs","arl000000887469","USD"],["rttoeku8tuzwcxs","arb000000010067","USD"],["rttoeku8tuzwcxs","arb000000004619","USD"],["on43kr6107cxdyh","arb000000002969","USD"],["on43kr6107cxdyh","arb000000006287","USD"],["on43kr6107cxdyh","arb000000004965","USD"],["1dyhvm5a04zqiyi","arb000000001273","USD"],["1dyhvm5a04zqiyi","arb000000006561","USD"],["1dyhvm5a04zqiyi","arb000000008999","USD"],["p38r73mx0e9cocq","arb000000004907","USD"],["p38r73mx0e9cocq","arb000000011989","USD"],["p38r73mx0e9cocq","arl000000886625","USD"],["p38r73mx0e9cocq","arb000000009111","USD"],["p38r73mx0e9cocq","arb000000004291","USD"],["p38r73mx0e9cocq","arb000000001605","USD"],["p38r73mx0e9cocq","arl000000887311","USD"],["a7onzefy39erff2","arb000000000705","USD"],["nnxubbibive2plj","arb000000003013","USD"],["nnxubbibive2plj","arb000000009213","USD"],["nnxubbibive2plj","arc000000357019","USD"],["nnxubbibive2plj","arc000000357166","USD"],["nnxubbibive2plj","arb000000004601","USD"],["nnxubbibive2plj","arb000000001207","USD"],["nnxubbibive2plj","arb000000010547","USD"],["nnxubbibive2plj","arb000000003111","USD"],["plwqbqm65dzmm8n","arb000000002929","USD"],["plwqbqm65dzmm8n","arb000000004289","USD"],["plwqbqm65dzmm8n","arl000000885933","USD"],["plwqbqm65dzmm8n","arb000000005521","USD"],["plwqbqm65dzmm8n","arb000000006091","USD"],["plwqbqm65dzmm8n","arb000000012399","USD"],["plwqbqm65dzmm8n","arb000000012007","USD"],["plwqbqm65dzmm8n","arb000000000977","USD"],["plwqbqm65dzmm8n","arb000000007549","USD"],["fobo9ejg4xz162u","arl000000885991","USD"],["fobo9ejg4xz162u","arb000000010783","USD"],["fobo9ejg4xz162u","arb000000002769","USD"],["ds93j68zh6199s0","arb000000003793","USD"],["ds93j68zh6199s0","arb000000004107","USD"],["ds93j68zh6199s0","arc000000358189","USD"],["ds93j68zh6199s0","arb000000012195","USD"],["2urfmapjiaf79ql","arl000000887341","USD"],["2urfmapjiaf79ql","arl000000886563","USD"],["iib9b5iwybv5c6y","arb000000007333","USD"],["iib9b5iwybv5c6y","arb000000001109","USD"],["iib9b5iwybv5c6y","arb000000008169","USD"],["iib9b5iwybv5c6y","arl000000886223","USD"],["iib9b5iwybv5c6y","arl000000886961","USD"],["r6ywjb4lawfn4gl","arb000000002615","USD"],["r6ywjb4lawfn4gl","arb000000003949","USD"],["r6ywjb4lawfn4gl","arc000000358423","USD"],["r6ywjb4lawfn4gl","arb000000008317","USD"],["r6ywjb4lawfn4gl","arb000000001145","USD"],["r6ywjb4lawfn4gl","arl000000886175","USD"],["r6ywjb4lawfn4gl","arb000000002779","USD"],["r6ywjb4lawfn4gl","arl000000885669","USD"],["d2jfefi0nxkwvtj","arb000000005577","USD"],["d2jfefi0nxkwvtj","arb000000002311","USD"],["d2jfefi0nxkwvtj","arb000000002279","USD"],["d2jfefi0nxkwvtj","arb000000003011","USD"],["d2jfefi0nxkwvtj","arc000000357016","USD"],["p9bdlk0e9lueslr","arb000000007255","USD"],["p9bdlk0e9lueslr","arb000000004779","USD"],["p9bdlk0e9lueslr","arb000000004531","USD"],["toro6o1whnkfgo3","arb000000004151","USD"],["toro6o1whnkfgo3","arl000000886655","USD"],["em0isoreug2bl4h","arb000000007689","USD"],["em0isoreug2bl4h","arb000000011147","USD"],["wprp3o93out01lt","arb000000003753","USD"],["wprp3o93out01lt","arc000000357718","USD"],["wprp3o93out01lt","arb000000012885","USD"],["wprp3o93out01lt","arc000000358129","USD"],["wprp3o93out01lt","arb000000005581","USD"],["wprp3o93out01lt","arb000000005713","USD"],["wprp3o93out01lt","arb000000003479","USD"],["wprp3o93out01lt","arb000000007205","USD"],["3vxz3yea7q4f3ro","arl000000887111","USD"],["3vxz3yea7q4f3ro","arb000000000941","USD"],["3vxz3yea7q4f3ro","arb000000002829","USD"],["9vwrrpnbi5jwuon","arb000000010821","USD"],["9vwrrpnbi5jwuon","arb000000006107","USD"],["9vwrrpnbi5jwuon","arl000000885795","USD"],["3umnwgxegrck3yz","arb000000011743","USD"],["3umnwgxegrck3yz","arl000000887173","USD"],["e02qtt79ul6134p","arl000000887491","USD"],["e02qtt79ul6134p","arb000000012143","USD"],["e02qtt79ul6134p","arl000000885973","USD"],["e02qtt79ul6134p","arb000000007301","USD"],["e02qtt79ul6134p","arl000000885735","USD"],["e02qtt79ul6134p","arl000000887205","USD"],["9dnbdr8v604orac","arb000000005263","USD"],["9dnbdr8v604orac","arb000000001973","USD"],["9dnbdr8v604orac","arb000000010843","USD"],["9dnbdr8v604orac","arb000000007507","USD"],["5jz8ynyqpco8xw9","arb000000006299","USD"],["5jz8ynyqpco8xw9","arb000000011709","USD"],["5jz8ynyqpco8xw9","arb000000010857","USD"],["a3jvgoo62vdj2wr","arb000000006893","USD"],["a3jvgoo62vdj2wr","arl000000885533","USD"],["a3jvgoo62vdj2wr","arb000000001653","USD"],["a3jvgoo62vdj2wr","arb000000004989","USD"],["a3jvgoo62vdj2wr","arb000000008759","USD"],["a3jvgoo62vdj2wr","arb000000012445","USD"],["0vf42qi9o3b606p","arb000000011679","USD"],["0vf42qi9o3b606p","arb000000009983","USD"],["0vf42qi9o3b606p","arb000000005251","USD"],["0vf42qi9o3b606p","arb000000011761","USD"],["0vf42qi9o3b606p","arb000000008935","USD"],["0vf42qi9o3b606p","arb000000009021","USD"],["0vf42qi9o3b606p","arb000000006519","USD"],["xtcluwe9qp3g22p","arc000000357826","USD"],["xtcluwe9qp3g22p","arb000000003551","USD"],["xtcluwe9qp3g22p","arc000000357985","USD"],["xtcluwe9qp3g22p","arb000000012111","USD"],["xtcluwe9qp3g22p","arb000000003657","USD"],["h30x2bnuweww8vc","arb000000000965","USD"],["h30x2bnuweww8vc","arb000000004353","USD"],["h30x2bnuweww8vc","arb000000001393","USD"],["s1m4y8ohz7rtzrj","arb000000005495","USD"],["42ubk7ogmb8iqzb","arb000000008327","USD"],["42ubk7ogmb8iqzb","arb000000009825","USD"],["42ubk7ogmb8iqzb","arb000000006429","USD"],["wbrkjblqj8emf00","arb000000004911","USD"],["wbrkjblqj8emf00","arb000000012607","USD"],["wbrkjblqj8emf00","arb000000001723","USD"],["wbrkjblqj8emf00","arb000000012955","USD"],["wbrkjblqj8emf00","arb000000008831","USD"],["wbrkjblqj8emf00","arb000000005541","USD"],["wbrkjblqj8emf00","arb000000006721","USD"],["ujyw6pmm2bb5gk9","arb000000008587","USD"],["ujyw6pmm2bb5gk9","arb000000009567","USD"],["ujyw6pmm2bb5gk9","arb000000011105","USD"],["ujyw6pmm2bb5gk9","arb000000006405","USD"],["ujyw6pmm2bb5gk9","arb000000008185","USD"],["05fwv9o2qe3i6ta","arb000000003723","USD"],["05fwv9o2qe3i6ta","arb000000009339","USD"],["05fwv9o2qe3i6ta","arl000000885855","USD"],["05fwv9o2qe3i6ta","arb000000000985","USD"],["05fwv9o2qe3i6ta","arl000000885643","USD"],["05fwv9o2qe3i6ta","arl000000886933","USD"],["05fwv9o2qe3i6ta","arl000000885773","USD"],["05fwv9o2qe3i6ta","arc000000358084","USD"],["05fwv9o2qe3i6ta","arb000000004717","USD"],["05fwv9o2qe3i6ta","arb000000007715","USD"],["05fwv9o2qe3i6ta","arb000000010807","USD"],["p57rhwj0u05r25j","arb000000004561","USD"],["p57rhwj0u05r25j","arb000000007177","USD"],["p57rhwj0u05r25j","arb000000002495","USD"],["p57rhwj0u05r25j","arb000000008709","USD"],["p57rhwj0u05r25j","arb000000011435","USD"],["z9mbvb103k1ql41","arb000000011695","USD"],["z9mbvb103k1ql41","arb000000006181","USD"],["z9mbvb103k1ql41","arb000000005189","USD"],["z9mbvb103k1ql41","arb000000004137","USD"],["z9mbvb103k1ql41","arb000000004543","USD"],["z9mbvb103k1ql41","arb000000005431","USD"],["56mrn6yietcj6ya","arb000000001563","USD"],["56mrn6yietcj6ya","arl000000886911","USD"],["56mrn6yietcj6ya","arb000000001167","USD"],["56mrn6yietcj6ya","arl000000886891","USD"],["56mrn6yietcj6ya","arb000000001369","USD"],["56mrn6yietcj6ya","arc000000357232","USD"],["56mrn6yietcj6ya","arb000000003155","USD"],["hnu2kw1l6if6o8h","arb000000002999","USD"],["hnu2kw1l6if6o8h","arb000000004699","USD"],["hnu2kw1l6if6o8h","arb000000010643","USD"],["hnu2kw1l6if6o8h","arb000000010113","USD"],["e1wp8vkrrqkzx0w","arl000000885545","USD"],["e1wp8vkrrqkzx0w","arb000000001743","USD"],["avpw5l5tnlg5lwe","arb000000006437","USD"],["avpw5l5tnlg5lwe","arb000000001249","USD"],["avpw5l5tnlg5lwe","arb000000009365","USD"],["avpw5l5tnlg5lwe","arb000000007003","USD"],["yslua3wdf3w5z7d","arb000000008121","USD"],["94faove12thqowx","arl000000885977","USD"],["94faove12thqowx","arb000000001245","USD"],["l06zd0usrtc0k9w","arb000000003207","USD"],["l06zd0usrtc0k9w","arb000000009583","USD"],["l06zd0usrtc0k9w","arc000000357310","USD"],["4ma13rl1s9a4t6t","arb000000001923","USD"],["4ma13rl1s9a4t6t","arb000000010741","USD"],["4ma13rl1s9a4t6t","arb000000002833","USD"],["4ma13rl1s9a4t6t","arb000000001075","USD"],["4ma13rl1s9a4t6t","arb000000002523","USD"],["4ma13rl1s9a4t6t","arb000000002863","USD"],["4ma13rl1s9a4t6t","arb000000005335","USD"],["170nitjyiyo4t4v","arb000000000693","USD"],["170nitjyiyo4t4v","arl000000887109","USD"],["170nitjyiyo4t4v","arb000000008913","USD"],["n6xl558yrs7oq35","arb000000012301","USD"],["u5za0qowm4xs6oc","arb000000008505","USD"],["u5za0qowm4xs6oc","arb000000011255","USD"],["jea36mv249mpjap","arb000000008881","USD"],["jea36mv249mpjap","arl000000885845","USD"],["jea36mv249mpjap","arb000000010341","USD"],["jea36mv249mpjap","arb000000004897","USD"],["jea36mv249mpjap","arb000000009055","USD"],["jea36mv249mpjap","arb000000010139","USD"],["z8jzma8mcuestrp","arb000000003903","USD"],["z8jzma8mcuestrp","arb000000009137","USD"],["z8jzma8mcuestrp","arc000000358354","USD"],["z8jzma8mcuestrp","arb000000001939","USD"],["sl9h9g84xpx41nr","arl000000887387","USD"],["sl9h9g84xpx41nr","arb000000003975","USD"],["sl9h9g84xpx41nr","arb000000005825","USD"],["sl9h9g84xpx41nr","arc000000358462","USD"],["639p52el5a47767","arl000000885803","USD"],["639p52el5a47767","arb000000012713","USD"],["639p52el5a47767","arb000000009473","USD"],["639p52el5a47767","arb000000011169","USD"],["639p52el5a47767","arb000000010235","USD"],["amhfihmh32mf3d9","arb000000011819","USD"],["amhfihmh32mf3d9","arb000000010039","USD"],["s1hmnavuma4oy1p","arl000000887303","USD"],["sp1wjm48q66ma8j","arb000000002693","USD"],["sp1wjm48q66ma8j","arb000000010961","USD"],["b7gzkwbvtzju1mk","arb000000009951","USD"],["b7gzkwbvtzju1mk","arl000000887307","USD"],["b7gzkwbvtzju1mk","arb000000002757","USD"],["b7gzkwbvtzju1mk","arb000000008187","USD"],["esnnl5cq1iz9rz3","arb000000002959","USD"],["esnnl5cq1iz9rz3","arc000000357238","USD"],["esnnl5cq1iz9rz3","arb000000003159","USD"],["384tfsji0ukfk8u","arb000000012859","USD"],["384tfsji0ukfk8u","arb000000006751","USD"],["384tfsji0ukfk8u","arb000000005171","USD"],["384tfsji0ukfk8u","arb000000000987","USD"],["384tfsji0ukfk8u","arb000000004063","USD"],["384tfsji0ukfk8u","arb000000002823","USD"],["muw7zrqojb3xgxl","arb000000010815","USD"],["muw7zrqojb3xgxl","arb000000002087","USD"],["muw7zrqojb3xgxl","arb000000011483","USD"],["muw7zrqojb3xgxl","arb000000002227","USD"],["muw7zrqojb3xgxl","arb000000002405","USD"],["muw7zrqojb3xgxl","arb000000012523","USD"],["muw7zrqojb3xgxl","arl000000886585","USD"],["muw7zrqojb3xgxl","arb000000002971","USD"],["w4c5lhsk5njyytd","arb000000009721","USD"],["w4c5lhsk5njyytd","arb000000005331","USD"],["w4c5lhsk5njyytd","arb000000006035","USD"],["w4c5lhsk5njyytd","arb000000002841","USD"],["w4c5lhsk5njyytd","arb000000009697","USD"],["w4c5lhsk5njyytd","arb000000002987","USD"],["14cx3i5w5nm0kgo","arb000000010495","USD"],["14cx3i5w5nm0kgo","arb000000006313","USD"],["14cx3i5w5nm0kgo","arb000000011123","USD"],["eoa46v4nclzqers","arb000000011983","USD"],["n2hm4u4ka26f3of","arb000000002517","USD"],["n2hm4u4ka26f3of","arb000000001597","USD"],["n2hm4u4ka26f3of","arb000000006209","USD"],["lgk4b8xl1ic8u8r","arb000000006471","USD"],["lgk4b8xl1ic8u8r","arb000000010031","USD"],["lgk4b8xl1ic8u8r","arc000000358045","USD"],["lgk4b8xl1ic8u8r","arb000000007815","USD"],["lgk4b8xl1ic8u8r","arb000000001415","USD"],["lgk4b8xl1ic8u8r","arb000000003697","USD"],["2yptxr51o8s6xp0","arb000000006655","USD"],["2yptxr51o8s6xp0","arb000000007769","USD"],["2yptxr51o8s6xp0","arl000000886087","USD"],["2yptxr51o8s6xp0","arb000000012297","USD"],["2yptxr51o8s6xp0","arl000000886043","USD"],["2yptxr51o8s6xp0","arb000000004655","USD"],["2yptxr51o8s6xp0","arb000000012227","USD"],["olyljnmp321ppfo","arb000000004307","USD"],["olyljnmp321ppfo","arb000000001783","USD"],["olyljnmp321ppfo","arb000000009463","USD"],["vrohwe9rytnyxdl","arl000000886509","USD"],["vrohwe9rytnyxdl","arl000000885565","USD"],["vrohwe9rytnyxdl","arl000000886025","USD"],["led63etehpon1sj","arb000000000765","USD"],["led63etehpon1sj","arb000000002459","USD"],["led63etehpon1sj","arl000000887465","USD"],["i0xlx0fupot6lwm","arb000000012039","USD"],["i0xlx0fupot6lwm","arb000000010809","USD"],["i0xlx0fupot6lwm","arb000000004891","USD"],["i0xlx0fupot6lwm","arb000000005485","USD"],["i0xlx0fupot6lwm","arb000000007027","USD"],["6njcjj1mxaxii8x","arb000000003037","USD"],["6njcjj1mxaxii8x","arb000000009963","USD"],["6njcjj1mxaxii8x","arc000000357055","USD"],["v91fs4iktq4ptbs","arb000000001969","USD"],["v91fs4iktq4ptbs","arb000000005735","USD"],["huhenqycb3q0vp7","arc000000357271","USD"],["huhenqycb3q0vp7","arb000000003181","USD"],["lxz4cjv5imgs6bd","arl000000887443","USD"],["lxz4cjv5imgs6bd","arb000000012665","USD"],["lxz4cjv5imgs6bd","arb000000000781","USD"],["lxz4cjv5imgs6bd","arb000000004213","USD"],["lxz4cjv5imgs6bd","arb000000004775","USD"],["lxz4cjv5imgs6bd","arb000000009163","USD"],["lxz4cjv5imgs6bd","arb000000006297","USD"],["tn1qljsectbtqfo","arb000000001611","USD"],["tn1qljsectbtqfo","arb000000004635","USD"],["tn1qljsectbtqfo","arb000000011917","USD"],["tn1qljsectbtqfo","arb000000001017","USD"],["tn1qljsectbtqfo","arb000000012013","USD"],["r7xgruou70rvw8z","arb000000012073","USD"],["r7xgruou70rvw8z","arc000000357676","USD"],["r7xgruou70rvw8z","arb000000003609","USD"],["r7xgruou70rvw8z","arb000000003451","USD"],["r7xgruou70rvw8z","arb000000010277","USD"],["r7xgruou70rvw8z","arc000000357913","USD"],["45gmhe826c0kyxt","arb000000008777","USD"],["45gmhe826c0kyxt","arl000000886153","USD"],["45gmhe826c0kyxt","arb000000007387","USD"],["02x683fjdvjugut","arl000000886133","USD"],["02x683fjdvjugut","arb000000008425","USD"],["02x683fjdvjugut","arb000000010533","USD"],["02x683fjdvjugut","arl000000886543","USD"],["02x683fjdvjugut","arb000000011801","USD"],["5q51z1pwdswb37f","arb000000002935","USD"],["5q51z1pwdswb37f","arl000000886909","USD"],["0scr5xl2yd2vg87","arb000000008749","USD"],["0scr5xl2yd2vg87","arl000000887421","USD"],["0scr5xl2yd2vg87","arb000000006075","USD"],["0scr5xl2yd2vg87","arb000000005309","USD"],["8ysc3fnbmkfful6","arb000000008865","USD"],["8ysc3fnbmkfful6","arb000000012893","USD"],["8ysc3fnbmkfful6","arb000000010407","USD"],["tqpmjei2rz9zuk8","arb000000002905","USD"],["tqpmjei2rz9zuk8","arl000000885517","USD"],["tqpmjei2rz9zuk8","arb000000004469","USD"],["tqpmjei2rz9zuk8","arb000000010253","USD"],["1fag8ot3jcinql0","arb000000003523","USD"],["1fag8ot3jcinql0","arc000000357784","USD"],["1fag8ot3jcinql0","arb000000004667","USD"],["qtevo42xd0m7q5m","arb000000009527","USD"],["qtevo42xd0m7q5m","arb000000007803","USD"],["hu105fpxu9hwu0v","arb000000001775","USD"],["hu105fpxu9hwu0v","arb000000007135","USD"],["hu105fpxu9hwu0v","arb000000001997","USD"],["hu105fpxu9hwu0v","arb000000004595","USD"],["a2v6sw9kdl8q6ad","arb000000003751","USD"],["a2v6sw9kdl8q6ad","arb000000004987","USD"],["a2v6sw9kdl8q6ad","arc000000358126","USD"],["a2v6sw9kdl8q6ad","arb000000004945","USD"],["a2v6sw9kdl8q6ad","arb000000002623","USD"],["j5lreol4e4ofx1g","arb000000002027","USD"],["clapuovb62s8ll0","arb000000004051","USD"],["clapuovb62s8ll0","arb000000005997","USD"],["clapuovb62s8ll0","arl000000886763","USD"],["clapuovb62s8ll0","arb000000010563","USD"],["clapuovb62s8ll0","arl000000886521","USD"],["jppviitp89oicv1","arb000000010157","USD"],["4ha41acfl9qgi4a","arb000000007985","USD"],["4ha41acfl9qgi4a","arb000000008537","USD"],["4ha41acfl9qgi4a","arb000000010925","USD"],["4ha41acfl9qgi4a","arb000000002727","USD"],["dar76lao3bdrc9a","arb000000011507","USD"],["dar76lao3bdrc9a","arb000000010351","USD"],["dar76lao3bdrc9a","arb000000004387","USD"],["dar76lao3bdrc9a","arl000000885541","USD"],["dar76lao3bdrc9a","arb000000005441","USD"],["k29pazpxo597969","arb000000002521","USD"],["k29pazpxo597969","arc000000358069","USD"],["k29pazpxo597969","arb000000001935","USD"],["k29pazpxo597969","arb000000003713","USD"],["rl92rfc0cz5eaju","arb000000010319","USD"],["rl92rfc0cz5eaju","arb000000004449","USD"],["rl92rfc0cz5eaju","arb000000002171","USD"],["rl92rfc0cz5eaju","arb000000004663","USD"],["rl92rfc0cz5eaju","arb000000006969","USD"],["rl92rfc0cz5eaju","arb000000007477","USD"],["1hdzjjk1w89pp1q","arc000000357439","USD"],["1hdzjjk1w89pp1q","arl000000887445","USD"],["1hdzjjk1w89pp1q","arb000000004005","USD"],["1hdzjjk1w89pp1q","arb000000010151","USD"],["1hdzjjk1w89pp1q","arb000000000695","USD"],["1hdzjjk1w89pp1q","arb000000005745","USD"],["1hdzjjk1w89pp1q","arb000000003293","USD"],["ajlqe052qw4znpn","arc000000357781","USD"],["ajlqe052qw4znpn","arb000000005977","USD"],["ajlqe052qw4znpn","arb000000006799","USD"],["ajlqe052qw4znpn","arb000000010465","USD"],["ajlqe052qw4znpn","arb000000009139","USD"],["ajlqe052qw4znpn","arb000000003521","USD"],["ae9fxuosxjp71ae","arb000000001729","USD"],["ae9fxuosxjp71ae","arb000000007537","USD"],["ae9fxuosxjp71ae","arb000000011627","USD"],["ae9fxuosxjp71ae","arl000000886811","USD"],["3b76sbjm3a16o7h","arb000000005949","USD"],["3b76sbjm3a16o7h","arl000000886729","USD"],["3b76sbjm3a16o7h","arb000000001613","USD"],["3b76sbjm3a16o7h","arb000000008809","USD"],["3b76sbjm3a16o7h","arl000000885763","USD"],["3b76sbjm3a16o7h","arb000000011957","USD"],["rf0nuez9e6hope1","arb000000003619","USD"],["rf0nuez9e6hope1","arc000000357928","USD"],["rf0nuez9e6hope1","arb000000002313","USD"],["rf0nuez9e6hope1","arc000000358033","USD"],["rf0nuez9e6hope1","arl000000886709","USD"],["rf0nuez9e6hope1","arb000000003689","USD"],["lwh4l1feats5wf0","arb000000009145","USD"],["lwh4l1feats5wf0","arb000000008835","USD"],["lwh4l1feats5wf0","arl000000886663","USD"],["lwh4l1feats5wf0","arb000000006829","USD"],["kzoc8o422yv2l9l","arb000000000671","USD"],["kzoc8o422yv2l9l","arb000000008807","USD"],["kzoc8o422yv2l9l","arb000000006639","USD"],["9zqtx6yzv8utvwn","arb000000012717","USD"],["g4569w3po7pensv","arb000000003563","USD"],["g4569w3po7pensv","arc000000357844","USD"],["g4569w3po7pensv","arb000000002309","USD"],["g4569w3po7pensv","arb000000007289","USD"],["g4569w3po7pensv","arb000000011673","USD"],["g4569w3po7pensv","arb000000006169","USD"],["d3gdbjg0wqu0pe2","arb000000004269","USD"],["d3gdbjg0wqu0pe2","arb000000012707","USD"],["25mraccp4kt0gii","arb000000006727","USD"],["25mraccp4kt0gii","arb000000000839","USD"],["25mraccp4kt0gii","arb000000002067","USD"],["ojq67apjooasyaq","arb000000007231","USD"],["ojq67apjooasyaq","arb000000004309","USD"],["ojq67apjooasyaq","arb000000007565","USD"],["ojq67apjooasyaq","arb000000005279","USD"],["0khfblv76ttxbzf","arb000000006009","USD"],["b886jef1lh46rk8","arb000000011629","USD"],["b886jef1lh46rk8","arc000000357469","USD"],["b886jef1lh46rk8","arb000000012239","USD"],["b886jef1lh46rk8","arb000000003313","USD"],["igieaickuulwsci","arb000000006631","USD"],["igieaickuulwsci","arl000000885603","USD"],["igieaickuulwsci","arb000000005917","USD"],["igieaickuulwsci","arb000000011637","USD"],["6qq3kv2ifakshbf","arb000000011063","USD"],["qblfli0y21y0ea8","arb000000008043","USD"],["qblfli0y21y0ea8","arb000000004693","USD"],["qblfli0y21y0ea8","arl000000886991","USD"],["fak8easamxxdzze","arb000000004157","USD"],["fak8easamxxdzze","arb000000007513","USD"],["zi93og1jzyhqkri","arb000000003587","USD"],["zi93og1jzyhqkri","arc000000357880","USD"],["nph8lrdlcdh2ozd","arb000000008791","USD"],["azngiqtszk26meh","arb000000011509","USD"],["azngiqtszk26meh","arb000000005943","USD"],["azngiqtszk26meh","arb000000005921","USD"],["azngiqtszk26meh","arb000000007717","USD"],["azngiqtszk26meh","arb000000009759","USD"],["e3z0ghnkvkf39hx","arb000000002293","USD"],["1ou0rnhq44hckkw","arb000000012343","USD"],["1ou0rnhq44hckkw","arb000000004613","USD"],["1ou0rnhq44hckkw","arb000000005395","USD"],["1ou0rnhq44hckkw","arb000000009121","USD"],["0v7atj0l5ps37pz","arl000000887489","USD"],["0v7atj0l5ps37pz","arb000000007079","USD"],["0v7atj0l5ps37pz","arb000000002213","USD"],["0v7atj0l5ps37pz","arb000000001037","USD"],["n8vo5sj8am3ravn","arb000000000789","USD"],["n8vo5sj8am3ravn","arb000000002567","USD"],["n8vo5sj8am3ravn","arb000000001377","USD"],["n8vo5sj8am3ravn","arb000000005769","USD"],["gmlvz9zndvz6gpp","arb000000006497","USD"],["gmlvz9zndvz6gpp","arb000000003941","USD"],["gmlvz9zndvz6gpp","arc000000358411","USD"],["gmlvz9zndvz6gpp","arb000000008681","USD"],["rb6nazi2zgron3g","arb000000006855","USD"],["rb6nazi2zgron3g","arb000000011929","USD"],["c9u59d69v36y7ji","arb000000006713","USD"],["c9u59d69v36y7ji","arb000000001237","USD"],["c9u59d69v36y7ji","arb000000008055","USD"],["5oh4ezpisj9l7hn","arb000000009999","USD"],["5oh4ezpisj9l7hn","arl000000886467","USD"],["5oh4ezpisj9l7hn","arb000000010505","USD"],["5oh4ezpisj9l7hn","arb000000004251","USD"],["5oh4ezpisj9l7hn","arb000000011879","USD"],["rpc3m1r0sxv9h5r","arb000000002571","USD"],["rpc3m1r0sxv9h5r","arb000000008251","USD"],["rpc3m1r0sxv9h5r","arb000000010525","USD"],["l5wcj4ogjnww11j","arb000000002289","USD"],["l5wcj4ogjnww11j","arb000000012439","USD"],["l5wcj4ogjnww11j","arl000000887005","USD"],["l5wcj4ogjnww11j","arl000000887245","USD"],["l5wcj4ogjnww11j","arb000000007459","USD"],["l5wcj4ogjnww11j","arb000000005097","USD"],["hcuvxfduau14uxl","arb000000012813","USD"],["hcuvxfduau14uxl","arb000000002217","USD"],["hcuvxfduau14uxl","arb000000007161","USD"],["hcuvxfduau14uxl","arb000000007791","USD"],["97aepwho1386v53","arb000000003067","USD"],["97aepwho1386v53","arb000000002031","USD"],["97aepwho1386v53","arb000000000743","USD"],["97aepwho1386v53","arc000000357100","USD"],["8lc7lig8dgvcqcs","arb000000006533","USD"],["8lc7lig8dgvcqcs","arb000000009539","USD"],["8lc7lig8dgvcqcs","arb000000002511","USD"],["8lc7lig8dgvcqcs","arb000000011955","USD"],["8lc7lig8dgvcqcs","arb000000012101","USD"],["8lc7lig8dgvcqcs","arb000000012011","USD"],["8lc7lig8dgvcqcs","arl000000886769","USD"],["8lc7lig8dgvcqcs","arl000000886415","USD"],["n5okvnb37rv8cde","arb000000007345","USD"],["n5okvnb37rv8cde","arb000000000795","USD"],["n5okvnb37rv8cde","arb000000006507","USD"],["n5okvnb37rv8cde","arb000000012205","USD"],["mn4zvfdb2ehivx3","arl000000885873","USD"],["mn4zvfdb2ehivx3","arb000000002961","USD"],["mn4zvfdb2ehivx3","arb000000007927","USD"],["it62hmgwx5tvoog","arb000000004991","USD"],["it62hmgwx5tvoog","arb000000012421","USD"],["it62hmgwx5tvoog","arb000000004135","USD"],["it62hmgwx5tvoog","arl000000886705","USD"],["9r4ge4cexqvpnoa","arb000000011429","USD"],["9r4ge4cexqvpnoa","arb000000002387","USD"],["9r4ge4cexqvpnoa","arb000000009885","USD"],["m01deaj8b3yhy88","arb000000001175","USD"],["m01deaj8b3yhy88","arb000000009923","USD"],["m01deaj8b3yhy88","arb000000006323","USD"],["m01deaj8b3yhy88","arb000000001485","USD"],["m01deaj8b3yhy88","arb000000012413","USD"],["m01deaj8b3yhy88","arl000000885833","USD"],["qocknaxa8lxjggx","arb000000007035","USD"],["qocknaxa8lxjggx","arb000000001209","USD"],["qocknaxa8lxjggx","arb000000002717","USD"],["5eitdx4blzf2ob5","arb000000012909","USD"],["5eitdx4blzf2ob5","arb000000011417","USD"],["5eitdx4blzf2ob5","arb000000001669","USD"],["5eitdx4blzf2ob5","arb000000003883","USD"],["5eitdx4blzf2ob5","arb000000006481","USD"],["5eitdx4blzf2ob5","arc000000358324","USD"],["5eitdx4blzf2ob5","arl000000886051","USD"],["5eitdx4blzf2ob5","arb000000006863","USD"],["5eitdx4blzf2ob5","arb000000000815","USD"],["5eitdx4blzf2ob5","arb000000010195","USD"],["xv25imrfjgyatc5","arc000000357691","USD"],["xv25imrfjgyatc5","arb000000003461","USD"],["z0cqkaapjopg9x4","arb000000011585","USD"],["z0cqkaapjopg9x4","arb000000001445","USD"],["ugmgv6ysgtw5j2g","arb000000010819","USD"],["ugmgv6ysgtw5j2g","arc000000358213","USD"],["ugmgv6ysgtw5j2g","arc000000358453","USD"],["ugmgv6ysgtw5j2g","arb000000003969","USD"],["ugmgv6ysgtw5j2g","arb000000003809","USD"],["zo4vxt2s9mxneip","arc000000357856","USD"],["zo4vxt2s9mxneip","arb000000003571","USD"],["fycx90kd6oy1ilr","arb000000006097","USD"],["fycx90kd6oy1ilr","arb000000009421","USD"],["fycx90kd6oy1ilr","arb000000006943","USD"],["fycx90kd6oy1ilr","arl000000887017","USD"],["bt96zrd6b684ltg","arl000000887169","USD"],["bt96zrd6b684ltg","arb000000005429","USD"],["bt96zrd6b684ltg","arb000000012867","USD"],["bt96zrd6b684ltg","arb000000012747","USD"],["cqt0lh3v2hu645f","arb000000004941","USD"],["cqt0lh3v2hu645f","arb000000002223","USD"],["cqt0lh3v2hu645f","arb000000001603","USD"],["cqt0lh3v2hu645f","arb000000010337","USD"],["cqt0lh3v2hu645f","arb000000011645","USD"],["cqt0lh3v2hu645f","arb000000011477","USD"],["rz4thxac9w6meas","arb000000003139","USD"],["rz4thxac9w6meas","arb000000002201","USD"],["rz4thxac9w6meas","arb000000001055","USD"],["rz4thxac9w6meas","arc000000357208","USD"],["rz4thxac9w6meas","arb000000002423","USD"],["jkesnv616rexetb","arb000000006767","USD"],["jkesnv616rexetb","arb000000007937","USD"],["sc8wtahosfjff6g","arb000000009907","USD"],["sc8wtahosfjff6g","arc000000358120","USD"],["sc8wtahosfjff6g","arb000000003747","USD"],["sc8wtahosfjff6g","arb000000002525","USD"],["mw1tbhpvditc8mq","arb000000010489","USD"],["mw1tbhpvditc8mq","arb000000005035","USD"],["mw1tbhpvditc8mq","arl000000885923","USD"],["mw1tbhpvditc8mq","arb000000012289","USD"],["mw1tbhpvditc8mq","arb000000004753","USD"],["l35ni35onhh9z87","arb000000002295","USD"],["l35ni35onhh9z87","arb000000009953","USD"],["x5q0zvw9rqc0qrj","arb000000011577","USD"],["x5q0zvw9rqc0qrj","arb000000012389","USD"],["x5q0zvw9rqc0qrj","arl000000885867","USD"],["x5q0zvw9rqc0qrj","arl000000886069","USD"],["x5q0zvw9rqc0qrj","arb000000010289","USD"],["x5q0zvw9rqc0qrj","arb000000008105","USD"],["lxowwkaqlevwv1p","arb000000005759","USD"],["8wg17ibjmnmnmwj","arb000000008839","USD"],["8wg17ibjmnmnmwj","arb000000009395","USD"],[null,"arl000000885759","USD"],[null,"arl000000886979","USD"],[null,"arl000000886619","USD"],[null,"arl000000886459","USD"],[null,"arl000000886839","USD"],[null,"arl000000887179","USD"],[null,"arl000000886659","USD"],[null,"arl000000886279","USD"],[null,"arl000000885899","USD"],[null,"arl000000887399","USD"],[null,"arl000000885619","USD"],[null,"arl000000887239","USD"],[null,"arl000000886819","USD"],[null,"arl000000886419","USD"],[null,"arl000000886699","USD"],[null,"arl000000885659","USD"],[null,"arl000000886219","USD"],[null,"arl000000886719","USD"],[null,"arl000000886759","USD"],[null,"arl000000887319","USD"],[null,"arl000000885699","USD"],[null,"arl000000887099","USD"],[null,"arl000000886899","USD"],[null,"arl000000885799","USD"],[null,"arl000000885739","USD"],[null,"arl000000887479","USD"],[null,"arl000000886959","USD"],[null,"arl000000886779","USD"],[null,"arl000000887119","USD"],[null,"arl000000886079","USD"],[null,"arl000000885539","USD"],[null,"arl000000886519","USD"],[null,"arl000000886159","USD"],[null,"arl000000886119","USD"],[null,"arl000000886439","USD"],[null,"arl000000886559","USD"],[null,"arl000000887299","USD"],[null,"arl000000885839","USD"],[null,"arl000000886139","USD"],[null,"arl000000886339","USD"],[null,"arl000000887059","USD"],[null,"arl000000886579","USD"],[null,"arl000000886359","USD"],[null,"arl000000886939","USD"],[null,"arl000000886479","USD"],[null,"arl000000887039","USD"],[null,"arl000000887199","USD"],[null,"arl000000887499","USD"],[null,"arl000000887339","USD"],[null,"arl000000886179","USD"],[null,"arl000000885639","USD"],[null,"arl000000887459","USD"],[null,"arl000000887139","USD"],[null,"arl000000885719","USD"],[null,"arl000000886739","USD"],[null,"arl000000885999","USD"],[null,"arl000000886299","USD"],[null,"arl000000887019","USD"],[null,"arl000000887379","USD"],[null,"arl000000886019","USD"],[null,"arl000000886799","USD"],[null,"arl000000886999","USD"],[null,"arl000000886039","USD"],[null,"arl000000885579","USD"],[null,"arl000000885919","USD"],[null,"arl000000885979","USD"],[null,"arl000000885879","USD"],[null,"arl000000887419","USD"],[null,"arl000000886199","USD"],[null,"arl000000886239","USD"],[null,"arl000000887219","USD"],[null,"arl000000885599","USD"],[null,"arl000000886639","USD"],[null,"arl000000885959","USD"],[null,"arl000000886059","USD"],[null,"arl000000886259","USD"],[null,"arl000000886399","USD"],[null,"arl000000887159","USD"],[null,"arl000000886859","USD"],[null,"arl000000885779","USD"],[null,"arl000000886919","USD"],[null,"arl000000885859","USD"],[null,"arl000000886379","USD"],[null,"arl000000886499","USD"],[null,"arl000000886539","USD"],[null,"arl000000885559","USD"],[null,"arl000000886099","USD"],[null,"arl000000885679","USD"],[null,"arl000000887279","USD"],[null,"arl000000885819","USD"],[null,"arl000000886599","USD"],[null,"arl000000887359","USD"],[null,"arl000000887079","USD"],[null,"arl000000887439","USD"],[null,"arl000000886879","USD"],[null,"arl000000885939","USD"],[null,"arl000000886319","USD"],[null,"arl000000886679","USD"],[null,"arl000000887259","USD"],[null,"arl000000885519","USD"]]'))
SELECT * FROM (SELECT d.*, gord.__g AS __g FROM (SELECT w.__id AS __id, w.k0 AS k0, w.k1 AS k1, w.ck0 AS ck0, w.h11 AS s0, w.h12 AS s1, w.h13 AS s2, w.h14 AS s3, (CASE WHEN (w.rc0 IS NULL OR w.rc0 = '') THEN 1 ELSE 0 END) AS s4, tc_round((CASE WHEN ('name' IS 'balance') THEN COALESCE((COALESCE(w.h7, 0) - COALESCE(w.h8, 0)), 0) ELSE 0 END), 0) AS s5, lower(w.rc1) AS s6, w.c0 AS v0, NULL AS vcur0, NULL AS vmx0, w.wh0 AS vl0, NULL AS vc0, w.h11 AS v1, NULL AS vcur1, NULL AS vmx1, NULL AS vl1, NULL AS vc1, (CASE WHEN (COALESCE(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) IS 0) THEN NULL ELSE COALESCE(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 0) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) END) AS v2, NULL AS vcur2, NULL AS vmx2, NULL AS vl2, NULL AS vc2, (CASE WHEN (COALESCE(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) IS 0) THEN NULL ELSE COALESCE(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 1) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 30)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) END) AS v3, NULL AS vcur3, NULL AS vmx3, NULL AS vl3, NULL AS vc3, (CASE WHEN (COALESCE(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) IS 0) THEN NULL ELSE COALESCE(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 31) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 60)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) END) AS v4, NULL AS vcur4, NULL AS vmx4, NULL AS vl4, NULL AS vc4, (CASE WHEN (COALESCE(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) IS 0) THEN NULL ELSE COALESCE(tc_round((CASE WHEN ((CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 61) AND (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) <= 90)) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) END) AS v5, NULL AS vcur5, NULL AS vmx5, NULL AS vl5, NULL AS vc5, (CASE WHEN (COALESCE(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) IS 0) THEN NULL ELSE COALESCE(tc_round((CASE WHEN (CAST(julianday(substr('2026-11-18', 1, 10)) - julianday(substr(w.h11, 1, 10)) AS INTEGER) >= 91) THEN (COALESCE(w.h7, 0) - COALESCE(w.h8, 0)) ELSE 0 END), 0), 0) END) AS v6, NULL AS vcur6, NULL AS vmx6, NULL AS vl6, NULL AS vc6, COALESCE((COALESCE(w.h7, 0) - COALESCE(w.h8, 0)), 0) AS v7, NULL AS vcur7, NULL AS vmx7, NULL AS vl7, NULL AS vc7, w.c8 AS v8, NULL AS vcur8, NULL AS vmx8, w.wh1 AS vl8, NULL AS vc8, w.c9 AS v9, NULL AS vcur9, NULL AS vmx9, NULL AS vl9, NULL AS vc9, w.h12 AS v10, NULL AS vcur10, NULL AS vmx10, NULL AS vl10, NULL AS vc10, (COALESCE(w.h13, '') || COALESCE(' · ', '') || COALESCE((CASE WHEN ((w.h15 IS 'bill') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill' WHEN ((w.h15 IS 'bill_payment') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill payment' WHEN ((w.h15 IS 'credit_memo') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Credit memo' WHEN ((w.h15 IS 'expense') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Expense' WHEN ((w.h15 IS 'invoice') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Invoice' WHEN ((w.h15 IS 'payment') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Payment' WHEN ((w.h15 IS 'refund_receipt') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Refund receipt' WHEN ((w.h15 IS 'sales_receipt') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Sales receipt' WHEN ((w.h15 IS 'transfer') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Transfer' WHEN ((w.h15 IS 'vendor_credit') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor credit' WHEN ((w.h15 IS 'vendor_refund') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor refund' WHEN ((w.h15 IS 'write_off') AND (NOT COALESCE((w.h16 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Write-off' WHEN (w.h16 IS 'reversal') THEN (CASE WHEN (w.h17 IS NULL OR w.h17 = '') THEN 'Reversal' ELSE (COALESCE('Reversal', '') || COALESCE(' of ', '') || COALESCE(w.h17, '')) END) WHEN (w.h16 IS 'void_reversal') THEN (CASE WHEN (w.h17 IS NULL OR w.h17 = '') THEN 'Void reversal' ELSE (COALESCE('Void reversal', '') || COALESCE(' of ', '') || COALESCE(w.h17, '')) END) WHEN (w.h16 IS 'auto_reversal') THEN (CASE WHEN (w.h17 IS NULL OR w.h17 = '') THEN 'Auto reversal' ELSE (COALESCE('Auto reversal', '') || COALESCE(' of ', '') || COALESCE(w.h17, '')) END) WHEN (w.h16 IS 'manual') THEN 'Journal entry' WHEN (w.h16 IS 'opening_balance') THEN 'Opening balances' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(w.h18, '')) AS __label, NULL AS __labelcur, (CASE WHEN ((w.h16 IS 'document') AND (w.h15 IS 'bill') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/bills/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'bill_payment') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/bill-payments/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'credit_memo') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/credit-memos/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'expense') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/expenses/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'invoice') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/invoices/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'payment') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/payments/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'refund_receipt') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/refund-receipts/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'sales_receipt') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/sales-receipts/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'vendor_credit') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/vendor-credits/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'vendor_refund') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/vendor-refunds/', '') || COALESCE(w.h19, '')) WHEN ((w.h16 IS 'document') AND (w.h15 IS 'write_off') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/write-offs/', '') || COALESCE(w.h19, '')) WHEN ((w.h15 IS 'transfer') AND (w.h16 IS 'manual')) THEN (COALESCE('books/transfers/', '') || COALESCE(w.h20, '')) ELSE (COALESCE('books/entries/', '') || COALESCE(w.h20, '')) END) AS __open FROM (SELECT w.*, (SELECT COALESCE(NULLIF([[t8.display_name]], ''), '(no name)')
FROM r1 t8
WHERE [[t8.id]] IS w.c8) AS wh1 FROM (SELECT w.*, (SELECT COALESCE(NULLIF([[t7.display_name]], ''), '(no name)')
FROM r1 t7
WHERE [[t7.id]] IS w.c0) AS wh0 FROM (SELECT w.*, NULLIF([[t6.id]], '') AS rc0, [[t6.display_name]] AS rc1 FROM ws w LEFT JOIN r1 t6 ON [[t6.id]] IS w.k0) w) w) w) d JOIN gord ON d.k0 IS gord.g0 AND d.k1 IS gord.g1 AND d.ck0 IS gord.g2) d WHERE 1 ORDER BY d.__g, (d.s0 IS NULL), d.s0, (d.s1 IS NULL), d.s1, (d.s2 IS NULL), d.s2, (d.s3 IS NULL), d.s3, (d.s4 IS NULL), d.s4, (d.s5 IS NULL), d.s5 DESC, (d.s6 IS NULL), d.s6, d.__id LIMIT 50002
```

no statistics:

```
MATERIALIZE gord
  SCAN json_each VIRTUAL TABLE INDEX 1:
SCAN gord
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 46
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 47
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 48
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_payable_items USING INDEX idx_books_payable_items_item (item=?)
SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 60
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 61
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 62
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 18
  MATERIALIZE s2
    CO-ROUTINE a2
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 102
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 103
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 104
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 116
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 117
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 118
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 130
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 131
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 132
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_entries USING COVERING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 144
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 145
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 146
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
    SCALAR SUBQUERY 5
      CO-ROUTINE __rule
        SCAN CONSTANT ROW
      SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
      CORRELATED SCALAR SUBQUERY 158
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 159
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 160
        SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
      SCAN __rule
      SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  BLOOM FILTER ON p (k0=? AND k1=? AND ck0=?)
  SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND k1=? AND ck0=?)
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 8
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 74
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 75
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 76
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 8
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 88
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 89
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 90
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 172
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 173
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 174
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 34
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 186
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 187
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 188
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 33
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 200
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 201
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 202
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
LIST SUBQUERY 21
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 22
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 23
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 24
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 25
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 26
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 27
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 28
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 29
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 30
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 31
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 32
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
MATERIALIZE gord
  SCAN json_each VIRTUAL TABLE INDEX 1:
SCAN gord
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 46
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 47
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 48
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_payable_items USING INDEX idx_books_payable_items_item (item=?)
SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 60
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 61
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 62
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 18
  MATERIALIZE s2
    CO-ROUTINE a2
      SEARCH books_payable_items USING INDEX idx_books_payable_items_settled_date (settled>?)
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 102
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 103
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 104
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 116
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 117
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 118
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 130
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 131
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 132
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_entries USING COVERING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 144
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 145
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 146
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
    SCALAR SUBQUERY 5
      CO-ROUTINE __rule
        SCAN CONSTANT ROW
      SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
      CORRELATED SCALAR SUBQUERY 158
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 159
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 160
        SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
      SCAN __rule
      SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  BLOOM FILTER ON p (k0=? AND k1=? AND ck0=?)
  SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND k1=? AND ck0=?)
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 8
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 74
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 75
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 76
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 8
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 88
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 89
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 90
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 172
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 173
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 174
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 34
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 186
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 187
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 188
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 33
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 200
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 201
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 202
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
LIST SUBQUERY 21
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 22
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 23
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 24
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 25
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 26
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 27
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 28
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 29
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 30
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 31
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 32
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
USE TEMP B-TREE FOR ORDER BY
```

## Run 7 CSV export, statement 41

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

## Run 7 CSV export, statement 42

```sql
SELECT count(*) FROM `users` WHERE `id`='erm9hfihaqj47y3'
```

no statistics:

```
SEARCH users USING COVERING INDEX sqlite_autoindex_users_1 (id=?)
```

after ANALYZE:

```
SEARCH users USING COVERING INDEX sqlite_autoindex_users_1 (id=?)
```
