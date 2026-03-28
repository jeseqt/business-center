-- Fix invite code type logic: 
-- 1. 'beta' codes: Allow multiple per user (removed restriction)
-- 2. 'activity' codes: Limit to 1 per user (added restriction)

CREATE OR REPLACE FUNCTION public.redeem_invite_code(
    _app_id uuid,
    _code text,
    _platform_user_id uuid,
    _required_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _invite_record record;
    _user_id uuid;
BEGIN
    -- Get auth user id from platform user
    select user_id into _user_id from public.platform_users where id = _platform_user_id;
    
    if _user_id is null then
        return jsonb_build_object('success', false, 'error', 'User not found');
    end if;

    -- Find invite code
    select * into _invite_record 
    from public.platform_invite_codes 
    where code = _code 
      and app_id = _app_id
    for update;
    
    if not found then
        return jsonb_build_object('success', false, 'error', 'Invalid code or code not belongs to this app');
    end if;

    -- Check type if required
    if _required_type is not null and _invite_record.type != _required_type then
         return jsonb_build_object('success', false, 'error', 'Invalid code type');
    end if;

    -- Verify status
    if _invite_record.status != 'active' then
        return jsonb_build_object('success', false, 'error', 'Code is not active');
    end if;

    -- Verify expiration
    if _invite_record.expires_at is not null and _invite_record.expires_at < now() then
        return jsonb_build_object('success', false, 'error', 'Code expired');
    end if;

    -- Verify usage limit
    if _invite_record.max_usage > 0 and _invite_record.current_usage >= _invite_record.max_usage then
        return jsonb_build_object('success', false, 'error', 'Max usage reached');
    end if;

    -- Verify if user already redeemed THIS specific code (idempotency)
    if exists (select 1 from public.platform_user_invites where invite_code_id = _invite_record.id and platform_user_id = _platform_user_id) then
        return jsonb_build_object('success', false, 'error', 'Already redeemed this code');
    end if;

    -- [CHANGED] 'beta' type: No limit check (User can use multiple)
    
    -- [CHANGED] 'activity' type: Strict limit 1 per user
    if _invite_record.type = 'activity' then
        if exists (
            select 1 
            from public.platform_user_invites u
            join public.platform_invite_codes c on u.invite_code_id = c.id
            where u.platform_user_id = _platform_user_id
              and c.type = 'activity'
        ) then
            return jsonb_build_object('success', false, 'error', 'You have already bound an invite code');
        end if;
    end if;

    -- Update usage
    update public.platform_invite_codes
    set current_usage = current_usage + 1,
        updated_at = now()
    where id = _invite_record.id;

    -- Insert usage record
    insert into public.platform_user_invites (platform_user_id, invite_code_id, used_at)
    values (_platform_user_id, _invite_record.id, now());

    return jsonb_build_object(
        'success', true, 
        'data', jsonb_build_object(
            'id', _invite_record.id,
            'code', _invite_record.code,
            'type', _invite_record.type
        )
    );
END;
$$;
