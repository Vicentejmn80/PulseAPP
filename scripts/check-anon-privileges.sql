select 'function' as kind, p.proname as name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and (
    has_function_privilege('anon', p.oid, 'execute')
    or has_function_privilege('public', p.oid, 'execute')
    or has_function_privilege('authenticated', p.oid, 'execute')
  )
union all
select 'table-grant' as kind, c.relname as name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and (
    has_table_privilege('anon', c.oid, 'select')
    or has_table_privilege('authenticated', c.oid, 'select')
    or has_table_privilege('public', c.oid, 'select')
  )
union all
select 'table-no-rls' as kind, c.relname as name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
order by 1, 2;
