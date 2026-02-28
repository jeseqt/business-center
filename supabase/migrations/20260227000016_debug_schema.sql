
CREATE OR REPLACE FUNCTION debug_schema_info(p_table text, p_column text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT data_type::text
  FROM information_schema.columns
  WHERE table_name = p_table AND column_name = p_column
  LIMIT 1;
$$;
