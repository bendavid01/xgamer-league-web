import type { TransactionSql } from "postgres";
import { db } from "./db";

type Sql = ReturnType<typeof db> | TransactionSql;

/**
 * Nicknames are unique ignoring case, and can't be another active player's
 * gaming name either. Callers that write one hold lockNickname (contact-lock.ts).
 */
export async function nicknameTaken(
  sql: Sql,
  nickname: string,
  except?: string,
) {
  const [row] = await sql`select 1 from player
    where deleted_at is null and (${except ?? null}::uuid is null or id <> ${except ?? null}::uuid)
      and (lower(display_nickname)=lower(${nickname}) or lower(gaming_name)=lower(${nickname}))
    limit 1`;
  return !!row;
}

export async function nicknameAvailable(nickname: string) {
  return !(await nicknameTaken(db(), nickname));
}
