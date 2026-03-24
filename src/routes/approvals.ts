import express from "express";
import bcrypt from "bcryptjs";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { user, account, pendingRegistrations } from "../db/schema/auth.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import { sendWelcomeEmail, sendRejectionEmail } from "../lib/email.js";

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

router.get("/", async (req, res) => {
  try {
    const { status = "pending", page = 1, limit = 20 } = req.query;
    const currentPage  = Math.max(1, parseInt(String(page)) || 1);
    const limitPerPage = Math.min(Math.max(1, parseInt(String(limit)) || 20), 100);
    const offset       = (currentPage - 1) * limitPerPage;
    const where = eq(pendingRegistrations.status, status as "pending" | "approved" | "rejected");
    const countRows = await db.select({ count: sql<number>`count(*)` }).from(pendingRegistrations).where(where);
    const total     = Number(countRows[0]?.count ?? 0);
    const list      = await db
      .select({ id: pendingRegistrations.id, name: pendingRegistrations.name, email: pendingRegistrations.email, role: pendingRegistrations.role, status: pendingRegistrations.status, notes: pendingRegistrations.notes, rejectionReason: pendingRegistrations.rejectionReason, approvedById: pendingRegistrations.approvedById, approvedAt: pendingRegistrations.approvedAt, createdAt: pendingRegistrations.createdAt })
      .from(pendingRegistrations).where(where).orderBy(desc(pendingRegistrations.createdAt)).limit(limitPerPage).offset(offset);
    res.json({ data: list, pagination: { page: currentPage, limit: limitPerPage, total, totalPages: Math.ceil(total / limitPerPage) } });
  } catch { res.status(500).json({ error: "Failed to get pending registrations." }); }
});

router.post("/:id/approve", async (req, res) => {
  const { id } = req.params;
  const approverUserId = req.user!.userId;
  try {
    const rows = await db.select().from(pendingRegistrations).where(eq(pendingRegistrations.id, id));
    const pending = rows[0];
    if (!pending) { res.status(404).json({ error: "Registration not found." }); return; }
    if (pending.status !== "pending") { res.status(400).json({ error: "Registration is not pending." }); return; }

    const existingRows = await db.select({ id: user.id }).from(user).where(eq(user.email, pending.email));
    if (existingRows[0]) { res.status(409).json({ error: "Email already registered." }); return; }

    const newUserId = crypto.randomUUID();
    const insertedRows = await db.insert(user).values({ id: newUserId, name: pending.name, email: pending.email, role: pending.role, emailVerified: false, isMainAdmin: false, status: "active" }).returning({ id: user.id, name: user.name, email: user.email, role: user.role });
    const newUser = insertedRows[0];
    if (!newUser) { res.status(500).json({ error: "Failed to create account." }); return; }

    await db.insert(account).values({ id: crypto.randomUUID(), accountId: newUserId, providerId: "credential", userId: newUserId, password: pending.passwordHash, createdAt: new Date(), updatedAt: new Date() });
    await db.update(pendingRegistrations).set({ status: "approved", approvedById: approverUserId, approvedAt: new Date() }).where(eq(pendingRegistrations.id, id));

    // Welcome email
    sendWelcomeEmail({ to: newUser.email, name: newUser.name, role: newUser.role }).catch(() => {});

    res.json({ data: { message: `${pending.name}'s account has been approved and activated.`, user: newUser } });
  } catch { res.status(500).json({ error: "Failed to approve registration." }); }
});

router.post("/:id/reject", async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body as { reason?: string };
  try {
    const rows = await db.select().from(pendingRegistrations).where(eq(pendingRegistrations.id, id));
    const pending = rows[0];
    if (!pending) { res.status(404).json({ error: "Registration not found." }); return; }
    if (pending.status !== "pending") { res.status(400).json({ error: "Registration is not pending." }); return; }

    await db.update(pendingRegistrations).set({ status: "rejected", rejectionReason: reason ?? null }).where(eq(pendingRegistrations.id, id));

    // Rejection email
    sendRejectionEmail({ to: pending.email, name: pending.name, role: pending.role, reason }).catch(() => {});

    res.json({ data: { message: "Registration rejected." } });
  } catch { res.status(500).json({ error: "Failed to reject registration." }); }
});

export default router;
