-- Migration ID: 20260227000011_debug_rpc_function
-- Description: Adds debug_database_state RPC function for diagnosis

CREATE OR REPLACE FUNCTION public.debug_database_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_locks jsonb;
    v_queries jsonb;
    v_triggers jsonb;
BEGIN
    -- Get Locks
    SELECT jsonb_agg(row_to_json(l)) INTO v_locks
    FROM (
        SELECT pid, mode, granted, relation::regclass as relation
        FROM pg_locks
        WHERE NOT granted
    ) l;

    -- Get Queries (All active ones to see what's happening)
    SELECT jsonb_agg(row_to_json(a)) INTO v_queries
    FROM (
        SELECT pid, now() - query_start as duration, query, state, wait_event_type, wait_event
        FROM pg_stat_activity
        WHERE state != 'idle' AND pid <> pg_backend_pid()
    ) a;

    -- Get Triggers
    SELECT jsonb_agg(row_to_json(t)) INTO v_triggers
    FROM (
        SELECT event_object_table, trigger_name, action_timing, event_manipulation
        FROM information_schema.triggers
        WHERE event_object_table IN ('platform_users', 'platform_wallets')
    ) t;

    RETURN jsonb_build_object(
        'locks', COALESCE(v_locks, '[]'::jsonb),
        'queries', COALESCE(v_queries, '[]'::jsonb),
        'triggers', COALESCE(v_triggers, '[]'::jsonb)
    );
END;
$$;
