-- No invented auction/transaction data in production tables.
insert into public.app_settings(id,scoring_config,collection_config) values (
  1,
  '{"weights":{"price_attractiveness":40,"failed_bids":15,"transaction_activity":15,"competition":10,"profitability":20},"version":1}',
  '{"onbid_interval_minutes":60,"transaction_lookback_months":12}'
) on conflict(id) do nothing;
-- TODO Phase 4: validate and load these settings in scoring service (not implemented yet).
