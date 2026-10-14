-- The data factory's batch RPCs (refresh_current_rounds etc.) outgrew the 8s API timeout it inherited
-- from authenticator. Only server-side jobs use service_role; anon/authenticated keep 3s/8s.
alter role service_role set statement_timeout = '120s';
notify pgrst, 'reload config';
