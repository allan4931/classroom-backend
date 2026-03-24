import express from "express";
import bcrypt from "bcryptjs";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { user, account, waitlist } from "../db/schema/auth.js";
import { db } from "../db/index.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { sendWelcomeEmail } from "../lib/email.js";

const router = express.Router();
router.use(requireAuth);

/* ── GET /api/users ── */
router.get("/", requireRole("admin"), async (req, res) => {
  try {
    const { search, role, status, page = 1, limit = 15 } = req.query;
    const currentPage  = Math.max(1, parseInt(String(page)) || 1);
    const limitPerPage = Math.min(Math.max(1, parseInt(String(limit)) || 15), 100);
    const offset       = (currentPage - 1) * limitPerPage;

    const conditions = [];
    if (search) conditions.push(or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`)));
    if (role)   conditions.push(eq(user.role, role as any));
    if (status) conditions.push(eq(user.status, status as any));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const countRows = await db.select({ count: sql<number>`count(*)` }).from(user).where(where);
    const total     = Number(countRows[0]?.count ?? 0);
    const users     = await db
      .select({ id: user.id, name: user.name, email: user.email, role: user.role, image: user.image, isMainAdmin: user.isMainAdmin, status: user.status, createdAt: user.createdAt, updatedAt: user.updatedAt })
      .from(user).where(where).orderBy(desc(user.createdAt)).limit(limitPerPage).offset(offset);

    res.json({ data: users, pagination: { page: currentPage, limit: limitPerPage, total, totalPages: Math.ceil(total / limitPerPage) } });
  } catch { res.status(500).json({ error: "Failed to get users." }); }
});

/* ── POST /api/users — admin creates directly-active accounts ── */
router.post("/", requireRole("admin", "teacher"), async (req, res) => {
  try {
    const currentUser = req.user!;
    const { name, email, password, role: targetRole = "student" } = req.body as {
      name: string; email: string; password: string; role?: "admin" | "teacher" | "student";
    };

    if (currentUser.role === "teacher" && targetRole !== "student") {
      res.status(403).json({ error: "Teachers can only create student accounts." }); return;
    }
    if (!name || !email || !password) {
      res.status(400).json({ error: "Name, email, and password are required." }); return;
    }

    const existingRows = await db.select({ id: user.id }).from(user).where(eq(user.email, email.toLowerCase().trim()));
    if (existingRows[0]) { res.status(409).json({ error: "Email already registered." }); return; }

    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    const insertedRows = await db
      .insert(user)
      .values({ id, name: name.trim(), email: email.toLowerCase().trim(), role: targetRole, emailVerified: false, isMainAdmin: false, status: "active" })
      .returning({ id: user.id, name: user.name, email: user.email, role: user.role });

    const newUser = insertedRows[0];
    if (!newUser) { res.status(500).json({ error: "Failed to create user." }); return; }

    await db.insert(account).values({ id: crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password: passwordHash, createdAt: new Date(), updatedAt: new Date() });

    // Send welcome email with credentials
    sendWelcomeEmail({ to: newUser.email, name: newUser.name, role: newUser.role, temporaryPassword: password }).catch(() => {});

    res.status(201).json({ data: newUser });
  } catch { res.status(500).json({ error: "Failed to create user." }); }
});

/* ── GET /api/users/:id ── */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user!;
  
  if (!id) { res.status(400).json({ error: "User ID is required." }); return; }
  if (currentUser.role !== "admin" && currentUser.userId !== id) { res.status(403).json({ error: "Forbidden." }); return; }
  
  const rows = await db.select({ id: user.id, name: user.name, email: user.email, role: user.role, image: user.image, isMainAdmin: user.isMainAdmin, status: user.status, createdAt: user.createdAt, updatedAt: user.updatedAt }).from(user).where(eq(user.id, id));
  const found = rows[0];
  if (!found) { res.status(404).json({ error: "User not found." }); return; }
  res.json({ data: found });
});

/* ── PUT /api/users/:id ── */
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user!;
  
  if (!id) { res.status(400).json({ error: "User ID is required." }); return; }
  if (currentUser.role !== "admin" && currentUser.userId !== id) { res.status(403).json({ error: "You can only update your own profile." }); return; }
  
  try {
    const { name, image, imageCldPubId, role } = req.body as { name?: string; image?: string; imageCldPubId?: string; role?: "admin" | "teacher" | "student" };
    const updateData: Record<string, unknown> = {};
    if (name          !== undefined) updateData["name"]          = name.trim();
    if (image         !== undefined) updateData["image"]         = image;
    if (imageCldPubId !== undefined) updateData["imageCldPubId"] = imageCldPubId;
    if (role          !== undefined && currentUser.role === "admin") updateData["role"] = role;
    const updatedRows = await db.update(user).set(updateData).where(eq(user.id, id)).returning({ id: user.id, name: user.name, email: user.email, role: user.role });
    const updated = updatedRows[0];
    if (!updated) { res.status(404).json({ error: "User not found." }); return; }
    res.json({ data: updated });
  } catch { res.status(500).json({ error: "Failed to update user." }); }
});

/* ── POST /api/users/:id/suspend ── admin only */
router.post("/:id/suspend", requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user!;
  
  if (!id) { res.status(400).json({ error: "User ID is required." }); return; }
  if (currentUser.userId === id) { res.status(400).json({ error: "Cannot suspend your own account." }); return; }

  const targetRows = await db.select({ isMainAdmin: user.isMainAdmin, status: user.status }).from(user).where(eq(user.id, id));
  const target = targetRows[0];
  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  if (target.isMainAdmin) { res.status(403).json({ error: "Cannot suspend the main admin." }); return; }

  await db.update(user).set({ status: "suspended" }).where(eq(user.id, id));
  res.json({ data: { message: "User suspended." } });
});

/* ── POST /api/users/:id/reinstate ── admin only */
router.post("/:id/reinstate", requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  
  if (!id) { res.status(400).json({ error: "User ID is required." }); return; }
  
  const targetRows = await db.select({ status: user.status, name: user.name, email: user.email }).from(user).where(eq(user.id, id));
  const target = targetRows[0];
  if (!target) { res.status(404).json({ error: "User not found." }); return; }

  await db.update(user).set({ status: "active" }).where(eq(user.id, id));

  // Close any open waitlist entry
  const { notes } = req.body as { notes?: string };
  const wlRows = await db.select({ id: waitlist.id }).from(waitlist).where(and(eq(waitlist.userId, id)));
  if (wlRows[0]) {
    await db.update(waitlist).set({ reinstatedAt: new Date(), reinstatedById: req.user!.userId, notes: notes ?? null }).where(eq(waitlist.userId, id));
  }

  // Welcome back email
  sendWelcomeEmail({ to: target.email, name: target.name, role: "member" }).catch(() => {});

  res.json({ data: { message: "User reinstated and is now active." } });
});

/* ── DELETE /api/users/:id ── */
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user!;
  
  if (!id) { res.status(400).json({ error: "User ID is required." }); return; }
  if (currentUser.userId === id) { res.status(400).json({ error: "You cannot delete your own account." }); return; }
  
  const targetRows = await db.select({ role: user.role, isMainAdmin: user.isMainAdmin }).from(user).where(eq(user.id, id));
  const target = targetRows[0];
  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  if (target.isMainAdmin) { res.status(403).json({ error: "The main admin account cannot be deleted." }); return; }
  const currentUserRows = await db.select({ isMainAdmin: user.isMainAdmin }).from(user).where(eq(user.id, currentUser.userId));
  const isCurrentMainAdmin = currentUserRows[0]?.isMainAdmin ?? false;
  if (!isCurrentMainAdmin && target.role === "admin") { res.status(403).json({ error: "Mini admins cannot delete other admin accounts." }); return; }
  try {
    const deletedRows = await db.delete(user).where(eq(user.id, id)).returning({ id: user.id });
    if (!deletedRows[0]) { res.status(404).json({ error: "User not found." }); return; }
    res.json({ data: { message: "User deleted successfully." } });
  } catch { res.status(500).json({ error: "Failed to delete user." }); }
});

export default router;
