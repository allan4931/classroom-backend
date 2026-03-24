import express from "express";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import { departments, subjects } from "../db/schema/index.js";
import { db } from "../db/index.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { validateMeaningfulName } from "../lib/validation.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const { search, department, page = 1, limit = 10 } = req.query;
    const currentPage  = Math.max(1, parseInt(String(page)) || 1);
    const limitPerPage = Math.min(Math.max(1, parseInt(String(limit)) || 10), 100);
    const offset       = (currentPage - 1) * limitPerPage;

    const conds: any[] = [];
    if (search)     conds.push(or(ilike(subjects.name, `%${search}%`), ilike(subjects.code, `%${search}%`)));
    if (department) conds.push(ilike(departments.name, `%${String(department)}%`));
    const where = conds.length ? and(...conds) : undefined;

    const countRows = await db.select({ count: sql<number>`count(*)` }).from(subjects).leftJoin(departments, eq(subjects.departmentId, departments.id)).where(where);
    const total     = Number(countRows[0]?.count ?? 0);
    const list      = await db.select({ ...getTableColumns(subjects), department: getTableColumns(departments) }).from(subjects).leftJoin(departments, eq(subjects.departmentId, departments.id)).where(where).orderBy(desc(subjects.createdAt)).limit(limitPerPage).offset(offset);

    res.json({ data: list, pagination: { page: currentPage, limit: limitPerPage, total, totalPages: Math.ceil(total / limitPerPage) } });
  } catch { res.status(500).json({ error: "Failed to get subjects." }); }
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid ID." }); return; }
  const rows = await db.select({ ...getTableColumns(subjects), department: getTableColumns(departments) }).from(subjects).leftJoin(departments, eq(subjects.departmentId, departments.id)).where(eq(subjects.id, id));
  const subject = rows[0];
  if (!subject) { res.status(404).json({ error: "Subject not found." }); return; }
  res.json({ data: subject });
});

router.post("/", requireRole("admin"), async (req, res) => {
  try {
    const { name, code, description, departmentId } = req.body as {
      name: string; code: string; description?: string; departmentId: number;
    };
    if (!name || !code || !departmentId) {
      res.status(400).json({ error: "Name, code, and departmentId required." });
      return;
    }

    // Reject gibberish
    const nameCheck = validateMeaningfulName(name);
    if (!nameCheck.valid) { res.status(400).json({ error: nameCheck.error }); return; }

    const cleanCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,15}$/.test(cleanCode)) {
      res.status(400).json({ error: "Code must be 2–15 uppercase letters/digits (e.g. BIO101)." });
      return;
    }

    const insertedRows = await db
      .insert(subjects)
      .values({ name: name.trim(), code: cleanCode, description: description?.trim(), departmentId: Number(departmentId) })
      .returning({ id: subjects.id });

    const created = insertedRows[0];
    if (!created) { res.status(500).json({ error: "Failed to create subject." }); return; }
    res.status(201).json({ data: created });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "23505") { res.status(409).json({ error: "Subject code already exists." }); return; }
    if (err?.code === "23503") { res.status(400).json({ error: "Invalid department ID." }); return; }
    res.status(500).json({ error: "Failed to create subject." });
  }
});

router.put("/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid ID." }); return; }
  try {
    const { name, code, description, departmentId } = req.body as {
      name?: string; code?: string; description?: string; departmentId?: number;
    };
    if (name) {
      const check = validateMeaningfulName(name);
      if (!check.valid) { res.status(400).json({ error: check.error }); return; }
    }

    const updateData: Record<string, unknown> = {};
    if (name         !== undefined) updateData["name"]         = name.trim();
    if (code         !== undefined) updateData["code"]         = code.trim().toUpperCase();
    if (description  !== undefined) updateData["description"]  = description.trim();
    if (departmentId !== undefined) updateData["departmentId"] = Number(departmentId);

    const updatedRows = await db.update(subjects).set(updateData).where(eq(subjects.id, id)).returning({ id: subjects.id });
    if (!updatedRows[0]) { res.status(404).json({ error: "Subject not found." }); return; }
    res.json({ data: updatedRows[0] });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "23505") { res.status(409).json({ error: "Subject code already exists." }); return; }
    res.status(500).json({ error: "Failed to update subject." });
  }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid ID." }); return; }
  try {
    const deletedRows = await db.delete(subjects).where(eq(subjects.id, id)).returning({ id: subjects.id });
    if (!deletedRows[0]) { res.status(404).json({ error: "Subject not found." }); return; }
    res.json({ data: { message: "Deleted." } });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "23503") { res.status(409).json({ error: "Cannot delete: classes are linked." }); return; }
    res.status(500).json({ error: "Failed to delete subject." });
  }
});

export default router;
