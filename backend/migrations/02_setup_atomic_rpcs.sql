-- =============================================================================
-- Phase 2: PostgreSQL Atomic PL/pgSQL RPC Stored Procedures
-- Project: MAK FIN PAY
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RPC: rpc_get_agent_stats
-- Fast aggregate query for Agent Dashboard (< 5ms)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_agent_stats(p_user_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_wallet_bal NUMERIC(15, 2) := 0.00;
  v_qr_sum NUMERIC(15, 2) := 0.00;
  v_bill_sum NUMERIC(15, 2) := 0.00;
  v_pending_recharges INT := 0;
  v_pending_bills INT := 0;
  v_pending_withdrawals INT := 0;
  v_res JSONB;
BEGIN
  -- Get wallet balance
  SELECT COALESCE(balance, 0.00) INTO v_wallet_bal FROM wallets WHERE user_id::text = p_user_id LIMIT 1;
  
  -- Aggregate approved QR payments
  SELECT COALESCE(SUM(amount), 0.00) INTO v_qr_sum FROM recharges WHERE user_id::text = p_user_id AND status = 'approved';

  -- Aggregate success bill payments
  SELECT COALESCE(SUM(bill_amount), 0.00) INTO v_bill_sum FROM transactions WHERE user_id::text = p_user_id AND status = 'success';

  -- Pending counts
  SELECT COUNT(*) INTO v_pending_recharges FROM recharges WHERE user_id::text = p_user_id AND status = 'pending';
  SELECT COUNT(*) INTO v_pending_bills FROM transactions WHERE user_id::text = p_user_id AND status = 'pending';
  SELECT COUNT(*) INTO v_pending_withdrawals FROM withdrawals WHERE user_id::text = p_user_id AND status = 'pending';

  v_res := jsonb_build_object(
    'wallet_balance', COALESCE(v_wallet_bal, 0.00),
    'qr_payment', COALESCE(v_qr_sum, 0.00),
    'live_bill_payment', COALESCE(v_bill_sum, 0.00),
    'pending_requests', (v_pending_recharges + v_pending_bills + v_pending_withdrawals)
  );
  
  RETURN v_res;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 2. RPC: rpc_get_distributor_stats
-- Fast aggregate query for Distributor Dashboard (< 5ms)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_distributor_stats(p_dist_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_agents_count INT := 0;
  v_pending_recharges INT := 0;
  v_approved_recharges INT := 0;
  v_earnings NUMERIC(15, 2) := 0.00;
  v_today_earnings NUMERIC(15, 2) := 0.00;
  v_withdraw_reserved NUMERIC(15, 2) := 0.00;
  v_today_start TIMESTAMPTZ := date_trunc('day', NOW() AT TIME ZONE 'UTC');
BEGIN
  SELECT COUNT(*) INTO v_agents_count FROM users WHERE parent_id::text = p_dist_id AND is_deleted = false;

  SELECT COUNT(*) INTO v_pending_recharges FROM recharges r 
    JOIN users u ON r.user_id::text = u.id::text 
    WHERE u.parent_id::text = p_dist_id AND r.status = 'pending';

  SELECT COUNT(*) INTO v_approved_recharges FROM recharges WHERE distributor_id::text = p_dist_id AND status = 'approved';

  SELECT COALESCE(SUM(distributor_earnings_amount), 0.00) INTO v_earnings 
    FROM recharges WHERE distributor_id::text = p_dist_id AND status = 'approved';

  SELECT COALESCE(SUM(distributor_earnings_amount), 0.00) INTO v_today_earnings 
    FROM recharges WHERE distributor_id::text = p_dist_id AND status = 'approved' AND created_at >= v_today_start;

  SELECT COALESCE(SUM(amount), 0.00) INTO v_withdraw_reserved 
    FROM withdrawals WHERE user_id::text = p_dist_id AND status IN ('approved', 'pending');

  RETURN jsonb_build_object(
    'agents', v_agents_count,
    'pending_recharges', v_pending_recharges,
    'approved_recharges', v_approved_recharges,
    'earnings', v_earnings,
    'today_earnings', v_today_earnings,
    'available_for_withdrawal', GREATEST(0.00, v_earnings - v_withdraw_reserved)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 3. RPC: rpc_get_md_stats
-- Fast aggregate query for Master Distributor Dashboard (< 5ms)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_get_md_stats(p_md_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_distributors_count INT := 0;
  v_agents_count INT := 0;
  v_pending_recharges INT := 0;
  v_approved_recharges INT := 0;
  v_earnings NUMERIC(15, 2) := 0.00;
  v_today_earnings NUMERIC(15, 2) := 0.00;
  v_withdraw_reserved NUMERIC(15, 2) := 0.00;
  v_today_start TIMESTAMPTZ := date_trunc('day', NOW() AT TIME ZONE 'UTC');
BEGIN
  SELECT COUNT(*) INTO v_distributors_count FROM users WHERE md_id::text = p_md_id AND role = 'distributor' AND is_deleted = false;
  SELECT COUNT(*) INTO v_agents_count FROM users WHERE md_id::text = p_md_id AND role = 'agent' AND is_deleted = false;

  SELECT COUNT(*) INTO v_pending_recharges FROM recharges r 
    JOIN users u ON r.user_id::text = u.id::text 
    WHERE u.md_id::text = p_md_id AND r.status = 'pending';

  SELECT COUNT(*) INTO v_approved_recharges FROM recharges WHERE md_id::text = p_md_id AND status = 'approved';

  SELECT COALESCE(SUM(md_earnings_amount), 0.00) INTO v_earnings 
    FROM recharges WHERE md_id::text = p_md_id AND status = 'approved';

  SELECT COALESCE(SUM(md_earnings_amount), 0.00) INTO v_today_earnings 
    FROM recharges WHERE md_id::text = p_md_id AND status = 'approved' AND created_at >= v_today_start;

  SELECT COALESCE(SUM(amount), 0.00) INTO v_withdraw_reserved 
    FROM withdrawals WHERE user_id::text = p_md_id AND status IN ('approved', 'pending');

  RETURN jsonb_build_object(
    'distributors', v_distributors_count,
    'agents', v_agents_count,
    'pending_recharges', v_pending_recharges,
    'approved_recharges', v_approved_recharges,
    'earnings', v_earnings,
    'today_earnings', v_today_earnings,
    'available_for_withdrawal', GREATEST(0.00, v_earnings - v_withdraw_reserved)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 4. RPC: rpc_approve_recharge
-- Atomic financial transaction for approving a recharge with full commission logic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_approve_recharge(
  p_recharge_id VARCHAR,
  p_admin_id VARCHAR
)
RETURNS JSONB AS $$
DECLARE
  v_recharge RECORD;
  v_agent RECORD;
  v_wallet RECORD;
  v_gross NUMERIC(15, 2);
  v_total_pct NUMERIC(15, 4) := 0.00;
  v_admin_pct NUMERIC(15, 4) := 0.00;
  v_md_pct NUMERIC(15, 4) := 0.00;
  v_dist_pct NUMERIC(15, 4) := 0.00;
  v_total_comm NUMERIC(15, 2) := 0.00;
  v_admin_rev NUMERIC(15, 2) := 0.00;
  v_md_earn NUMERIC(15, 2) := 0.00;
  v_dist_earn NUMERIC(15, 2) := 0.00;
  v_net_credit NUMERIC(15, 2) := 0.00;
  v_dist_id TEXT;
  v_md_id TEXT;
  v_new_balance NUMERIC(15, 2);
  v_now TIMESTAMPTZ := NOW() AT TIME ZONE 'UTC';
BEGIN
  -- Lock and fetch recharge
  SELECT * INTO v_recharge FROM recharges WHERE id::text = p_recharge_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge record not found';
  END IF;

  IF v_recharge.status <> 'pending' THEN
    RAISE EXCEPTION 'Recharge is already processed';
  END IF;

  v_gross := v_recharge.amount;

  -- Lock and fetch agent details
  SELECT * INTO v_agent FROM users WHERE id::text = v_recharge.user_id::text;
  IF FOUND THEN
    v_md_id := v_agent.md_id;
    IF v_agent.created_by_role = 'distributor' AND v_agent.parent_id IS NOT NULL THEN
      v_dist_id := v_agent.parent_id;
    END IF;

    v_admin_pct := COALESCE(v_agent.admin_pct, v_agent.base_commission, 0.0);
    v_md_pct    := COALESCE(v_agent.md_pct, 0.0);
    v_dist_pct  := COALESCE(v_agent.dist_pct, v_agent.markup_commission, 0.0);
    v_total_pct := COALESCE(v_agent.total_commission, v_agent.commission_percent, (v_admin_pct + v_md_pct + v_dist_pct), 0.0);
  END IF;

  IF v_recharge.is_t1 IS TRUE THEN
    v_total_pct := COALESCE(v_recharge.commission_percent, v_agent.t1_commission_percent, 0.0);
    v_admin_pct := v_total_pct;
    v_md_pct    := 0.0;
    v_dist_pct  := 0.0;

    v_total_comm := ROUND(v_gross * v_total_pct / 100.0, 2);
    v_admin_rev  := v_total_comm;
    v_md_earn    := 0.0;
    v_dist_earn  := 0.0;
    v_net_credit := ROUND(v_gross - v_total_comm, 2);
  ELSE
    v_total_comm := ROUND(v_gross * v_total_pct / 100.0, 2);
    v_admin_rev  := ROUND(v_gross * v_admin_pct / 100.0, 2);
    v_md_earn    := ROUND(v_gross * v_md_pct / 100.0, 2);
    v_dist_earn  := ROUND(v_total_comm - v_admin_rev - v_md_earn, 2);
    v_net_credit := ROUND(v_gross - v_total_comm, 2);
  END IF;

  -- Lock and update agent wallet
  SELECT * INTO v_wallet FROM wallets WHERE user_id::text = v_recharge.user_id::text FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO wallets (id, user_id, balance, created_at, updated_at)
    VALUES (gen_random_uuid()::text, v_recharge.user_id, v_net_credit, v_now, v_now)
    RETURNING * INTO v_wallet;
    v_new_balance := v_net_credit;
  ELSE
    v_new_balance := v_wallet.balance + v_net_credit;
    UPDATE wallets SET balance = v_new_balance, updated_at = v_now WHERE user_id::text = v_recharge.user_id::text;
  END IF;

  -- Create Ledger record
  INSERT INTO ledger (id, user_id, kind, amount, balance_after, ref_type, ref_id, note, created_at)
  VALUES (
    gen_random_uuid()::text,
    v_recharge.user_id,
    'credit',
    v_net_credit,
    v_new_balance,
    'recharge',
    p_recharge_id,
    'Recharge Approved: ₹' || v_recharge.amount::text,
    v_now
  );

  -- Update Recharge Status with full immutable commission snapshot
  UPDATE recharges SET 
    status = 'approved',
    commission_amount = v_total_comm,
    credit_amount = v_net_credit,
    agent_id = v_recharge.user_id,
    distributor_id = v_dist_id,
    md_id = v_md_id,
    gross_amount = v_gross,
    commission_percent_used = v_total_pct,
    admin_commission_percent = v_admin_pct,
    md_commission_percent = v_md_pct,
    distributor_markup_percent = v_dist_pct,
    total_commission_amount = v_total_comm,
    admin_revenue_amount = v_admin_rev,
    md_earnings_amount = v_md_earn,
    distributor_earnings_amount = v_dist_earn,
    net_credit_amount = v_net_credit,
    reviewed_at = v_now,
    reviewed_by = p_admin_id
  WHERE id::text = p_recharge_id;

  RETURN jsonb_build_object(
    'success', true, 
    'new_balance', v_new_balance,
    'net_credit', v_net_credit,
    'total_commission', v_total_comm,
    'admin_revenue', v_admin_rev,
    'md_earnings', v_md_earn,
    'distributor_earnings', v_dist_earn
  );
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
