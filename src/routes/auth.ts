import express from "express";
import bcrypt from "bcryptjs";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { user, account, pendingRegistrations } from "../db/schema/auth.js";
import { signToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { loginLimiter, registerLimiter, recordFailedAttempt, clearFailedAttempts, checkPasswordStrength } from "../lib/rateLimiter.js";
import {
  sendWelcomeEmail,
  sendLoginNotificationEmail,
  sendNewRegistrationNotice,
  sendRejectionEmail,
} from "../lib/email.js";

const router = express.Router();
const SALT = 12;

function sanitizeEmail(e: string) { return String(e ?? "").toLowerCase().trim(); }
function sanitizeName(n: string)  { return String(n ?? "").trim(); }

/* ── POST /api/auth/register ── */
router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { email, password, name, role = "student", notes } = req.body as {
      email: string; password: string; name: string;
      role?: "admin" | "teacher" | "student"; notes?: string;
    };

    if (!email || !password || !name) {
      res.status(400).json({ error: "Email, password, and name are required." }); return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters." }); return;
    }

    const cleanEmail = sanitizeEmail(email);
    const cleanName  = sanitizeName(name);

    const activeRows = await db.select({ id: user.id }).from(user).where(eq(user.email, cleanEmail));
    if (activeRows.length > 0) { res.status(409).json({ error: "Email already registered." }); return; }

    const pendingRows = await db.select({ id: pendingRegistrations.id, status: pendingRegistrations.status }).from(pendingRegistrations).where(eq(pendingRegistrations.email, cleanEmail));
    const existingPending = pendingRows[0];
    if (existingPending?.status === "pending") {
      res.status(409).json({ error: "A registration for this email is already awaiting approval.", pending: true }); return;
    }

    const countRows = await db.select({ count: sql<number>`count(*)` }).from(user);
    const totalUsers = Number(countRows[0]?.count ?? 0);
    const isFirstUser = totalUsers === 0;
    const passwordHash = await bcrypt.hash(password, SALT);
    const id = crypto.randomUUID();

    // First user → immediate admin (main admin)
    if (isFirstUser || role === "admin") {
      const insertedRows = await db
        .insert(user)
        .values({ id, email: cleanEmail, name: cleanName, role: "admin", emailVerified: false, isMainAdmin: isFirstUser, status: "active" })
        .returning({ id: user.id, email: user.email, name: user.name, role: user.role });

      const newUser = insertedRows[0];
      if (!newUser) { res.status(500).json({ error: "Failed to create account." }); return; }

      await db.insert(account).values({ id: crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password: passwordHash, createdAt: new Date(), updatedAt: new Date() });

      // Welcome email (fire-and-forget)
      sendWelcomeEmail({ to: newUser.email, name: newUser.name, role: "Admin" }).catch(() => {});

      const token        = signToken({ userId: id, email: newUser.email, role: "admin", name: newUser.name });
      const refreshToken = signRefreshToken(id);

      res.status(201).json({ message: isFirstUser ? "Main admin account created." : "Admin account created.", user: newUser, token, refreshToken, immediate: true });
      return;
    }

    // Teacher or student → pending approval
    await db.insert(pendingRegistrations).values({ id, name: cleanName, email: cleanEmail, passwordHash, role, status: "pending", notes: notes ?? null });

    // Notify all admins (best-effort)
    const adminRows = await db.select({ email: user.email }).from(user).where(and(eq(user.role, "admin"), eq(user.status, "active")));
    adminRows.forEach(admin => {
      sendNewRegistrationNotice({ adminEmail: admin.email, applicantName: cleanName, applicantEmail: cleanEmail, role }).catch(() => {});
    });

    res.status(201).json({
      message: role === "teacher"
        ? "Thank you for your teacher registration application. Your request has been submitted to the administration team for review. You will be notified once approved."
        : "Thanks for signing up! Your registration is pending approval. You'll receive an email when your account is activated.",
      pending: true,
      role,
    });
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

/* ── POST /api/auth/login ── */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) { res.status(400).json({ error: "Email and password are required." }); return; }

    const cleanEmail = sanitizeEmail(email);
    const userRows   = await db.select().from(user).where(eq(user.email, cleanEmail));
    const foundUser  = userRows[0];

    console.log('Login attempt:', { email, userFound: !!foundUser, userStatus: foundUser?.status });

    if (!foundUser) {
      res.status(401).json({ error: "Invalid email or password." }); return;
    }

    if (foundUser.status === "suspended") {
      res.status(401).json({ error: "Your account has been suspended. Please contact your administrator." }); return;
    }

    // TEMPORARILY DISABLE SECURITY FOR DEBUGGING
    const credRows = await db.select({ password: account.password }).from(account).where(and(eq(account.userId, foundUser.id), eq(account.providerId, "credential")));
    const cred = credRows[0];
    
    if (!cred?.password) {
      console.log('No credential record found');
      res.status(401).json({ error: "Invalid email or password." }); 
      return; 
    }

    console.log('Found credential record:', !!cred);
    console.log('Comparing with account password...');
    
    let token: string;
    let refreshToken: string;
    
    try {
      const valid = await bcrypt.compare(password, cred.password);
      console.log('Password valid:', valid);
      
      if (!valid) { 
        console.log('Password comparison failed');
        res.status(401).json({ error: "Invalid email or password." }); 
        return; 
      }
      
      token = signToken({ userId: foundUser.id, email: foundUser.email, role: foundUser.role, name: foundUser.name });
      refreshToken = signRefreshToken(foundUser.id);
      
      // Login notification email (fire-and-forget)
      const ip        = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "Unknown";
      const userAgent = req.headers["user-agent"] ?? "Unknown device";
      sendLoginNotificationEmail({ to: foundUser.email, name: foundUser.name, ip, userAgent, timestamp: new Date() }).catch(() => {});

      res.json({
        message: "Login successful.",
        user: { id: foundUser.id, email: foundUser.email, name: foundUser.name, role: foundUser.role, image: foundUser.image, isMainAdmin: foundUser.isMainAdmin },
        token,
        refreshToken,
      });
    } catch (compareError) {
      console.error('Bcrypt comparison error:', compareError);
      res.status(500).json({ error: "Login failed due to server error." });
      return;
    }
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

/* ── POST /api/auth/refresh ── */
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    if (!refreshToken) { res.status(400).json({ error: "Refresh token required." }); return; }

    const payload = verifyRefreshToken(refreshToken);
    const userRows = await db.select().from(user).where(eq(user.id, payload.userId));
    const foundUser = userRows[0];
    if (!foundUser) { res.status(401).json({ error: "User not found." }); return; }
    if (foundUser.status === "suspended") { res.status(401).json({ error: "Account suspended." }); return; }

    const newToken        = signToken({ userId: foundUser.id, email: foundUser.email, role: foundUser.role, name: foundUser.name });
    const newRefreshToken = signRefreshToken(foundUser.id);

    res.json({ token: newToken, refreshToken: newRefreshToken });
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token." });
  }
});

/* ── GET /api/auth/me ── */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const rows = await db.select({ id: user.id, email: user.email, name: user.name, role: user.role, image: user.image, isMainAdmin: user.isMainAdmin, status: user.status, createdAt: user.createdAt }).from(user).where(eq(user.id, req.user?.userId ?? ""));
    const foundUser = rows[0];
    if (!foundUser) { res.status(404).json({ error: "User not found." }); return; }
    res.json({ data: foundUser });
  } catch { res.status(500).json({ error: "Failed to get profile." }); }
});

/* ── GET /api/auth/pending-status?email= ── */
router.get("/pending-status", async (req, res) => {
  const email = sanitizeEmail(String(req.query.email ?? ""));
  if (!email) { res.status(400).json({ error: "Email required." }); return; }
  try {
    const activeRows = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (activeRows[0]) { res.json({ status: "active", message: "Your account is active. You can now log in." }); return; }
    const pendingRows = await db.select({ status: pendingRegistrations.status, rejectionReason: pendingRegistrations.rejectionReason }).from(pendingRegistrations).where(eq(pendingRegistrations.email, email));
    const pending = pendingRows[0];
    if (!pending) { res.json({ status: "not_found", message: "No registration found for this email." }); return; }
    res.json({
      status: pending.status,
      message: pending.status === "pending"  ? "Your registration is still under review." :
               pending.status === "approved" ? "Your registration has been approved. Please log in." :
               `Your registration was not approved.${pending.rejectionReason ? ` Reason: ${pending.rejectionReason}` : ""}`,
    });
  } catch { res.status(500).json({ error: "Failed to check status." }); }
});

export default router;
