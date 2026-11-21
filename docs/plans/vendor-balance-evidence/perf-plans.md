# Vendor Balance query plans (L)

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
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
WHERE (([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, NULL AS v2, NULL AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, a.k0 AS v2, a.wh0 AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1)
SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.ck0, o.v0, o.v1, o.v2, o.vl2, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1 LIMIT 201
```

no statistics:

```
MATERIALIZE o1
  CO-ROUTINE (subquery-164)
    MATERIALIZE il1
      MATERIALIZE s1
        MATERIALIZE a1
          MATERIALIZE w
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            SCALAR SUBQUERY 8
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 57
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 58
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 59
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 2
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 29
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 30
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 31
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
            SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 43
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 44
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 45
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
        SCALAR SUBQUERY 5
          CO-ROUTINE __rule
            SCAN CONSTANT ROW
          SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
          CORRELATED SCALAR SUBQUERY 71
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 72
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 73
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
        CORRELATED SCALAR SUBQUERY 85
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 86
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 87
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-164)
SCAN o
BLOOM FILTER ON o1 (ck0=? AND k0=?)
SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
MATERIALIZE o1
  CO-ROUTINE (subquery-164)
    MATERIALIZE il1
      MATERIALIZE s1
        MATERIALIZE a1
          MATERIALIZE w
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            SCALAR SUBQUERY 8
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 57
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 58
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 59
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 2
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 29
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 30
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 31
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
            SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 43
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 44
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 45
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
        SCALAR SUBQUERY 5
          CO-ROUTINE __rule
            SCAN CONSTANT ROW
          SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
          CORRELATED SCALAR SUBQUERY 71
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 72
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 73
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
        CORRELATED SCALAR SUBQUERY 85
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 86
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 87
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-164)
SCAN o
BLOOM FILTER ON o1 (ck0=? AND k0=?)
SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
USE TEMP B-TREE FOR ORDER BY
```

## Run 1 default, statement 6

```sql
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
WHERE (([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, NULL AS v2, NULL AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, a.k0 AS v2, a.wh0 AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a)
SELECT * FROM o0
```

no statistics:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-64)
    CO-ROUTINE a0
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 55
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 56
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 57
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 27
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 28
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 29
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 41
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 42
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 43
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-64)
SCAN o0
```

after ANALYZE:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-64)
    CO-ROUTINE a0
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 55
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 56
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 57
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 27
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 28
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 29
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 41
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 42
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 43
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-64)
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
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
WHERE (([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2024-05-20'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, NULL AS v2, NULL AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, a.k0 AS v2, a.wh0 AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1)
SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.ck0, o.v0, o.v1, o.v2, o.vl2, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1 LIMIT 201
```

no statistics:

```
MATERIALIZE o1
  CO-ROUTINE (subquery-164)
    MATERIALIZE il1
      MATERIALIZE s1
        MATERIALIZE a1
          MATERIALIZE w
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            SCALAR SUBQUERY 8
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 57
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 58
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 59
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 2
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 29
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 30
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 31
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
            SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 43
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 44
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 45
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
        SCALAR SUBQUERY 5
          CO-ROUTINE __rule
            SCAN CONSTANT ROW
          SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
          CORRELATED SCALAR SUBQUERY 71
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 72
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 73
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
        CORRELATED SCALAR SUBQUERY 85
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 86
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 87
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-164)
SCAN o
BLOOM FILTER ON o1 (ck0=? AND k0=?)
SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
MATERIALIZE o1
  CO-ROUTINE (subquery-164)
    MATERIALIZE il1
      MATERIALIZE s1
        MATERIALIZE a1
          MATERIALIZE w
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            SCALAR SUBQUERY 8
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 57
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 58
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 59
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 2
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 29
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 30
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 31
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
            SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 43
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 44
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 45
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
        SCALAR SUBQUERY 5
          CO-ROUTINE __rule
            SCAN CONSTANT ROW
          SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
          CORRELATED SCALAR SUBQUERY 71
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 72
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 73
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
        CORRELATED SCALAR SUBQUERY 85
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 86
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 87
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-164)
SCAN o
BLOOM FILTER ON o1 (ck0=? AND k0=?)
SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
USE TEMP B-TREE FOR ORDER BY
```

## Run 2 past day, statement 6

```sql
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
WHERE (([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2024-05-20'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, NULL AS v2, NULL AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, a.k0 AS v2, a.wh0 AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a)
SELECT * FROM o0
```

no statistics:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-64)
    CO-ROUTINE a0
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 55
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 56
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 57
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 27
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 28
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 29
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 41
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 42
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 43
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-64)
SCAN o0
```

after ANALYZE:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-64)
    CO-ROUTINE a0
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 55
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 56
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 57
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 27
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 28
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 29
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 41
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 42
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 43
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-64)
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
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
WHERE (([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, NULL AS v2, NULL AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, a.k0 AS v2, a.wh0 AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1)
SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.ck0, o.v0, o.v1, o.v2, o.vl2, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1 LIMIT 201
```

no statistics:

```
MATERIALIZE o1
  CO-ROUTINE (subquery-164)
    MATERIALIZE il1
      MATERIALIZE s1
        MATERIALIZE a1
          MATERIALIZE w
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            SCALAR SUBQUERY 8
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 57
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 58
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 59
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 2
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 29
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 30
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 31
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
            SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 43
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 44
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 45
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
        SCALAR SUBQUERY 5
          CO-ROUTINE __rule
            SCAN CONSTANT ROW
          SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
          CORRELATED SCALAR SUBQUERY 71
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 72
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 73
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
        CORRELATED SCALAR SUBQUERY 85
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 86
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 87
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-164)
SCAN o
BLOOM FILTER ON o1 (ck0=? AND k0=?)
SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
MATERIALIZE o1
  CO-ROUTINE (subquery-164)
    MATERIALIZE il1
      MATERIALIZE s1
        MATERIALIZE a1
          MATERIALIZE w
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            SCALAR SUBQUERY 8
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 57
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 58
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 59
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 2
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 29
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 30
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 31
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
            SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 43
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 44
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 45
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
        SCALAR SUBQUERY 5
          CO-ROUTINE __rule
            SCAN CONSTANT ROW
          SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
          CORRELATED SCALAR SUBQUERY 71
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 72
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 73
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
        CORRELATED SCALAR SUBQUERY 85
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 86
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 87
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-164)
SCAN o
BLOOM FILTER ON o1 (ck0=? AND k0=?)
SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
USE TEMP B-TREE FOR ORDER BY
```

## Run 3 largest balance, statement 6

```sql
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
WHERE (([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, NULL AS v2, NULL AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, a.k0 AS v2, a.wh0 AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('balance' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a)
SELECT * FROM o0
```

no statistics:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-64)
    CO-ROUTINE a0
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 55
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 56
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 57
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 27
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 28
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 29
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 41
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 42
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 43
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-64)
SCAN o0
```

after ANALYZE:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-64)
    CO-ROUTINE a0
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 55
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 56
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 57
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 27
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 28
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 29
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 41
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 42
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 43
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-64)
SCAN o0
```

## Run 4 with activity, statement 1

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

## Run 4 with activity, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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

## Run 4 with activity, statement 3

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

## Run 4 with activity, statement 4

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

## Run 4 with activity, statement 5

```sql
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
WHERE (([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, NULL AS v2, NULL AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('activity' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, a.k0 AS v2, a.wh0 AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1)
SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.ck0, o.v0, o.v1, o.v2, o.vl2, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1 LIMIT 201
```

no statistics:

```
MATERIALIZE o1
  CO-ROUTINE (subquery-164)
    MATERIALIZE il1
      MATERIALIZE s1
        MATERIALIZE a1
          MATERIALIZE w
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            SCALAR SUBQUERY 8
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 57
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 58
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 59
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 2
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 29
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 30
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 31
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
            SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 43
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 44
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 45
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
        SCALAR SUBQUERY 5
          CO-ROUTINE __rule
            SCAN CONSTANT ROW
          SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
          CORRELATED SCALAR SUBQUERY 71
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 72
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 73
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
        CORRELATED SCALAR SUBQUERY 85
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 86
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 87
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-164)
SCAN o
BLOOM FILTER ON o1 (ck0=? AND k0=?)
SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
MATERIALIZE o1
  CO-ROUTINE (subquery-164)
    MATERIALIZE il1
      MATERIALIZE s1
        MATERIALIZE a1
          MATERIALIZE w
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            SCALAR SUBQUERY 8
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 57
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 58
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 59
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 2
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 29
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 30
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 31
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
            SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 43
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 44
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 45
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
        SCALAR SUBQUERY 5
          CO-ROUTINE __rule
            SCAN CONSTANT ROW
          SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
          CORRELATED SCALAR SUBQUERY 71
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 72
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 73
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
        CORRELATED SCALAR SUBQUERY 85
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 86
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 87
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-164)
SCAN o
BLOOM FILTER ON o1 (ck0=? AND k0=?)
SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
USE TEMP B-TREE FOR ORDER BY
```

## Run 4 with activity, statement 6

```sql
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
WHERE (([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, NULL AS v2, NULL AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('activity' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, a.k0 AS v2, a.wh0 AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a)
SELECT * FROM o0
```

no statistics:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-64)
    CO-ROUTINE a0
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 55
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 56
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 57
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 27
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 28
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 29
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 41
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 42
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 43
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-64)
SCAN o0
```

after ANALYZE:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-64)
    CO-ROUTINE a0
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 55
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 56
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 57
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 27
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 28
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 29
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 41
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 42
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 43
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-64)
SCAN o0
```

## Run 5 five vendors, statement 1

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

## Run 5 five vendors, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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

## Run 5 five vendors, statement 3

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

## Run 5 five vendors, statement 4

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

## Run 5 five vendors, statement 5

```sql
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
WHERE (([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18') AND (NULLIF([[t2.id]], '') IN (SELECT +value FROM json_each('["319ojli62y9y3hl","ci0ce0ymf8a9dp8","ixz1ubxx6iksxst","kqexja4z8cz3vqj","vz0huxaj11qd300"]'))))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, NULL AS v2, NULL AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, a.k0 AS v2, a.wh0 AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1)
SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.ck0, o.v0, o.v1, o.v2, o.vl2, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1 LIMIT 201
```

no statistics:

```
MATERIALIZE o1
  CO-ROUTINE (subquery-165)
    MATERIALIZE il1
      MATERIALIZE s1
        MATERIALIZE a1
          MATERIALIZE w
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            SCALAR SUBQUERY 8
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 58
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 59
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 60
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 2
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 30
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 31
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 32
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
            SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 44
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 45
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 46
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            LIST SUBQUERY 10
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
        SCALAR SUBQUERY 5
          CO-ROUTINE __rule
            SCAN CONSTANT ROW
          SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
          CORRELATED SCALAR SUBQUERY 72
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 73
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 74
            SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
          SCAN __rule
          SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCAN a
    SCAN a
    CORRELATED SCALAR SUBQUERY 19
      SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 86
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 87
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 88
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-165)
SCAN o
BLOOM FILTER ON o1 (ck0=? AND k0=?)
SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
MATERIALIZE o1
  CO-ROUTINE (subquery-165)
    MATERIALIZE il1
      MATERIALIZE s1
        MATERIALIZE a1
          MATERIALIZE w
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            SCALAR SUBQUERY 8
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 58
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 59
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 60
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 2
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 30
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 31
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 32
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
            SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 44
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 45
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 46
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            LIST SUBQUERY 10
              SCAN json_each VIRTUAL TABLE INDEX 1:
              CREATE BLOOM FILTER
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
        SCALAR SUBQUERY 5
          CO-ROUTINE __rule
            SCAN CONSTANT ROW
          SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
          CORRELATED SCALAR SUBQUERY 72
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 73
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 74
            SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
          SCAN __rule
          SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCAN a
    SCAN a
    CORRELATED SCALAR SUBQUERY 19
      SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 86
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 87
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 88
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-165)
SCAN o
BLOOM FILTER ON o1 (ck0=? AND k0=?)
SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
USE TEMP B-TREE FOR ORDER BY
```

## Run 5 five vendors, statement 6

```sql
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
WHERE (([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18') AND (NULLIF([[t2.id]], '') IN (SELECT +value FROM json_each('["319ojli62y9y3hl","ci0ce0ymf8a9dp8","ixz1ubxx6iksxst","kqexja4z8cz3vqj","vz0huxaj11qd300"]'))))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, NULL AS v2, NULL AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, a.k0 AS v2, a.wh0 AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a)
SELECT * FROM o0
```

no statistics:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-65)
    CO-ROUTINE a0
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 56
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 57
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 58
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 28
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 29
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 30
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 42
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 43
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 44
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      LIST SUBQUERY 10
        SCAN json_each VIRTUAL TABLE INDEX 1:
        CREATE BLOOM FILTER
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-65)
SCAN o0
```

after ANALYZE:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-65)
    CO-ROUTINE a0
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 56
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 57
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 58
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 28
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 29
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 30
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 42
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 43
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 44
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      LIST SUBQUERY 10
        SCAN json_each VIRTUAL TABLE INDEX 1:
        CREATE BLOOM FILTER
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-65)
SCAN o0
```

## Run 5 five vendors, statement 7

```sql
WITH r0 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1)))
SELECT o.v AS v, o.l AS l, o.lc AS lc, o.g AS g FROM (SELECT CAST(NULLIF([[t1.id]], '') AS TEXT) AS v, COALESCE(min(NULLIF(CAST([[t1.display_name]] AS TEXT), '')), '') AS l, min(NULL) AS lc, NULL AS g, NULL AS k
FROM r0 t1
WHERE 1 AND CAST(NULLIF([[t1.id]], '') AS TEXT) IS NOT NULL
GROUP BY 1) o
WHERE 1 AND o.v IN (SELECT +value FROM json_each('["319ojli62y9y3hl","ci0ce0ymf8a9dp8","ixz1ubxx6iksxst","kqexja4z8cz3vqj","vz0huxaj11qd300"]'))
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

## Run 6 vendor opened, statement 1

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

## Run 6 vendor opened, statement 2

```sql
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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

## Run 6 vendor opened, statement 3

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

## Run 6 vendor opened, statement 4

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

## Run 6 vendor opened, statement 5

```sql
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
WHERE (([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, NULL AS v2, NULL AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, a.k0 AS v2, a.wh0 AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1)
SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.ck0, o.v0, o.v1, o.v2, o.vl2, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1 LIMIT 201
```

no statistics:

```
MATERIALIZE o1
  CO-ROUTINE (subquery-164)
    MATERIALIZE il1
      MATERIALIZE s1
        MATERIALIZE a1
          MATERIALIZE w
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            SCALAR SUBQUERY 8
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 57
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 58
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 59
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 2
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 29
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 30
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 31
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
            SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 43
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 44
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 45
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
        SCALAR SUBQUERY 5
          CO-ROUTINE __rule
            SCAN CONSTANT ROW
          SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
          CORRELATED SCALAR SUBQUERY 71
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 72
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 73
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
        CORRELATED SCALAR SUBQUERY 85
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 86
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 87
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-164)
SCAN o
BLOOM FILTER ON o1 (ck0=? AND k0=?)
SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
MATERIALIZE o1
  CO-ROUTINE (subquery-164)
    MATERIALIZE il1
      MATERIALIZE s1
        MATERIALIZE a1
          MATERIALIZE w
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            SCALAR SUBQUERY 8
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 57
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 58
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 59
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 2
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 29
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 30
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 31
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
            SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 43
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 44
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 45
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
        SCALAR SUBQUERY 5
          CO-ROUTINE __rule
            SCAN CONSTANT ROW
          SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
          CORRELATED SCALAR SUBQUERY 71
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 72
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 73
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
        CORRELATED SCALAR SUBQUERY 85
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 86
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 87
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-164)
SCAN o
BLOOM FILTER ON o1 (ck0=? AND k0=?)
SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
USE TEMP B-TREE FOR ORDER BY
```

## Run 6 vendor opened, statement 6

```sql
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
WHERE (([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, NULL AS v2, NULL AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, a.k0 AS v2, a.wh0 AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a)
SELECT * FROM o0
```

no statistics:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-64)
    CO-ROUTINE a0
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 55
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 56
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 57
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 27
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 28
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 29
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 41
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 42
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 43
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-64)
SCAN o0
```

after ANALYZE:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-64)
    CO-ROUTINE a0
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 55
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 56
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 57
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 27
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 28
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 29
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 41
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 42
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 43
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-64)
SCAN o0
```

## Run 6 vendor opened, statement 7

```sql
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r3 AS (SELECT `books_journal_entries`.* FROM `books_journal_entries` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
gord AS MATERIALIZED (SELECT key AS __g, json_extract(value, '$[0]') AS g0, json_extract(value, '$[1]') AS g1 FROM json_each('[["wafzfgk0c2teyzz","USD"]]')),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6, NULLIF(substr([[t1.date]], 1, 10), '') AS h7, NULLIF([[t5.posted_at]], '') AS h8, [[t1.position]] AS h9, NULLIF([[t5.doc_type]], '') AS h10, NULLIF([[t5.origin]], '') AS h11, [[t9.number]] AS h12, [[t5.number]] AS h13, [[t1.memo]] AS h14, [[t5.memo]] AS h15, [[t5.document]] AS h16, NULLIF([[t5.id]], '') AS h17
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
LEFT JOIN r3 t5 ON [[t5.id]] = [[t1.entry]]
LEFT JOIN r3 t9 ON [[t9.id]] = [[t5.reverses]]
WHERE ((([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))) AND [[t1.vendor]] IN (SELECT g0 FROM gord WHERE g0 IS NOT NULL)),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
ws AS (SELECT w.* FROM w WHERE EXISTS (SELECT 1 FROM s1 p WHERE p.k0 IS w.k0 AND p.ck0 IS w.ck0))
SELECT * FROM (SELECT d.*, gord.__g AS __g FROM (SELECT w.__id AS __id, w.k0 AS k0, w.ck0 AS ck0, w.h7 AS s0, w.h8 AS s1, w.h9 AS s2, (CASE WHEN (w.rc0 IS NULL OR w.rc0 = '') THEN 1 ELSE 0 END) AS s3, tc_round((CASE WHEN ('name' IS 'balance') THEN COALESCE((COALESCE(w.h5, 0) - COALESCE(w.h6, 0)), 0) ELSE 0 END), 0) AS s4, lower(w.rc1) AS s5, w.c0 AS v0, NULL AS vcur0, NULL AS vmx0, w.wh0 AS vl0, NULL AS vc0, COALESCE((COALESCE(w.h5, 0) - COALESCE(w.h6, 0)), 0) AS v1, NULL AS vcur1, NULL AS vmx1, NULL AS vl1, NULL AS vc1, w.c2 AS v2, NULL AS vcur2, NULL AS vmx2, w.wh1 AS vl2, NULL AS vc2, (COALESCE(w.h7, '') || COALESCE(' · ', '') || COALESCE((CASE WHEN ((w.h10 IS 'bill') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill' WHEN ((w.h10 IS 'bill_payment') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill payment' WHEN ((w.h10 IS 'credit_memo') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Credit memo' WHEN ((w.h10 IS 'expense') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Expense' WHEN ((w.h10 IS 'invoice') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Invoice' WHEN ((w.h10 IS 'payment') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Payment' WHEN ((w.h10 IS 'refund_receipt') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Refund receipt' WHEN ((w.h10 IS 'sales_receipt') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Sales receipt' WHEN ((w.h10 IS 'transfer') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Transfer' WHEN ((w.h10 IS 'vendor_credit') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor credit' WHEN ((w.h10 IS 'vendor_refund') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor refund' WHEN ((w.h10 IS 'write_off') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Write-off' WHEN (w.h11 IS 'reversal') THEN (CASE WHEN (w.h12 IS NULL OR w.h12 = '') THEN 'Reversal' ELSE (COALESCE('Reversal', '') || COALESCE(' of ', '') || COALESCE(w.h12, '')) END) WHEN (w.h11 IS 'void_reversal') THEN (CASE WHEN (w.h12 IS NULL OR w.h12 = '') THEN 'Void reversal' ELSE (COALESCE('Void reversal', '') || COALESCE(' of ', '') || COALESCE(w.h12, '')) END) WHEN (w.h11 IS 'auto_reversal') THEN (CASE WHEN (w.h12 IS NULL OR w.h12 = '') THEN 'Auto reversal' ELSE (COALESCE('Auto reversal', '') || COALESCE(' of ', '') || COALESCE(w.h12, '')) END) WHEN (w.h11 IS 'manual') THEN 'Journal entry' WHEN (w.h11 IS 'opening_balance') THEN 'Opening balances' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(w.h13, '') || COALESCE(' · ', '') || COALESCE((CASE WHEN (w.h14 IS NULL OR w.h14 = '') THEN w.h15 ELSE w.h14 END), '')) AS __label, NULL AS __labelcur, (CASE WHEN ((w.h11 IS 'document') AND (w.h10 IS 'bill') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/bills/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'bill_payment') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/bill-payments/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'credit_memo') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/credit-memos/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'expense') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/expenses/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'invoice') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/invoices/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'payment') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/payments/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'refund_receipt') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/refund-receipts/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'sales_receipt') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/sales-receipts/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'vendor_credit') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/vendor-credits/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'vendor_refund') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/vendor-refunds/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'write_off') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/write-offs/', '') || COALESCE(w.h16, '')) WHEN ((w.h10 IS 'transfer') AND (w.h11 IS 'manual')) THEN (COALESCE('books/transfers/', '') || COALESCE(w.h17, '')) ELSE (COALESCE('books/entries/', '') || COALESCE(w.h17, '')) END) AS __open FROM (SELECT w.*, (SELECT COALESCE(NULLIF([[t8.display_name]], ''), '(no name)')
FROM r1 t8
WHERE [[t8.id]] IS w.c2) AS wh1 FROM (SELECT w.*, (SELECT COALESCE(NULLIF([[t7.display_name]], ''), '(no name)')
FROM r1 t7
WHERE [[t7.id]] IS w.c0) AS wh0 FROM (SELECT w.*, NULLIF([[t6.id]], '') AS rc0, [[t6.display_name]] AS rc1 FROM ws w LEFT JOIN r1 t6 ON [[t6.id]] IS w.k0) w) w) w) d JOIN gord ON d.k0 IS gord.g0 AND d.ck0 IS gord.g1) d WHERE 1 ORDER BY d.__g, (d.s0 IS NULL), d.s0, (d.s1 IS NULL), d.s1, (d.s2 IS NULL), d.s2, (d.s3 IS NULL), d.s3, (d.s4 IS NULL), d.s4 DESC, (d.s5 IS NULL), d.s5, d.__id LIMIT 201
```

no statistics:

```
MATERIALIZE gord
  SCAN json_each VIRTUAL TABLE INDEX 1:
SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
SCALAR SUBQUERY 8
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 75
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 76
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 77
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 47
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 48
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 49
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
LIST SUBQUERY 14
  SCAN gord
  CREATE BLOOM FILTER
SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 61
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 62
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 63
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 20
  MATERIALIZE s1
    CO-ROUTINE a1
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 145
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 146
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 147
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 117
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 118
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 119
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
      REUSE LIST SUBQUERY 14
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 131
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 132
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 133
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 11
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 159
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 160
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 161
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_entries USING COVERING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 11
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 173
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 174
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 175
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
      CORRELATED SCALAR SUBQUERY 187
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 188
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 189
        SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
      SCAN __rule
      SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  BLOOM FILTER ON p (k0=? AND ck0=?)
  SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 11
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 89
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 90
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 91
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 11
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 103
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 104
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 105
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 201
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 202
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 203
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
BLOOM FILTER ON gord (g0=?)
SEARCH gord USING AUTOMATIC PARTIAL COVERING INDEX (g0=?)
CORRELATED SCALAR SUBQUERY 35
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 215
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 216
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 217
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 34
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 229
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 230
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 231
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
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
LIST SUBQUERY 33
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
MATERIALIZE gord
  SCAN json_each VIRTUAL TABLE INDEX 1:
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (ANY(account) AND ANY(posted) AND vendor=?)
LIST SUBQUERY 14
  SCAN gord
SCALAR SUBQUERY 8
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 75
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 76
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 77
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 47
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 48
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 49
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 61
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 62
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 63
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 20
  MATERIALIZE s1
    CO-ROUTINE a1
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 145
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 146
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 147
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 117
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 118
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 119
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (ANY(account) AND ANY(posted) AND vendor=?)
      REUSE LIST SUBQUERY 14
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 131
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 132
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 133
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 11
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 159
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 160
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 161
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_entries USING COVERING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 11
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 173
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 174
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 175
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
      CORRELATED SCALAR SUBQUERY 187
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 188
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 189
        SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
      SCAN __rule
      SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  BLOOM FILTER ON p (k0=? AND ck0=?)
  SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
BLOOM FILTER ON books_accounts (id=?)
SEARCH books_accounts USING INDEX sqlite_autoindex_books_accounts_1 (id=?)
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 11
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 89
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 90
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 91
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 11
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 103
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 104
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 105
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 201
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 202
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 203
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
BLOOM FILTER ON gord (g0=?)
SEARCH gord USING AUTOMATIC PARTIAL COVERING INDEX (g0=?)
CORRELATED SCALAR SUBQUERY 35
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 215
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 216
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 217
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 34
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 229
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 230
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 231
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
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
LIST SUBQUERY 33
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
USE TEMP B-TREE FOR ORDER BY
```

## Run 7 CSV export, statement 1

```sql
SELECT `reports`.* FROM `reports` WHERE [[reports.shipped_key]] = 'books.vendor_balance' LIMIT 1
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
SELECT `users`.* FROM `users` WHERE `users`.`id`='zitkhlywkhk14ik' LIMIT 1
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
SELECT `reports`.* FROM `reports` WHERE `reports`.`id`='y9tnkose6kjke0b' LIMIT 1
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
SELECT DISTINCT (1) FROM `reports` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `report_shares` `reports_report_shares_via_report` ON [[reports_report_shares_via_report.report]] = [[reports.id]] WHERE (`reports`.`id`='y9tnkose6kjke0b') AND (('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND ([[reports.owner]] = 'zitkhlywkhk14ik' OR [[reports_report_shares_via_report.user]] = 'zitkhlywkhk14ik' OR ([[reports.published]] = 1 AND [[__auth_users.role]] IS NOT 'guest')))) LIMIT 1
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
SELECT DISTINCT (1) FROM `books_settings` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE (`books_settings`.`id`='bookssettings01') AND (('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1)) LIMIT 1
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
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
w AS MATERIALIZED (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
WHERE (([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, NULL AS v2, NULL AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, a.k0 AS v2, a.wh0 AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a),
pp1 AS (SELECT k0, ck0, __ord AS __p1 FROM o1)
SELECT * FROM (SELECT o.__level, o.__row, o.k0, o.ck0, o.v0, o.v1, o.v2, o.vl2, o.__ord, o.__own, o.__label, o.__labelcur, o.__n, o.__kids, o.__inline, o.__muted, pp.__p1, o.__s1_0, o.__s1_1, o.__s1_2, o.__s1_3, o.__s1_4, o.__s1_5, o.__s1_6, o.__s1_7, o.__s1_8, o.__s1_9 FROM o1 o JOIN pp1 pp ON o.k0 IS pp.k0 AND o.ck0 IS pp.ck0 WHERE 1)
WHERE 1
ORDER BY (ck0 IS NULL), ck0, __p1 LIMIT 50002
```

no statistics:

```
MATERIALIZE o1
  CO-ROUTINE (subquery-164)
    MATERIALIZE il1
      MATERIALIZE s1
        MATERIALIZE a1
          MATERIALIZE w
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            SCALAR SUBQUERY 8
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 57
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 58
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 59
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 2
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 29
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 30
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 31
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
            SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 43
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 44
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 45
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
        SCALAR SUBQUERY 5
          CO-ROUTINE __rule
            SCAN CONSTANT ROW
          SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
          CORRELATED SCALAR SUBQUERY 71
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 72
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 73
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
        CORRELATED SCALAR SUBQUERY 85
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 86
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 87
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-164)
SCAN o
BLOOM FILTER ON o1 (ck0=? AND k0=?)
SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
MATERIALIZE o1
  CO-ROUTINE (subquery-164)
    MATERIALIZE il1
      MATERIALIZE s1
        MATERIALIZE a1
          MATERIALIZE w
            SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
            SCALAR SUBQUERY 8
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 57
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 58
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 59
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 2
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 29
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 30
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 31
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
            SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
            SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
            SCALAR SUBQUERY 5
              CO-ROUTINE __rule
                SCAN CONSTANT ROW
              SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
              CORRELATED SCALAR SUBQUERY 43
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 44
                SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
              CORRELATED SCALAR SUBQUERY 45
                SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
              SCAN __rule
              SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
          SCAN w
          USE TEMP B-TREE FOR GROUP BY
        SCAN a
        SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
        SCALAR SUBQUERY 5
          CO-ROUTINE __rule
            SCAN CONSTANT ROW
          SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
          CORRELATED SCALAR SUBQUERY 71
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 72
            SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
          CORRELATED SCALAR SUBQUERY 73
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
        CORRELATED SCALAR SUBQUERY 85
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 86
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 87
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-164)
SCAN o
BLOOM FILTER ON o1 (ck0=? AND k0=?)
SEARCH o1 USING AUTOMATIC PARTIAL COVERING INDEX (ck0=? AND k0=?)
USE TEMP B-TREE FOR ORDER BY
```

## Run 7 CSV export, statement 39

```sql
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
WHERE (([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))),
a0 AS (SELECT ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY ck0),
o0 AS (SELECT 0 AS __level, NULL AS __row, NULL AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, NULL AS v2, NULL AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC) AS __ord, 1 AS __own, NULL AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, 0 AS __inline, 0 AS __muted FROM a0 a),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
il1 AS MATERIALIZED (SELECT a.*, 0 AS __inline, COALESCE((a.rc1 IS true), 0) AS __muted FROM s1 a),
o1 AS MATERIALIZED (SELECT 1 AS __level, NULL AS __row, a.k0 AS k0, a.ck0 AS ck0, NULL AS v0, a.y0 AS v1, a.k0 AS v2, a.wh0 AS vl2, ROW_NUMBER() OVER (PARTITION BY a.ck0 ORDER BY ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL), (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END), (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL), tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) DESC, (lower(a.rc0) IS NULL), lower(a.rc0), ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL), (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')), (a.k0 IS NULL), a.k0) AS __ord, 1 AS __own, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __label, NULL AS __labelcur, a.__n AS __n, NULL AS __kids, a.__inline AS __inline, a.__muted AS __muted, ((CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) IS NULL) AS __s1_0, (CASE WHEN (a.rc2 IS NULL OR a.rc2 = '') THEN 1 ELSE 0 END) AS __s1_1, (tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) IS NULL) AS __s1_2, tc_round((CASE WHEN ('name' IS 'balance') THEN a.y0 ELSE 0 END), 0) AS __s1_3, (lower(a.rc0) IS NULL) AS __s1_4, lower(a.rc0) AS __s1_5, ((COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) IS NULL) AS __s1_6, (COALESCE(COALESCE(a.rc0, 'No vendor'), '') || COALESCE((CASE WHEN (a.rc1 IS true) THEN ' (inactive)' ELSE '' END), '')) AS __s1_7, (a.k0 IS NULL) AS __s1_8, a.k0 AS __s1_9 FROM (SELECT a.*, (SELECT COALESCE(NULLIF([[t5.display_name]], ''), '(no name)')
FROM r1 t5
WHERE [[t5.id]] IS a.k0) AS wh0 FROM il1 a) a)
SELECT * FROM o0
```

no statistics:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-64)
    CO-ROUTINE a0
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 55
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 56
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 57
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 27
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 28
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 29
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 41
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 42
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 43
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-64)
SCAN o0
```

after ANALYZE:

```
CO-ROUTINE o0
  CO-ROUTINE (subquery-64)
    CO-ROUTINE a0
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 55
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 56
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 57
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 27
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 28
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 29
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 41
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 42
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 43
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      USE TEMP B-TREE FOR GROUP BY
    SCAN a
    USE TEMP B-TREE FOR ORDER BY
  SCAN (subquery-64)
SCAN o0
```

## Run 7 CSV export, statement 40

```sql
WITH r0 AS (SELECT `books_journal_lines`.* FROM `books_journal_lines` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r1 AS (SELECT `books_vendors`.* FROM `books_vendors` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r2 AS (SELECT `books_accounts`.* FROM `books_accounts` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
r3 AS (SELECT `books_journal_entries`.* FROM `books_journal_entries` WHERE EXISTS (SELECT (1) FROM (SELECT 1) `__rule` LEFT JOIN `users` `__auth_users` ON `__auth_users`.`id`='zitkhlywkhk14ik' LEFT JOIN `books_access` `__collection_alias_me` WHERE ('zitkhlywkhk14ik' IS NOT '' AND [[__auth_users.disabled]] IS NOT 1 AND [[__collection_alias_me.user]] = 'zitkhlywkhk14ik' AND [[__collection_alias_me.can_read]] = 1))),
gord AS MATERIALIZED (SELECT key AS __g, json_extract(value, '$[0]') AS g0, json_extract(value, '$[1]') AS g1 FROM json_each('[["wafzfgk0c2teyzz","USD"],["319ojli62y9y3hl","USD"],["ci0ce0ymf8a9dp8","USD"],["ixz1ubxx6iksxst","USD"],["kqexja4z8cz3vqj","USD"],["vz0huxaj11qd300","USD"],["ht29sfxm5bbveg5","USD"],["h4szy8vfxuwf9p5","USD"],["nbe1cwe5wjqfm6m","USD"],["1kr52p08t93s9dt","USD"],["ni69atve834j8k0","USD"],["4bpn2d3akin3cvn","USD"],["lu602opx84qa6z6","USD"],["qyp5onu5srcuwso","USD"],["zgusv2dhfaalsx0","USD"],["bx62vfmxfvpp9zg","USD"],["cj3mjj0jbmq84sn","USD"],["5njhlidcch3ybzg","USD"],["ab8kbkug22wvn24","USD"],["pip3c3rlo0xkdr5","USD"],["y3qn5exnjrv9qjx","USD"],["m5jck65zk7zj0ea","USD"],["eaatcuywobelp6h","USD"],["z9b07pknfhin17o","USD"],["cgjyh45td4spi5x","USD"],["dpakvn6zn2o53pc","USD"],["oczxowwepg1y7t5","USD"],["f0w06wm5tgi6uo9","USD"],["yb5sauaevx901gs","USD"],["d6yi6vmujfsw9f9","USD"],["twxs9hmv6pfl3xd","USD"],["hkxmdvn0hdnij21","USD"],["0z2w46hcfd8wzph","USD"],["m9qgzcolduy1v6e","USD"],["49ui4i0cj44ded8","USD"],["hycany4nhjgskd2","USD"],["k7i3qfwr3vnhxq7","USD"],["zse18snczgwspuz","USD"],["2ndiu1pm7a68kup","USD"],["iz8h00lprxgfokx","USD"],["err6krvrfqyik5l","USD"],["3uyfacr4kxk3lub","USD"],["hxm7cji0khazioi","USD"],["wljusc655w45zmi","USD"],["sjvf6tlo7vabpdd","USD"],["oggsymbf47y2k8u","USD"],["x5uagzrnz978l19","USD"],["vun2y629taekbfj","USD"],["s4e94j8bu1mhc7m","USD"],["9gju0cifp9p89qz","USD"],["826vh680h9npaoa","USD"],["hxuehpupys2izkd","USD"],["p1i3ay9ie6u384r","USD"],["x7yb7txmlp3k7mz","USD"],["v1g0dv4xpnystma","USD"],["gvjz6nuuuvsurwn","USD"],["so9uk9j3r74qpe8","USD"],["ibvhgjuzljo2p1m","USD"],["iavxgol7mexnjhx","USD"],["wy8r6nacol6lbn1","USD"],["u4euuty0xkivfyu","USD"],["ojiraf1zeljicta","USD"],["p5jn56ydmr9d8qa","USD"],["0qxa8ngenq2ln7o","USD"],["ghkwg0aqe55k3yg","USD"],["xqked8ft5iz5cw9","USD"],["yk4d2izsgk21a60","USD"],["m2i3fk5tb0dau6t","USD"],["gcpbricybxy2ble","USD"],["l87ck2l7dnabupa","USD"],["o10n72w49qzzepv","USD"],["2my5hhip8u23q4v","USD"],["af117zsy4ly1khn","USD"],["izy1xq3q3sn90p6","USD"],["lk2xvxgnkhp54nq","USD"],["hueh2lh55wpp1te","USD"],["jkgsmg0bp586zor","USD"],["gjqdc09c89yeh7w","USD"],["a6z461sxw2ylxuy","USD"],["qiftbpn5vn23vr2","USD"],["xdgftsoq345f2ho","USD"],["alf7wv4jpofsb9y","USD"],["bmr2k8zp1mza7we","USD"],["w9ec63oivhwjbke","USD"],["dq044lk436pqunn","USD"],["e2zqym3dxd1hxjb","USD"],["g56v96muh08evh1","USD"],["ipbblq70h91bkov","USD"],["epg4i8ncbqd9lze","USD"],["xjfplxf1xksv7cf","USD"],["v2qax0zmloja652","USD"],["z3ogm7vr38xb1h1","USD"],["u5swr68lyf0271w","USD"],["r4rmiep7nps9vm4","USD"],["rai3adwbwxlrcoe","USD"],["c35q2curd9vbtml","USD"],["lbh3yl3nl5lqnni","USD"],["jwv8jdfbzpvpp5g","USD"],["zoyy6vyigen4dp5","USD"],["mhcqs2fkg3st141","USD"],["8qg3pqg1mce3u34","USD"],["oi5x33g06lk08zg","USD"],["s1lrpakchdwnwel","USD"],["onu22sxpdtnwn6v","USD"],["qyafz4t2867mt97","USD"],["b7e4vcqgyhjf45a","USD"],["jymdzswdn72xejv","USD"],["um0r5moagi8kjow","USD"],["xx5ncihnidf28lp","USD"],["v109mb5db0v22cs","USD"],["an0wgjqrn3xod2y","USD"],["385y1h0ilgcz8vo","USD"],["ztg0dehkmi046nk","USD"],["jvkz65dxjbmkyez","USD"],["f4uqqu8viixobd2","USD"],["chti1l6wro1243j","USD"],["zlqudi9r78zo6eq","USD"],["qd1fmbb65pd07k6","USD"],["a38ne7qrqi5y3c5","USD"],["d3g4x0gqyhudusc","USD"],["z5nf5lj7hud3nu4","USD"],["lhcm2yp775e5z0n","USD"],["5h45ryjj155gvr4","USD"],["glf04l5m53del0u","USD"],["nr8gu7o3r5kb6y6","USD"],["vx7x66adh8rginv","USD"],["c932hx52bvyqeyw","USD"],["x3cvt8paza3detj","USD"],["0xjadn5kkwafpdf","USD"],["1uc3zv6yamyz2go","USD"],["grao1nj7lxwiqbq","USD"],["roowgcilb3yw934","USD"],["0qt3wzphb0trcvt","USD"],["keffng8i0e2zcj6","USD"],["091fe591wb9kzka","USD"],["q9u6zqqgbhl41f0","USD"],["s3r2vcl9cutvn95","USD"],["kernsg6ji6jf3xz","USD"],["dx3nvcw7k5050lg","USD"],["x42uduqyc2c32wt","USD"],["jhebig1czzuibcw","USD"],["a0n2bn9l9cx84p3","USD"],["r4dode90kc2o38x","USD"],["6dmi9o7iyyhwunk","USD"],["8mg28ounejodvfn","USD"],["f5w2kukwz0qo3ir","USD"],["k38b44pbrvsx5fl","USD"],["8objqawldkrgggb","USD"],["n5f21yx4j2slj4g","USD"],["yz1esxzfcf4d4sc","USD"],["0nk1boqlz1l2wvy","USD"],["kyl7yaadz0sbms0","USD"],["2zu43or7n1ws96f","USD"],["fwybp2lpgesqnn8","USD"],["98j34y7zh9iz57w","USD"],["9q1ko6qm344bf2c","USD"],["pzcn49c471wz4xd","USD"],["e7va0yfg0kajgy0","USD"],["lvwveyihboygwwh","USD"],["szjzffu3l6aftdm","USD"],["pjww3p3y4yk6ir6","USD"],["t2idz99qjhufp2q","USD"],["tnnn5gqx7aeq3au","USD"],["5p69fe8ktyds7un","USD"],["qlaqcxvqo6l1hwd","USD"],["po4vn65izpfjrqx","USD"],["isxlbbahoyfjq68","USD"],["ocgu0wuuuda46yq","USD"],["v3s6k06da5v73zt","USD"],["oyr1hwdxon8mfsi","USD"],["phplc2sxy2n6xyk","USD"],["1358lddbrantjyh","USD"],["tko6wz6zuga4zr1","USD"],["6a3z1vteadil7p0","USD"],["saj9r1bd2g3qxul","USD"],["59j132h9t6tfb61","USD"],["5d1swuiyiue06s3","USD"],["06m24xikjrd99wo","USD"],["pt2m5kc7vu1upzm","USD"],["850ezo5u22z8sgc","USD"],["eeat6mebf33gapa","USD"],["jkuj6nw1c4effkm","USD"],["jebv1jgdixr135o","USD"],["rb5fyerunpxpdfl","USD"],["wnixo11nszx7u6y","USD"],["lk4pdyebzthly2u","USD"],["b6haz9nv6a4eaw5","USD"],["7l3u27vbpl9544k","USD"],["hvxksqxgll7go4r","USD"],["qdxcblsywzuabfr","USD"],["9gdd28m5yor14ha","USD"],["5wfxjggf303iah8","USD"],["xf7e3g065pbji7c","USD"],["wehlj1hcg04r90s","USD"],["iqqz4kmyzmb37c9","USD"],["sxwp6kgy9p7vkys","USD"],["q8ayebdinsmu36j","USD"],["d06uyjq0x5fh0os","USD"],["7jbhjcojs6rd0b4","USD"],["e1txs1d6usp1adf","USD"],["is3kamhjfzkhds1","USD"],["z53t15lyl3qbmr9","USD"],["pstzs4ll63rhqe7","USD"],["89p3o7r7kzj8o2g","USD"],["zwvwita5gv92x88","USD"],["7fo32ib7b6xlq14","USD"],["lh13yw6e70kxb1l","USD"],["ywttwd8a6lq0bpr","USD"],["v7ddzu5jn59r36n","USD"],["c8w53iurpng2ezt","USD"],["tkpkvoo284je7kz","USD"],["b0otyuxjes76gyc","USD"],["hyqtkghaqp2prow","USD"],["a5g1khdu0ihgvnf","USD"],["csszbkozx73n8ug","USD"],["r27ylmx525qk3ux","USD"],["lk44g8mxs0opvjo","USD"],["mdibndxfuyo4rlg","USD"],["x57igihqgn6v9gn","USD"],["evt13bk531v6qk8","USD"],["zwll54r0uhnt1xk","USD"],["8vh3nc3ywqibcbf","USD"],["pln5sig5bqrbxlh","USD"],["p6pciyxqj7xbqvp","USD"],["gmhebhiq4rbdpwt","USD"],["4ojf2eelh7mceog","USD"],["y4cahy8wsaw6f9o","USD"],["13gvyvrgdgw6frb","USD"],["pxvg2iaqrzegknh","USD"],["ynldsqfdpw7zjhs","USD"],["arjglz224c1qurs","USD"],["1lb76itc7fb8u32","USD"],["khr9as09tuupj3h","USD"],["ndkyc1qoi65jvdk","USD"],["tfjlloaa64fenqx","USD"],["w705iy2rp8qo5yg","USD"],["u0vjp7kiof9kag0","USD"],["fcewjzizb3296bi","USD"],["m9bezcd61et37gm","USD"],["2j0b87z1gqx7z7e","USD"],["xl0i3h2s0h7cyx2","USD"],["18uszxzqx26ofif","USD"],["68jelgkzuoraoj3","USD"],["ioczco8rzfhn3ns","USD"],["b4vzih9vks2sw9q","USD"],["ln4rbcq4293vnjo","USD"],["n1u3elfoy6s2sk8","USD"],["gl34ymk8bjo6e4b","USD"],["y776bk3p42sbch5","USD"],["ym7l61xfmi0yryz","USD"],["xhlbur1miqsyuyg","USD"],["bwor8aisudp8mpy","USD"],["gxxmvcka7fqdylf","USD"],["6jwmosuw7zcw355","USD"],["wz6a822mmu0707v","USD"],["jiae5dbkscwvm3r","USD"],["rjbd20ppmdacy3n","USD"],["7l1x31w5fhodmmj","USD"],["42cb49wl60cc6sp","USD"],["lshlti0necvn8fa","USD"],["h06wgbkvd44oy12","USD"],["ketutk4r5bjgm3b","USD"],["u14n3syuivmotem","USD"],["gkko1cxkosz3ve6","USD"],["cpttp27pwpjqkcv","USD"],["cgmtuc6226vux0c","USD"],["xl5b29y32zr39du","USD"],["n7mhbomj3cv5z8r","USD"],["0ejnrjqvpumr2fc","USD"],["2lx4cbks0ftzcj3","USD"],["sekz2vi5a99jose","USD"],["9hevahn60avpp9s","USD"],["or3lzhfznytox12","USD"],["t1px2zvobnbi9se","USD"],["buc8h8ec7qs4j2t","USD"],["hxq6zr59b29e1ia","USD"],["1ydv0z00zpovh4u","USD"],["cljzyiotvwekij2","USD"],["6shj4ybzmtfkiq0","USD"],["gaj8h7l7dvg7ky1","USD"],["dw4sf3hybgsx5j4","USD"],["dra2detn2zydj0z","USD"],["f8z6o0w4ggnfp0v","USD"],["18poakgmo3fm8dg","USD"],["2iv4ashebafuy1w","USD"],["ma2g9b8z7d80lsu","USD"],["pcbjs9yoi0husiu","USD"],["lhonkny05ssqroa","USD"],["4936gt0podmq318","USD"],["p70de4qij1izp0o","USD"],["wku242gd6un0ubn","USD"],["ygt1hkv57cjnqfd","USD"],["p5x862603q2h4if","USD"],["fbq5cpy5usdxj5o","USD"],["xwnny73lluo1p9x","USD"],["it7a77kiy798egf","USD"],["8jsye9yqsye71h3","USD"],["nbjbdhtu4buvzus","USD"],["v4bfn8dsyfk2r7i","USD"],["bsj2z8kqxke2u6b","USD"],["hiwb4yhsflsw2q0","USD"],["2qbydiv4rb2bbpm","USD"],["wdkx74mm7q4bw5v","USD"],["0ro1zona2i3jdnt","USD"],["r5emnom036mtd9z","USD"],["m35y53o84d4z91u","USD"],["j7e2qhtx53q5ysc","USD"],["nrpkqhilhrifbxx","USD"],["oxhhtrqzbnzgf0t","USD"],["9cgxfh5vq9za0hh","USD"],["677t34bnlh80tqt","USD"],["6e60pgb02lfxwyt","USD"],["jw5nqvsqadn4ry9","USD"],["bjzyesva4fais91","USD"],["jbv0us8oqz50shc","USD"],["u5onnecikwwsf9d","USD"],["0x0hv5htb8kw01x","USD"],["jiidpawgel1i97m","USD"],["28acnl9nllnhp9p","USD"],["zg91kdqa6p16vgt","USD"],["x7vdx1gmhb15hpe","USD"],["ndzix4v70e7zvpa","USD"],["kw0m69q6cnisyt6","USD"],["54schjkuxwkhn28","USD"],["c89e2myqcpgx3n1","USD"],["4rg3zhpdi3dm7eu","USD"],["rijk7ddjojvvdu9","USD"],["1dcfx6ecg7qw3rz","USD"],["6f4ro4ex8b5s3dk","USD"],["jgvpgmjcpb15mcy","USD"],["9a3cl5w5a3omixs","USD"],["ruk86wgldfdn0bf","USD"],["xyf54fptb3grv5g","USD"],["p2iq5knqqukgxld","USD"],["0rsmjqf7lbxahrg","USD"],["327q87bahqt03h5","USD"],["jgmftqlrtrgm6ku","USD"],["aqxxtyaqop2y3xz","USD"],["w1fhbmiyzpgokpl","USD"],["wg6szpou28usr7x","USD"],["0v5hoa3fu8ju8p5","USD"],["n3lz87rfvv7ckjt","USD"],["xcyyi5d4xi5mon4","USD"],["o22irs1k6bipjzn","USD"],["c12n1zrn0laq5yf","USD"],["xea31o8mgla0fau","USD"],["dp378daveb94rjv","USD"],["f98s51vvo2dob2k","USD"],["y9hbg159422m65m","USD"],["afab0s63aji2ll5","USD"],["n7ofw1t3n58e5u5","USD"],["oqtym986pncsm0v","USD"],["gsopz2v0qa7w13z","USD"],["o9b44r9b9l3uzrc","USD"],["k0lil6jaey3yra6","USD"],["fil4ds41ly3x1pz","USD"],["qq51xieei22xsgy","USD"],["ywre39d3qcs1wj3","USD"],["52ss6o1s61s9o2s","USD"],["r6x72gyky5197af","USD"],["nigasisx577quwr","USD"],["p55uhkdohuace6u","USD"],["u6uefnwb1r4o9v1","USD"],["a3yjshiokahyhjg","USD"],["28yaoys903k95i0","USD"],["gsp4g08n5vactmf","USD"],["fvjsl3uml5hu416","USD"],["a26ogv7ipv8r04q","USD"],["aijyrem7y5u4oor","USD"],["tozfx3vk9zm2u3r","USD"],["xlzoeolwsfn2x8s","USD"],["lircxx1lpmko6d0","USD"],["nu3k0nx8axfrtcr","USD"],["7zlwd6cqun2pv1n","USD"],["a81rht5ura1zq6f","USD"],["hq7grtoavlvfp31","USD"],["636o5cow2lkr2r0","USD"],["ml6ymelzn9eglcq","USD"],["c5fq5gcmd7h1rvw","USD"],["r5ukrpvzq6jo1lh","USD"],["m6cbsgxoy1pqfgr","USD"],["ozsttmvhk5uhu99","USD"],["qymoe1jadfxldw3","USD"],["w0zbuyo8slcxt60","USD"],["w1bey7szfuuztmd","USD"],["l956qogm74nr7lm","USD"],["wpshm8ohnqzjylq","USD"],["wdjy705ihao3bs7","USD"],["4mla324tvrc2x0s","USD"],["bamywrh80zj5qrp","USD"],["zuwui35x69azpu9","USD"],["qyw7d8dbyv6usn9","USD"],["1oo7d5vh4jkrcx5","USD"],["qv1woc1loxmuq4z","USD"],["il44p8169vztbh2","USD"],["18fwips4bgwhtxx","USD"],["a3nxi2h7d3hv9dh","USD"],["ke4rnox8tdzfv7c","USD"],["e3rwmx9cssknfc1","USD"],["3j6kxolgbcmnvak","USD"],["e5x88ztdvyfsrpx","USD"],["nq5fgoao7ubcfhd","USD"],["emd9t4mxbl75y1k","USD"],["ofiqwp6xwge7ee5","USD"],["qh5ztd2dbv93mq7","USD"],["30qspp2tvugkpn5","USD"],["dz31vr2qtcl0ghy","USD"],["goeise1t72ays7y","USD"],["63nplqisbf0nlf2","USD"],["lovhy5tpxx0h97s","USD"],["tcttjipmgpkmsjh","USD"],["8pr9vdslg0grekr","USD"],["zpim941gja4tmyn","USD"],["fkfg9op197q0z5q","USD"],["sv2qqnvp6qkwvgv","USD"],["s6p1t52sx5hft97","USD"],["elugtk2nkja0rko","USD"],["z4hhn0bzyy03mwp","USD"],["9l5lceoka6f85k0","USD"],["pkp7p1qb3m5uuhp","USD"],["7xgxdo1qczfad3p","USD"],["bmsl08r19e68zcs","USD"],["9mf56ntmakpm38i","USD"],["yw9cojwlwu5u0og","USD"],["wyvaraza4jgv2f5","USD"],["af7b7h4fjztvi2o","USD"],["5rttmx5ybm815tw","USD"],["szpq7hon99hio9i","USD"],["cijzkcz0j35qj1s","USD"],["i0xc34ey7tyhobb","USD"],["ov2sxd6jzb9ewah","USD"],["13y9u72qsogtpip","USD"],["7bs4wq44e44uuqw","USD"],["8yqly7pq2gct7kk","USD"],["saksvo0hiddnh44","USD"],["34tcy2lyvu748oh","USD"],["4damqg8fhcj5o0l","USD"],["nmk4cq5eci3omvd","USD"],["6mvg3dfhhbyz4t4","USD"],["t6aemhy01538cyp","USD"],["64hvefcf95gaxc1","USD"],["x80xsulug308qap","USD"],["o4jkqy6r8zd1feu","USD"],["xpr4k32i7nn5c7q","USD"],["3d8xhie76vsaodg","USD"],["u3trz3pbv99kghj","USD"],["xl6lxp84m682h51","USD"],["cvflqu1ps64siti","USD"],["hzx1ee16ruyrzam","USD"],["o82x4ci7gel9i58","USD"],["db0tij47qokuwmx","USD"],["uf94fdxw7lc9pkq","USD"],["zmjf5ebbc075549","USD"],["qsc80pnpal5vtxr","USD"],["a7xunnrc6n51gc1","USD"],["9q84yp9hdnklvjv","USD"],["6wohikico6s7l6c","USD"],["4kyut8vlgnfymlq","USD"],["kzuk16jealulzyy","USD"],["oabdtjhtu60alcy","USD"],["9wtrsf7rg1qo33s","USD"],["iisi9zg4vgm8ucf","USD"],["lj7ixnlyi9r7axs","USD"],["igiismznn6ok6z6","USD"],["p2jnwjntdd7ja5p","USD"],["gmr7xna7j7mlwa8","USD"],["ykwxfk21u5cdcv6","USD"],["atlf6mmaouxioqn","USD"],["fkf5mjnotpveai9","USD"],["7la1z9k9nw9gopp","USD"],["p6ngmk8zj8fdp7k","USD"],["7ettdspszpcgtz6","USD"],["r7asddqfjm70772","USD"],["t5wcd4mdlnb8k3v","USD"],["2rmoc84kq8gbl2r","USD"],["pn8by7c7fyqaiqx","USD"],["30nu1i9t9zjfc8w","USD"],["tzk1aannkokin9c","USD"],["x501p65oy775vej","USD"],["7muplcb14p6s4uc","USD"],["18c2rotv5quyxk7","USD"],["gfmuvneyh72tc1c","USD"],["0gkb0jzn48i41qy","USD"],["p5y89sbgh6vx9be","USD"],["n1pk72k96enrk58","USD"],["i4zwbuvecz8pw8y","USD"],["vy2sk8a3qgizkef","USD"],["8k65qn0k01tqmrc","USD"],["fllk95bqs79cq08","USD"],["xe9wqry8dxhguz8","USD"],["v1bwtc6fso1m070","USD"],["qkzdu78aa3ah538","USD"],["mi6hlop8r5oxukj","USD"],["8rgu3tmg641ztdl","USD"],["zfhx5hglczyhcek","USD"],["ak790byzrp8u2mk","USD"],["gvq9u4jyn67cnme","USD"],["zqx2k83kut0xmh0","USD"],["xaob4nkxrl43df5","USD"],["im8kvttvg48sfhd","USD"],["gqn13lgk8t29pie","USD"],["os020pobzyo281j","USD"],["3ict1or2jsfjq8n","USD"],["x82b9uz7ykga7nk","USD"],["0qfxuv5mxvicuoy","USD"],["na3r4fvboy9yw5v","USD"],["jh6fom9gkhv55fe","USD"],["ptopwuocydzp5vf","USD"],["vemkb72eha4fhi8","USD"],["6x0mrp4abfxxdyh","USD"],["qa3nqtgz9opj61m","USD"],["glper8xvhpk9bte","USD"],["cu99c4w43awxird","USD"],["u65myxu3c384p1r","USD"],["2u4divk9y2z718b","USD"],["mbcnkeubb7j5i8h","USD"],["1sccn3cu1gm3um5","USD"],["1zeskpnbrn6u13o","USD"],["byogx3kqrcdhv0k","USD"],["s9kjx0egqjyc95h","USD"],["gq4khjzgpwe6z0u","USD"],["ehd1b3u435q7cwv","USD"],["wyowf7z4ay17n0u","USD"],["38sqv7tqy4xhs13","USD"],["bcuap7nszovtz4n","USD"],["wz7mu9iqbe7xv0q","USD"],["8e6lkngjuo2oftd","USD"],["olgz7xvx5ar0447","USD"],["lobmft6eke8laot","USD"],["weir1ondim4blyh","USD"],["hcdnaznh6udc52s","USD"],["0r9nezx58n9fixh","USD"],["0jxz7tixfyv9kty","USD"],["twqtyvzyqvfhxz3","USD"],["lobijbzaflh0q7b","USD"],["auafp12iq3t2o01","USD"],["rcpcjbqjo3urlkw","USD"],["zfmf9jh0g7kjm0c","USD"],["bzij9jz28ujtoxg","USD"],["e6810ib6e5se5wm","USD"],["r5p3zls4gqhft90","USD"],["m0m0btnxwyabrms","USD"],["7z422siznxjbf9o","USD"],["t6frormar63wfy0","USD"],["grle8vo12rxskoy","USD"],["zketgdw11pvqyqv","USD"],["7th0linv11qbv1q","USD"],["4tvnsqpkmqiwkqx","USD"],["oyn7f9z7bvp8bbw","USD"],["o80sj48s3ujamto","USD"],["9wr2lttk5bfcmra","USD"],["30oo16iotlwylvx","USD"],["nnfrovt95yd3awe","USD"],["mi1otmonp2i2s6g","USD"],["dxsi286nr3rj2nh","USD"],["yr5zw06pwt2l4e7","USD"],["bpswaqinsliaos9","USD"],["n7xrgpmnmf9nvez","USD"],["f8vw4jzzzjjdwxy","USD"],["5s70e186oujis8q","USD"],["2tvqjg10r1ncgwn","USD"],["wsxowy7f9gi63fl","USD"],["7095ewi8bfbxrk3","USD"],["ml89b8col3nxyr4","USD"],["vtyrx6l60e80qkf","USD"],["lmyimugv4nfh93h","USD"],["qyqcrx9d86xykvf","USD"],["qn7gulx206zkib3","USD"],["6vy1qsrmdg1ehuc","USD"],["5ie0n94lpdj6q4k","USD"],["y4vx4g4bbeuqrnz","USD"],["3m3u0ieuspgqt8r","USD"],["lgcq0xhhappko66","USD"],["xmkh0jcv03afs28","USD"],["hn4y1pif61te8x6","USD"],["adgxfnunle27tym","USD"],["ky3yq3blmnl9vdi","USD"],["jmnsdp4ql0lz6vt","USD"],["nbwdiswch0n75ts","USD"],["pq2kz3ss7afndbc","USD"],["r161gmzpnp0ye9g","USD"],["dmh0bshvrgdo9qo","USD"],["4omflgfqar6yezh","USD"],["9myoaw235dorbnm","USD"],["7fwvt24bo0ay0qk","USD"],["n7qbuuz034awlxq","USD"],["jt66ifm7bktjr94","USD"],["pqbzb6xxnm8z6di","USD"],["cpwvutjyamald2h","USD"],["7hp95oex43efg3a","USD"],["ldcqhrc8v1g8dra","USD"],["xxcq57a67hfq6gl","USD"],["43pj8cun2o06odk","USD"],["3ynfmiml1t0eh0y","USD"],["jqz708l369xffmt","USD"],["atfvt84ma935iao","USD"],["efn5bqw4atmp0oo","USD"],["tfc55gci1ziec9t","USD"],["slag27xun8jripp","USD"],["ea19xczp0sw0azq","USD"],["2s62nc8zhlpgj4v","USD"],["kycyfc8ihx21wqi","USD"],["rrn9er6hrmxo181","USD"],["v66ih28rlfuh9ol","USD"],["p7r1965yc6lqo4d","USD"],["u41gvnbrjrb0g3c","USD"],["pyhr9rgo6iwgbqy","USD"],["p9zwh8p3sffv4n1","USD"],["5i4f12pz9rsedj9","USD"],["3slt8xcm47zt45v","USD"],["ereyac2wczkeqpj","USD"],["s5zsrdxropb0tt4","USD"],["9lr099uwo2pvr3k","USD"],["isbmwvirpsop2hn","USD"],["e4ap3hyevg5ycuw","USD"],["8g9kpc2j72px6xp","USD"],["rj4y5rr764u4hxy","USD"],["0k9q4tnr9f0rqkc","USD"],["2759w9pn50eftx5","USD"],["3gsij8c1l3zs6kr","USD"],["azdjf74tkr40h4y","USD"],["apknzwipd8kectn","USD"],["zgod1z6zmoqa76d","USD"],["rohvchyqomalatl","USD"],["pmz9tj2z1g1vpof","USD"],["2pm0xy3qjeuv6y9","USD"],["zmvpa2chiftj1ny","USD"],["wezf8vox6qzqqka","USD"],["fify0duqhvlhj01","USD"],["srt7zmy24j12vy3","USD"],["rund3x0yd6cywb4","USD"],["8uwe8psk2b6dzqj","USD"],["mrn9uve01cbynug","USD"],["yh92micnr92hshw","USD"],["jpwx7sykb352vo5","USD"],["nzb5f1b4rw0bsqw","USD"],["tbbq8851njyy62b","USD"],["gxdhqyfon9jfcsd","USD"],["gavrp3ktz4z9ln2","USD"],["z631w4dq3i1yynf","USD"],["ner30lyd1q66e6z","USD"],["06qvsw3lltjzio6","USD"],["i2nk6optide55s2","USD"],["p4q9mbtvpx0xu9a","USD"],["ish6u23lraauyu2","USD"],["bj9bq44954n4dhp","USD"],["d1opi5qqmwgikjj","USD"],["ens9pb2vn9s6pkr","USD"],["jcaabeftg248xw5","USD"],["1gc3q2m46jmtd5k","USD"],["ruec67bmuzqdnfi","USD"],["694k5i0vkk73cqm","USD"],["qwao4ro0uvpit4d","USD"],["8b0ab83622ekhy7","USD"],["2zehkj6rvwurkl1","USD"],["yubiz4xyb59yazd","USD"],["a9px8xuud0d9fh1","USD"],["c4w73spsqq10g7h","USD"],["qv27h4sc40pi5ea","USD"],["7fsy0hzl4w3dnc4","USD"],["223lp7i6896vs4z","USD"],["6x92odaj7dfecfe","USD"],["kk6h9o1afk5eykp","USD"],["6dw6dokjqqlcg7h","USD"],["yc2bdbui128kazr","USD"],["hg8drkuce507rqy","USD"],["9jnjm2vzvplqjb8","USD"],["w3uo5id9lpx3f53","USD"],["tiegdz35qss2o7u","USD"],["rktpx84xtga83xu","USD"],["mhv0wznydafcjy5","USD"],["ygb57ijnlrgg38g","USD"],["ftyn5oirlwojrj5","USD"],["jifvs83sqcxaf1f","USD"],["tdb2d5j3sb0zcc0","USD"],["qzrekvrzxfxi3cd","USD"],["szurqzkvtwzsw83","USD"],["nnpyzebr5i2lga8","USD"],["kaxhfkcongfkbhd","USD"],["2e23f0zccip3l41","USD"],["1y4ji9rcsf36j0d","USD"],["3nu9d6t13lwisdo","USD"],["hkape7pi40vwplf","USD"],["f2ck775y8j7ehph","USD"],["7iq5l7jd8mpfotz","USD"],["w87g19p73tm5ekh","USD"],["eoli322kfkk0n9z","USD"],["nmxidc3f6cpm1nv","USD"],["dvaq45injy13bey","USD"],["g6k8p1xdbnynge4","USD"],["6hki6jjsivrkduc","USD"],["s5wofsp9hz2cfew","USD"],["4ia9l5xkyb96js9","USD"],["w46pap71ap9durw","USD"],["e64w0nsct89kmum","USD"],["95x0o1and7wm1nu","USD"],["l9kcx18nt1zqlic","USD"],["u3og998l03o5yge","USD"],["9amb70wnbzw1jh8","USD"],["adatsh5ht2nnbau","USD"],["0r6kctsctmfqigy","USD"],["vhtm85z4nfsszkq","USD"],["01cas3p8nuuaupm","USD"],["mqpt7sw8c71p0jd","USD"],["2uxt2hs56kkap93","USD"],["hw61rjgt28sxp8w","USD"],["a0yztku1m5lcz6p","USD"],["r5rzt0mynv2ny6z","USD"],["grpl7snto9vm9ir","USD"],["za2c84w5kjsz0jo","USD"],["jrj105frms03phf","USD"],["mbbniu77o941vjl","USD"],["x7avtvoxnmu9ael","USD"],["lg3nlkk4dzex6xi","USD"],["rqjkghvhypdlgge","USD"],["sgx4mwnyq8tn3gj","USD"],["suo51rpoawm5uyx","USD"],["susp6gvbk0ihlal","USD"],["7qikdhf0paup6j6","USD"],["4ax73g8uwfc7ghm","USD"],["wwje3hpvhv43p40","USD"],["bu7wwggxdr29hls","USD"],["4nri6jgsi9crqvg","USD"],["5cmhbn8lx8jh129","USD"],["i6gnfnnurkta49x","USD"],["cpxmnloi3xa393i","USD"],["fjbb0f43ah2oxgd","USD"],["5qcyfg1phh65t8u","USD"],["7mwpi8b4zb35sjn","USD"],["i4vo3gjep6zv9fo","USD"],["y883nzkb8hn4d8a","USD"],["33i49uv69xk0m9j","USD"],["i06991nj55xldva","USD"],["6rj94pt2bwptbpk","USD"],["k3tukpejqehs0bi","USD"],["4c8a0o3k2dhnt62","USD"],["s8cn8eql0n3xici","USD"],["xod292pjefiahfj","USD"],["kxrgieu8yiue77u","USD"],["va83r415ueevmfu","USD"],["s8i5e1740qgim5u","USD"],["9dzx2aw8glq28ix","USD"],["y1bzq4a2a2d8jqn","USD"],["t1z6ra6abwqbncb","USD"],["y8emvtrvusji2mx","USD"],["urtepzm3yksy3z9","USD"],["71dn7p9nvjcla4o","USD"],["7tiflwcng67pe25","USD"],["8bbvthdpdb4rufw","USD"],["gpgi2jss62bghz1","USD"],["7edwhsq676j62zz","USD"],["7qror795mr1n3a1","USD"],["w6gh2dmudfdkbbp","USD"],["i4icd8rnj5sq0v5","USD"],["jvxny0q1fjnq467","USD"],["5on0wn00ug35023","USD"],["7ceta97bzuggnwo","USD"],["u1t0b781pdx3vor","USD"],["bsrybdxpru73ncg","USD"],["5c1dv3pk70q4uoe","USD"],["6cuyrckqhbfgj0z","USD"],["dy870vg5kobnwgk","USD"],["d0b79hke3exk34i","USD"],["d0jg4eyq35opt7m","USD"],["758ybjgk1f02w3b","USD"],["e5c6bz3qg0x3dg3","USD"],["krn1t2s6gzhxza7","USD"],["uvdwujb4yn6i0vh","USD"],["52ev0eeif7djny8","USD"],["w05fkyzmznwtp5w","USD"],["6ymtm4elmqm5qp7","USD"],["0oqxrabomyu3lym","USD"],["6hvlm1tk874ht9z","USD"],["hlvz1cm2t8njz4h","USD"],["5hupdp1ke5o3m7g","USD"],["m8p4vtv7a8z8vgg","USD"],["afqlb2o1jtvdnbu","USD"],["72oy3ykgr82nz6p","USD"],["9h0ldf1nl0eu1mc","USD"],["ln0lmbltk859wvy","USD"],["0eb5ehq7cidjfqs","USD"],["zrhisagtk72b6vx","USD"],["f7peae74cm7g70v","USD"],["czheeccxzz71nxc","USD"],["guvkzongs6webv4","USD"],["40bh955y7xkbvbg","USD"],["uzkwchtt4zyrbsv","USD"],["rrsdq402kty2ia0","USD"],["kp4tpmq3gswrm7y","USD"],["pnfyauabrcroqdr","USD"],["s0l8xb1pijethy5","USD"],["0r4hty5tt1x6gmv","USD"],["td3up4gtlmzp9zs","USD"],["xoi2smcwfeygrrz","USD"],["imwb889vqr2ddtl","USD"],["98k7fswsb1peb2u","USD"],["w3u1kcg248kfjvz","USD"],["nuxa5avz5m9lcvx","USD"],["iz6w6h3k2a8vnde","USD"],["sikkv415e0s7z3e","USD"],["m1nsaurg9mc8sbw","USD"],["4nalv82qabwcbw6","USD"],["bbugltb1ufwa5vw","USD"],["pptk2jpge6gn76x","USD"],["9j0mbr3ejjbfhwy","USD"],["wyrmdv7rlo39ff6","USD"],["jbm33m5by7tehu4","USD"],["20hc5affbf7oqvg","USD"],["88h90gcezk1t1f5","USD"],["lcvfnkgwk794g7x","USD"],["cpb2ceg4e0zz6hb","USD"],["fdorljs6vw036zi","USD"],["c26q2f9jziwi52u","USD"],["ywzc4luqquw94ae","USD"],["0okd3m8o2hc3ysk","USD"],["hihhr37brglazr3","USD"],["pctsxkk84mv52r3","USD"],["ot23gpp2n3yaerk","USD"],["jn6avim31r2k6yr","USD"],["xgkaqabiit016nr","USD"],["ntpsi9lg1vznkx2","USD"],["wyjamn2cvvwkleq","USD"],["dvopey9jkfwt3w8","USD"],["u5av99prz93mvy5","USD"],["k3q7ej2u81tj6r5","USD"],["9s0usuib6jltgf4","USD"],["aal46qsbm14jv3b","USD"],["81n2yi1robz3dm2","USD"],["7ucyr2wzo4c5kiy","USD"],["l58b6rp02r64qdc","USD"],["sdqjlz2q8ag53lx","USD"],["j0mij1fmoigt2ag","USD"],["9e2z3g7avq0zgo3","USD"],["m44dd8ljq0xxtl7","USD"],["fq5rn4b3bf2eeeo","USD"],["kweoduyhlrq2zjc","USD"],["a92wzrha0bvtf0f","USD"],["v8oqf81w7q6ugru","USD"],["6uvl1nuuu4mu24x","USD"],["piec2dx0nfp87no","USD"],["2p2bdr1ueq6ktax","USD"],["vbbeun4gdb7pums","USD"],["vxqomieq16jjbl4","USD"],["dnzoi3zxy5au4e0","USD"],["mvc9m3sktoa0b0y","USD"],["aytosrl7syrlbwo","USD"],["esha58wj80n4uj8","USD"],["dqpau52ez92q0rn","USD"],["ngytzyvlp7z99ck","USD"],["vjk9puxkw297hsd","USD"],["bfrx74aql4wna3p","USD"],["ljvz9tojcl2fitz","USD"],["shs04fr66v21sbm","USD"],["90j8dyuaf9m1sm9","USD"],["n754se2s43ujig2","USD"],["da3eri04ialik47","USD"],["4krmghf0dqq4p57","USD"],["envs37n8rp1zxmw","USD"],["54x8fdgp48e8svs","USD"],["tb17xpjzge7oz55","USD"],["ls5avjamgfh7ndn","USD"],["4f31wszfhljwm68","USD"],["9oc6tv06k2tqbhp","USD"],["2hjzwjle2sh3swo","USD"],["2l2q8nex4n6shu7","USD"],["h8dx5ksvi7vwtwl","USD"],["z1dzfm9lonawu19","USD"],["4nb3tosyk9wqq13","USD"],["64ba720bnuka5s5","USD"],["khchc10cfuj6c9q","USD"],["z4sorktc42zgaj3","USD"],["n2zfanxcm70uz3x","USD"],["y2u0fmrdxdd0kou","USD"],["2uaz02wfec2sopp","USD"],["abhbx6ag8iuc1yd","USD"],["lw3e7ookfvf7unk","USD"],["ofrrxji02s78fmg","USD"],["2cmkjaidwxjoiuy","USD"],["v207yqx7q1vlvfb","USD"],["ctxe7x8tvx3lrx7","USD"],["i9x7t5pb6tmr65r","USD"],["bbjyw03t7rsv9md","USD"],["apecv3rxeb7gq6u","USD"],["zsib1ysqcf5pn6t","USD"],["j7wm51l1zruljsn","USD"],["ry1dgwy1zj720xz","USD"],["rj39caa3ryzpgt5","USD"],["7o8na2dk2cu8djk","USD"],["y52emzlfkq2ub5v","USD"],["qfet0cncadpncrb","USD"],["n6lqsmege1r5zxz","USD"],["z1gw9y5ir90ip9h","USD"],["d8d6gbdp1isckvr","USD"],["eu26ylzvjh7o41v","USD"],["7611j6l9elb5o0n","USD"],["m0l9g7e74dmtn02","USD"],["1sx9ctshvp610su","USD"],["nlu7jpuvsrulsgu","USD"],["hzi2wsfbe4pfxju","USD"],["nvcuuyaiyma8b5i","USD"],["1pw3g2y3e54xfbx","USD"],["7ux0wyhw8uwpdw9","USD"],["1hpjrazj56701rz","USD"],["zruokrr36mhvoqu","USD"],["fyct04clt5prp24","USD"],["hxbzvgf9wucb4xr","USD"],["j8qvuuhl3ziaoyl","USD"],["l8s909ewptdters","USD"],["f2elzkscc4g7uwa","USD"],["tycarqx04mr3e0i","USD"],["x60heq5ghwpncvg","USD"],["x5e46gtgpcvfn4v","USD"],["qtp5qn43fpfwv1l","USD"],["901gb8cee7gdk2v","USD"],["xp12pc0229hnh2w","USD"],["mqvyo5lpg3ws3j2","USD"],["969gg7cru4ceq51","USD"],["lomr30ifjpgp44w","USD"],["o2nxivj5vgiyq7v","USD"],["i0tswo5x7a0czd6","USD"],["jnemjrfmp4f7z75","USD"],["ug4zf5khfknvx9z","USD"],["qewhalw863hfu2a","USD"],["0844q6q8r8g4r5k","USD"],["5yukb09kwdn4h9t","USD"],["izio61mmi7ss9yv","USD"],["d3coam4r45wjsom","USD"],["vyh441p349ly2uy","USD"],["9cm223ik9kihxib","USD"],["r5cwnnqi1fq10e9","USD"],["maewzua06gc9vub","USD"],["hnho6g6rpgcap09","USD"],["nw4p6k1o9qhae6k","USD"],["ekohs6p69eo6fp4","USD"],["g60jpmy72jbbxs7","USD"],["f0bdy5s61l53i7g","USD"],["c6wzuryel78ete7","USD"],["gjb355w202yn03c","USD"],["16yei5y6w5vwodz","USD"],["ubu7geij4vb9t5r","USD"],["uiv2orwxhnm84tu","USD"],["oxw2l4boeq9l6kl","USD"],["2hxvz43ifm8qgzd","USD"],["lztsibtrsyasf54","USD"],["oawov4z2xjpxg4n","USD"],["b47f32tppyfyuwc","USD"],["t6hcxohvstapjht","USD"],["07nmhtx71yqyt2h","USD"],["9j8mvva8j30kxll","USD"],["d127raxxe1cuxht","USD"],["luu91hkom690wz8","USD"],["2feb9ouozdzfv1h","USD"],["audsaeebirzf0xc","USD"],["r0bmdbsmj7noy83","USD"],["pwoxep3oc9g63v2","USD"],["g5bn9ewrwq7ci2t","USD"],["bogbn9m1a8kh7ys","USD"],["s12m3g6bbi85c8t","USD"],["vlta4x6igz02i4q","USD"],["7fuvd9ysx9ya1lu","USD"],["lmfvr03mgv2n61x","USD"],["ty2lm0vltuvumn7","USD"],["9tar8srtdhh5q1u","USD"],["0kttwnoweyrj5f5","USD"],["7ytniab0omt5rs1","USD"],["2qzb6mpkfeleb2y","USD"],["vdopyoa7pc7gdrz","USD"],["x9jny9hn6lejduu","USD"],["gs7v33lb70dffbk","USD"],["c6ucw5u77n8rdno","USD"],["a0cyeyvyyd3y99a","USD"],["gdhruxvp88zzqnr","USD"],["o0lv8c7xx7evsij","USD"],["ariqbfns7o629an","USD"],["68amtf7olaw6pib","USD"],["nj8gsp07izxn0oh","USD"],["or8s164irxul2gi","USD"],["qjgy53hskuxmaum","USD"],["gbcqc0yxr55gcbz","USD"],["o431ivodtobbqzf","USD"],["fhrhvxxgac6xn25","USD"],["is3vnzr2binq099","USD"],["qdf6psyogmx79gb","USD"],["px0rc1jgif2r55e","USD"],["kdg8fripobuifvu","USD"],["p8p622658kpu4cs","USD"],["slz49ifmafbiii7","USD"],["lrmbn8sre3p7vob","USD"],["psg58zh6hyuwotf","USD"],["kqmkc1qhgbzwihi","USD"],["3cz63afyy098ilg","USD"],["grwee0adubanp53","USD"],["pt7x86kctgb1w4u","USD"],["1ogsapthg7vfrp0","USD"],["g3ceinvirgsj7ls","USD"],["6f88qgke48f1o8b","USD"],["tt6d0n87sr5a22m","USD"],["9avzy218mkc9syn","USD"],["u0q1jssitozql58","USD"],["oczpdktpj96zsjl","USD"],["oksq60l3qqie7ry","USD"],["8c6pnypiaac2o6j","USD"],["j8urydgab34wysh","USD"],["jb51i84vqp8m907","USD"],["gge8l0noqfs63v8","USD"],["lcsjvj5ojoagklc","USD"],["2b231qhyzytwkxr","USD"],["0jmb6arl2gwayx1","USD"],["0a2s5u10zjv1gyi","USD"],["faapvqpov4dkaw3","USD"],["g24flvn7ggaabyk","USD"],["ttoyawywrxwn702","USD"],["757dco3knpoxgb4","USD"],["uhu9d8dtinz1wna","USD"],["1twbhwbit6mlchz","USD"],["u7nj5sg52s8kmxa","USD"],["z1h2uvrbyk3xck4","USD"],["75jug5oemw8dl18","USD"],["esiyrjzkyc1g78i","USD"],["6r727amspgm9s7z","USD"],["c5lvqf2wup7n412","USD"],["unm398e6fqcn18k","USD"],["jz2uh4235w6tyjk","USD"],["13h2eltelda6j7c","USD"],["uubpes5xqpugu6p","USD"],["lny2bj6vuadzj0m","USD"],["zjsux6aeldduavc","USD"],["bml83dfzcb3l9nd","USD"],["gvevz00e6nctklh","USD"],["6p1f27syuadpcok","USD"],["4tk6b3l630l9pno","USD"],["jzrfrf11l4mboac","USD"],["wrugi6h3qw6dr7z","USD"],["ytjrn3r0pxi7kqp","USD"],["if825lo9x8npi88","USD"],["0jfa487xfxmnswd","USD"],["0csvaarflrom1zg","USD"],["7eoqa7qjfr7te6m","USD"],["jxz3wgye60qel72","USD"],["7naqv04two2goi8","USD"],["59kps62vv48ksw2","USD"],["yuzjqbyurz8lj9u","USD"],["q7d2g1ym6olll67","USD"],["au3g9799l287ehd","USD"],["4jlb97j134kmlnx","USD"],["jn5ens64xhem6cv","USD"],["t08rpf782f3qo5a","USD"],["o25dx9sv8qzqi9i","USD"],["94kl9383vlkknma","USD"],["exzp2eukm6jppxj","USD"],["ndjcwyfm9tfw48e","USD"],["scqamb7re4cut63","USD"],["b8gsvaqiqxs6l5i","USD"],["7o6jsgbjuylzbvq","USD"],["dkekulkbf5b2ycv","USD"],["a1xyv519694n8wm","USD"],["a0sc56uupfb2ila","USD"],["m8uh4slyzsrn3c8","USD"],["z68vb5mo9ltmbqa","USD"],["v9b6wy5ly5rhzo6","USD"],["ryxy0bcq8ksuw66","USD"],["yqhw5ipoalmrmo1","USD"],["vskz6l9i3htfdn3","USD"],["o8v0dujec942pyw","USD"],["bzg4m10devo1sec","USD"],["gfjrs2ygr8klf47","USD"],["1s5fpkgydas8r90","USD"],["w625xdg1166vflp","USD"],["ec0fmbp6kq56roi","USD"],["ej6325y30qd18b2","USD"],["0d54c3wvbuojr14","USD"],["9ci0vcmyjhqaoqr","USD"],["fbcueg05fx5xknj","USD"],["bom5d4d5aook4m4","USD"],["jlbxrotl40mpfq8","USD"],["gh3e7hck3sf6fw2","USD"],["buxipsyjm2uwhgy","USD"],["00all36etouc4xm","USD"],["mc1mogysiusadul","USD"],["ny9yu2yi1yk1fts","USD"],["sgo3dd60drvvg6m","USD"],["wvdcig5i3iedjnw","USD"],["e8g7q4pulispav1","USD"],["d9uxtpzfq81ibyi","USD"],["jm0ozi8x8b4f45i","USD"],["xiwdd2hp6tywa3e","USD"],["fiy1gvzccx74v60","USD"],["x3ttnuy771l2cxb","USD"],["u8zhe3y3l5k7sip","USD"],["uabatzvc221lbpm","USD"],["h3nr0dj7bph1lo5","USD"],["qlokr3twx9nz4lx","USD"],["gn6xiyebl74f7ge","USD"],["krhesdxn2anpdhe","USD"],["iizrydzw4vd43y0","USD"],["tsufxzjhs3t3s03","USD"],["8h452u5c4zujqrj","USD"],["et5zcuryev0ejop","USD"],["y7o49x17i1fcb93","USD"],["ipcetam05yxlgfk","USD"],["3i1lx65oo42o03a","USD"],["r22z51yqg124zkg","USD"],["i3556vohsc37aes","USD"],["un5gg07nlc0qg4f","USD"],["v21hxxlowl8qn6r","USD"],["hsedc98uxdgfc39","USD"],["16wnr5pkl23qd98","USD"],["vf7n2qe2lwi9ev8","USD"],["s0dqjgp3ki4nwnr","USD"],["kpz8tlh6swmgaie","USD"],["x4yumryx5jrnu30","USD"],["856qhisoiie6li2","USD"],["321ldje8452i1w0","USD"],["6k7hbm8naadz31k","USD"],["s4dgp389hbqx9er","USD"],["5d5k5yijasn7myi","USD"],["csi0e5uki57p4zh","USD"],["567tozkpk6jzwvc","USD"],["yi1yqwnxyu2dm2n","USD"],["8qm9coeeu6u84cg","USD"],["mkaq814lweey5yc","USD"],["r295c6clckopbum","USD"],["meu22ufl04gcyul","USD"],["zg0vo6qp7g9x4ke","USD"],["vkjtlkd7p842hwy","USD"],["ie0ci4wi7sgfhyt","USD"],["ooy33je9s0luq9b","USD"],["215ufs7gkcv78xx","USD"],["ac3rqfyrt0oczcz","USD"],["ze0g7d4xccu5ioq","USD"],["1oygekjif49lpni","USD"],["5neoboadktfrro2","USD"],["pp1ljj2i5m14kno","USD"],["d6tv9todxxdafob","USD"],["9kngp0u21vi7aci","USD"],["32l3lculbwtluyp","USD"],["7ezxij8m78nkwhd","USD"],["115nqv6hmc6cbvf","USD"],["ty2wuw74csluceu","USD"],["uiddfv5w0duajbc","USD"],["e9b69xmrmcaz3we","USD"],["3f4iff2ik4dq6m7","USD"],["e80pqk3rje1djmz","USD"],["3vvw21o6k2uamub","USD"],["tsl17uwse3gcy7l","USD"],["iuw5iwfzc969v6b","USD"],["1ut1a2wulx5dkyp","USD"],["zou038icwt162iy","USD"],["sfafab6n8shzaw3","USD"],["uoa3rc26fupurgj","USD"],["871lblmkel0847f","USD"],["eu13n1u7d7ank6r","USD"],["flt5xh4tx8rdtzd","USD"],["vs1phnmy89d7pyv","USD"],["rixhpho8v9ihs5t","USD"],["lo7yfuags0bu4j5","USD"],["fizal7g95bsc7e8","USD"],["sfzcwef7bsgftw3","USD"],["xs6a1jozt8gm16h","USD"],["hriu8449n9t961h","USD"],["q300y5i871ftp1v","USD"],["oh7beowgtpf1e92","USD"],["yzqmlzx30fxki1y","USD"],["nc7xcykn3vc7qcr","USD"],["hn5782o1liss8p8","USD"],["s9mh56onmnaqcvi","USD"],["spczbm8009916te","USD"],["4qvae0dz5k8rsa5","USD"],["0nury3zakty0fcn","USD"],["ur9us78rmni29sg","USD"],["cap5nx9lugzvmdd","USD"],["du70l1yhi7p91lp","USD"],["axlr49046ms3zer","USD"],["02zudqqn2x27tt4","USD"],["kk5j8tc54kd852x","USD"],["g11mjrd1xuzve83","USD"],["mu4b1936b8ka3ln","USD"],["8kopznkqwp5den5","USD"],["thpy7q17npkfy31","USD"],["wdftrsxf39wnmcj","USD"],["o8visrby7i3idie","USD"],["yuv66qinpihjtt6","USD"],["yx78a9hdgx4d8ju","USD"],["30lq4jjjlymb0qc","USD"],["fd8c8ve6tf1qa2b","USD"],["rpp6fa9fq0inzyt","USD"],["inf4ebrjwihny5a","USD"],["l9la5pmfz9e7y5r","USD"],["3oglpqf4l5v668v","USD"],["uiqy6k6g02wrabs","USD"],["qmr7kqtejji1nf2","USD"],["ntkbk2i7n9kmltl","USD"],["4ov5m5o3yct6h6o","USD"],["o4ngsrd1xt0i9dr","USD"],["6v6rfnh8ozxkjph","USD"],["2f57k0zqjesm3cx","USD"],["ahto5b00b7rmq0n","USD"],["rrh321vdkpa81ab","USD"],["bfzq80voz2qb26y","USD"],["3eez6ghzvpfqe3p","USD"],["7vt9odtewon8zug","USD"],["cg7o0n5am5p3ecx","USD"],["evvcr5mu0q7n5j0","USD"],["il2omoy64buifd9","USD"],["nh3awo9j3rgz1zn","USD"],["59gjqkedho5y5c4","USD"],["h5aly02ch4y2ioe","USD"],["1t9jig7hiz60as3","USD"],["x5n9imj0x9lds0q","USD"],["ard0tdag2w5fzzq","USD"],["65ttquihr6gq37v","USD"],["a6r4rup6y090crq","USD"],["e4cthynne5ceine","USD"],["dqv3zx8789n23wm","USD"],["c442vmo7pm4ma6c","USD"],["d01cf6jpmqookuz","USD"],["xt4t3gkcgbnri8t","USD"],["y72lw6gi5zn0mzd","USD"],["tii2xfbwg3zdh86","USD"],["gxfdctyqkh4hdw5","USD"],["3gbewag13x24gpi","USD"],["seelhp5xpv8hse4","USD"],["351cpk0qh7243t5","USD"],["p44hdkn2kj9q7x2","USD"],["v1gg4hu6h37ttea","USD"],["y13twm5schs7u57","USD"],["jg6fepa8sw9ajl9","USD"],["z2s7icywmq8di82","USD"],["heddn5aquxur55x","USD"],["56yaee9bd6lqszu","USD"],["jj0yj2j6e2g8ceh","USD"],["3abn4g1ghmsk6xh","USD"],["0813bs6p8rwlmwh","USD"],["hmfsg8ppfgbd308","USD"],["fj96awn5vo9wyak","USD"],["rcv3hxbryj527hr","USD"],["okfqbilsj8ygd9r","USD"],["ls3ca0te14zvv3d","USD"],["4mohh9lm4zkrw2u","USD"],["1sgw3foegfiyuh9","USD"],["b1jup7onjl82jpp","USD"],["koj2h0jgxeu4u0a","USD"],["0eu8m3afzwtbsgu","USD"],["s9hoss521fogivc","USD"],["0rm4cf3jhjdt0f7","USD"],["lvr43x3ektfhucz","USD"],["xogwhazeh9rtffg","USD"],["1rj1wec1ek90n92","USD"],["0zchn46z56zs6jj","USD"],["xx4g5c17mfkt2c6","USD"],["9rdldfc5wado1nx","USD"],["xk7evef15mgiv4m","USD"],["0qikqnbk9ospync","USD"],["zihcatg86jlksug","USD"],["1xa38mgl32qzwll","USD"],["vqk3b9rls24hv6r","USD"],["k6scm739qtgd9u6","USD"],["62inlgl6q8jq9qo","USD"],["mhcvjxc07m83968","USD"],["uro1dycldd023zo","USD"],["cyjio8k6fb1r94e","USD"],["t82omjr1v7fuxa7","USD"],["1v2gveg4yxrpk3r","USD"],["4yldj1p9jc7fu6e","USD"],["bmc7vja5jrzjg11","USD"],["3dwidnbyj80pgrd","USD"],["eg8bae1n8jifc4n","USD"],["5jmxnbqvtbbwkix","USD"],["bd5k19xx0vc8cr1","USD"],["5qsllshodsblme1","USD"],["lvfqf0zurdgvl9c","USD"],["28v5wfsgiyy8sh2","USD"],["vohs3zge7tzp182","USD"],["p56l9x53t63axiq","USD"],["o9axyyqy71umco3","USD"],["shb91zymjdumstf","USD"],["0ihs0mwg2o949o1","USD"],["860qhrospipnimu","USD"],["8f33nmv423ejwnn","USD"],["kgemlte7lwuk9ia","USD"],["t2mpg5t2i2hcc41","USD"],["m9hfx19mcyip298","USD"],["8o4jwcbd5wef55y","USD"],["iuikqjorsu44jln","USD"],["fvu6l3s6j31e1b5","USD"],["g4c3x261m8toed2","USD"],["o87sc99mts3mf9e","USD"],["dinx02lm0pp6rqi","USD"],["q269dv2qahrjqpr","USD"],["ak0xn79imdgd4uk","USD"],["xt1xpsy5ezh90iy","USD"],["06t6lhyqc7yrqvo","USD"],["dqfn4jtjco9cpk7","USD"],["1x6ynthu3oghvwp","USD"],["d3tofaksbfl407g","USD"],["pd9abn6xesv9kzr","USD"],["e5wzbkosr2f6unu","USD"],["h4xx2bdxqbjoilq","USD"],["ro0xueojdxo1pn9","USD"],["mli2v07ldkwh27g","USD"],["t6dx4916qghg43w","USD"],["h4mcyxtiup4suyo","USD"],["xukt1b3cyad6g05","USD"],["wd1n4l2enactvp3","USD"],["fdqevv7pelda18o","USD"],["f6hhz9zf1gi6vaq","USD"],["hsujysttot4pm0h","USD"],["9t1lsz7md6xny4q","USD"],["u5oxckip2l9p1vt","USD"],["x2lfbn4k0gljpoe","USD"],["ihp4945ho6ks2pe","USD"],["m35ya5certyam18","USD"],["ike1kdu729nszko","USD"],["48vl0kwkqrouymj","USD"],["878inrlgl8f79ne","USD"],["1r4bl4erze5okpb","USD"],["w3k1sdlfcohypag","USD"],["sgic7j6wdepzf67","USD"],["maor9cke6tilm0c","USD"],["v57aheu1fcr54dj","USD"],["wie2gmt25g369gm","USD"],["ak72eisaix4gz9q","USD"],["rg6k95gzhmzp141","USD"],["8ovfb1rskyrukem","USD"],["zqish959h6h2fi8","USD"],["s69gutb73ge8zcu","USD"],["m0cvjst3ets8ex3","USD"],["kdjrmc4s2gv85c3","USD"],["7wzn0e5qlobux6n","USD"],["eavufznix4uociw","USD"],["i7uvvyv5wbarwsx","USD"],["p534ayues2u4fjq","USD"],["5r8gmggx8imc6g4","USD"],["7h4yovs3jtumywa","USD"],["glxvtn8u6zknhf9","USD"],["4imgqpaqfnajkow","USD"],["pwvzdgwaxnysgsz","USD"],["vngdpedq3rlzi4q","USD"],["ccss9hyg5rii5m2","USD"],["syoefps12e39s25","USD"],["9f98syy73xzqtsi","USD"],["v2hby6bw5kwdgxi","USD"],["u89r1m9lxbx94zs","USD"],["gsy9n4m53hi8lsn","USD"],["bo58aozubjwi2iy","USD"],["saolu9fvb7gnjql","USD"],["j9alj27pvg088jj","USD"],["ev1sc79f6owe2cz","USD"],["xbpv403zxd1z7o6","USD"],["j344nix96k6bxbe","USD"],["pmpbzbmm3cd8qq5","USD"],["3isnownpkyfxrgm","USD"],["0nvpqowut60fhmo","USD"],["0vghutcju47qqyy","USD"],["5yksv3fn7drl0zh","USD"],["hyuyl1bqampjt25","USD"],["rsogcbgnxifepeo","USD"],["wbdaynl8erc2kvn","USD"],["lw82znmsyyz48hv","USD"],["ruls2d3fhmf4u32","USD"],["8ftbnebjobgb3xm","USD"],["q1v08t754kk5ca1","USD"],["exts82dvgzomenz","USD"],["m13m7wskid4gfq6","USD"],["opqdneb6qv66uin","USD"],["y64f71dfuamwod8","USD"],["1rllpj5a6d7g1rg","USD"],["jcny2j9jep03flt","USD"],["vbv1hqlal94hn5t","USD"],["qbyu8tqiqfaam2s","USD"],["pfzvl45mgafn4st","USD"],["wkqucb0owgjy05i","USD"],["t1m75vi64korejh","USD"],["t9xpi5tnv7xkts6","USD"],["h0mfqhhnuzijyes","USD"],["yj39khtjrq7063a","USD"],["8z7w6yudnhw7qv8","USD"],["pacn6u9bn6zy7sb","USD"],["sj0paj7r0cn27s5","USD"],["ieff72urfvicgs4","USD"],["fkzn55e5huj1yfa","USD"],["gm4ngp69uke0y7t","USD"],["0j3jinv0iadtyx8","USD"],["cemu4uutw3wifff","USD"],["rctyuxei58qpcbb","USD"],["q258gj803v6h98l","USD"],["a9f58oz3l8y60jv","USD"],["781ky1znl4nrg52","USD"],["1xfagye3e0iaatz","USD"],["ux8d82rujt0qz6j","USD"],["fypq1fs59lfswy2","USD"],["0ty10h4kzrbxz8a","USD"],["h7qn83obrno29g3","USD"],["0gmsozg1lik5950","USD"],["eneuvrh3blszq62","USD"],["ty8carrahoa2c08","USD"],["cinva29yyqbnpun","USD"],["ojvicafxjspyoqv","USD"],["83jb96revo5kful","USD"],["ax71l1khjath32h","USD"],["v6q1wyyx2e7fx9a","USD"],["tsucshowuk8a0tb","USD"],["o4yuailtl7yrup4","USD"],["g4i20wzhm8p7xe7","USD"],["5xyb0dvo7hjl29j","USD"],["dat980rk68g9gkp","USD"],["ozg3bwhqk8i2oge","USD"],["120z7fo6ac4dt92","USD"],["cir59gx1vqjnvc6","USD"],["2nwxguzyen64a8z","USD"],["g8ghb62eb7grv3j","USD"],["2659tbkwsb5ig3e","USD"],["wuap2h6uhea3paw","USD"],["631u27ssplq3he0","USD"],["z1hd035x6iz4v7z","USD"],["7d24gwfcrxhekxt","USD"],["zdojuioj8vhqivw","USD"],["4pvj1es4nigoc67","USD"],["jq1qjdwsgl9dw36","USD"],["khh4o586iyr4m4j","USD"],["twxk87hw8fri0i8","USD"],["hyd1l0bdgs5kl2p","USD"],["l7rync4zbusphwy","USD"],["oiky7st6fbml75z","USD"],["0i9og6z3fu3vnea","USD"],["r7660bhdv6s6508","USD"],["r0g1fxapih9qiz7","USD"],["7723d13jiopjuy7","USD"],["o692sq6llsnksqh","USD"],["q88vvznmaill9uq","USD"],["8lw142vaq9n6t5f","USD"],["ikialedi52bfhnl","USD"],["tyc06nl414eopq0","USD"],["jyrq0ibn5bshzdk","USD"],["orc1sn8wi74p8n6","USD"],["0lho72g336yksld","USD"],["pt9xf01y5e357rm","USD"],["eo4uwhqrrdtchei","USD"],["mkd6gigp0fkt63k","USD"],["02zus9rxgtrlaip","USD"],["xmlxc116hj7p1i6","USD"],["5vb7q77fiflunl0","USD"],["0mspryw1ncmqd9y","USD"],["33suxfizqw2kw1h","USD"],["zeql8w2fn7prc82","USD"],["8xr2h45y7lqchtm","USD"],["fedf3rte9rbzcu3","USD"],["45a88azqmcvz84l","USD"],["jk5tm5kov4y115r","USD"],["lfj54pwbcxcawd5","USD"],["vk00p5l1i8wdcab","USD"],["v65o2e7jcb2pkkx","USD"],["xjzgw10abp09dsr","USD"],["nt6n387r3o0ellm","USD"],["ypuo3285lzcxorv","USD"],["6m217g3zw0mqsvj","USD"],["v40edmak5t3q0t3","USD"],["9t0ybet4d85t83w","USD"],["vepupt31oe1uen6","USD"],["jls1kdo5760f80u","USD"],["jh0fvqppw8684xi","USD"],["o94vaunbnx9zlro","USD"],["m5b7hrwv1nx3y64","USD"],["oaq97nava9jlu9s","USD"],["gamg6cwpipsk4y6","USD"],["brd5bxwscthijfi","USD"],["s03ll03lrx4vsmh","USD"],["i90pv72pkt9soe8","USD"],["d5pg3ycctq1yxnu","USD"],["bsnxgtpr2f6xw53","USD"],["u0ogpgrr3ljx221","USD"],["fajlimprvif3o07","USD"],["hd65xaec5bl5byr","USD"],["u7xu1sumneet43b","USD"],["49pxn3hkpan64rv","USD"],["g4gir03x0rxo77q","USD"],["sg9weon14mbgyjd","USD"],["z8ie1hfb7s91k9v","USD"],["eovwt8r2ki78mid","USD"],["ui0irra02sup7tj","USD"],["pevvfrafnxucpss","USD"],["mloez0id2rgf16o","USD"],["vuo9o37vwnkj8rt","USD"],["k7skmfbs17okxqb","USD"],["eafbtmh6ckzv4u3","USD"],["5h02eg9hppebay2","USD"],["iq1qf8t6t4s4mf8","USD"],["qgelji2v32vh9ps","USD"],["66dnc2xn0j00w0h","USD"],["nynqcy6lfdu8lpv","USD"],["9soss7lilqchsuh","USD"],["nzi3noimkbf8bu2","USD"],["8yyh4vp9qq21vv4","USD"],["y8o7picamaar8ca","USD"],["meii4l496i886q5","USD"],["vaynrryj5saiqpp","USD"],["8x60iuqcdlekcpd","USD"],["wt7koqszh1bs7rz","USD"],["f6aq15tlg93r6hl","USD"],["au1ez6l5jn14ns5","USD"],["92wkk0krhwu7wrf","USD"],["wom62wn3fhp46fv","USD"],["8dnnkre34rr3ee7","USD"],["1yqbwfw9ae2tofj","USD"],["326a5zlev4x17wv","USD"],["o474x9vgk0wnoz7","USD"],["m04qx1yvwtitat4","USD"],["jopid1mv3ewl6u0","USD"],["3o2vejelbun3fuy","USD"],["l2lgyaz3l2w6acp","USD"],["wl0w2vd7l58m3z6","USD"],["d4e8s0sl4c5fcbs","USD"],["lcj4r3ncvclf53v","USD"],["oqpffnnusywfwtj","USD"],["pfg8y0f1gv2jjch","USD"],["ljzemoi5zr4ece9","USD"],["ao5nhzvafe7k929","USD"],["lp8g9nzktfj2qyu","USD"],["mq446lic0ra85gz","USD"],["j5cxd9favlztykg","USD"],["uclllhnf6p0khvh","USD"],["ebebzojttwupcd8","USD"],["bzxf52c7q89n1uy","USD"],["u5jgoxmz90fo35i","USD"],["ggilcsilgs0402j","USD"],["zj7dpinzzp46mjj","USD"],["rqof73oxocsxhpv","USD"],["0jpt6iztfl7i74v","USD"],["dpbnbpnpxjdch3d","USD"],["plmv3ar1u4ahxa6","USD"],["n10bu0afvb97kxp","USD"],["9r8qpho1t0homij","USD"],["at2z7jrvydjf563","USD"],["eqsck0i4n3rz5qp","USD"],["w2bydic4rpc0t27","USD"],["mevr1nfew7l09ax","USD"],["7rphwfywsd7eny9","USD"],["v0m2bjw5fwe8plg","USD"],["pc3njezh8yzc5ag","USD"],["8vtzbehuutog6dr","USD"],["ppikklafcgq5te8","USD"],["pxfp5j356rq1q16","USD"],["oes0go6iyk14i75","USD"],["d794t2giwkf1g2v","USD"],["wev5n7c81qpooj4","USD"],["n1gghe6vgyo5bfc","USD"],["iucz1us8acht065","USD"],["ntexs5d1vax787s","USD"],["7znjxigvab5eaxh","USD"],["sn7ppgehux4ovtr","USD"],["z3dd9scoo8035ev","USD"],["n2joc46jlele2w6","USD"],["8fhnhjvzr9bdy2i","USD"],["wnaqrjad1wnd8ku","USD"],["4i9otrl8kmh7sw8","USD"],["tqwx6k63kz2przs","USD"],["ejkpclwmb1hesgh","USD"],["lhz050wctt6wrki","USD"],["tgl6h32nu2lmr83","USD"],["745qjrswd8ydjvc","USD"],["jmsdd322tf5wayv","USD"],["5k9ltvjbq7csfaw","USD"],["3t9aeocom96esic","USD"],["b3j89c230eouh4t","USD"],["fyl3w8hky9njl00","USD"],["3j6x0tnpe9tzkvi","USD"],["is83h3vi2dfjtzg","USD"],["hicogmvy8gskk1i","USD"],["50kblamjuhtrzff","USD"],["j9gurq51mpi6nye","USD"],["apjaybu4rmy2mrw","USD"],["epn18ff92yd9tyo","USD"],["jdyd6w4sh9ns84s","USD"],["rxr1c7le9iuuroz","USD"],["3gdwi5svnjnilti","USD"],["ph8vqp7j563qgxk","USD"],["hwy8y8jtb9jlzhg","USD"],["uf13hp22swggauq","USD"],["i0eauk4x8tm6v8r","USD"],["k7ebxsoj6pj94me","USD"],["3z29xgj6za5tlvm","USD"],["z44iu2jwn34j1ox","USD"],["npjuenvtah41vyj","USD"],["hfloe3eocm01uxc","USD"],["py9n9hoywvvwdmb","USD"],["8jwpwtub49x4tbd","USD"],["ac82xuoo3xotb90","USD"],["9v6l8x53tdwnihl","USD"],["byezzithkp5g956","USD"],["woz7hya50swi10q","USD"],["t2rjyyq8z0w0jvn","USD"],["xhxjvj2ozc7zaqm","USD"],["n4b5b13in78ekwi","USD"],["j7ssgth6l82kbb0","USD"],["n70vgyc9goiy49y","USD"],["0quh8s3rr6v2mgl","USD"],["ca9id1sxs6toi9c","USD"],["s50f9lc0hibbaqq","USD"],["x4fxqssx1gqw5xs","USD"],["1mdq5h2hyjyhu4x","USD"],["fvgielyvyk2armt","USD"],["fgxymt4eeb2020y","USD"],["gxso85mhnhgv3bs","USD"],["zmnakzcm4dbgzz0","USD"],["6f0li2g4g3hlnc0","USD"],["cbgcf5n8346cwqq","USD"],["d7bkr4xmgpw7eb1","USD"],["skrbvb9omkcfhmd","USD"],["4ctta07p2l7hurc","USD"],["vpv8x2llyqmxws5","USD"],["855li5xnt11tncd","USD"],["4b5pw1t0ohez2fz","USD"],["hggfudiecefbo27","USD"],["ddc22fm0c8i5n17","USD"],["t73j82mrie236m6","USD"],["njp1ako111ximr1","USD"],["mp2v58yguviz0wm","USD"],["zrgtriurq60nhds","USD"],["4wpsdtxn6yc22qn","USD"],["aw1lnbmmqu1qu9v","USD"],["pv24dhgk2qwk7ls","USD"],["7edih69pocofzge","USD"],["17av9p7k5ui95s6","USD"],["c4cgftrkqsloe8p","USD"],["d57vc9k38uubdcx","USD"],["7tlugacqhwk7koq","USD"],["mco8ql4s9ocwj9f","USD"],["nzzgujdl1308kw0","USD"],["0qz9ew2crl7qve2","USD"],["thiwrnx4r9hcy55","USD"],["yyk99bogi3u0j0s","USD"],["bg7hqymbhqmkol3","USD"],["h8uy4qdl5e7ssxv","USD"],["20se7vmvpu0d2qe","USD"],["yffhm85hizq4knz","USD"],["y047dke9zy5uexd","USD"],["i7zm77mv5ecy0xr","USD"],["sz4ex6tae190q8h","USD"],["d4wy2xqm0t3ryit","USD"],["5ubnzl47l9b9853","USD"],["vutdouubt2ddzc4","USD"],["pkp02r89hif062e","USD"],["nuf7bftj6dsz6zn","USD"],["bsh5bng7m9me8o8","USD"],["xev0d6h23rosc2w","USD"],["gs1ddx8ksxbdgl3","USD"],["lxe5rk3lsz6b8bx","USD"],["y5pjq4lghttabjq","USD"],["vbl1j4q1kq237py","USD"],["e8lk6o23lc77a8b","USD"],["gyz6loflx50w7c7","USD"],["6n94w66k1z4lbzf","USD"],["pmgtbjfzlldbnpa","USD"],["bsax6qjro7fvabr","USD"],["zx24ymun3kzqjrn","USD"],["argrbrx70flpn37","USD"],["kdnswoa60wobjwb","USD"],["o84ohvz86qspnxt","USD"],["p6fj65p13fjz3ke","USD"],["szrpvmuak99n7t1","USD"],["2s1m3mkvw8s7v0o","USD"],["lc4yhacb86ixpvo","USD"],["5xje0yvldhqhg4i","USD"],["rxhtdeo0ypfrwxm","USD"],["41axdtw7rq91m4k","USD"],["9i7lmzzvnyxicxo","USD"],["wijtofwvlic7abg","USD"],["c8xziavvjiv4488","USD"],["jaz7weeifb1647n","USD"],["3rq6e7n2xlct86z","USD"],["p2ykmwxh9kp1350","USD"],["nfe4iiqlep6wc6a","USD"],["mcjs041niixkfax","USD"],["jqzoo5uuzpog25q","USD"],["clhwa4k7wyvzf4b","USD"],["xgwfyubbwbv7glt","USD"],["p6bqw2xrhtshqkb","USD"],["xhfi935c6z09ybc","USD"],["7qa7rcim2ygo3jr","USD"],["l7ux0zpkxxsi5yo","USD"],["t7bvk9sll3fbcry","USD"],["fbjuk0wg5s5u631","USD"],["qvr1vqtar3sr4n7","USD"],["r62twmd29v31xwm","USD"],["0htza7pivyrpc2b","USD"],["d115fdpohg4cdro","USD"],["go2zkv3lz63xp07","USD"],["1hl04w7vme4hh9b","USD"],["2dfhghnu0o3j9u0","USD"],["uzsu0w3rwdb2rah","USD"],["5x4ivy1hglpqitq","USD"],["wkcporm5qrj08rg","USD"],["wqfkg7r2oyyfxo1","USD"],["x5ejpb1rwi0wqje","USD"],["ok8t5e3wj26mk6x","USD"],["ghs064jeaskugdv","USD"],["jgx3fidd2kfhdp8","USD"],["upcweyyw1n0lsk5","USD"],["qpet7jybhkw5lmk","USD"],["7aothgze36giaxs","USD"],["v7ovbe08zwqw4zn","USD"],["rs8voty9izdnsu9","USD"],["ylj0eyz0ekydlpl","USD"],["67qzxg7zllixyu7","USD"],["w714bs3ile9wdo1","USD"],["lsm7ajanp5pcazp","USD"],["h9rbqzdta4yzgtb","USD"],["as6dgbx57wzy6ow","USD"],["r5j41btmxcuoimi","USD"],["jbg48qe8gx3x2e9","USD"],["cqwgpvfuvgkg1jo","USD"],["c22m3nbe6tzvd2m","USD"],["1c1klxmvek8k97h","USD"],["j9wdc6ffckwwqeg","USD"],["1pn54ox0rq9o6b4","USD"],["7b2bw1bwrajx5ut","USD"],["0w166bek5x9y03i","USD"],["7lwf0apg6k7o8yo","USD"],["18w60y4511b5omj","USD"],["kx2awya21ask5nc","USD"],["7yw3i4kgsar87uy","USD"],["xule8l8zfid79sr","USD"],["c2imzu3zmmz9j43","USD"],["wb56wu4ksj3e80b","USD"],["9r4euu9yfrhiymm","USD"],["vglwbgf54blzouk","USD"],["4re74myx12bannu","USD"],["nnwhhnm1f312ua5","USD"],["7yxr065an84aw7s","USD"],["ftaxtdgr6igel7y","USD"],["c6yoa6y0cvwm32x","USD"],["h9fu3i7rwdlqjt5","USD"],["99c7jwk6k4bi2pz","USD"],["j14l6jsh3wniod6","USD"],["cf43uze4mebrhb6","USD"],["y1pcav9xcehvljl","USD"],["sztspj4shrz4b7o","USD"],["e53owd4to3jxb5y","USD"],["c94h8nuovn80hap","USD"],["mfuek076kublf9n","USD"],["j2fojwwl2ya067k","USD"],["63vn9t6jvqohg41","USD"],["sxuejbarwdg3fy9","USD"],["astfr1w9dq9rms4","USD"],["rlseet8upds1h0l","USD"],["lul8imbcdooqouf","USD"],["glfbjs08f074m8a","USD"],["bncsreu2i6afkrd","USD"],["xi02ntxoyo4i0ya","USD"],["4uq2rt1t29uuaho","USD"],["xx6aaj1984iexs7","USD"],["54uregsqtceq6xm","USD"],["0r4nz3gbekmmkz4","USD"],["agcmea1fx976m5x","USD"],["lc0b81e3iyq93mf","USD"],["1fl0asj4zgy07ug","USD"],["7f7w1otydb8njk6","USD"],["4oh3cyfp1kq8uex","USD"],["5wyhc379gjc4dqq","USD"],["pmzb3ljvrxjbl7c","USD"],["mrzn61zff63kh7c","USD"],["mg2tbbkbah78ku3","USD"],["2trnlq4bkv1b60c","USD"],["ignxo2zkk35ot4a","USD"],["btc4bq0x0n6ifuu","USD"],["uxhvgh2kfiv3a8i","USD"],["203muymtxvt3taf","USD"],["5htvnmymjjt6c9w","USD"],["73hj0w67xa6jesf","USD"],["6z6nhexchjyzcqt","USD"],["i4m8pmhlopw8laa","USD"],["pbbnh8na1g6w76k","USD"],["5iuejovxcpruwiw","USD"],["yt0xyanhz0s6tht","USD"],["j992xwgjz3gthok","USD"],["1wfnbj4bjrbsqt5","USD"],["p5haoycebzem1w7","USD"],["lh3aq9lxi3xymg6","USD"],["5pktxiwwgph30tz","USD"],["o2pu3t7vhdx30wm","USD"],["eaxf9r6nm1ml2fw","USD"],["yxh2logcdqw7141","USD"],["u520354tso45jxm","USD"],["016pnf5q0wesu3z","USD"],["nlqk0ua6uozu14z","USD"],["joykusmemc7u5op","USD"],["4yogweg1xe2b6lm","USD"],["m23ayt0v9pwop63","USD"],["2vcmeezivxxnvav","USD"],["34z8okti7gs1doa","USD"],["dbls422s3r6fcaq","USD"],["2t2l661ux1d4stw","USD"],["3b4mv7rssliyvm3","USD"],["z55a0vvjidhjep3","USD"],["3wjqluqbjd91dwo","USD"],["1q4f7p7wzezn0if","USD"],["9w6rpty4dlerbaa","USD"],["5l3hkriniiyss1q","USD"],["zuvtp2bnrohg0m0","USD"],["rcwpcaw80wtv8i7","USD"],["crrv32p4o20bnbt","USD"],["8ha8ztfknrlx4k2","USD"],["p5ws3r5vpli89rj","USD"],["y4l1e5h9woen181","USD"],["4y6dghq03dahc76","USD"],["p4ywt2bilnfygb3","USD"],["6ae28xqxg4ymsgl","USD"],["py35yuia21vwi55","USD"],["gk8jstdcacvorcy","USD"],["5kb16s92zimo113","USD"],["1u7bi85oj48dai6","USD"],["ai9pgo0m8pdviwj","USD"],["1af87sy9q5am8n1","USD"],["9wn2gzh1pepjsbh","USD"],["nvrjre4x7ht94yc","USD"],["vbz05uaqgwki27w","USD"],["jdy21kmr07td1ma","USD"],["aedq5xz9st6eyu5","USD"],["8onpyhdfzpg3gps","USD"],["9lcqo6juplu9q64","USD"],["rbnn5ynkoo06m0q","USD"],["vltdgszbz3ub4yp","USD"],["t0lyt3fgkef33w7","USD"],["c0crkzojtlgia19","USD"],["7ps5ovynkxa6xp0","USD"],["pbhx1wavtrsajo9","USD"],["7giky95zjuhdqr8","USD"],["b88uayh17xi4o0c","USD"],["ymi6078tq0ndxof","USD"],["ido62pa2v2m7e6i","USD"],["gdt74vvlemwxttj","USD"],["sn1fgyoq50tpuwg","USD"],["i3a7k6oalk6peh9","USD"],["cmfr7x60gsxsz09","USD"],["u6x9ebtllu5kfql","USD"],["81c4lqfc3u5t7s3","USD"],["lpiriui94o92hue","USD"],["0u0vjon24yhf6ci","USD"],["h233g70zbo2hh2w","USD"],["eyevdu2mbo2ohmn","USD"],["cx4kpqbaq108rl6","USD"],["lw0s2bbi103ro0l","USD"],["phh0nf776k9ssoy","USD"],["dffdnst7bma3prg","USD"],["3rlwerh7pelip6f","USD"],["qav46nz1aty4wuz","USD"],["x3dyzpltbiefcya","USD"],["xdf52zu870gb3ex","USD"],["wg4cr5w31fdz8ef","USD"],["wtllg2lf0laz0rh","USD"],["p77iqhuwrv08w0z","USD"],["4fzfhs0t40c9xpm","USD"],["z6vc4it7xktdgbo","USD"],["7yhhscez4c4uivh","USD"],["kigvi0j5ve3q9hl","USD"],["fxjglxovj783dut","USD"],["z2ppm74c1yivzx2","USD"],["svb3kunghl0eq2c","USD"],["41pt4ktt6ltzfgk","USD"],["08z09ggl6rewm1w","USD"],["4nwdxka2n083rod","USD"],["3hzx50tsm184os3","USD"],["7efw11no9hqifv9","USD"],["g6554pggremvoow","USD"],["0bvkyt7ti47jwf7","USD"],["p2c54c3yxrw3dmb","USD"],["mje2ltvebl8at9x","USD"],["b8qemqkh0amsfis","USD"],["tcbsx6erxd9h2p9","USD"],["j9hw35l94h4axai","USD"],["a6a51t2gvqcn3g1","USD"],["gqxywws9d3oh9rq","USD"],["qfrqw86ffxermyq","USD"],["ds8617pplch1v2a","USD"],["sjfr9rfcr0xyith","USD"],["c97cgvp31g6umax","USD"],["qbqjzuvmoegk30x","USD"],["zpbynpyq13izzrr","USD"],["v2c44gqn8d6fk4s","USD"],["zg78413p39p2dgb","USD"],["gqlgv27hc9t7uwf","USD"],["2gzkntpj5f2jtnz","USD"],["ymluu3kjh7pycem","USD"],["0v131c2l0xhpy8t","USD"],["x2ufx9x2v9sjp6v","USD"],["noo9bqqd4v0y1p4","USD"],["5pxledukyggp7tw","USD"],["8c3dvzkvc41o4nt","USD"],["hpsruc5un88bted","USD"],["jppwpm8vxqe49rc","USD"],["isjxva12vgw19z0","USD"],["hoc6o2pldmf941h","USD"],["4exylhgsxhhlp1z","USD"],["vsa21f45qb0fusj","USD"],["mfvwo4nhs2cz1le","USD"],["2y3jg4kip8ktt0q","USD"],["cl2oqc2olflm18w","USD"],["2ttucsaan28905q","USD"],["6qtuds4edt8olu3","USD"],["qc2d41071qlwqv0","USD"],["1za2xw9m0d8wn8z","USD"],["0xrg5vhcr4qku55","USD"],["5wwhfi49t6gvcpm","USD"],["ltf0c7k2embgl68","USD"],["ktzb9ect1vwwuwd","USD"],["mkk61bd3ti895d2","USD"],["zwl265sgrngnci0","USD"],["wlu5wdh3q2d09z2","USD"],["q00nih1w41es6sq","USD"],["5jjew46ecfx49he","USD"],["oz143y9i022o31w","USD"],["a26w1az7jzeva0o","USD"],["y76u6wd0kc5tmvk","USD"],["a53j078ox9eo0nm","USD"],["7k7oagpijb9zuhz","USD"],["v60f9aeqk42wguo","USD"],["b9qc95lewmxzyws","USD"],["2svuuruvf0hrp81","USD"],["7gc99zri8fwi8v5","USD"],["8d402ixl1hy27e3","USD"],["ty395wpvg6ezx2v","USD"],["thfpehxqwmas8ww","USD"],["eoal4pb3m15ki5e","USD"],["7sqvnhij0jupbop","USD"],["vni59g66kj1lb8v","USD"],["vd71kbuadf4m6tq","USD"],["nifty3ooimdbb95","USD"],["4ef0nn1ht1ywu5o","USD"],["92tqjgfy0slju74","USD"],["qxj7zor19nxnkki","USD"],["41424nqpvtq0s9s","USD"],["4sggngn3k1fz9bj","USD"],["2ds57piem74fszc","USD"],["iqgwi03ileog195","USD"],["n50jb4cd812hrml","USD"],["wrt5jtxsex0zaxf","USD"],[null,"USD"]]')),
w AS (SELECT [[t1.id]] AS __id, NULLIF([[t2.id]], '') AS c0, NULLIF([[t2.id]], '') AS c2, [[t1.currency]] AS ck0, NULLIF([[t2.id]], '') AS k0, [[t1.credit]] AS h5, [[t1.debit]] AS h6, NULLIF(substr([[t1.date]], 1, 10), '') AS h7, NULLIF([[t5.posted_at]], '') AS h8, [[t1.position]] AS h9, NULLIF([[t5.doc_type]], '') AS h10, NULLIF([[t5.origin]], '') AS h11, [[t9.number]] AS h12, [[t5.number]] AS h13, [[t1.memo]] AS h14, [[t5.memo]] AS h15, [[t5.document]] AS h16, NULLIF([[t5.id]], '') AS h17
FROM r0 t1
LEFT JOIN r1 t2 ON [[t2.id]] = [[t1.vendor]]
LEFT JOIN r2 t3 ON [[t3.id]] = [[t1.account]]
LEFT JOIN r3 t5 ON [[t5.id]] = [[t1.entry]]
LEFT JOIN r3 t9 ON [[t9.id]] = [[t5.reverses]]
WHERE ((([[t1.posted]] IS true) AND (NULLIF([[t3.type]], '') IS 'accounts_payable' AND [[t3.type]] = 'accounts_payable') AND (NULLIF(substr([[t1.date]], 1, 10), '') <= '2026-11-18'))) AND ([[t1.vendor]] IN (SELECT g0 FROM gord WHERE g0 IS NOT NULL) OR NULLIF([[t2.id]], '') IS NULL)),
a1 AS (SELECT k0, ck0, COALESCE(sum((COALESCE(w.h5, 0) - COALESCE(w.h6, 0))), 0) AS y0, count(*) AS __n FROM w GROUP BY k0, ck0),
gr1 AS (SELECT * FROM (SELECT a.*, [[t4.display_name]] AS rc0, [[t4.inactive]] AS rc1, NULLIF([[t4.id]], '') AS rc2 FROM a1 a LEFT JOIN r1 t4 ON [[t4.id]] IS a.k0) a),
s1 AS MATERIALIZED (SELECT a.* FROM gr1 a WHERE COALESCE((('nonzero' IS 'activity') OR (a.y0 IS NOT 0)), 0)),
ws AS (SELECT w.* FROM w WHERE EXISTS (SELECT 1 FROM s1 p WHERE p.k0 IS w.k0 AND p.ck0 IS w.ck0))
SELECT * FROM (SELECT d.*, gord.__g AS __g FROM (SELECT w.__id AS __id, w.k0 AS k0, w.ck0 AS ck0, w.h7 AS s0, w.h8 AS s1, w.h9 AS s2, (CASE WHEN (w.rc0 IS NULL OR w.rc0 = '') THEN 1 ELSE 0 END) AS s3, tc_round((CASE WHEN ('name' IS 'balance') THEN COALESCE((COALESCE(w.h5, 0) - COALESCE(w.h6, 0)), 0) ELSE 0 END), 0) AS s4, lower(w.rc1) AS s5, w.c0 AS v0, NULL AS vcur0, NULL AS vmx0, w.wh0 AS vl0, NULL AS vc0, COALESCE((COALESCE(w.h5, 0) - COALESCE(w.h6, 0)), 0) AS v1, NULL AS vcur1, NULL AS vmx1, NULL AS vl1, NULL AS vc1, w.c2 AS v2, NULL AS vcur2, NULL AS vmx2, w.wh1 AS vl2, NULL AS vc2, (COALESCE(w.h7, '') || COALESCE(' · ', '') || COALESCE((CASE WHEN ((w.h10 IS 'bill') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill' WHEN ((w.h10 IS 'bill_payment') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Bill payment' WHEN ((w.h10 IS 'credit_memo') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Credit memo' WHEN ((w.h10 IS 'expense') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Expense' WHEN ((w.h10 IS 'invoice') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Invoice' WHEN ((w.h10 IS 'payment') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Payment' WHEN ((w.h10 IS 'refund_receipt') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Refund receipt' WHEN ((w.h10 IS 'sales_receipt') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Sales receipt' WHEN ((w.h10 IS 'transfer') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Transfer' WHEN ((w.h10 IS 'vendor_credit') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor credit' WHEN ((w.h10 IS 'vendor_refund') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Vendor refund' WHEN ((w.h10 IS 'write_off') AND (NOT COALESCE((w.h11 IN (SELECT +value FROM json_each('["reversal","void_reversal","auto_reversal"]'))), 0))) THEN 'Write-off' WHEN (w.h11 IS 'reversal') THEN (CASE WHEN (w.h12 IS NULL OR w.h12 = '') THEN 'Reversal' ELSE (COALESCE('Reversal', '') || COALESCE(' of ', '') || COALESCE(w.h12, '')) END) WHEN (w.h11 IS 'void_reversal') THEN (CASE WHEN (w.h12 IS NULL OR w.h12 = '') THEN 'Void reversal' ELSE (COALESCE('Void reversal', '') || COALESCE(' of ', '') || COALESCE(w.h12, '')) END) WHEN (w.h11 IS 'auto_reversal') THEN (CASE WHEN (w.h12 IS NULL OR w.h12 = '') THEN 'Auto reversal' ELSE (COALESCE('Auto reversal', '') || COALESCE(' of ', '') || COALESCE(w.h12, '')) END) WHEN (w.h11 IS 'manual') THEN 'Journal entry' WHEN (w.h11 IS 'opening_balance') THEN 'Opening balances' ELSE 'Journal entry' END), '') || COALESCE(' ', '') || COALESCE(w.h13, '') || COALESCE(' · ', '') || COALESCE((CASE WHEN (w.h14 IS NULL OR w.h14 = '') THEN w.h15 ELSE w.h14 END), '')) AS __label, NULL AS __labelcur, (CASE WHEN ((w.h11 IS 'document') AND (w.h10 IS 'bill') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/bills/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'bill_payment') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/bill-payments/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'credit_memo') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/credit-memos/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'expense') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/expenses/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'invoice') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/invoices/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'payment') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/payments/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'refund_receipt') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/refund-receipts/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'sales_receipt') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/sales-receipts/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'vendor_credit') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/vendor-credits/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'vendor_refund') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/vendor-refunds/', '') || COALESCE(w.h16, '')) WHEN ((w.h11 IS 'document') AND (w.h10 IS 'write_off') AND (NOT COALESCE((w.h16 IS NULL OR w.h16 = ''), 0))) THEN (COALESCE('books/write-offs/', '') || COALESCE(w.h16, '')) WHEN ((w.h10 IS 'transfer') AND (w.h11 IS 'manual')) THEN (COALESCE('books/transfers/', '') || COALESCE(w.h17, '')) ELSE (COALESCE('books/entries/', '') || COALESCE(w.h17, '')) END) AS __open FROM (SELECT w.*, (SELECT COALESCE(NULLIF([[t8.display_name]], ''), '(no name)')
FROM r1 t8
WHERE [[t8.id]] IS w.c2) AS wh1 FROM (SELECT w.*, (SELECT COALESCE(NULLIF([[t7.display_name]], ''), '(no name)')
FROM r1 t7
WHERE [[t7.id]] IS w.c0) AS wh0 FROM (SELECT w.*, NULLIF([[t6.id]], '') AS rc0, [[t6.display_name]] AS rc1 FROM ws w LEFT JOIN r1 t6 ON [[t6.id]] IS w.k0) w) w) w) d JOIN gord ON d.k0 IS gord.g0 AND d.ck0 IS gord.g1) d WHERE 1 ORDER BY d.__g, (d.s0 IS NULL), d.s0, (d.s1 IS NULL), d.s1, (d.s2 IS NULL), d.s2, (d.s3 IS NULL), d.s3, (d.s4 IS NULL), d.s4 DESC, (d.s5 IS NULL), d.s5, d.__id LIMIT 50002
```

no statistics:

```
MATERIALIZE gord
  SCAN json_each VIRTUAL TABLE INDEX 1:
SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
SCALAR SUBQUERY 8
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 75
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 76
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 77
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 47
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 48
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 49
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 61
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 62
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 63
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
LIST SUBQUERY 14
  SCAN gord
  CREATE BLOOM FILTER
CORRELATED SCALAR SUBQUERY 20
  MATERIALIZE s1
    CO-ROUTINE a1
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 145
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 146
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 147
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 117
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 118
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 119
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 131
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 132
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 133
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      REUSE LIST SUBQUERY 14
      SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 11
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 159
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 160
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 161
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_entries USING COVERING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 11
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 173
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 174
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 175
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
      CORRELATED SCALAR SUBQUERY 187
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 188
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 189
        SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
      SCAN __rule
      SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  BLOOM FILTER ON p (k0=? AND ck0=?)
  SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 11
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 89
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 90
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 91
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 11
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 103
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 104
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 105
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 201
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 202
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 203
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
BLOOM FILTER ON gord (g0=?)
SEARCH gord USING AUTOMATIC PARTIAL COVERING INDEX (g0=?)
CORRELATED SCALAR SUBQUERY 35
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 215
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 216
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 217
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 34
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 229
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 230
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 231
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
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
LIST SUBQUERY 33
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
USE TEMP B-TREE FOR ORDER BY
```

after ANALYZE:

```
MATERIALIZE gord
  SCAN json_each VIRTUAL TABLE INDEX 1:
SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
SCALAR SUBQUERY 8
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 75
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 76
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 77
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 2
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 47
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 48
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 49
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 61
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 62
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 63
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
LIST SUBQUERY 14
  SCAN gord
  CREATE BLOOM FILTER
CORRELATED SCALAR SUBQUERY 20
  MATERIALIZE s1
    CO-ROUTINE a1
      SEARCH books_accounts USING INDEX idx_books_accounts_type (type=?)
      SCALAR SUBQUERY 8
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 145
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 146
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 147
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 2
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 117
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 118
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 119
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_lines USING INDEX idx_books_jlines_account_posted_vendor_date (account=?)
      SEARCH books_vendors USING COVERING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 5
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 131
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 132
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 133
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      REUSE LIST SUBQUERY 14
      SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 11
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 159
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 160
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 161
          SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
        SCAN __rule
        SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
      SEARCH books_journal_entries USING COVERING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
      SCALAR SUBQUERY 11
        CO-ROUTINE __rule
          SCAN CONSTANT ROW
        SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
        CORRELATED SCALAR SUBQUERY 173
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 174
          SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
        CORRELATED SCALAR SUBQUERY 175
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
      CORRELATED SCALAR SUBQUERY 187
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 188
        SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
      CORRELATED SCALAR SUBQUERY 189
        SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
      SCAN __rule
      SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
  BLOOM FILTER ON p (k0=? AND ck0=?)
  SEARCH p USING AUTOMATIC COVERING INDEX (k0=? AND ck0=?)
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 11
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 89
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 90
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 91
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_journal_entries USING INDEX sqlite_autoindex_books_journal_entries_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 11
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 103
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 104
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 105
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?) LEFT-JOIN
SCALAR SUBQUERY 5
  CO-ROUTINE __rule
    SCAN CONSTANT ROW
  SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
  CORRELATED SCALAR SUBQUERY 201
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 202
    SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
  CORRELATED SCALAR SUBQUERY 203
    SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
  SCAN __rule
  SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
BLOOM FILTER ON gord (g0=?)
SEARCH gord USING AUTOMATIC PARTIAL COVERING INDEX (g0=?)
CORRELATED SCALAR SUBQUERY 35
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 215
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 216
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 217
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
CORRELATED SCALAR SUBQUERY 34
  SEARCH books_vendors USING INDEX sqlite_autoindex_books_vendors_1 (id=?)
  SCALAR SUBQUERY 5
    CO-ROUTINE __rule
      SCAN CONSTANT ROW
    SEARCH u USING INDEX sqlite_autoindex_users_1 (id=?)
    CORRELATED SCALAR SUBQUERY 229
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 230
      SEARCH a USING INDEX idx_org_pkg_access_user_pkg (user=? AND pkg=?)
    CORRELATED SCALAR SUBQUERY 231
      SEARCH b USING COVERING INDEX idx_books_admins_user (user=?)
    SCAN __rule
    SEARCH __auth_users USING INDEX sqlite_autoindex_users_1 (id=?) LEFT-JOIN
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
LIST SUBQUERY 33
  SCAN json_each VIRTUAL TABLE INDEX 1:
  CREATE BLOOM FILTER
USE TEMP B-TREE FOR ORDER BY
```
