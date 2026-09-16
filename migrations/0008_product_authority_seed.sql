-- Canonical OrbitFS product authority seed.
-- License Master owns product definitions and the entitlement components issued from them.
insert into license_products
(id, code, name, slug, description, product_type, active, purchasable, public, component_key, runtime, requires_engine, requires_base, max_installations, sort_order)
values
('prod_orbitfs_base','orbitfs_base','OrbitFS Base','orbitfs-base','OrbitFS core panel and base runtime.','component',true,true,true,'orbitfs_base','panel',false,false,1,10),
('prod_orbitfs_mcp','orbitfs_mcp','OrbitFS MCP','orbitfs-mcp','ChatGPT/MCP backend addon for OrbitFS.','addon',true,true,true,'orbitfs_mcp','engine',true,true,1,20),
('prod_orbitfs_apex','orbitfs_apex','OrbitFS APEX','orbitfs-apex','Sorter and converter addon for OrbitFS.','addon',true,true,true,'orbitfs_apex','engine',true,true,1,30),
('prod_orbitfs_studio','orbitfs_studio','OrbitFS Studio','orbitfs-studio','Writing and documentation addon for OrbitFS.','addon',true,true,true,'orbitfs_studio','engine',true,true,1,40)
on conflict (code) do update set name=excluded.name,description=excluded.description,product_type=excluded.product_type,component_key=excluded.component_key,runtime=excluded.runtime,requires_engine=excluded.requires_engine,requires_base=excluded.requires_base,updated_at=now();

insert into product_component_rules(id,product_id,component_key,enabled,required)
select 'rule_' || p.code || '_' || p.component_key, p.id, p.component_key, true, true
from license_products p
where p.code in ('orbitfs_base','orbitfs_mcp','orbitfs_apex','orbitfs_studio')
on conflict (product_id,component_key) do update set enabled=true,required=true;
