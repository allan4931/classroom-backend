/**
 * Update admin password script
 * Updates the existing admin user's password to the new secure password
 */

import bcrypt from "bcryptjs";
import { db } from "../src/db/index.js";
import { user } from "../src/db/schema/auth.js";
import { account } from "../src/db/schema/auth.js";
import { eq, and, sql } from "drizzle-orm";

async function updateAdminPassword() {
  try {
    console.log("🔧 Updating admin password...");

    // Find the existing admin user
    const [existingAdmin] = await db
      .select({ 
        id: user.id, 
        email: user.email, 
        name: user.name,
        role: user.role 
      })
      .from(user)
      .where(eq(user.email, process.env.ADMIN_EMAIL || "admin@university.edu"));

    if (!existingAdmin) {
      console.log("❌ Admin user with email admin@university.edu not found");
      console.log("💡 Available admin users:");
      
      // Show all admin users
      const allAdmins = await db
        .select({ 
          id: user.id, 
          email: user.email, 
          name: user.name,
          role: user.role 
        })
        .from(user)
        .where(eq(user.role, "admin"));
        
      allAdmins.forEach((admin: any) => {
        console.log(`   - ${admin.name} (${admin.email})`);
      });
      
      return;
    }

    console.log("👤 Found admin user:");
    console.log(`   Name: ${existingAdmin.name}`);
    console.log(`   Email: ${existingAdmin.email}`);
    console.log(`   Role: ${existingAdmin.role}`);

    // Hash the new password
    const newPassword = process.env.ADMIN_PASSWORD || "Fx2Y8g9f#";
    const SALT_ROUNDS = 12;
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update the account password
    await db
      .update(account)
      .set({ 
        password: passwordHash,
        updatedAt: new Date()
      })
      .where(eq(account.userId, existingAdmin.id));

    console.log("✅ Admin password updated successfully!");
    console.log("");
    console.log("🔐 Login credentials:");
    console.log(`   Email: ${process.env.ADMIN_EMAIL || "admin@university.edu"}`);
    console.log("   Password: [Configured in environment]");
    console.log("");
    console.log("🚀 Use credentials from your .env file to login");

  } catch (error) {
    console.error("❌ Error updating admin password:", error);
    process.exit(1);
  }
}

// Run the update
updateAdminPassword()
  .then(() => {
    console.log("🎉 Password update complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Update failed:", error);
    process.exit(1);
  });
