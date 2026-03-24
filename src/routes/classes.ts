/**
 * Classes routes — RBAC protected
 * GET  /api/classes              admin: all | teacher: own | student: enrolled
 * POST /api/classes              admin | teacher
 * GET  /api/classes/:id          admin | teacher (own) | student (enrolled)
 * PUT  /api/classes/:id          admin | teacher (own)
 * DELETE /api/classes/:id        admin only
 * POST /api/classes/join         student
 * GET  /api/classes/:id/students admin | teacher (own)
 * POST /api/classes/:id/regenerate-key  admin | teacher (own)
 * GET  /api/enrollments/my-classes      student
 */
import express from "express";
import { and, desc, eq, getTableColumns, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { classes, departments, enrollments, subjects } from "../db/schema/app.js";
import { user } from "../db/schema/auth.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(requireAuth);

/* ── helpers ─────────────────────────────────────────────── */
function genInviteCode(): string {
  return Math.random().toString(36).substring(2, 9).toUpperCase();
}

/* ── List classes (role-filtered) ────────────────────────── */
router.get("/", async (req, res) => {
  try {
    const currentUser = req.user!;
    const { search, subject, teacher, status, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, parseInt(String(page)) || 1);
    const limitPerPage = Math.min(Math.max(1, parseInt(String(limit)) || 10), 100);
    const offset = (currentPage - 1) * limitPerPage;

    const conditions: any[] = [];

    // Role-based base filter
    if (currentUser.role === "teacher") {
      conditions.push(eq(classes.teacherId, currentUser.userId || ''));
    } else if (currentUser.role === "student") {
      // Get enrolled class IDs
      const enrolled = await db
        .select({ classId: enrollments.classId })
        .from(enrollments)
        .where(eq(enrollments.studentId, currentUser.userId || ''));
      const enrolledIds = enrolled.map((e) => e.classId);
      if (enrolledIds.length === 0) {
        return res.json({ data: [], pagination: { page: currentPage, limit: limitPerPage, total: 0, totalPages: 0 } });
      }
      conditions.push(inArray(classes.id, enrolledIds));
    }

    if (search) conditions.push(or(ilike(classes.name, `%${search}%`), ilike(classes.inviteCode, `%${search}%`)));
    if (subject) conditions.push(ilike(subjects.name, `%${String(subject).replace(/[%_]/g, "\\$&")}%`));
    if (teacher && currentUser.role === "admin") conditions.push(ilike(user.name, `%${String(teacher).replace(/[%_]/g, "\\$&")}%`));
    if (status) conditions.push(eq(classes.status, status as any));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(where);
    const count = result?.count || 0;

    const list = await db
      .select({ ...getTableColumns(classes), subject: getTableColumns(subjects), teacher: getTableColumns(user) })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(where)
      .orderBy(desc(classes.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.json({ data: list, pagination: { page: currentPage, limit: limitPerPage, total: count || 0, totalPages: Math.ceil((count || 0) / limitPerPage) } });
  } catch (e) {
    console.error("GET /classes:", e);
    res.status(500).json({ error: "Failed to get classes." });
  }
});

/* ── Create class ─────────────────────────────────────────── */
router.post("/", requireRole("admin", "teacher"), async (req, res) => {
  try {
    const currentUser = req.user!;
    const body = req.body;

    // Teachers are auto-assigned as the teacher
    const teacherId = currentUser.role === "teacher" ? (currentUser.userId || '') : (body.teacherId ?? (currentUser.userId || ''));

    const [created] = await db
      .insert(classes)
      .values({ ...body, teacherId, inviteCode: genInviteCode(), schedules: body.schedules ?? [] })
      .returning({ id: classes.id, inviteCode: classes.inviteCode });

    res.status(201).json({ data: created });
  } catch (e) {
    console.error("POST /classes:", e);
    res.status(500).json({ error: "Failed to create class." });
  }
});

/* ── Get class detail ─────────────────────────────────────── */
router.get("/:id", async (req, res) => {
  const classId = Number(req.params.id);
  if (!Number.isFinite(classId)) return res.status(400).json({ error: "Invalid class ID." });

  const currentUser = req.user!;

  // Students: verify enrolled
  if (currentUser.role === "student") {
    const [enrolled] = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.classId, classId), eq(enrollments.studentId, currentUser.userId || '')));
    if (!enrolled) return res.status(403).json({ error: "You are not enrolled in this class." });
  }

  const [classDetails] = await db
    .select({ ...getTableColumns(classes), subject: getTableColumns(subjects), department: getTableColumns(departments), teacher: getTableColumns(user) })
    .from(classes)
    .leftJoin(subjects, eq(classes.subjectId, subjects.id))
    .leftJoin(user, eq(classes.teacherId, user.id))
    .leftJoin(departments, eq(subjects.departmentId, departments.id))
    .where(eq(classes.id, classId));

  if (!classDetails) return res.status(404).json({ error: "Class not found." });

  // Teachers can only see their own
  if (currentUser.role === "teacher" && classDetails.teacherId !== (currentUser.userId || '')) {
    return res.status(403).json({ error: "Access denied." });
  }

  const [result] = await db.select({ count: sql<number>`count(*)` }).from(enrollments).where(eq(enrollments.classId, classId));
  const count = result?.count || 0;

  res.json({ data: { ...classDetails, enrollmentCount: Number(count) } });
});

/* ── Update class ─────────────────────────────────────────── */
router.put("/:id", requireRole("admin", "teacher"), async (req, res) => {
  const classId = Number(req.params.id);
  if (!Number.isFinite(classId)) return res.status(400).json({ error: "Invalid class ID." });
  const currentUser = req.user!;

  // Teacher can only edit own class
  if (currentUser.role === "teacher") {
    const [cls] = await db.select({ teacherId: classes.teacherId }).from(classes).where(eq(classes.id, classId));
    if (!cls) return res.status(404).json({ error: "Class not found." });
    if (cls.teacherId !== (currentUser.userId || '')) return res.status(403).json({ error: "You can only edit your own classes." });
  }

  try {
    const { name, description, subjectId, teacherId, capacity, status, bannerUrl, bannerCldPubId, schedules } = req.body;
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (subjectId !== undefined) updateData.subjectId = Number(subjectId);
    if (teacherId !== undefined && req.user!.role === "admin") updateData.teacherId = teacherId;
    if (capacity !== undefined) updateData.capacity = Number(capacity);
    if (status !== undefined) updateData.status = status;
    if (bannerUrl !== undefined) updateData.bannerUrl = bannerUrl;
    if (bannerCldPubId !== undefined) updateData.bannerCldPubId = bannerCldPubId;
    if (schedules !== undefined) updateData.schedules = schedules;

    const [updated] = await db.update(classes).set(updateData).where(eq(classes.id, classId)).returning({ id: classes.id });
    if (!updated) return res.status(404).json({ error: "Class not found." });
    res.json({ data: updated });
  } catch (e) {
    console.error("PUT /classes:", e);
    res.status(500).json({ error: "Failed to update class." });
  }
});

/* ── Delete class ─────────────────────────────────────────── */
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const classId = Number(req.params.id);
  if (!Number.isFinite(classId)) return res.status(400).json({ error: "Invalid class ID." });

  try {
    const [deleted] = await db.delete(classes).where(eq(classes.id, classId)).returning({ id: classes.id });
    if (!deleted) return res.status(404).json({ error: "Class not found." });
    res.json({ data: { message: "Class deleted." } });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete class." });
  }
});

/* ── Join class via invite code (student) ─────────────────── */
router.post("/join", requireRole("student"), async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const studentId = req.user?.userId || '';

    if (!inviteCode) return res.status(400).json({ error: "Invite code is required." });

    const [target] = await db
      .select({ id: classes.id, capacity: classes.capacity, status: classes.status })
      .from(classes)
      .where(eq(classes.inviteCode, inviteCode.trim().toUpperCase()));

    if (!target) return res.status(404).json({ error: "Invalid invite code." });
    if (target.status !== "active") return res.status(400).json({ error: "This class is not accepting enrollments." });

    const [existing] = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.classId, target.id), eq(enrollments.studentId, studentId)));

    if (existing) return res.status(409).json({ error: "Already enrolled in this class." });

    const [result] = await db.select({ count: sql<number>`count(*)` }).from(enrollments).where(eq(enrollments.classId, target.id));
    const count = result?.count || 0;
    if (Number(count) >= target.capacity) return res.status(400).json({ error: "Class has reached its capacity." });

    await db.insert(enrollments).values({ classId: target.id, studentId });
    res.status(201).json({ data: { classId: target.id, message: "Successfully joined the class!" } });
  } catch (e) {
    console.error("POST /classes/join:", e);
    res.status(500).json({ error: "Failed to join class." });
  }
});

/* ── Get enrolled students ────────────────────────────────── */
router.get("/:id/students", requireRole("admin", "teacher"), async (req, res) => {
  const classId = Number(req.params.id);
  if (!Number.isFinite(classId)) return res.status(400).json({ error: "Invalid class ID." });
  const currentUser = req.user!;

  if (currentUser.role === "teacher") {
    const [cls] = await db.select({ teacherId: classes.teacherId }).from(classes).where(eq(classes.id, classId));
    if (!cls || cls.teacherId !== (currentUser.userId || '')) return res.status(403).json({ error: "Access denied." });
  }

  try {
    const students = await db
      .select({ id: user.id, name: user.name, email: user.email, image: user.image, createdAt: user.createdAt })
      .from(enrollments)
      .leftJoin(user, eq(enrollments.studentId, user.id))
      .where(eq(enrollments.classId, classId));

    res.json({ data: students });
  } catch (e) {
    res.status(500).json({ error: "Failed to get students." });
  }
});

/* ── Regenerate invite code ───────────────────────────────── */
router.post("/:id/regenerate-key", requireRole("admin", "teacher"), async (req, res) => {
  const classId = Number(req.params.id);
  if (!Number.isFinite(classId)) return res.status(400).json({ error: "Invalid class ID." });
  const currentUser = req.user!;

  if (currentUser.role === "teacher") {
    const [cls] = await db.select({ teacherId: classes.teacherId }).from(classes).where(eq(classes.id, classId));
    if (!cls || cls.teacherId !== (currentUser.userId || '')) return res.status(403).json({ error: "Access denied." });
  }

  try {
    const newCode = genInviteCode();
    await db.update(classes).set({ inviteCode: newCode }).where(eq(classes.id, classId));
    res.json({ data: { inviteCode: newCode, message: "Invite code regenerated." } });
  } catch (e) {
    res.status(500).json({ error: "Failed to regenerate code." });
  }
});

/* ── My enrolled classes (student) ───────────────────────── */
router.get("/my/enrolled", requireRole("student"), async (req, res) => {
  try {
    const studentId = req.user?.userId || '';
    const list = await db
      .select({ ...getTableColumns(classes), subject: getTableColumns(subjects), teacher: getTableColumns(user) })
      .from(enrollments)
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(eq(enrollments.studentId, studentId))
      .orderBy(desc(classes.createdAt));

    res.json({ data: list });
  } catch (e) {
    res.status(500).json({ error: "Failed to get enrolled classes." });
  }
});

export default router;
