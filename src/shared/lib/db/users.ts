import "server-only";
import { getDb, saveDb } from "./instance";

export interface IUserRow {
  id: string;
  login: string;
  password_hash: string;
  role: "admin" | "player";
  created_at: string;
}

export async function getUserByLogin(login: string): Promise<IUserRow | undefined> {
  const db = await getDb();
  const stmt = db.prepare("SELECT * FROM users WHERE login = ?");
  stmt.bind([login]);
  if (stmt.step()) {
    const row = stmt.getAsObject() as unknown as IUserRow;
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

export async function getUserById(id: string): Promise<IUserRow | undefined> {
  const db = await getDb();
  const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject() as unknown as IUserRow;
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

export async function hasAnyAdmin(): Promise<boolean> {
  const db = await getDb();
  const stmt = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'");
  stmt.step();
  const row = stmt.getAsObject() as { cnt: number };
  stmt.free();
  return row.cnt > 0;
}

export async function createUser(
  id: string,
  login: string,
  passwordHash: string,
  role: "admin" | "player"
): Promise<void> {
  const db = await getDb();
  db.run("INSERT INTO users (id, login, password_hash, role) VALUES (?, ?, ?, ?)", [
    id,
    login,
    passwordHash,
    role,
  ]);
  saveDb();
}
