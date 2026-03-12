
-- 20260311000002_update_voice_reflect_webhook.sql
-- Update Voice Reflect app with webhook URL for config push

DO $$
BEGIN
    -- Update webhook_url for the Voice Reflect app (identified by app_key)
    UPDATE public.platform_apps
    SET webhook_url = 'https://utomrejpwoyekngegzds.supabase.co/functions/v1/sync-points-config'
    WHERE app_key = '945dc2a8-965b-4946-91eb-e7f015024c3d';
    
    -- Optional: Log if not found (for debugging, though we can't see logs easily here)
    IF NOT FOUND THEN
        RAISE NOTICE 'App with key 945dc2a8-965b-4946-91eb-e7f015024c3d not found';
    END IF;
END $$;
