CREATE UNIQUE INDEX IF NOT EXISTS idx_licences_order_ref_unique
  ON licences(order_ref)
  WHERE order_ref IS NOT NULL AND order_ref <> '';
