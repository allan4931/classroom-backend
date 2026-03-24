import bcrypt from "bcryptjs";
import { db } from "./src/db/index.js";
import { user, account } from "./src/db/schema/auth.js";
import { eq, and } from "drizzle-orm";

const SALT = 12;

async function revertAdminPassword() {
  const adminEmail = 'admin@university.edu';
  const originalPassword = 'Fx2Y8g9f#'; // Restore original strong password
  
  try {
    // Get admin user
    const userRows = await db.select().from(user).where(eq(user.email, adminEmail));
    const adminUser = userRows[0];
    
    if (!adminUser) {
      console.log('Admin user not found');
      return;
    }
    
    // Hash original password
    const passwordHash = await bcrypt.hash(originalPassword, SALT);
    
    // Update user password
    await db.update(user)
      .set({ password: passwordHash })
      .where(eq(user.id, adminUser.id));
    
    // Update account credentials
    await db.update(account)
      .set({ password: passwordHash })
      .where(and(eq(account.userId, adminUser.id), eq(account.providerId, 'credential')));
    
    console.log(`Admin password reverted to: ${originalPassword}`);
    console.log('You can now login with:');
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${originalPassword}`);
    
  } catch (error) {
    console.error('Error reverting admin password:', error);
  }
}

revertAdminPassword().then(() => process.exit(0));
