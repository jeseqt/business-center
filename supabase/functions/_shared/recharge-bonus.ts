
export const RECHARGE_BONUS_CONFIG = {
    FRENZY_ACTIVE: true,
    FRENZY_MULTIPLIER: 1.5,
    FIRST_RECHARGE_RATE: 0.10,
    CUMULATIVE_THRESHOLD: 20000, // 200 USD in cents
    CUMULATIVE_REWARD: 30,
    INVITE_REWARD: 20
};

export interface BonusResult {
    totalBonus: number;
    bonusDetails: string[];
}

export async function calculateRechargeBonuses(
    supabase: any,
    order: { id: string; platform_user_id: string; amount: number; app_id: string; merchant_order_no: string },
    basePoints: number,
    externalUserId: string
): Promise<BonusResult> {
    const { FRENZY_ACTIVE, FRENZY_MULTIPLIER, FIRST_RECHARGE_RATE, CUMULATIVE_THRESHOLD, CUMULATIVE_REWARD, INVITE_REWARD } = RECHARGE_BONUS_CONFIG;
    
    let totalBonus = 0;
    const bonusDetails: string[] = [];

    // 1. Check First Recharge
    // We check if there is exactly 1 paid order (the current one, which should be updated to paid before calling this or we handle the logic carefully)
    // To be safe across both Webhook (post-update) and Mock (pre/post-update?), let's count ALL paid orders.
    // If count == 0 (pre-update) or 1 (post-update), it is first.
    // But `bagelpay-webhook` calls this AFTER update. `create-recharge-order` might call it BEFORE or AFTER.
    // Let's assume it's called AFTER the order is marked as paid.
    
    const { count: paidOrderCount, error: countError } = await supabase
        .from('platform_orders')
        .select('*', { count: 'exact', head: true })
        .eq('platform_user_id', order.platform_user_id) 
        .eq('status', 'paid');

    // If count is 1, it's the first one (current one).
    const isFirstRecharge = !countError && paidOrderCount === 1;

    if (isFirstRecharge) {
        let bonus = Math.floor(basePoints * FIRST_RECHARGE_RATE);
        if (FRENZY_ACTIVE) {
            bonus = Math.floor(bonus * FRENZY_MULTIPLIER);
            bonusDetails.push(`首充奖励 (10% x ${FRENZY_MULTIPLIER} 倍狂欢): +${bonus}`);
        } else {
            bonusDetails.push(`首充奖励 (10%): +${bonus}`);
        }
        totalBonus += bonus;
    }

    // 2. Check Cumulative Recharge (Last 7 Days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentOrders, error: recentError } = await supabase
        .from('platform_orders')
        .select('amount')
        .eq('platform_user_id', order.platform_user_id)
        .eq('status', 'paid')
        .gte('created_at', sevenDaysAgo);

    if (!recentError && recentOrders) {
        const totalRecentAmount = recentOrders.reduce((sum: number, o: any) => sum + o.amount, 0);
        
        // Calculate how many times the threshold has been crossed
        // previousTotal is the amount BEFORE this current order
        const previousTotal = totalRecentAmount - order.amount;
        
        const previousMultiples = Math.floor(previousTotal / CUMULATIVE_THRESHOLD);
        const currentMultiples = Math.floor(totalRecentAmount / CUMULATIVE_THRESHOLD);
        const newCompletions = currentMultiples - previousMultiples;
        
        if (newCompletions > 0) {
            let bonusPerCompletion = CUMULATIVE_REWARD;
            if (FRENZY_ACTIVE) {
                bonusPerCompletion = Math.floor(bonusPerCompletion * FRENZY_MULTIPLIER);
            }
            
            const totalNewBonus = bonusPerCompletion * newCompletions;
            
            if (FRENZY_ACTIVE) {
                bonusDetails.push(`累计充值奖励 x${newCompletions} (7日满$200 x ${FRENZY_MULTIPLIER} 倍狂欢): +${totalNewBonus}`);
            } else {
                bonusDetails.push(`累计充值奖励 x${newCompletions} (7日满$200): +${totalNewBonus}`);
            }
            totalBonus += totalNewBonus;
        }
    }

    // 3. Frenzy Multiplier on Base Bonus
    // The base points already include the standard bonus (e.g. Pay 30 Get 35, base bonus is 5).
    // If Frenzy is active, we need to apply the multiplier to this base bonus as well.
    // The caller passes 'basePoints' which is the total points from the product (e.g. 35).
    // 'order.amount' is in cents, so we convert to dollars for comparison.
    const amountDollars = Math.floor(order.amount / 100);
    const originalBaseBonus = basePoints - amountDollars;

    if (FRENZY_ACTIVE && originalBaseBonus > 0) {
        // Calculate the extra part due to Frenzy
        // Total Bonus should be originalBaseBonus * FRENZY_MULTIPLIER
        // We already have originalBaseBonus in basePoints, so we add the difference
        const frenzyBaseBonus = Math.floor(originalBaseBonus * FRENZY_MULTIPLIER);
        const extraFrenzy = frenzyBaseBonus - originalBaseBonus;
        
        if (extraFrenzy > 0) {
            bonusDetails.push(`狂欢节基础赠送加成 (+${originalBaseBonus} x ${FRENZY_MULTIPLIER}): +${extraFrenzy}`);
            totalBonus += extraFrenzy;
        }
    }

    // 4. Invite Logic (Handled by redeem-invite function immediately)
    // We disable this to avoid double rewarding users.
    /*
    if (isFirstRecharge) {
        // ... (existing invite logic commented out)
    }
    */

    return { totalBonus, bonusDetails };
}
