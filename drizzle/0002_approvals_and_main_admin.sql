-- ── Migration 0002: approvals, main admin, status, profiles, waitlist ──────

-- 1. Add is_main_admin to user
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "is_main_admin" boolean DEFAULT false NOT NULL;

-- 2. Pending status enum
DO $$ BEGIN
  CREATE TYPE "pending_status" AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Pending registrations table
CREATE TABLE IF NOT EXISTS "pending_registrations" (
  "id"               text PRIMARY KEY,
  "name"             text NOT NULL,
  "email"            text NOT NULL UNIQUE,
  "password_hash"    text NOT NULL,
  "role"             "role" DEFAULT 'student' NOT NULL,
  "status"           "pending_status" DEFAULT 'pending' NOT NULL,
  "rejection_reason" text,
  "approved_by_id"   text,
  "approved_at"      timestamp,
  "notes"            text,
  "created_at"       timestamp DEFAULT now() NOT NULL,
  "updated_at"       timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "pending_email_idx"  ON "pending_registrations" ("email");
CREATE INDEX IF NOT EXISTS "pending_status_idx" ON "pending_registrations" ("status");

-- 4. User status enum & column
DO $$ BEGIN
  CREATE TYPE "user_status" AS ENUM ('active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "status"             "user_status" DEFAULT 'active' NOT NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "two_factor_secret"  text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean DEFAULT false NOT NULL;

-- 5. Profiles table
CREATE TABLE IF NOT EXISTS "profiles" (
  "user_id"             text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "bio"                 text,
  "phone"               text,
  "address"             text,
  "website"             text,
  "academic_info"       jsonb DEFAULT '{}' NOT NULL,
  "notification_prefs"  jsonb DEFAULT '{"emailLogin":true,"emailApproval":true,"emailClasses":true}' NOT NULL,
  "created_at"          timestamp DEFAULT now() NOT NULL,
  "updated_at"          timestamp DEFAULT now() NOT NULL
);

-- 6. Waitlist table
CREATE TABLE IF NOT EXISTS "waitlist" (
  "id"               text PRIMARY KEY,
  "user_id"          text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "rejected_by_id"   text NOT NULL,
  "rejection_reason" text,
  "rejected_at"      timestamp DEFAULT now() NOT NULL,
  "reinstated_at"    timestamp,
  "reinstated_by_id" text,
  "notes"            text
);
CREATE INDEX IF NOT EXISTS "waitlist_user_id_idx" ON "waitlist" ("user_id");
