import "server-only";
import { getDb, saveDb } from "./instance";

export interface IUserRow {
  id: string;
  login: string;
  password_hash: string;
  role: "admin" | "player";
  display_name: string;
  avatar: string;
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
  db.run(
    "INSERT INTO users (id, login, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)",
    [id, login, passwordHash, role, login]
  );
  saveDb();
}

export async function updateUserProfile(
  id: string,
  displayName: string,
  avatar: string
): Promise<void> {
  const db = await getDb();
  db.run("UPDATE users SET display_name = ?, avatar = ? WHERE id = ?", [
    displayName,
    avatar,
    id,
  ]);
  saveDb();
}

export async function updateUserPassword(
  id: string,
  passwordHash: string
): Promise<void> {
  const db = await getDb();
  db.run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, id]);
  saveDb();
}

export async function getAllUsers(): Promise<IUserRow[]> {
  const db = await getDb();
  const stmt = db.prepare("SELECT * FROM users ORDER BY created_at");
  const rows: IUserRow[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as unknown as IUserRow);
  }
  stmt.free();
  return rows;
}
