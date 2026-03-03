
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CUMULATIVE_GOAL = 200; // $200
const CUMULATIVE_REWARD = 30; // 30 points
const REWARD_TYPE = 'cumulative_reward';

export async function checkAndAwardCumulative(
    supabase: SupabaseClient,
    userId: string,
    appId: string
) {
    console.log(`Checking cumulative rewards for user ${userId}...`);
    
    // 1. Calculate total recharge amount in last 7 days (including current transaction)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Note: This query depends on RLS or service role. Edge functions use service role.
    const { data: orders, error: ordersError } = await supabase
        .from('platform_orders')
        .select('amount')
        .eq('platform_user_id', userId) // Assuming userId is platform_user_id (UUID)
        .eq('status', 'paid')
        .gte('created_at', sevenDaysAgo.toISOString());
        
    if (ordersError) {
        console.error('Error fetching recent orders:', ordersError);
        return;
    }
    
    // amount is in cents, convert to dollars for logic
    const totalAmountCents = orders.reduce((sum, order) => sum + (order.amount || 0), 0);
    const totalAmountDollars = Math.floor(totalAmountCents / 100);
    
    const targetCycles = Math.floor(totalAmountDollars / CUMULATIVE_GOAL);
    
    if (targetCycles <= 0) {
        console.log(`Cumulative total $${totalAmountDollars} < $${CUMULATIVE_GOAL}. No reward.`);
        return;
    }
    
    // 2. Check how many rewards already given in last 7 days (by amount sum)
    const { data: givenTxs, error: txError } = await supabase
        .from('platform_wallet_transactions')
        .select('amount')
        .eq('wallet_id', await getWalletId(supabase, userId))
        .eq('type', REWARD_TYPE)
        .gte('created_at', sevenDaysAgo.toISOString());
        
    if (txError) {
        console.error('Error counting given rewards:', txError);
        return;
    }
    
    const givenPoints = givenTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const alreadyGivenCycles = Math.floor(givenPoints / CUMULATIVE_REWARD);
    
    const toGiveCycles = targetCycles - alreadyGivenCycles;
    
    console.log(`Cumulative: Total $${totalAmountDollars} (${targetCycles} cycles). Given Points: ${givenPoints} (${alreadyGivenCycles} cycles). To give cycles: ${toGiveCycles}`);
    
    if (toGiveCycles > 0) {
        const points = toGiveCycles * CUMULATIVE_REWARD;
        
        // We need auth user id for process_wallet_transaction if it takes auth id
        // But here userId is platform_user_id. 
        // process_wallet_transaction expects _user_id which is AUTH user id usually?
        // Let's check process_wallet_transaction definition.
        // It takes _user_id uuid. Usually auth.uid().
        
        // Wait, platform_orders.platform_user_id IS platform_users.id
        // platform_users.id is NOT auth.uid().
        // We need to find the AUTH ID (external_user_id) corresponding to platform_user_id
        
        const { data: pUser } = await supabase
            .from('platform_users')
            .select('external_user_id')
            .eq('id', userId)
            .single();
            
        if (!pUser) {
            console.error('Platform user not found for ID:', userId);
            return;
        }
        
        const authUserId = pUser.external_user_id;

        const { error: rpcError } = await supabase.rpc('process_wallet_transaction', {
            _user_id: authUserId,
            _amount: points,
            _type: REWARD_TYPE,
            _app_id: appId,
            _description: `Cumulative Recharge Reward (x${toGiveCycles}): $${totalAmountDollars} in 7 days`
        });
        
        if (rpcError) {
            console.error('Failed to award cumulative points:', rpcError);
        } else {
            console.log(`Awarded ${points} points for cumulative recharge.`);
        }
    }
}

async function getWalletId(supabase: SupabaseClient, platformUserId: string) {
    // Helper to find wallet id by platform user id
    const { data } = await supabase
        .from('platform_wallets')
        .select('id')
        .eq('platform_user_id', platformUserId)
        .single();
    return data?.id;
}
