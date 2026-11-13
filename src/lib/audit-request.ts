import type { TransactionSql } from "postgres";

/** Serialize audit UUIDs. In READ COMMITTED the waiter sees the winner's event. */
export async function lockAuditRequest(tx: TransactionSql, requestId: string) {
  await tx`select pg_advisory_xact_lock(hashtextextended(${"xgamer:om-request:" + requestId.toLowerCase()}, 0))`;
}
