import {
  pgTable, text, timestamp, boolean, pgEnum, index, jsonb
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const roleEnum          = pgEnum("role",           ["student", "teacher", "admin"]);
export const pendingStatusEnum = pgEnum("pending_status", ["pending", "approved", "rejected"]);
export const userStatusEnum    = pgEnum("user_status",    ["active", "suspended"]);

const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
};

// ── Active users ────────────────────────────────────────────────────────────
export const user = pgTable("user", {
  id:             text("id").primaryKey(),
  name:           text("name").notNull(),
  email:          text("email").notNull().unique(),
  emailVerified:  boolean("email_verified").notNull(),
  image:          text("image"),
  role:           roleEnum("role").default("student").notNull(),
  imageCldPubId:  text("image_cld_pub_id"),
  isMainAdmin:    boolean("is_main_admin").default(false).notNull(),
  status:         userStatusEnum("status").default("active").notNull(),
  twoFactorSecret:text("two_factor_secret"),          // TOTP secret (admin 2FA)
  twoFactorEnabled:boolean("two_factor_enabled").default(false).notNull(),
  ...timestamps,
});

// ── Extended profile (one-to-one with user) ─────────────────────────────────
export const profiles = pgTable("profiles", {
  userId:       text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  bio:          text("bio"),
  phone:        text("phone"),
  address:      text("address"),
  website:      text("website"),
  academicInfo: jsonb("academic_info").$type<Record<string, string>>().default({}).notNull(),
  notificationPrefs: jsonb("notification_prefs")
    .$type<{ emailLogin: boolean; emailApproval: boolean; emailClasses: boolean }>()
    .default({ emailLogin: true, emailApproval: true, emailClasses: true })
    .notNull(),
  ...timestamps,
});

// ── Pending registrations ───────────────────────────────────────────────────
export const pendingRegistrations = pgTable("pending_registrations", {
  id:              text("id").primaryKey(),
  name:            text("name").notNull(),
  email:           text("email").notNull().unique(),
  passwordHash:    text("password_hash").notNull(),
  role:            roleEnum("role").default("student").notNull(),
  status:          pendingStatusEnum("status").default("pending").notNull(),
  rejectionReason: text("rejection_reason"),
  approvedById:    text("approved_by_id"),
  approvedAt:      timestamp("approved_at"),
  notes:           text("notes"),
  ...timestamps,
}, (t) => [
  index("pending_email_idx").on(t.email),
  index("pending_status_idx").on(t.status),
]);

// ── Waitlist (rejected students preserved for potential reinstatement) ──────
export const waitlist = pgTable("waitlist", {
  id:             text("id").primaryKey(),
  userId:         text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  rejectedById:   text("rejected_by_id").notNull(),
  rejectionReason:text("rejection_reason"),
  rejectedAt:     timestamp("rejected_at").defaultNow().notNull(),
  reinstatedAt:   timestamp("reinstated_at"),
  reinstatedById: text("reinstated_by_id"),
  notes:          text("notes"),
}, (t) => [index("waitlist_user_id_idx").on(t.userId)]);

// ── Auth infrastructure ─────────────────────────────────────────────────────
export const session = pgTable("session", {
  id:        text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token:     text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId:    text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [index("session_user_id_idx").on(t.userId)]);

export const account = pgTable("account", {
  id:                    text("id").primaryKey(),
  accountId:             text("account_id").notNull(),
  providerId:            text("provider_id").notNull(),
  userId:                text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken:           text("access_token"),
  refreshToken:          text("refresh_token"),
  idToken:               text("id_token"),
  accessTokenExpiresAt:  timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope:                 text("scope"),
  password:              text("password"),
  createdAt:             timestamp("created_at").defaultNow().notNull(),
  updatedAt:             timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [index("account_user_id_idx").on(t.userId)]);

export const verification = pgTable("verification", {
  id:         text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value:      text("value").notNull(),
  expiresAt:  timestamp("expires_at").notNull(),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
  updatedAt:  timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

// ── Relations ───────────────────────────────────────────────────────────────
export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  profile:  one(profiles, { fields: [user.id], references: [profiles.userId] }),
}));

export const profileRelations = relations(profiles, ({ one }) => ({
  user: one(user, { fields: [profiles.userId], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

// ── Types ───────────────────────────────────────────────────────────────────
export type User               = typeof user.$inferSelect;
export type Profile            = typeof profiles.$inferSelect;
export type PendingRegistration= typeof pendingRegistrations.$inferSelect;
export type WaitlistEntry      = typeof waitlist.$inferSelect;
export type Session            = typeof session.$inferSelect;
export type Account            = typeof account.$inferSelect;
