/**
 * Profiles routes — extended user profile (bio, contact, Cloudinary image, prefs)
 * GET    /api/profiles/:userId   — admin | self
 * PUT    /api/profiles/:userId   — self only
 * POST   /api/profiles/:userId/change-password — self only
 */
import express from "express";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { user, account, profiles } from "../db/schema/auth.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(requireAuth);

/* ── Completeness score ─────────────────────────────────────────────────── */
function calcCompleteness(p: typeof profiles.$inferSelect | null, u: typeof user.$inferSelect): number {
  const checks = [
    !!u.name,
    !!u.email,
    !!u.image,
    !!p?.bio,
    !!p?.phone,
    !!p?.address,
    !!(p?.academicInfo && Object.keys(p.academicInfo).length > 0),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/* ── GET /api/profiles/:userId ── */
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;
  const currentUser = req.user!;

  if (currentUser.role !== "admin" && currentUser.userId !== userId) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  try {
    const userRows = await db.select().from(user).where(eq(user.id, userId));
    const foundUser = userRows[0];
    if (!foundUser) { res.status(404).json({ error: "User not found." }); return; }

    const profileRows = await db.select().from(profiles).where(eq(profiles.userId, userId));
    const profile = profileRows[0] ?? null;

    res.json({
      data: {
        ...foundUser,
        profile: profile ?? { userId, bio: null, phone: null, address: null, website: null, academicInfo: {}, notificationPrefs: { emailLogin: true, emailApproval: true, emailClasses: true } },
        completeness: calcCompleteness(profile, foundUser),
      },
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to get profile." });
  }
});

/* ── PUT /api/profiles/:userId ── */
router.put("/:userId", async (req, res) => {
  const { userId } = req.params;
  const currentUser = req.user!;

  if (currentUser.userId !== userId) {
    res.status(403).json({ error: "You can only edit your own profile." });
    return;
  }

  try {
    const {
      name, image, imageCldPubId,
      bio, phone, address, website,
      academicInfo, notificationPrefs,
    } = req.body as {
      name?: string; image?: string; imageCldPubId?: string;
      bio?: string; phone?: string; address?: string; website?: string;
      academicInfo?: Record<string, string>;
      notificationPrefs?: { emailLogin: boolean; emailApproval: boolean; emailClasses: boolean };
    };

    // Update user table fields
    const userUpdate: Record<string, unknown> = {};
    if (name          !== undefined) userUpdate["name"]          = name.trim();
    if (image         !== undefined) userUpdate["image"]         = image;
    if (imageCldPubId !== undefined) userUpdate["imageCldPubId"] = imageCldPubId;

    if (Object.keys(userUpdate).length > 0) {
      await db.update(user).set(userUpdate).where(eq(user.id, userId));
    }

    // Upsert profile
    const profileData: Record<string, unknown> = { userId };
    if (bio               !== undefined) profileData["bio"]               = bio;
    if (phone             !== undefined) profileData["phone"]             = phone;
    if (address           !== undefined) profileData["address"]           = address;
    if (website           !== undefined) profileData["website"]           = website;
    if (academicInfo      !== undefined) profileData["academicInfo"]      = academicInfo;
    if (notificationPrefs !== undefined) profileData["notificationPrefs"] = notificationPrefs;

    await db
      .insert(profiles)
      .values(profileData as any)
      .onConflictDoUpdate({ target: profiles.userId, set: profileData as any });

    // Re-fetch to return complete profile
    const userRows    = await db.select().from(user).where(eq(user.id, userId));
    const profileRows = await db.select().from(profiles).where(eq(profiles.userId, userId));
    const updatedUser    = userRows[0];
    const updatedProfile = profileRows[0] ?? null;

    if (!updatedUser) { res.status(404).json({ error: "User not found." }); return; }

    res.json({
      data: {
        ...updatedUser,
        profile: updatedProfile,
        completeness: calcCompleteness(updatedProfile, updatedUser),
      },
    });
  } catch (e) {
    console.error("PUT /profiles:", e);
    res.status(500).json({ error: "Failed to update profile." });
  }
});

/* ── POST /api/profiles/:userId/change-password ── */
router.post("/:userId/change-password", async (req, res) => {
  const { userId } = req.params;
  const currentUser = req.user!;

  if (currentUser.userId !== userId) {
    res.status(403).json({ error: "You can only change your own password." });
    return;
  }

  const { currentPassword, newPassword } = req.body as {
    currentPassword: string; newPassword: string;
  };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current and new password are required." });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters." });
    return;
  }

  try {
    const credRows = await db
      .select({ id: account.id, password: account.password })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));

    const cred = credRows[0];
    if (!cred?.password) { res.status(400).json({ error: "No password credential found." }); return; }

    const valid = await bcrypt.compare(currentPassword, cred.password);
    if (!valid) { res.status(401).json({ error: "Current password is incorrect." }); return; }

    const newHash = await bcrypt.hash(newPassword, 12);
    await db.update(account).set({ password: newHash }).where(eq(account.id, cred.id));

    res.json({ data: { message: "Password changed successfully." } });
  } catch (e) {
    console.error("change-password:", e);
    res.status(500).json({ error: "Failed to change password." });
  }
});

export default router;
