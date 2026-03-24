import { db } from './src/db/index.js';
import { user } from './src/db/schema/auth.js';
import { departments, classes } from './src/db/schema/app.js';
import { eq } from 'drizzle-orm';

const users = await db.select().from(user).where(eq(user.role, 'admin'));
console.log(JSON.stringify(users, null, 2));

const allUsers = await db.select().from(user);
console.log('\nAll users:', allUsers.length);

const depts = await db.select().from(departments);
console.log('Departments:', depts.length);

const allClasses = await db.select().from(classes);
console.log('Classes:', allClasses.length);

process.exit(0);
