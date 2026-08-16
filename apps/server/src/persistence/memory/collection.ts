import { randomUUID } from "node:crypto";

/** Minimal in-process collection: enough CRUD to back the repository interfaces. */
export class Collection<T extends { id: string }> {
  private rows = new Map<string, T>();

  insert(row: Omit<T, "id">): T {
    const id = randomUUID();
    const full = { ...row, id } as T;
    this.rows.set(id, full);
    return full;
  }

  get(id: string): T | null {
    return this.rows.get(id) ?? null;
  }

  all(): T[] {
    return Array.from(this.rows.values());
  }

  update(id: string, patch: Partial<T>): T {
    const existing = this.rows.get(id);
    if (!existing) {
      throw new Error(`Record not found: ${id}`);
    }
    const updated = { ...existing, ...patch, id } as T;
    this.rows.set(id, updated);
    return updated;
  }

  find(predicate: (row: T) => boolean): T[] {
    return this.all().filter(predicate);
  }

  findOne(predicate: (row: T) => boolean): T | null {
    return this.all().find(predicate) ?? null;
  }
}
