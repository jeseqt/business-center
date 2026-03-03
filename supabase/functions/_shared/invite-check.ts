
export async function checkAndAwardInvite(
    supabase: any,
    authUserId: string,
    platformUserId: string,
    appId: string,
    orderAmount: number
) {
    console.log(`Checking invite reward for user ${authUserId}, amount ${orderAmount}`);

    // 1. Exclude Novice Experience (Amount <= 100 cents)
    if (orderAmount <= 100) {
        console.log('Invite Reward: Skipping Novice Experience order');
        return;
    }

    // 2. Check if this is the First Qualifying Recharge
    const { count, error } = await supabase
        .from('platform_orders')
        .select('*', { count: 'exact', head: true })
        .eq('platform_user_id', platformUserId)
        .eq('status', 'paid')
        .gt('amount', 100); // Strict > 100 cents

    if (error) {
        console.error('Invite Reward: Failed to count orders', error);
        return;
    }

    // If count > 1, then this is not the first qualifying order.
    // If count == 1, this IS the first one.
    if (count !== 1) {
        console.log(`Invite Reward: Not first qualifying order (count: ${count})`);
        return;
    }

    // 3. Check for Invite Binding
    const { data: inviteBinding, error: bindingError } = await supabase
        .from('platform_global_user_invites')
        .select('invite_code_id, platform_invite_codes(created_by, code)')
        .eq('user_id', authUserId)
        .maybeSingle();

    if (bindingError) {
        console.error('Invite Reward: Error fetching binding', bindingError);
        return;
    }

    // Use type assertion or optional chaining safely
    const inviterId = (inviteBinding as any)?.platform_invite_codes?.created_by;
    const inviteCode = (inviteBinding as any)?.platform_invite_codes?.code;

    if (!inviterId) {
        console.log('Invite Reward: No inviter found');
        return;
    }

    // 4. Calculate Reward (50% of Recharge Amount in Dollars/Points)
    // orderAmount is in cents.
    // 50% rebate. Example: Recharge 1000 cents ($10), rebate 500 cents ($5).
    const rewardPoints = Math.floor(orderAmount * 0.5);
    
    if (rewardPoints <= 0) {
        console.log('Invite Reward: Calculated reward is 0');
        return;
    }

    // 5. Credit Inviter
    const { error: txError } = await supabase.rpc('process_wallet_transaction', {
        _user_id: inviterId,
        _amount: rewardPoints,
        _type: 'invite_reward',
        _app_id: appId,
        _description: `Invite Reward from user ${authUserId} (Code: ${inviteCode})`
    });

    if (txError) {
        console.error('Invite Reward: Transaction failed', txError);
    } else {
        console.log(`Invite Reward: Credited ${rewardPoints} to inviter ${inviterId}`);
    }
}
