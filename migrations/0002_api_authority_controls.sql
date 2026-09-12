alter table if exists master_license_settings add column if not exists api_mode text not null default 'online' check (api_mode in ('online','offline','maintenance'));
alter table if exists master_license_settings add column if not exists allow_offline_grace boolean not null default true;
update master_license_settings set api_mode='online', allow_offline_grace=true where id='primary';
