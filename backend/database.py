import os
import json
import uuid
import secrets
import logging
import asyncpg
from decimal import Decimal

logger = logging.getLogger("supabase_adapter")

class DuplicateKeyError(Exception):
    pass

# Predefined columns for each SQL table to avoid inserting unsupported columns
TABLE_COLUMNS = {
    "users": ["id", "role", "full_name", "email", "password_hash", "phone", "address", "aadhaar_path", "pan_path", "kyc_status", "kyc_rejection_reason", "kyc_reviewed_at", "kyc_reviewed_by", "parent_id", "md_id", "commission_percent", "base_commission", "markup_commission", "total_commission", "admin_pct", "md_pct", "dist_pct", "commission_type", "created_by_role", "created_by_id", "frozen", "is_deleted", "created_at", "created_by", "password_changed_at", "firm_name", "firm_address", "first_login", "welcome_shown", "aadhaar_back_path", "pan_back_path", "selfie_path", "cheque_path", "firm_front_path", "t1_commission_percent", "t1_admin_pct", "t1_md_pct", "t1_dist_pct", "mpin_hash", "tpin_hash"],
    "wallets": ["id", "user_id", "balance", "created_at", "updated_at", "t1_balance", "hold_balance", "hold_active"],
    "ledger": ["id", "user_id", "kind", "amount", "balance_after", "ref_type", "ref_id", "note", "created_at"],
    "recharges": ["id", "user_id", "user_name", "amount", "utr", "card_last4", "qr_code_id", "qr_code_label", "screenshot_path", "status", "commission_percent", "commission_amount", "credit_amount", "note", "created_at", "reviewed_at", "reviewed_by", "agent_id", "distributor_id", "md_id", "gross_amount", "commission_percent_used", "admin_commission_percent", "md_commission_percent", "distributor_markup_percent", "total_commission_amount", "admin_revenue_amount", "md_earnings_amount", "distributor_earnings_amount", "net_credit_amount", "estimated", "older_qr", "is_t1", "ocr_utr", "ocr_amount", "ocr_qr_name", "ocr_match", "ocr_bypass"],
    "transactions": ["id", "user_id", "user_name", "type", "customer_name", "card_last4", "operator", "customer_phone", "bill_amount", "service_charge", "total_amount", "amount", "status", "created_at", "reviewed_at", "reviewed_by", "note", "operator_txn_id", "api_charge"],
    "withdrawals": ["id", "user_id", "user_name", "role", "amount", "status", "bank", "note", "created_at", "reviewed_at", "reviewed_by"],
    "kyc": ["id", "user_id", "aadhaar_path", "pan_path", "status", "rejection_reason", "updated_at", "reviewed_at", "reviewed_by", "aadhaar_back_path", "pan_back_path", "selfie_path", "cheque_path", "firm_front_path"],
    "qr_codes": ["id", "label", "image_path", "upi_id", "active", "is_deleted", "created_at", "mobile_number", "is_t1"],
    "qr_name_entries": ["id", "name", "color", "mobile_number", "upi_id", "min_amount", "max_amount", "image_path", "position", "active", "is_deleted", "created_at", "qr_percent", "is_t1"],
    "bank_details": ["id", "user_id", "account_holder", "account_number", "ifsc", "bank_name", "phone_number", "updated_at"],
    "settings": ["id", "default_percent", "updated_at", "min_recharge_limit", "max_recharge_limit", "qr_enabled", "recharge_enabled", "withdrawal_enabled", "bill_pay_enabled", "t1_qr_enabled", "live_bill_enabled", "live_bill_api_charge", "logo_path", "favicon_path", "logo_collapsed_path", "watermark_path", "t1_recharge_enabled"],
    "files": ["id", "storage_path", "original_filename", "content_type", "size", "uploaded_by", "is_deleted", "created_at"],
    "headlines": ["id", "message", "type", "active", "position", "is_deleted", "created_at"],
    "audit_logs": ["id", "user_id", "action", "target", "meta", "ip", "created_at"],
    "backup_settings": ["id", "enabled", "retention_days", "updated_at"],
    "backups": ["id", "gridfs_id", "filename", "label", "kind", "size_bytes", "status", "manifest", "error", "started_at", "completed_at", "created_at", "created_by", "version", "restore_status", "restore_started_at", "restore_completed_at", "restore_error", "restore_safety_backup_id", "restore_result"],
    "backups_fs.files": ["_id", "length", "chunkSize", "uploadDate", "filename", "contentType", "metadata"],
    "backups_fs.chunks": ["_id", "files_id", "n", "data"],
    "notifications": ["id", "user_id", "title", "message", "read", "created_at"],
    "fraud_flags": ["id", "user_id", "reason", "created_at"],
    "service_charge_slabs": ["id", "min_amount", "max_amount", "charge_amount", "charge_type", "active", "is_deleted", "created_at"],
    "banks": ["id", "name", "active", "bill_pay_enabled", "payout_enabled", "is_deleted", "created_at"],
    "rejection_categories": ["id", "name", "show_bill", "show_qr", "show_kyc", "is_deleted", "created_at"],
    "rejection_reasons": ["id", "category_id", "reason_text", "active", "is_deleted", "created_at"],
    "policies": ["id", "title", "content", "active", "is_deleted", "created_at"],
    "billers": ["biller_id", "biller_name", "category", "metadata", "created_at"],
    "admin_profit_ledger": ["id", "type", "amount", "balance_after", "ref_type", "ref_id", "note", "created_at"],
    "admin_cashbook": ["id", "type", "amount", "balance_after", "ref_type", "ref_id", "note", "created_at"],
    "admin_credentials": ["id", "email", "password", "password_hash", "created_at"]
}

DATETIME_COLUMNS = {
    "created_at", "updated_at", "kyc_reviewed_at", "password_changed_at", 
    "reviewed_at", "uploadDate", "started_at", "completed_at", "restore_started_at", "restore_completed_at",
    "activated_at", "deactivated_at"
}

import datetime

def convert_val(key, val):
    if key in DATETIME_COLUMNS and isinstance(val, str):
        try:
            clean_val = val.replace("Z", "+00:00")
            return datetime.datetime.fromisoformat(clean_val)
        except Exception:
            pass
    if isinstance(val, uuid.UUID):
        return str(val)
    return val

def compile_filter(filter_dict, params):
    if not filter_dict:
        return "TRUE"
    
    clauses = []
    for key, val in filter_dict.items():
        if key == "$or":
            or_clauses = []
            for sub in val:
                or_clauses.append(compile_filter(sub, params))
            clauses.append(f"({ ' OR '.join(or_clauses) })")
        elif key == "$and":
            and_clauses = []
            for sub in val:
                and_clauses.append(compile_filter(sub, params))
            clauses.append(f"({ ' AND '.join(and_clauses) })")
        else:
            column = key
            # Nested JSON parameter lookup mapping
            if "." in key:
                parts = key.split(".")
                col = parts[0]
                json_path = "->>".join(f"'{p}'" for p in parts[1:])
                column = f"{col}->>{json_path}"
            
            if isinstance(val, dict):
                for op, op_val in val.items():
                    if op == "$in":
                        if not op_val:
                            clauses.append("FALSE")
                        else:
                            placeholders = []
                            for item in op_val:
                                params.append(convert_val(column, item))
                                placeholders.append(f"${len(params)}")
                            clauses.append(f"{column} IN ({', '.join(placeholders)})")
                    elif op == "$ne":
                        params.append(convert_val(column, op_val))
                        clauses.append(f"{column} != ${len(params)}")
                    elif op == "$gte":
                        params.append(convert_val(column, op_val))
                        clauses.append(f"{column} >= ${len(params)}")
                    elif op == "$lte":
                        params.append(convert_val(column, op_val))
                        clauses.append(f"{column} <= ${len(params)}")
                    elif op == "$gt":
                        params.append(convert_val(column, op_val))
                        clauses.append(f"{column} > ${len(params)}")
                    elif op == "$lt":
                        params.append(convert_val(column, op_val))
                        clauses.append(f"{column} < ${len(params)}")
                    elif op == "$regex":
                        regex_val = str(op_val).replace("\\", "")
                        params.append(f"%{regex_val}%")
                        clauses.append(f"{column}::text ILIKE ${len(params)}")
                    elif op == "$options":
                        continue
                    elif op == "$exists":
                        if op_val:
                            clauses.append(f"{column} IS NOT NULL")
                        else:
                            clauses.append(f"{column} IS NULL")
            else:
                params.append(convert_val(column, val))
                clauses.append(f"{column} = ${len(params)}")
                
    return " AND ".join(clauses) if clauses else "TRUE"

def parse_val_expr_with_params(col, expr, params):
    if isinstance(expr, dict):
        if "$add" in expr:
            args = expr["$add"]
            left = parse_val_expr_with_params(col, args[0], params)
            right = parse_val_expr_with_params(col, args[1], params)
            return f"({left} + {right})"
        if "$ifNull" in expr:
            args = expr["$ifNull"]
            col_expr = parse_val_expr_with_params(col, args[0], params)
            val_expr = parse_val_expr_with_params(col, args[1], params)
            return f"COALESCE({col_expr}, {val_expr})"
    elif isinstance(expr, str) and expr.startswith("$"):
        return expr[1:]
    else:
        params.append(convert_val(col, expr))
        return f"${len(params)}"

def compile_pipeline_set(set_fields, params):
    set_clauses = []
    for col, expr in set_fields.items():
        if isinstance(expr, dict):
            sql_expr = parse_val_expr_with_params(col, expr, params)
            set_clauses.append(f"{col} = {sql_expr}")
        else:
            params.append(convert_val(col, expr))
            set_clauses.append(f"{col} = ${len(params)}")
    return ", ".join(set_clauses)

def compile_aggregate(table_name, pipeline, params):
    match_stage = None
    group_stage = None
    for stage in pipeline:
        if "$match" in stage:
            match_stage = stage["$match"]
        if "$group" in stage:
            group_stage = stage["$group"]
            
    where_clause = "TRUE"
    if match_stage:
        where_clause = compile_filter(match_stage, params)
        
    if not group_stage:
        return f"SELECT * FROM {table_name} WHERE {where_clause}"
        
    group_by_field = group_stage.get("_id")
    group_cols = []
    select_exprs = []
    
    if group_by_field is not None and isinstance(group_by_field, str) and group_by_field.startswith("$"):
        group_col_name = group_by_field[1:]
        group_cols.append(group_col_name)
        select_exprs.append(f"{group_col_name} AS _id")
    else:
        select_exprs.append("NULL AS _id")
        
    for alias, expr in group_stage.items():
        if alias == "_id":
            continue
        if isinstance(expr, dict) and "$sum" in expr:
            sum_expr = expr["$sum"]
            if sum_expr == 1:
                select_exprs.append(f"COUNT(*) AS {alias}")
            elif isinstance(sum_expr, dict) and "$ifNull" in sum_expr:
                if_args = sum_expr["$ifNull"]
                col = if_args[0][1:] if (isinstance(if_args[0], str) and if_args[0].startswith("$")) else if_args[0]
                val = if_args[1][1:] if (isinstance(if_args[1], str) and if_args[1].startswith("$")) else if_args[1]
                select_exprs.append(f"COALESCE(SUM(COALESCE({col}, {val})), 0) AS {alias}")
            elif isinstance(sum_expr, str) and sum_expr.startswith("$"):
                col = sum_expr[1:]
                select_exprs.append(f"COALESCE(SUM({col}), 0) AS {alias}")
            else:
                select_exprs.append(f"COALESCE(SUM({sum_expr}), 0) AS {alias}")
        elif alias == "count":
            select_exprs.append(f"COUNT(*) AS {alias}")
            
    select_str = ", ".join(select_exprs)
    group_by_str = ""
    if group_cols:
        group_by_str = f" GROUP BY {', '.join(group_cols)}"
        
    safe_table = f'"{table_name}"' if "." in table_name else table_name
    return f"SELECT {select_str} FROM {safe_table} WHERE {where_clause}{group_by_str}"

class PostgresCursor:
    def __init__(self, db, query, params, table_name):
        self.db = db
        self.query = query
        self.params = params
        self.table_name = table_name
        self._sort = None
        self._skip = None
        self._limit = None

    def sort(self, key, direction=1):
        if isinstance(key, list):
            sort_clauses = []
            for k, d in key:
                dir_str = "ASC" if d == 1 else "DESC"
                sort_clauses.append(f"{k} {dir_str}")
            self._sort = f" ORDER BY {', '.join(sort_clauses)}"
        else:
            dir_str = "ASC" if direction == 1 else "DESC"
            self._sort = f" ORDER BY {key} {dir_str}"
        return self

    def skip(self, count):
        self._skip = f" OFFSET {count}"
        return self

    def limit(self, count):
        self._limit = f" LIMIT {count}"
        return self

    async def to_list(self, length):
        sql = self._build_sql()
        async with self.db.pool.acquire() as conn:
            records = await conn.fetch(sql, *self.params)
            # Standardize records: parse JSON string fields, convert UUIDs to str, and Decimals to floats
            res_list = []
            for r in records:
                d = dict(r)
                for k, v in d.items():
                    if isinstance(v, uuid.UUID):
                        d[k] = str(v)
                    elif isinstance(v, Decimal):
                        d[k] = float(v)
                    elif isinstance(v, str) and (v.startswith("{") or v.startswith("[")):
                        try:
                            d[k] = json.loads(v)
                        except Exception:
                            pass
                res_list.append(d)
            return res_list

    def _build_sql(self):
        sql = self.query
        if self._sort:
            sql += self._sort
        if self._limit is not None:
            sql += self._limit
        if self._skip is not None:
            sql += self._skip
        return sql

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not hasattr(self, "_records"):
            sql = self._build_sql()
            async with self.db.pool.acquire() as conn:
                records = await conn.fetch(sql, *self.params)
                self._records = []
                for r in records:
                    d = dict(r)
                    for k, v in d.items():
                        if isinstance(v, uuid.UUID):
                            d[k] = str(v)
                        elif isinstance(v, Decimal):
                            d[k] = float(v)
                        elif isinstance(v, str) and (v.startswith("{") or v.startswith("[")):
                            try:
                                d[k] = json.loads(v)
                            except Exception:
                                pass
                    self._records.append(d)
                self._index = 0
        if self._index < len(self._records):
            r = self._records[self._index]
            self._index += 1
            return r
        else:
            raise StopAsyncIteration

class PostgresCollection:
    def __init__(self, db, name):
        self.db = db
        self.table_name = name

    async def create_index(self, *args, **kwargs):
        pass

    async def drop_index(self, *args, **kwargs):
        pass

    async def index_information(self, *args, **kwargs):
        return {}

    async def find_one(self, filter_dict, projection=None, **kwargs):
        params = []
        where_clause = compile_filter(filter_dict, params)
        safe_table = f'"{self.table_name}"' if "." in self.table_name else self.table_name
        
        sort_clause = ""
        sort_arg = kwargs.get("sort")
        if sort_arg:
            if isinstance(sort_arg, list):
                sort_clauses = []
                for k, d in sort_arg:
                    dir_str = "ASC" if d == 1 else "DESC"
                    sort_clauses.append(f"{k} {dir_str}")
                sort_clause = f" ORDER BY {', '.join(sort_clauses)}"
            else:
                direction = kwargs.get("direction", 1)
                dir_str = "ASC" if direction == 1 else "DESC"
                sort_clause = f" ORDER BY {sort_arg} {dir_str}"

        select_cols = "*"
        if isinstance(projection, dict):
            include_cols = [k for k, v in projection.items() if v == 1]
            if include_cols:
                select_cols = ", ".join([f'"{c}"' if c.lower() in ("limit", "order", "group", "offset") else c for c in include_cols])
                if "id" not in include_cols and "id" in TABLE_COLUMNS.get(self.table_name, []):
                    select_cols += ", id"

        sql = f"SELECT {select_cols} FROM {safe_table} WHERE {where_clause}{sort_clause} LIMIT 1"
        try:
            async with self.db.pool.acquire() as conn:
                row = await conn.fetchrow(sql, *params)
                if not row:
                    return None
                d = dict(row)
                for k, v in d.items():
                    if isinstance(v, uuid.UUID):
                        d[k] = str(v)
                    elif isinstance(v, Decimal):
                        d[k] = float(v)
                    elif isinstance(v, str) and (v.startswith("{") or v.startswith("[")):
                        try:
                            d[k] = json.loads(v)
                        except Exception:
                            pass
                return d
        except Exception as e:
            logger.error(f"find_one SQL failed: {sql} with {params}. Error: {e}")
            raise e

    def find(self, filter_dict, projection=None):
        params = []
        where_clause = compile_filter(filter_dict, params)
        safe_table = f'"{self.table_name}"' if "." in self.table_name else self.table_name
        
        select_cols = "*"
        if isinstance(projection, dict):
            include_cols = [k for k, v in projection.items() if v == 1]
            if include_cols:
                # Add quotes to reserved keywords or custom column names if necessary
                select_cols = ", ".join([f'"{c}"' if c.lower() in ("limit", "order", "group", "offset") else c for c in include_cols])
                # Always ensure id column is present if defined
                if "id" not in include_cols and "id" in TABLE_COLUMNS.get(self.table_name, []):
                    select_cols += ", id"
                    
        sql = f"SELECT {select_cols} FROM {safe_table} WHERE {where_clause}"
        return PostgresCursor(self.db, sql, params, self.table_name)

    async def insert_one(self, doc):
        table_cols = TABLE_COLUMNS.get(self.table_name, [])
        cols = []
        vals = []
        params = []
        for col in table_cols:
            if col in doc:
                cols.append(col)
                val = doc[col]
                if isinstance(val, (dict, list)):
                    val = json.dumps(val)
                params.append(convert_val(col, val))
                vals.append(f"${len(params)}")
                
        safe_table = f'"{self.table_name}"' if "." in self.table_name else self.table_name
        sql = f"INSERT INTO {safe_table} ({', '.join(cols)}) VALUES ({', '.join(vals)})"
        try:
            async with self.db.pool.acquire() as conn:
                await conn.execute(sql, *params)
            class InsertOneResult:
                def __init__(self, inserted_id):
                    self.inserted_id = inserted_id
            return InsertOneResult(doc.get("id") or doc.get("_id"))
        except asyncpg.exceptions.UniqueViolationError:
            raise DuplicateKeyError("Unique constraint violation in Supabase PostgreSQL")
        except Exception as e:
            logger.error(f"insert_one SQL failed: {sql} with {params}. Error: {e}")
            raise e

    async def insert_many(self, docs):
        if not docs:
            return
        table_cols = TABLE_COLUMNS.get(self.table_name, [])
        if not table_cols:
            return
            
        cols = [col for col in table_cols]
        safe_table = f'"{self.table_name}"' if "." in self.table_name else self.table_name
        
        value_groups = []
        params = []
        for doc in docs:
            group = []
            for col in cols:
                val = doc.get(col)
                if isinstance(val, (dict, list)):
                    val = json.dumps(val)
                params.append(convert_val(col, val))
                group.append(f"${len(params)}")
            value_groups.append(f"({', '.join(group)})")
            
        sql = f"INSERT INTO {safe_table} ({', '.join(cols)}) VALUES {', '.join(value_groups)}"
        try:
            async with self.db.pool.acquire() as conn:
                await conn.execute(sql, *params)
        except asyncpg.exceptions.UniqueViolationError:
            raise DuplicateKeyError("Unique constraint violation in Supabase PostgreSQL during insert_many")
        except Exception as e:
            logger.error(f"insert_many SQL failed: {sql[:1000]}... with {len(params)} params. Error: {e}")
            raise e

    async def update_one(self, filter_dict, update_dict, upsert=False):
        exists = await self.find_one(filter_dict)
        if not exists:
            if upsert:
                doc = {}
                for k, v in filter_dict.items():
                    if not isinstance(v, dict):
                        doc[k] = v
                set_fields = update_dict.get("$set", {})
                doc.update(set_fields)
                await self.insert_one(doc)
                return
            else:
                return
        
        params = []
        set_clauses = []
        
        if isinstance(update_dict, list):
            if len(update_dict) == 1 and "$set" in update_dict[0]:
                set_fields = update_dict[0]["$set"]
                set_str = compile_pipeline_set(set_fields, params)
            else:
                raise ValueError("Unsupported pipeline update")
        else:
            set_fields = update_dict.get("$set", {})
            table_cols = TABLE_COLUMNS.get(self.table_name, [])
            for col in table_cols:
                if col in set_fields:
                    val = set_fields[col]
                    if isinstance(val, (dict, list)):
                        val = json.dumps(val)
                    params.append(convert_val(col, val))
                    set_clauses.append(f"{col} = ${len(params)}")
            
            unset_fields = update_dict.get("$unset", {})
            for col in table_cols:
                if col in unset_fields:
                    set_clauses.append(f"{col} = NULL")
                    
            set_str = ", ".join(set_clauses)
            
        if not set_str:
            return
            
        where_clause = compile_filter(filter_dict, params)
        safe_table = f'"{self.table_name}"' if "." in self.table_name else self.table_name
        sql = f"UPDATE {safe_table} SET {set_str} WHERE {where_clause}"
        try:
            async with self.db.pool.acquire() as conn:
                await conn.execute(sql, *params)
        except asyncpg.exceptions.UniqueViolationError:
            raise DuplicateKeyError("Unique constraint violation in Supabase PostgreSQL during update")
        except Exception as e:
            logger.error(f"update_one SQL failed: {sql} with {params}. Error: {e}")
            raise e

    async def update_many(self, filter_dict, update_dict):
        params = []
        set_clauses = []
        
        if isinstance(update_dict, list):
            if len(update_dict) == 1 and "$set" in update_dict[0]:
                set_fields = update_dict[0]["$set"]
                set_str = compile_pipeline_set(set_fields, params)
            else:
                raise ValueError("Unsupported pipeline update")
        else:
            set_fields = update_dict.get("$set", {})
            table_cols = TABLE_COLUMNS.get(self.table_name, [])
            for col in table_cols:
                if col in set_fields:
                    val = set_fields[col]
                    if isinstance(val, (dict, list)):
                        val = json.dumps(val)
                    params.append(convert_val(col, val))
                    set_clauses.append(f"{col} = ${len(params)}")
            
            unset_fields = update_dict.get("$unset", {})
            for col in table_cols:
                if col in unset_fields:
                    set_clauses.append(f"{col} = NULL")
                    
            set_str = ", ".join(set_clauses)
            
        if not set_str:
            return
            
        where_clause = compile_filter(filter_dict, params)
        safe_table = f'"{self.table_name}"' if "." in self.table_name else self.table_name
        sql = f"UPDATE {safe_table} SET {set_str} WHERE {where_clause}"
        try:
            async with self.db.pool.acquire() as conn:
                res = await conn.execute(sql, *params)
            count = 0
            if res and res.startswith("UPDATE "):
                try:
                    count = int(res.split(" ")[1])
                except Exception:
                    pass
            class UpdateResult:
                def __init__(self, modified_count):
                    self.modified_count = modified_count
            return UpdateResult(count)
        except asyncpg.exceptions.UniqueViolationError:
            raise DuplicateKeyError("Unique constraint violation in Supabase PostgreSQL during update_many")
        except Exception as e:
            logger.error(f"update_many SQL failed: {sql} with {params}. Error: {e}")
            raise e

    async def count_documents(self, filter_dict):
        params = []
        where_clause = compile_filter(filter_dict, params)
        safe_table = f'"{self.table_name}"' if "." in self.table_name else self.table_name
        sql = f"SELECT COUNT(*) FROM {safe_table} WHERE {where_clause}"
        try:
            async with self.db.pool.acquire() as conn:
                val = await conn.fetchval(sql, *params)
                return val or 0
        except Exception as e:
            logger.error(f"count_documents SQL failed: {sql} with {params}. Error: {e}")
            raise e

    async def delete_many(self, filter_dict):
        params = []
        where_clause = compile_filter(filter_dict, params)
        safe_table = f'"{self.table_name}"' if "." in self.table_name else self.table_name
        sql = f"DELETE FROM {safe_table} WHERE {where_clause}"
        try:
            async with self.db.pool.acquire() as conn:
                res = await conn.execute(sql, *params)
            count = 0
            if res and res.startswith("DELETE "):
                try:
                    count = int(res.split(" ")[1])
                except Exception:
                    pass
            class DeleteResult:
                def __init__(self, deleted_count):
                    self.deleted_count = deleted_count
            return DeleteResult(count)
        except Exception as e:
            logger.error(f"delete_many SQL failed: {sql} with {params}. Error: {e}")
            raise e

    async def delete_one(self, filter_dict):
        params = []
        where_clause = compile_filter(filter_dict, params)
        safe_table = f'"{self.table_name}"' if "." in self.table_name else self.table_name
        # Note: use inner query lookup to delete exactly one row
        sql = f"DELETE FROM {safe_table} WHERE id = (SELECT id FROM {safe_table} WHERE {where_clause} LIMIT 1)"
        try:
            async with self.db.pool.acquire() as conn:
                await conn.execute(sql, *params)
        except Exception as e:
            logger.error(f"delete_one SQL failed: {sql} with {params}. Error: {e}")
            raise e

    def aggregate(self, pipeline):
        params = []
        sql = compile_aggregate(self.table_name, pipeline, params)
        return PostgresCursor(self.db, sql, params, self.table_name)

class GridFSUploadStream:
    def __init__(self, db, filename, metadata=None):
        self.db = db
        self.filename = filename
        self.metadata = metadata or {}
        self._id = secrets.token_hex(12)
        self.chunk_size = 261120
        self.buffer = bytearray()
        self.chunk_index = 0
        self.total_length = 0
        
    async def write(self, data):
        self.buffer.extend(data)
        self.total_length += len(data)
        while len(self.buffer) >= self.chunk_size:
            chunk_data = self.buffer[:self.chunk_size]
            self.buffer = self.buffer[self.chunk_size:]
            await self._write_chunk(chunk_data)
            
    async def _write_chunk(self, chunk_data):
        chunk_id = secrets.token_hex(12)
        sql = 'INSERT INTO "backups_fs.chunks" (_id, files_id, n, data) VALUES ($1, $2, $3, $4)'
        async with self.db.pool.acquire() as conn:
            await conn.execute(sql, chunk_id, self._id, self.chunk_index, bytes(chunk_data))
        self.chunk_index += 1
        
    async def close(self):
        if self.buffer:
            await self._write_chunk(self.buffer)
            self.buffer = bytearray()
            
        sql = 'INSERT INTO "backups_fs.files" (_id, length, "chunkSize", "uploadDate", filename, "contentType", metadata) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6)'
        async with self.db.pool.acquire() as conn:
            await conn.execute(sql, self._id, self.total_length, self.chunk_size, self.filename, "application/gzip", json.dumps(self.metadata))

class GridFSDownloadStream:
    def __init__(self, db, files_id):
        self.db = db
        self.files_id = str(files_id)
        self.current_chunk = 0
        self._chunks = []
        self._chunk_idx = 0
        
    async def _load_chunks(self):
        if not self._chunks:
            sql = 'SELECT data FROM "backups_fs.chunks" WHERE files_id = $1 ORDER BY n ASC'
            async with self.db.pool.acquire() as conn:
                rows = await conn.fetch(sql, self.files_id)
                self._chunks = [bytes(r['data']) for r in rows]
                
    async def read(self):
        await self._load_chunks()
        return b"".join(self._chunks)
        
    def __aiter__(self):
        return self
        
    async def __anext__(self):
        await self._load_chunks()
        if self._chunk_idx < len(self._chunks):
            chunk = self._chunks[self._chunk_idx]
            self._chunk_idx += 1
            return chunk
        else:
            raise StopAsyncIteration

class PostgresGridFSBucket:
    def __init__(self, db, bucket_name="backups_fs"):
        self.db = db
        
    def open_upload_stream(self, filename, metadata=None):
        return GridFSUploadStream(self.db, filename, metadata)
        
    def open_download_stream(self, files_id):
        return GridFSDownloadStream(self.db, files_id)
        
    async def upload_from_stream(self, filename, blob, metadata=None):
        uploader = GridFSUploadStream(self.db, filename, metadata)
        await uploader.write(blob)
        await uploader.close()
        return uploader._id
        
    async def delete(self, files_id):
        fid = str(files_id)
        async with self.db.pool.acquire() as conn:
            await conn.execute('DELETE FROM "backups_fs.files" WHERE _id = $1', fid)

AsyncIOMotorGridFSBucket = PostgresGridFSBucket

class AsyncIOMotorClient:
    def __init__(self, dsn):
        pass

class PostgresDatabase:
    def __init__(self):
        self.pool = None

    async def init_pool(self, dsn):
        if self.pool is None:
            self.pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5)

    def close(self):
        # Synchronous close helper
        pass

    def __getattr__(self, name):
        return PostgresCollection(self, name)

    def __getitem__(self, name):
        # Allows db["users"] or client[db_name] syntaxes
        return self
