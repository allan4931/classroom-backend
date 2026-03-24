import express from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { departments } from "../db/schema/app.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { validateMeaningfulName } from "../lib/validation.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const { search, page = 1, limit = 100 } = req.query;
    const currentPage  = Math.max(1, parseInt(String(page)) || 1);
    const limitPerPage = Math.min(Math.max(1, parseInt(String(limit)) || 100), 100);
    const offset       = (currentPage - 1) * limitPerPage;
    const where = search
      ? and(or(ilike(departments.name, `%${search}%`), ilike(departments.code, `%${search}%`)))
      : undefined;

    const countRows = await db.select({ count: sql<number>`count(*)` }).from(departments).where(where);
    const total     = Number(countRows[0]?.count ?? 0);
    const list      = await db.select().from(departments).where(where).orderBy(desc(departments.createdAt)).limit(limitPerPage).offset(offset);

    res.json({ data: list, pagination: { page: currentPage, limit: limitPerPage, total, totalPages: Math.ceil(total / limitPerPage) } });
  } catch { res.status(500).json({ error: "Failed to get departments." }); }
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid ID." }); return; }
  const rows = await db.select().from(departments).where(eq(departments.id, id));
  const dept = rows[0];
  if (!dept) { res.status(404).json({ error: "Department not found." }); return; }
  res.json({ data: dept });
});

router.post("/", requireRole("admin"), async (req, res) => {
  try {
    const { name, code, description } = req.body as { name: string; code: string; description?: string };
    if (!name || !code) { res.status(400).json({ error: "Name and code are required." }); return; }

    // Reject gibberish names
    const nameCheck = validateMeaningfulName(name);
    if (!nameCheck.valid) { res.status(400).json({ error: nameCheck.error }); return; }

    if (description) {
      const descCheck = validateMeaningfulName(description);
      if (!descCheck.valid) { res.status(400).json({ error: `Description: ${descCheck.error}` }); return; }
    }

    // Code: must be 2-10 alphanumeric characters
    const cleanCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(cleanCode)) {
      res.status(400).json({ error: "Code must be 2–10 uppercase letters/digits (e.g. CS, MATH101)." });
      return;
    }

    const insertedRows = await db
      .insert(departments)
      .values({ name: name.trim(), code: cleanCode, description: description?.trim() })
      .returning();

    const created = insertedRows[0];
    if (!created) { res.status(500).json({ error: "Failed to create department." }); return; }
    res.status(201).json({ data: created });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "23505") { res.status(409).json({ error: "A department with that code already exists." }); return; }
    res.status(500).json({ error: "Failed to create department." });
  }
});

router.put("/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid ID." }); return; }
  try {
    const { name, code, description } = req.body as { name?: string; code?: string; description?: string };

    if (name) {
      const check = validateMeaningfulName(name);
      if (!check.valid) { res.status(400).json({ error: check.error }); return; }
    }

    const updateData: Record<string, unknown> = {};
    if (name        !== undefined) updateData["name"]        = name.trim();
    if (code        !== undefined) updateData["code"]        = code.trim().toUpperCase();
    if (description !== undefined) updateData["description"] = description.trim();

    const updatedRows = await db.update(departments).set(updateData).where(eq(departments.id, id)).returning();
    const updated = updatedRows[0];
    if (!updated) { res.status(404).json({ error: "Department not found." }); return; }
    res.json({ data: updated });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "23505") { res.status(409).json({ error: "A department with that code already exists." }); return; }
    res.status(500).json({ error: "Failed to update department." });
  }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid ID." }); return; }
  try {
    const deletedRows = await db.delete(departments).where(eq(departments.id, id)).returning({ id: departments.id });
    if (!deletedRows[0]) { res.status(404).json({ error: "Department not found." }); return; }
    res.json({ data: { message: "Deleted." } });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === "23503") { res.status(409).json({ error: "Cannot delete: subjects are linked to it." }); return; }
    res.status(500).json({ error: "Failed to delete department." });
  }
});

export default router;
