-- Separating platform_users.id (App Profile ID) from external_user_id (Auth ID)
-- 1. Enable updating of IDs by cascading changes to referencing tables
-- 2. Randomize platform_users.id for all existing users
-- 3. Ensure foreign keys are set to ON UPDATE CASCADE

DO $$
DECLARE
    fk RECORD;
BEGIN
    -- 1. Modify Foreign Keys to support ON UPDATE CASCADE
    -- Find all FKs referencing platform_users(id)
    FOR fk IN 
        SELECT
            tc.table_schema, 
            tc.constraint_name, 
            tc.table_name, 
            kcu.column_name
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name='platform_users'
    LOOP
        RAISE NOTICE 'Modifying constraint: %.% to ON UPDATE CASCADE', fk.table_name, fk.constraint_name;
        
        -- Drop old constraint
        EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', fk.table_schema, fk.table_name, fk.constraint_name);
        
        -- Add new constraint with ON UPDATE CASCADE
        -- We preserve ON DELETE SET NULL which seems to be the default for these tables
        EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.platform_users(id) ON DELETE SET NULL ON UPDATE CASCADE', 
            fk.table_schema, fk.table_name, fk.constraint_name, fk.column_name);
            
    END LOOP;

    -- 2. Randomize IDs
    -- Update all users to have a new random UUID
    -- Since we enabled ON UPDATE CASCADE, this will automatically update platform_token_usage, platform_orders, etc.
    UPDATE public.platform_users
    SET id = uuid_generate_v4();
    
    RAISE NOTICE 'All platform_users IDs have been randomized.';
    
END $$;
