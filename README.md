# NetClass — Backend API

REST API for the NetClass classroom management system. Built with **Node.js + Express + TypeScript**, using **Drizzle ORM** for database access, **bcryptjs** for password hashing, and **JWT** for stateless authentication with full Role-Based Access Control (RBAC).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Framework | Express 5 |
| Language | TypeScript 5 (`strict` mode) |
| Database | PostgreSQL via [Neon](https://neon.tech) |
| ORM | Drizzle ORM |
| Auth | Custom JWT (`jsonwebtoken`) |
| Passwords | bcryptjs — 12 salt rounds |
| Rate Limiting | Arcjet (production only) |
| Dev runner | `tsx watch` |

---

## Project Structure

```
backend/
├── src/
│   ├── index.ts                 # Express app entry point — registers all routes
│   ├── express.d.ts             # Extends Express.Request with JWTPayload type
│   ├── type.d.ts                # Additional global type declarations
│   │
│   ├── db/
│   │   ├── index.ts             # Drizzle + Neon HTTP connection setup
│   │   └── schema/
│   │       ├── auth.ts          # user, session, account, verification tables
│   │       ├── app.ts           # departments, subjects, classes, enrollments tables
│   │       └── index.ts         # Re-exports both schemas
│   │
│   ├── lib/
│   │   ├── jwt.ts               # signToken() and verifyToken() helpers
│   │   └── auth.ts              # better-auth config (present but not active)
│   │
│   ├── middleware/
│   │   ├── authMiddleware.ts    # requireAuth() and requireRole() middleware
│   │   └── security.ts         # Arcjet rate-limiting and bot detection
│   │
│   ├── routes/
│   │   ├── auth.ts              # POST /register  POST /login  GET /me
│   │   ├── users.ts             # Full CRUD with RBAC
│   │   ├── classes.ts           # CRUD + join, roster, invite code regeneration
│   │   ├── departments.ts       # CRUD — write operations admin only
│   │   └── subjects.ts          # CRUD — write operations admin only
│   │
│   └── config/
│       └── arcjet.ts            # Arcjet client initialisation
│
├── drizzle/                     # Auto-generated SQL migration files
├── drizzle.config.ts            # Drizzle Kit config — points to schema and DB
├── tsconfig.json                # Strict TypeScript config
├── package.json
└── .env.example                 # All required environment variables with descriptions
```

---

## Environment Variables

Copy `.env.example` to `.env` then fill in your values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string from Neon |
| `JWT_SECRET` | ✅ | Random string — minimum 32 characters |
| `FRONTEND_URL` | ✅ | Your frontend origin for CORS e.g. `http://localhost:5173` |
| `PORT` | optional | Defaults to `8000` |
| `NODE_ENV` | optional | Set to `production` to activate Arcjet rate limiting |
| `BETTER_AUTH_SECRET` | optional | Only needed if you re-enable better-auth sessions |

> Get your free `DATABASE_URL` from [neon.tech](https://neon.tech) — free tier is enough for development. Copy the connection string from the Neon dashboard under **Connection Details**.

---

## Getting Started

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:
- `DATABASE_URL` — from Neon
- `JWT_SECRET` — any long random string

### 3. Run database migrations

Creates all tables in your Neon database:

```bash
npm run db:migrate
```

> If you later edit the schema files, regenerate before migrating:
> ```bash
> npm run db:generate
> npm run db:migrate
> ```

### 4. Start the dev server

```bash
npm run dev
```

You should see:

```
🎓 NetClass API  →  http://localhost:8000
```

---

## Available Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start server with hot-reload via `tsx watch` |
| `npm run build` | Compile TypeScript to `dist/` folder |
| `npm start` | Run the compiled production build |
| `npm run db:generate` | Scan schema files and generate new migration SQL |
| `npm run db:migrate` | Apply all pending migrations to the database |

---

## API Reference

All routes are prefixed with `/api`. All protected routes require the JWT token in the `Authorization` header:

```
Authorization: Bearer <your_token_here>
```

---

### Auth — no token required

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create account. First user becomes Admin automatically. |
| `POST` | `/api/auth/login` | Login. Returns `token` and `user` object. |
| `GET` | `/api/auth/me` | Returns the profile of the authenticated user. Token required. |

**Register body:**
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "password": "yourpassword",
  "role": "student"
}
```

> `role` can be `student` or `teacher`. The very first account registered ignores this field and is always assigned `admin`.

**Login response:**
```json
{
  "message": "Login successful.",
  "user": {
    "id": "...",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "role": "student"
  },
  "token": "eyJhbGci..."
}
```

Save the `token` — you need it for every other request.

---

### Users

| Method | Path | Who can call it | Description |
|---|---|---|---|
| `GET` | `/api/users` | Admin | List all users. Supports `?search=` and `?role=` query params. |
| `POST` | `/api/users` | Admin, Teacher | Create a user. Teachers can only create students. |
| `GET` | `/api/users/:id` | Admin, Self | Get one user profile. |
| `PUT` | `/api/users/:id` | Admin, Self | Update name, image. Only admin can change `role`. |
| `DELETE` | `/api/users/:id` | Admin | Delete user. Cannot delete your own account. |

---

### Classes

| Method | Path | Who can call it | Description |
|---|---|---|---|
| `GET` | `/api/classes` | All | Admin sees all. Teacher sees own. Student sees enrolled only. |
| `POST` | `/api/classes` | Admin, Teacher | Create class. Teacher is auto-assigned as the teacher. |
| `GET` | `/api/classes/:id` | All | Full class detail with subject, teacher, department. |
| `PUT` | `/api/classes/:id` | Admin, Teacher | Update. Teacher can only edit their own classes. |
| `DELETE` | `/api/classes/:id` | Admin | Delete class and all its enrollments. |
| `POST` | `/api/classes/join` | Student | Join a class using an invite code. Body: `{ "inviteCode": "ABC1234" }` |
| `GET` | `/api/classes/:id/students` | Admin, Teacher | Get enrolled student list for a class. |
| `POST` | `/api/classes/:id/regenerate-key` | Admin, Teacher | Generate a new invite code for the class. |
| `GET` | `/api/classes/my/enrolled` | Student | Get all classes this student is enrolled in. |

---

### Departments

| Method | Path | Who can call it | Description |
|---|---|---|---|
| `GET` | `/api/departments` | All | List departments. Supports `?search=` query param. |
| `GET` | `/api/departments/:id` | All | Get one department. |
| `POST` | `/api/departments` | Admin | Create department. `name` and `code` required. |
| `PUT` | `/api/departments/:id` | Admin | Update department. |
| `DELETE` | `/api/departments/:id` | Admin | Delete department. Blocked if subjects are linked. |

---

### Subjects

| Method | Path | Who can call it | Description |
|---|---|---|---|
| `GET` | `/api/subjects` | All | List subjects. Supports `?search=` and `?department=` params. |
| `GET` | `/api/subjects/:id` | All | Get one subject including its department. |
| `POST` | `/api/subjects` | Admin | Create subject. Requires `name`, `code`, and `departmentId`. |
| `PUT` | `/api/subjects/:id` | Admin | Update subject. |
| `DELETE` | `/api/subjects/:id` | Admin | Delete subject. Blocked if classes are linked. |

---

## How Authentication Works

1. User calls `POST /api/auth/login` with email and password
2. Server verifies password against the bcrypt hash stored in the `account` table
3. Server signs a JWT containing `{ userId, email, name, role }` — expires in 7 days
4. Client stores the token (frontend uses `localStorage`)
5. Every subsequent request includes `Authorization: Bearer <token>`
6. `requireAuth` middleware verifies the token on every protected route
7. `requireRole("admin")` middleware checks the `role` field from the decoded token

---

## Role Summary

| Role | What they can do |
|---|---|
| **Admin** | Full CRUD on all resources. Manage users. Cannot delete own account. First user registered becomes admin automatically — no setup needed. |
| **Teacher** | Create and manage own classes. Create student accounts. View rosters for own classes. Read-only access to departments and subjects. |
| **Student** | Join classes via invite code. View enrolled classes only. Edit own profile name and image. |

---

## Database Schema Overview

### `user`
All system users. `role` is an enum: `admin`, `teacher`, `student`.

### `account`
Stores the bcrypt-hashed password for each user under `providerId = "credential"`.

### `departments`
Top-level academic groupings. `code` must be unique (e.g. `CS`, `MATH`).

### `subjects`
Belong to a department via `departmentId`. Must have a unique `code`.

### `classes`
Belong to a subject and a teacher. Key fields:
- `inviteCode` — unique 7-character uppercase string, auto-generated at creation
- `status` — `active`, `inactive`, or `archived`
- `schedules` — JSONB array of `{ day, startTime, endTime }` objects
- `capacity` — max students, default 50

### `enrollments`
Join table between `user` (student) and `classes`. Composite primary key on `(studentId, classId)` prevents duplicate enrollments.

---

## Error Format

Every error response follows this shape:

```json
{ "error": "A clear description of what went wrong." }
```

| Status | Meaning |
|---|---|
| `400` | Bad request or missing required fields |
| `401` | No token provided or token is invalid/expired |
| `403` | Token is valid but your role is not allowed |
| `404` | The requested resource does not exist |
| `409` | Conflict — e.g. email already registered, duplicate code |
| `500` | Unexpected server error |