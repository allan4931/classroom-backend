/**
 * Admin setup script
 * Creates the first admin user with secure credentials
 */

import bcrypt from "bcryptjs";
import { db } from "../src/db/index.js";
import { user } from "../src/db/schema/auth.js";
import { account } from "../src/db/schema/auth.js";
import { signToken } from "../src/lib/jwt.js";
import { eq, and, sql } from "drizzle-orm";

async function createAdminUser() {
  try {
    console.log("🔧 Creating admin user...");

    // Check if admin already exists
    const [existingAdmin] = await db
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(eq(user.role, "admin"));

    if (existingAdmin) return console.log("⚠️  Admin user already exists:", existingAdmin.email);

    // ✅ FIX: use drizzle sql tag — not raw db.execute()
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(user);
    const count = result?.count || 0;

    const isFirstUser  = Number(count) === 0;
    const assignedRole = isFirstUser ? "admin" : "student";

    // Create admin user
    const adminEmail = process.env.ADMIN_EMAIL || "admin@university.edu";
    const adminPassword = process.env.ADMIN_PASSWORD || "Fx2Y8g9f#";
    const adminName = process.env.ADMIN_NAME || "System Administrator";

    console.log("📧 Email:", adminEmail);
    console.log("👤 Name:", adminName);
    console.log("🔐 Password:", adminPassword);

    // Hash password
    const SALT_ROUNDS = 12;
    const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
    const id = crypto.randomUUID();

    // Create user record
    const [newUser] = await db
      .insert(user)
      .values({ id, email: adminEmail, name: adminName, role: assignedRole, emailVerified: false })
      .returning({ id: user.id, email: user.email, name: user.name, role: user.role });

    // Create account record with password
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Generate login token
    const token = signToken({ userId: id, email: newUser?.email || '', role: assignedRole, name: newUser?.name || '' });

    console.log("✅ Admin user created successfully!");
    console.log("🎫 Admin JWT Token (valid for 7 days):");
    console.log(token);
    console.log("");
    console.log("🚀 You can now:");
    console.log("1. Start the backend server: npm run dev");
    console.log("2. Login with the credentials above");
    console.log("3. Use the JWT token for API testing");

  } catch (error) {
    console.error("❌ Error creating admin user:", error);
    process.exit(1);
  }
}

// Run the setup
createAdminUser()
  .then(() => {
    console.log("🎉 Admin setup complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Setup failed:", error);
    process.exit(1);
  });
