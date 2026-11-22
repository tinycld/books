# Expenses by Vendor query plans (L)

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
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1))
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
WITH r0 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r1 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r2 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r3 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c3, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.debit]] AS h5, [[t1.credit]] AS h6
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r2 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.account]]
WHERE (((NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger') OR ('accrual' IS 'cash')) AND ([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t3.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t3.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, NULL AS v3, NULL AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r0 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, a.k0 AS v3, a.wh0 AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r0 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.ck0, o.v0, o.v1, o.v2, o.v3, o.vl3, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1 LIMIT 201)
UNION ALL
SELECT __level, __row, k0, ck0, v0, v1, v2, v3, vl3, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1
```

no statistics:

```
CO-ROUTINE (subquery-23)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-21)
        MATERIALIZE o1
          CO-ROUTINE (subquery-25)
            CO-ROUTINE (subquery-26)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                          SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        UNION ALL
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          REUSE LIST SUBQUERY 7
                          SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 16
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-26)
          SCAN (subquery-25)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-21)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-28)
          CO-ROUTINE (subquery-29)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-29)
        SCAN (subquery-28)
      SCAN o0
SCAN (subquery-23)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-23)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-21)
        MATERIALIZE o1
          CO-ROUTINE (subquery-25)
            CO-ROUTINE (subquery-26)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (ANY(account) AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                        UNION ALL
                          SCAN books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          REUSE LIST SUBQUERY 7
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 16
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-26)
          SCAN (subquery-25)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-21)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-28)
          CO-ROUTINE (subquery-29)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-29)
        SCAN (subquery-28)
      SCAN o0
SCAN (subquery-23)
USE TEMP B-TREE FOR ORDER BY
```

## Run 2 middle months, statement 1

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

## Run 2 middle months, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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

## Run 2 middle months, statement 3

```sql
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1))
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

## Run 2 middle months, statement 4

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

## Run 2 middle months, statement 5

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

## Run 2 middle months, statement 6

```sql
WITH r0 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r1 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r2 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r3 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c3, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.debit]] AS h5, [[t1.credit]] AS h6
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r2 p WHERE [[p.date]] >= '2024-04-01' AND [[p.date]] <= ('2024-06-30' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2024-04-01' AND [[p.date]] <= ('2024-06-30' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.account]]
WHERE (((NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger') OR ('accrual' IS 'cash')) AND ([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2024-04-01' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2024-06-30') AND (NULLIF([[t3.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t3.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, NULL AS v3, NULL AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r0 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, a.k0 AS v3, a.wh0 AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r0 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.ck0, o.v0, o.v1, o.v2, o.v3, o.vl3, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1 LIMIT 201)
UNION ALL
SELECT __level, __row, k0, ck0, v0, v1, v2, v3, vl3, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1
```

no statistics:

```
CO-ROUTINE (subquery-23)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-21)
        MATERIALIZE o1
          CO-ROUTINE (subquery-25)
            CO-ROUTINE (subquery-26)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                          SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        UNION ALL
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          REUSE LIST SUBQUERY 7
                          SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 16
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-26)
          SCAN (subquery-25)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-21)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-28)
          CO-ROUTINE (subquery-29)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-29)
        SCAN (subquery-28)
      SCAN o0
SCAN (subquery-23)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-23)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-21)
        MATERIALIZE o1
          CO-ROUTINE (subquery-25)
            CO-ROUTINE (subquery-26)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (ANY(account) AND date>? AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                        UNION ALL
                          SCAN books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          REUSE LIST SUBQUERY 7
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 16
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-26)
          SCAN (subquery-25)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-21)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-28)
          CO-ROUTINE (subquery-29)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-29)
        SCAN (subquery-28)
      SCAN o0
SCAN (subquery-23)
USE TEMP B-TREE FOR ORDER BY
```

## Run 3 cash, statement 1

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

## Run 3 cash, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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

## Run 3 cash, statement 3

```sql
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1))
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

## Run 3 cash, statement 4

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

## Run 3 cash, statement 5

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

## Run 3 cash, statement 6

```sql
WITH r0 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r1 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r2 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r3 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c3, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.debit]] AS h5, [[t1.credit]] AS h6
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r2 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.account]]
WHERE (((NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger') OR ('cash' IS 'cash')) AND ([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t3.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t3.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, NULL AS v3, NULL AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r0 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, a.k0 AS v3, a.wh0 AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r0 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.ck0, o.v0, o.v1, o.v2, o.v3, o.vl3, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1 LIMIT 201)
UNION ALL
SELECT __level, __row, k0, ck0, v0, v1, v2, v3, vl3, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1
```

no statistics:

```
CO-ROUTINE (subquery-23)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-21)
        MATERIALIZE o1
          CO-ROUTINE (subquery-25)
            CO-ROUTINE (subquery-26)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                          SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        UNION ALL
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          REUSE LIST SUBQUERY 7
                          SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 16
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-26)
          SCAN (subquery-25)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-21)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-28)
          CO-ROUTINE (subquery-29)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-29)
        SCAN (subquery-28)
      SCAN o0
SCAN (subquery-23)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-23)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-21)
        MATERIALIZE o1
          CO-ROUTINE (subquery-25)
            CO-ROUTINE (subquery-26)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (ANY(account) AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                        UNION ALL
                          SCAN books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          REUSE LIST SUBQUERY 7
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 16
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-26)
          SCAN (subquery-25)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-21)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-28)
          CO-ROUTINE (subquery-29)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-29)
        SCAN (subquery-28)
      SCAN o0
SCAN (subquery-23)
USE TEMP B-TREE FOR ORDER BY
```

## Run 4 largest expenses, statement 1

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

## Run 4 largest expenses, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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

## Run 4 largest expenses, statement 3

```sql
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1))
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

## Run 4 largest expenses, statement 4

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

## Run 4 largest expenses, statement 5

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

## Run 4 largest expenses, statement 6

```sql
WITH r0 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r1 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r2 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r3 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c3, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.debit]] AS h5, [[t1.credit]] AS h6
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r2 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.account]]
WHERE (((NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger') OR ('accrual' IS 'cash')) AND ([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t3.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t3.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, NULL AS v3, NULL AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r0 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, a.k0 AS v3, a.wh0 AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('amount' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r0 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.ck0, o.v0, o.v1, o.v2, o.v3, o.vl3, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1 LIMIT 201)
UNION ALL
SELECT __level, __row, k0, ck0, v0, v1, v2, v3, vl3, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1
```

no statistics:

```
CO-ROUTINE (subquery-23)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-21)
        MATERIALIZE o1
          CO-ROUTINE (subquery-25)
            CO-ROUTINE (subquery-26)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                          SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        UNION ALL
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          REUSE LIST SUBQUERY 7
                          SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 16
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-26)
          SCAN (subquery-25)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-21)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-28)
          CO-ROUTINE (subquery-29)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-29)
        SCAN (subquery-28)
      SCAN o0
SCAN (subquery-23)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-23)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-21)
        MATERIALIZE o1
          CO-ROUTINE (subquery-25)
            CO-ROUTINE (subquery-26)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (ANY(account) AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                        UNION ALL
                          SCAN books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          REUSE LIST SUBQUERY 7
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 16
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-26)
          SCAN (subquery-25)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-21)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-28)
          CO-ROUTINE (subquery-29)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-29)
        SCAN (subquery-28)
      SCAN o0
SCAN (subquery-23)
USE TEMP B-TREE FOR ORDER BY
```

## Run 5 with activity, statement 1

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

## Run 5 with activity, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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

## Run 5 with activity, statement 3

```sql
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1))
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

## Run 5 with activity, statement 4

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

## Run 5 with activity, statement 5

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

## Run 5 with activity, statement 6

```sql
WITH r0 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r1 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r2 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r3 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c3, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.debit]] AS h5, [[t1.credit]] AS h6
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r2 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.account]]
WHERE (((NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger') OR ('accrual' IS 'cash')) AND ([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t3.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t3.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, NULL AS v3, NULL AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r0 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('activity' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, a.k0 AS v3, a.wh0 AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r0 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.ck0, o.v0, o.v1, o.v2, o.v3, o.vl3, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1 LIMIT 201)
UNION ALL
SELECT __level, __row, k0, ck0, v0, v1, v2, v3, vl3, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1
```

no statistics:

```
CO-ROUTINE (subquery-23)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-21)
        MATERIALIZE o1
          CO-ROUTINE (subquery-25)
            CO-ROUTINE (subquery-26)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                          SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        UNION ALL
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          REUSE LIST SUBQUERY 7
                          SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 16
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-26)
          SCAN (subquery-25)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-21)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-28)
          CO-ROUTINE (subquery-29)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-29)
        SCAN (subquery-28)
      SCAN o0
SCAN (subquery-23)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-23)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-21)
        MATERIALIZE o1
          CO-ROUTINE (subquery-25)
            CO-ROUTINE (subquery-26)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (ANY(account) AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                        UNION ALL
                          SCAN books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          REUSE LIST SUBQUERY 7
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 16
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-26)
          SCAN (subquery-25)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-21)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-28)
          CO-ROUTINE (subquery-29)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-29)
        SCAN (subquery-28)
      SCAN o0
SCAN (subquery-23)
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
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1))
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
WITH r0 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r1 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r2 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r3 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c3, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.debit]] AS h5, [[t1.credit]] AS h6
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r2 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff') AND [[p.vendor]] IN (SELECT +value FROM json_each('["8yzxzwj31hxahqd","vm447aetfryqel0","evcx4haa0dm4pbm","njk7et7mj8z85we","72ns294wgz5td1i"]'))
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff') AND [[p.vendor]] IN (SELECT +value FROM json_each('["8yzxzwj31hxahqd","vm447aetfryqel0","evcx4haa0dm4pbm","njk7et7mj8z85we","72ns294wgz5td1i"]'))) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.account]]
WHERE (((NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger') OR ('accrual' IS 'cash')) AND ([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t3.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t3.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)) AND (NULLIF([[t2.id]], '') IN (SELECT +value FROM json_each('["8yzxzwj31hxahqd","vm447aetfryqel0","evcx4haa0dm4pbm","njk7et7mj8z85we","72ns294wgz5td1i"]'))))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, NULL AS v3, NULL AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r0 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, a.k0 AS v3, a.wh0 AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r0 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.ck0, o.v0, o.v1, o.v2, o.v3, o.vl3, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1 LIMIT 201)
UNION ALL
SELECT __level, __row, k0, ck0, v0, v1, v2, v3, vl3, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1
```

no statistics:

```
CO-ROUTINE (subquery-26)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-24)
        MATERIALIZE o1
          CO-ROUTINE (subquery-28)
            CO-ROUTINE (subquery-29)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          LIST SUBQUERY 9
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                          SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                          LIST SUBQUERY 5
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          LIST SUBQUERY 10
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                        UNION ALL
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          LIST SUBQUERY 9
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                          SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          LIST SUBQUERY 10
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 19
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-29)
          SCAN (subquery-28)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-24)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-31)
          CO-ROUTINE (subquery-32)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-32)
        SCAN (subquery-31)
      SCAN o0
SCAN (subquery-26)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-26)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-24)
        MATERIALIZE o1
          CO-ROUTINE (subquery-28)
            CO-ROUTINE (subquery-29)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (ANY(account) AND ANY(posted) AND vendor=? AND date>? AND date<?)
                          LIST SUBQUERY 5
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          LIST SUBQUERY 10
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          LIST SUBQUERY 9
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                        UNION ALL
                          SEARCH books_cash_basis_lines USING INDEX idx_books_cash_basis_lines_account_posted_vendor_date (ANY(account) AND ANY(posted) AND vendor=? AND date>? AND date<?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          LIST SUBQUERY 9
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          LIST SUBQUERY 10
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 19
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-29)
          SCAN (subquery-28)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-24)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-31)
          CO-ROUTINE (subquery-32)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-32)
        SCAN (subquery-31)
      SCAN o0
SCAN (subquery-26)
USE TEMP B-TREE FOR ORDER BY
```

## Run 6 five vendors, statement 7

```sql
WITH r0 AS (SELECT `books_vendors`.* FROM `books_vendors`)
SELECT o.v AS v, o.l AS l, o.lc AS lc, o.g AS g FROM (SELECT CAST(NULLIF([[t1.id]], '') AS TEXT) AS v, COALESCE(min(NULLIF(CAST([[t1.display_name]] AS TEXT), '')), '') AS l, min(NULL) AS lc, NULL AS g, NULL AS k
FROM r0 t1
WHERE 1 AND CAST(NULLIF([[t1.id]], '') AS TEXT) IS NOT NULL
GROUP BY 1) o
WHERE 1 AND o.v IN (SELECT +value FROM json_each('["8yzxzwj31hxahqd","vm447aetfryqel0","evcx4haa0dm4pbm","njk7et7mj8z85we","72ns294wgz5td1i"]'))
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

## Run 7 vendor opened, statement 1

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

## Run 7 vendor opened, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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

## Run 7 vendor opened, statement 3

```sql
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1))
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

## Run 7 vendor opened, statement 4

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

## Run 7 vendor opened, statement 5

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

## Run 7 vendor opened, statement 6

```sql
WITH r0 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r1 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r2 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r3 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c3, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.debit]] AS h5, [[t1.credit]] AS h6
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r2 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.account]]
WHERE (((NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger') OR ('accrual' IS 'cash')) AND ([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t3.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t3.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, NULL AS v3, NULL AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r0 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, a.k0 AS v3, a.wh0 AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r0 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.ck0, o.v0, o.v1, o.v2, o.v3, o.vl3, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1 LIMIT 201)
UNION ALL
SELECT __level, __row, k0, ck0, v0, v1, v2, v3, vl3, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1
```

no statistics:

```
CO-ROUTINE (subquery-23)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-21)
        MATERIALIZE o1
          CO-ROUTINE (subquery-25)
            CO-ROUTINE (subquery-26)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                          SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        UNION ALL
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          REUSE LIST SUBQUERY 7
                          SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 16
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-26)
          SCAN (subquery-25)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-21)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-28)
          CO-ROUTINE (subquery-29)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-29)
        SCAN (subquery-28)
      SCAN o0
SCAN (subquery-23)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-23)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-21)
        MATERIALIZE o1
          CO-ROUTINE (subquery-25)
            CO-ROUTINE (subquery-26)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (ANY(account) AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                        UNION ALL
                          SCAN books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          REUSE LIST SUBQUERY 7
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 16
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-26)
          SCAN (subquery-25)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-21)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-28)
          CO-ROUTINE (subquery-29)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-29)
        SCAN (subquery-28)
      SCAN o0
SCAN (subquery-23)
USE TEMP B-TREE FOR ORDER BY
```

## Run 7 vendor opened, statement 7

```sql
WITH r0 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r1 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r2 AS (SELECT `books_journal_entries`.* FROM `books_journal_entries`),
r3 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r4 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
gord AS MATERIALIZED (SELECT key AS __g, json_extract(value, '$[0]') AS g0, json_extract(value, '$[1]') AS g1 FROM json_each('[["g8ts5u482rges30","USD"]]')),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c3, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.debit]] AS h5, [[t1.credit]] AS h6, NULLIF(substr([[t1.date]], 1, 10), '') AS h7, NULLIF([[t5.posted_at]], '') AS h8, [[t1.position]] AS h9, NULLIF([[t1.layer]], '') AS h10, NULLIF([[t5.origin]], '') AS h11, [[t9.number]] AS h12, [[t5.number]] AS h13, NULLIF([[t5.doc_type]], '') AS h14, [[t3.number]] AS h15, [[t3.full_name]] AS h16, [[t1.memo]] AS h17, [[t5.memo]] AS h18, [[t5.document]] AS h19, NULLIF([[t5.id]], '') AS h20
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r4 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.account]]
LEFT JOIN r2 t5 ON [[t5.id]] = [[t1.entry]]
LEFT JOIN r2 t9 ON [[t9.id]] = [[t5.reverses]]
WHERE ((((NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger') OR ('accrual' IS 'cash')) AND ([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t3.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t3.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)))) AND [[t1.vendor]] IN (SELECT g0 FROM gord WHERE g0 IS NOT NULL)),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r0 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
ws AS (SELECT w.* FROM w WHERE EXISTS (SELECT 1 FROM s1 p WHERE p.k0 IS w.k0 AND p.ck0 IS w.ck0))
SELECT * FROM (WITH wpage AS MATERIALIZED (SELECT * FROM (SELECT d.*, gord.__g AS __g FROM (SELECT w.*, w.h7 AS s0, w.h8 AS s1, w.h9 AS s2, (CASE WHEN (w.h10 IS 'ledger') THEN 0 ELSE 1 END) AS s3, (CASE WHEN (w.rc0 IS NULL OR w.rc0 = '') THEN 1 ELSE 0 END) AS s4, tc_round((CASE WHEN ('name' IS 'amount') THEN COALESCE((COALESCE(w.h5, 0) - COALESCE(w.h6, 0)), 0) ELSE 0 END), 0) AS s5, lower(w.rc1) AS s6 FROM (SELECT w.*, NULLIF([[t6.id]], '') AS rc0, [[t6.display_name]] AS rc1 FROM ws w LEFT JOIN r0 t6 ON [[t6.id]] IS w.k0) w) d CROSS JOIN gord ON +d.k0 IS gord.g0 AND +d.ck0 IS gord.g1) d WHERE 1 ORDER BY d.__g, (d.s0 IS NULL), d.s0, (d.s1 IS NULL), d.s1, (d.s2 IS NULL), d.s2, (d.s3 IS NULL), d.s3, (d.s4 IS NULL), d.s4, (d.s5 IS NULL), d.s5 DESC, (d.s6 IS NULL), d.s6, d.__id LIMIT 201), wcells AS MATERIALIZED (SELECT * FROM (SELECT w.*, (SELECT COALESCE(NULLIF([[t8.display_name]], ''), '(no name)')
FROM r0 t8
WHERE [[t8.id]] IS w.c3) AS wh1 FROM (SELECT w.*, (SELECT COALESCE(NULLIF([[t7.display_name]], ''), '(no name)')
FROM r0 t7
WHERE [[t7.id]] IS w.c0) AS wh0 FROM (SELECT * FROM wpage) w) w) w) SELECT w.__id AS __id, w.k0 AS k0, w.ck0 AS ck0, w.s0 AS s0, w.s1 AS s1, w.s2 AS s2, w.s3 AS s3, w.s4 AS s4, w.s5 AS s5, w.s6 AS s6, w.c0 AS v0, NULL AS vcur0, NULL AS vmx0, w.wh0 AS vl0, NULL AS vc0, COALESCE((COALESCE(w.h5, 0) - COALESCE(w.h6, 0)), 0) AS v1, NULL AS vcur1, NULL AS vmx1, NULL AS vl1, NULL AS vc1, NULL AS v2, NULL AS vcur2, NULL AS vmx2, NULL AS vl2, NULL AS vc2, w.c3 AS v3, NULL AS vcur3, NULL AS vmx3, w.wh1 AS vl3, NULL AS vc3, (COALESCE(w.h7, '') || COALESCE(' · ', '') || COALESCE((CASE WHEN ((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))) AND (w.h12 IS w.h13)) THEN (CASE WHEN ((w.h14 IS 'bill') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill' WHEN ((w.h14 IS 'bill_payment') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill payment' WHEN ((w.h14 IS 'credit_memo') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Credit memo' WHEN ((w.h14 IS 'expense') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Expense' WHEN ((w.h14 IS 'invoice') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Invoice' WHEN ((w.h14 IS 'payment') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Payment' WHEN ((w.h14 IS 'refund_receipt') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Refund receipt' WHEN ((w.h14 IS 'sales_receipt') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Sales receipt' WHEN ((w.h14 IS 'transfer') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Transfer' WHEN ((w.h14 IS 'vendor_credit') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor credit' WHEN ((w.h14 IS 'vendor_refund') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor refund' WHEN ((w.h14 IS 'write_off') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Write-off' WHEN (w.h11 IS 'reversal') THEN (CASE WHEN (w.h12 IS NULL OR w.h12 = '') THEN 'Reversal' ELSE (COALESCE('Reversal', '') || COALESCE(' of ', '') || COALESCE(w.h12, '')) END) WHEN (w.h11 IS 'void_reversal') THEN (CASE WHEN (w.h12 IS NULL OR w.h12 = '') THEN 'Void reversal' ELSE (COALESCE('Void reversal', '') || COALESCE(' of ', '') || COALESCE(w.h12, '')) END) WHEN (w.h11 IS 'auto_reversal') THEN (CASE WHEN (w.h12 IS NULL OR w.h12 = '') THEN 'Auto reversal' ELSE (COALESCE('Auto reversal', '') || COALESCE(' of ', '') || COALESCE(w.h12, '')) END) WHEN (w.h11 IS 'manual') THEN 'Journal entry' WHEN (w.h11 IS 'opening_balance') THEN 'Opening balances' ELSE 'Journal entry' END) ELSE (COALESCE((CASE WHEN ((w.h14 IS 'bill') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill' WHEN ((w.h14 IS 'bill_payment') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill payment' WHEN ((w.h14 IS 'credit_memo') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Credit memo' WHEN ((w.h14 IS 'expense') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Expense' WHEN ((w.h14 IS 'invoice') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Invoice' WHEN ((w.h14 IS 'payment') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Payment' WHEN ((w.h14 IS 'refund_receipt') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Refund receipt' WHEN ((w.h14 IS 'sales_receipt') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Sales receipt' WHEN ((w.h14 IS 'transfer') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Transfer' WHEN ((w.h14 IS 'vendor_credit') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor credit' WHEN ((w.h14 IS 'vendor_refund') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor refund' WHEN ((w.h14 IS 'write_off') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Write-off' WHEN (w.h11 IS 'reversal') THEN (CASE WHEN (w.h12 IS NULL OR w.h12 = '') THEN 'Reversal' ELSE (COALESCE('Reversal', '') || COALESCE(' of ', '') || COALESCE(w.h12, '')) END) WHEN (w.h11 IS 'void_reversal') THEN (CASE WHEN (w.h12 IS NULL OR w.h12 = '') THEN 'Void reversal' ELSE (COALESCE('Void reversal', '') || COALESCE(' of ', '') || COALESCE(w.h12, '')) END) WHEN (w.h11 IS 'auto_reversal') THEN (CASE WHEN (w.h12 IS NULL OR w.h12 = '') THEN 'Auto reversal' ELSE (COALESCE('Auto reversal', '') || COALESCE(' of ', '') || COALESCE(w.h12, '')) END) WHEN (w.h11 IS 'manual') THEN 'Journal entry' WHEN (w.h11 IS 'opening_balance') THEN 'Opening balances' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(w.h13, '')) END), '') || COALESCE(' · ', '') || COALESCE((CASE WHEN (w.h15 IS NULL OR w.h15 = '') THEN w.h16 ELSE (COALESCE(w.h15, '') || COALESCE(' ', '') || COALESCE(w.h16, '')) END), '') || COALESCE((CASE WHEN ((CASE WHEN (w.h17 IS NULL OR w.h17 = '') THEN w.h18 ELSE w.h17 END) IS NULL OR (CASE WHEN (w.h17 IS NULL OR w.h17 = '') THEN w.h18 ELSE w.h17 END) = '') THEN '' ELSE (COALESCE(' · ', '') || COALESCE((CASE WHEN (w.h17 IS NULL OR w.h17 = '') THEN w.h18 ELSE w.h17 END), '')) END), '')) AS __label, NULL AS __labelcur, (CASE WHEN ((w.h11 IS 'document') AND (w.h14 IS 'bill') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/bills/', '') || COALESCE(w.h19, '')) WHEN ((w.h11 IS 'document') AND (w.h14 IS 'bill_payment') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/bill-payments/', '') || COALESCE(w.h19, '')) WHEN ((w.h11 IS 'document') AND (w.h14 IS 'credit_memo') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/credit-memos/', '') || COALESCE(w.h19, '')) WHEN ((w.h11 IS 'document') AND (w.h14 IS 'expense') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/expenses/', '') || COALESCE(w.h19, '')) WHEN ((w.h11 IS 'document') AND (w.h14 IS 'invoice') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/invoices/', '') || COALESCE(w.h19, '')) WHEN ((w.h11 IS 'document') AND (w.h14 IS 'payment') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/payments/', '') || COALESCE(w.h19, '')) WHEN ((w.h11 IS 'document') AND (w.h14 IS 'refund_receipt') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/refund-receipts/', '') || COALESCE(w.h19, '')) WHEN ((w.h11 IS 'document') AND (w.h14 IS 'sales_receipt') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/sales-receipts/', '') || COALESCE(w.h19, '')) WHEN ((w.h11 IS 'document') AND (w.h14 IS 'vendor_credit') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/vendor-credits/', '') || COALESCE(w.h19, '')) WHEN ((w.h11 IS 'document') AND (w.h14 IS 'vendor_refund') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/vendor-refunds/', '') || COALESCE(w.h19, '')) WHEN ((w.h11 IS 'document') AND (w.h14 IS 'write_off') AND (NOT COALESCE((w.h19 IS NULL OR w.h19 = ''), 0))) THEN (COALESCE('books/write-offs/', '') || COALESCE(w.h19, '')) WHEN ((w.h14 IS 'transfer') AND (w.h11 IS 'manual')) THEN (COALESCE('books/transfers/', '') || COALESCE(w.h20, '')) ELSE (COALESCE('books/entries/', '') || COALESCE(w.h20, '')) END) AS __open, w.__g AS __g FROM wcells w) d ORDER BY d.__g, (d.s0 IS NULL), d.s0, (d.s1 IS NULL), d.s1, (d.s2 IS NULL), d.s2, (d.s3 IS NULL), d.s3, (d.s4 IS NULL), d.s4, (d.s5 IS NULL), d.s5 DESC, (d.s6 IS NULL), d.s6, d.__id
```

no statistics:

```
MATERIALIZE wcells
  MATERIALIZE wpage
    MATERIALIZE w
      COMPOUND QUERY
        LEFT-MOST SUBQUERY
          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
          LIST SUBQUERY 9
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=? AND date>? AND date<?)
          LIST SUBQUERY 10
            MATERIALIZE gord
              SCAN json_each VIRTUAL TABLE INDEX 1:
            SCAN gord
            CREATE BLOOM FILTER
          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
        UNION ALL
          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
          LIST SUBQUERY 9
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          SEARCH books_cash_basis_lines USING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
          LIST SUBQUERY 10
            SCAN gord
            CREATE BLOOM FILTER
          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
    SCAN w
    CORRELATED SCALAR SUBQUERY 16
      MATERIALIZE s1
        CO-ROUTINE a1
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      BLOOM FILTER ON p (k0=? AND ck0=?)
      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
    BLOOM FILTER ON gord (g0=? AND g1=?)
    SEARCH gord USING AUTOMATIC PARTIAL COVERING INDEX (g0=? AND g1=?)
    USE TEMP B-TREE FOR ORDER BY
  SCAN wpage
  CORRELATED SCALAR SUBQUERY 23
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  CORRELATED SCALAR SUBQUERY 22
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
SCAN w
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
LIST SUBQUERY 33
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 34
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 35
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
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
          LIST SUBQUERY 10
            MATERIALIZE gord
              SCAN json_each VIRTUAL TABLE INDEX 1:
            SCAN gord
          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
          BLOOM FILTER ON books_accounts (id=?)
          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
          LIST SUBQUERY 9
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
        UNION ALL
          SEARCH books_cash_basis_lines USING INDEX idx_books_cash_basis_lines_account_posted_vendor_date (ANY(account) AND ANY(posted) AND vendor=? AND date>? AND date<?)
          LIST SUBQUERY 10
            SCAN gord
          BLOOM FILTER ON books_accounts (id=?)
          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
          LIST SUBQUERY 9
            SCAN json_each VIRTUAL TABLE INDEX 1:
            CREATE BLOOM FILTER
          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
          SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
    SCAN w
    CORRELATED SCALAR SUBQUERY 16
      MATERIALIZE s1
        CO-ROUTINE a1
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      BLOOM FILTER ON p (k0=? AND ck0=?)
      SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
    BLOOM FILTER ON gord (g0=? AND g1=?)
    SEARCH gord USING AUTOMATIC PARTIAL COVERING INDEX (g0=? AND g1=?)
    USE TEMP B-TREE FOR ORDER BY
  SCAN wpage
  CORRELATED SCALAR SUBQUERY 23
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  CORRELATED SCALAR SUBQUERY 22
    SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
SCAN w
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
LIST SUBQUERY 33
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 34
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
LIST SUBQUERY 35
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
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
USE TEMP B-TREE FOR ORDER BY
```

## Run 8 CSV export, statement 1

```sql
SELECT `reports`.* FROM `reports` WHERE [[reports.shipped_key]] = 'books.expenses_by_vendor' LIMIT 1
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
SELECT `users`.* FROM `users` WHERE `users`.`id`='9cmemczly8l9eip' LIMIT 1
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
SELECT `reports`.* FROM `reports` WHERE `reports`.`id`='czaiqr0wcgn09q4' LIMIT 1
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
SELECT DISTINCT (1) FROM `reports` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `report_shares` `reports_report_shares_via_report` ON [[reports_report_shares_via_report.report]] = [[reports.id]] WHERE (`reports`.`id`='czaiqr0wcgn09q4') AND (('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND ([[reports.owner]] = '9cmemczly8l9eip' OR [[reports_report_shares_via_report.user]] = '9cmemczly8l9eip' OR ([[reports.published]] = 1 AND [[__auth_users.role]] IS NOT 'guest')))) LIMIT 1
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
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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
SELECT EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='9cmemczly8l9eip' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('9cmemczly8l9eip' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = '9cmemczly8l9eip' AND [[__collection_alias_me.can_read]] = 1))
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
WITH r0 AS (SELECT `books_vendors`.* FROM `books_vendors`),
r1 AS (SELECT `books_accounts`.* FROM `books_accounts`),
r2 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines`),
r3 AS (SELECT `books_cash_basis_lines`.* FROM `books_cash_basis_lines`),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c3, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.debit]] AS h5, [[t1.credit]] AS h6
FROM (SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'ledger' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r2 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')
UNION ALL
SELECT [[p.id]] AS [[id]], [[p.account]] AS [[account]], [[p.credit]] AS [[credit]], [[p.currency]] AS [[currency]], [[p.customer]] AS [[customer]], [[p.date]] AS [[date]], [[p.debit]] AS [[debit]], [[p.entry]] AS [[entry]], 'cash' AS [[layer]], [[p.memo]] AS [[memo]], [[p.position]] AS [[position]], [[p.posted]] AS [[posted]], [[p.vendor]] AS [[vendor]] FROM r3 p WHERE [[p.date]] >= '2021-11-19' AND [[p.date]] <= ('2026-11-18' || x'ff')) t1
LEFT JOIN r0 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r1 t3 ON [[t3.id]] = [[t1.account]]
WHERE (((NULLIF([[t1.layer]], '') IS 'ledger' AND [[t1.layer]] = 'ledger') OR ('accrual' IS 'cash')) AND ([[t1.posted]] IS true) AND (substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) >= '2021-11-19' AND substr(NULLIF(substr([[t1.date]], 1, 10), ''), 1, 10) <= '2026-11-18') AND (NULLIF([[t3.type]], '') IN (SELECT +value FROM json_each('["cost_of_goods_sold","expense","other_expense"]')) AND [[t3.type]] IN ('cost_of_goods_sold', 'expense', 'other_expense', NULL)))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, NULL AS v3, NULL AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r0 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, tc_pct(COALESCE(a.y0, 0), SUM(COALESCE(a.y0, 0)) OVER (PARTITION BY a.ck0), 2) AS v2, a.k0 AS v3, a.wh0 AS vl3, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'amount') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r0 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1)
SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.ck0, o.v0, o.v1, o.v2, o.v3, o.vl3, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1 LIMIT 50002)
UNION ALL
SELECT __level, __row, k0, ck0, v0, v1, v2, v3, vl3, __ord, __own, __label, __labelcur, __n, __kids, __inline, __muted, NULL AS __p1, NULL AS __s1_0, NULL AS __s1_1, NULL AS __s1_2, NULL AS __s1_3, NULL AS __s1_4, NULL AS __s1_5, NULL AS __s1_6, NULL AS __s1_7, NULL AS __s1_8, NULL AS __s1_9 FROM o0)
ORDER BY (__level = 0), (ck0 IS NULL), ck0, __p1
```

no statistics:

```
CO-ROUTINE (subquery-23)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-21)
        MATERIALIZE o1
          CO-ROUTINE (subquery-25)
            CO-ROUTINE (subquery-26)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                          SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (account=? AND date>? AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                        UNION ALL
                          SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
                          REUSE LIST SUBQUERY 7
                          SEARCH books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering (account=? AND date>? AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 16
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-26)
          SCAN (subquery-25)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-21)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-28)
          CO-ROUTINE (subquery-29)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-29)
        SCAN (subquery-28)
      SCAN o0
SCAN (subquery-23)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
CO-ROUTINE (subquery-23)
  COMPOUND QUERY
    LEFT-MOST SUBQUERY
      CO-ROUTINE (subquery-21)
        MATERIALIZE o1
          CO-ROUTINE (subquery-25)
            CO-ROUTINE (subquery-26)
              MATERIALIZE il1
                MATERIALIZE s1
                  MATERIALIZE a1
                    MATERIALIZE w
                      COMPOUND QUERY
                        LEFT-MOST SUBQUERY
                          SEARCH books_journal_lines USING COVERING INDEX idx_books_jlines_account_date_covering (ANY(account) AND date<?)
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          LIST SUBQUERY 7
                            SCAN json_each VIRTUAL TABLE INDEX 1:
                            CREATE BLOOM FILTER
                        UNION ALL
                          SCAN books_cash_basis_lines USING COVERING INDEX idx_books_cash_basis_lines_account_date_covering
                          SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                          BLOOM FILTER ON books_accounts (id=?)
                          SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
                          REUSE LIST SUBQUERY 7
                    SCAN w
                    USE TEMP B-TREE FOR GROUP BY
                  SCAN a
                  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
                SCAN a
              SCAN a
              CORRELATED SCALAR SUBQUERY 16
                SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
              USE TEMP B-TREE FOR ORDER BY
            SCAN (subquery-26)
          SCAN (subquery-25)
        SCAN o
        BLOOM FILTER ON o1 (ck0=? AND k0=?)
        SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
        USE TEMP B-TREE FOR ORDER BY
      SCAN (subquery-21)
    UNION ALL
      CO-ROUTINE o0
        CO-ROUTINE (subquery-28)
          CO-ROUTINE (subquery-29)
            CO-ROUTINE a0
              SCAN w
              USE TEMP B-TREE FOR GROUP BY
            SCAN a
            USE TEMP B-TREE FOR ORDER BY
          SCAN (subquery-29)
        SCAN (subquery-28)
      SCAN o0
SCAN (subquery-23)
USE TEMP B-TREE FOR ORDER BY
```
