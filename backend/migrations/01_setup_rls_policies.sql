-- =============================================================================
-- Phase 1: PostgreSQL Row Level Security (RLS) Policies
-- Project: MAK FIN PAY
-- =============================================================================

-- Enable Row Level Security on all core application tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE recharges ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_name_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE headlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_charge_slabs ENABLE ROW LEVEL SECURITY;

-- Helper function to extract current authenticated user role from JWT
CREATE OR REPLACE FUNCTION get_auth_role()
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.jwt.claims', true)::json->>'user_role',
    current_setting('request.jwt.claims', true)::json->>'role',
    'anon'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper function to extract current authenticated user ID from JWT
CREATE OR REPLACE FUNCTION get_auth_uid()
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.jwt.claims', true)::json->>'sub',
    current_setting('request.jwt.claims', true)::json->>'user_id',
    auth.uid()::text,
    ''
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 1. USERS TABLE POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_users_admin_all ON users;
CREATE POLICY rls_users_admin_all ON users
  FOR ALL TO authenticated
  USING (get_auth_role() = 'admin')
  WITH CHECK (get_auth_role() = 'admin');

DROP POLICY IF EXISTS rls_users_md_select ON users;
CREATE POLICY rls_users_md_select ON users
  FOR SELECT TO authenticated
  USING (
    get_auth_role() = 'master_distributor' AND (
      id::text = get_auth_uid() OR
      md_id::text = get_auth_uid()
    )
  );

DROP POLICY IF EXISTS rls_users_dist_select ON users;
CREATE POLICY rls_users_dist_select ON users
  FOR SELECT TO authenticated
  USING (
    get_auth_role() = 'distributor' AND (
      id::text = get_auth_uid() OR
      parent_id::text = get_auth_uid()
    )
  );

DROP POLICY IF EXISTS rls_users_agent_select ON users;
CREATE POLICY rls_users_agent_select ON users
  FOR SELECT TO authenticated
  USING (
    id::text = get_auth_uid()
  );

-- -----------------------------------------------------------------------------
-- 2. WALLETS TABLE POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_wallets_select ON wallets;
CREATE POLICY rls_wallets_select ON wallets
  FOR SELECT TO authenticated
  USING (
    user_id::text = get_auth_uid() OR get_auth_role() = 'admin'
  );

-- -----------------------------------------------------------------------------
-- 3. RECHARGES TABLE POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_recharges_select ON recharges;
CREATE POLICY rls_recharges_select ON recharges
  FOR SELECT TO authenticated
  USING (
    get_auth_role() = 'admin' OR
    user_id::text = get_auth_uid() OR
    distributor_id::text = get_auth_uid() OR
    md_id::text = get_auth_uid()
  );

DROP POLICY IF EXISTS rls_recharges_agent_insert ON recharges;
CREATE POLICY rls_recharges_agent_insert ON recharges
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id::text = get_auth_uid()
  );

-- -----------------------------------------------------------------------------
-- 4. LEDGER TABLE POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_ledger_select ON ledger;
CREATE POLICY rls_ledger_select ON ledger
  FOR SELECT TO authenticated
  USING (
    user_id::text = get_auth_uid() OR get_auth_role() = 'admin'
  );

-- -----------------------------------------------------------------------------
-- 5. TRANSACTIONS TABLE POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_transactions_select ON transactions;
CREATE POLICY rls_transactions_select ON transactions
  FOR SELECT TO authenticated
  USING (
    user_id::text = get_auth_uid() OR get_auth_role() = 'admin'
  );

DROP POLICY IF EXISTS rls_transactions_agent_insert ON transactions;
CREATE POLICY rls_transactions_agent_insert ON transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id::text = get_auth_uid()
  );

-- -----------------------------------------------------------------------------
-- 6. WITHDRAWALS TABLE POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_withdrawals_select ON withdrawals;
CREATE POLICY rls_withdrawals_select ON withdrawals
  FOR SELECT TO authenticated
  USING (
    user_id::text = get_auth_uid() OR get_auth_role() = 'admin'
  );

-- -----------------------------------------------------------------------------
-- 7. PUBLIC REFERENCE TABLES (READ FOR ALL, WRITE FOR ADMIN)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_settings_public_select ON settings;
CREATE POLICY rls_settings_public_select ON settings FOR SELECT USING (true);

DROP POLICY IF EXISTS rls_headlines_public_select ON headlines;
CREATE POLICY rls_headlines_public_select ON headlines FOR SELECT USING (true);

DROP POLICY IF EXISTS rls_policies_public_select ON policies;
CREATE POLICY rls_policies_public_select ON policies FOR SELECT USING (true);

DROP POLICY IF EXISTS rls_banks_public_select ON banks;
CREATE POLICY rls_banks_public_select ON banks FOR SELECT USING (true);

DROP POLICY IF EXISTS rls_service_charge_slabs_public_select ON service_charge_slabs;
CREATE POLICY rls_service_charge_slabs_public_select ON service_charge_slabs FOR SELECT USING (true);

DROP POLICY IF EXISTS rls_qr_codes_public_select ON qr_codes;
CREATE POLICY rls_qr_codes_public_select ON qr_codes FOR SELECT USING (true);

DROP POLICY IF EXISTS rls_qr_name_entries_public_select ON qr_name_entries;
CREATE POLICY rls_qr_name_entries_public_select ON qr_name_entries FOR SELECT USING (true);
