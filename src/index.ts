import "dotenv/config.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import authRouter       from "./routes/auth.js";
import usersRouter      from "./routes/users.js";
import classesRouter    from "./routes/classes.js";
import departmentsRouter from "./routes/departments.js";
import subjectsRouter   from "./routes/subjects.js";
import approvalsRouter  from "./routes/approvals.js";
import profilesRouter   from "./routes/profiles.js";
import securityMiddleware from "./middleware/security.js";

const app  = express();
const PORT = Number(process.env.PORT) || 8000;

if (!process.env.FRONTEND_URL) throw new Error("FRONTEND_URL must be set in .env");

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      scriptSrc:  ["'self'"],
      imgSrc:     ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL],
      fontSrc:    ["'self'"],
      objectSrc:  ["'none'"],
      frameSrc:   ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (process.env.NODE_ENV !== "production") {
      if (origin.includes("localhost") || origin.includes("127.0.0.1")) return cb(null, true);
    }
    if (origin === process.env.FRONTEND_URL) return cb(null, true);
    cb(new Error("Not allowed by CORS"), false);
  },
  methods:        ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials:    true,
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge:         86400,
}));

app.use(express.json({ limit: "10mb" }));
app.use(securityMiddleware);

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: process.env.NODE_ENV === "production" ? 100 : 1000, message: { error: "Too many requests." }, standardHeaders: true, legacyHeaders: false });
const authLimiter   = rateLimit({ windowMs: 15 * 60 * 1000, max: process.env.NODE_ENV === "production" ? 10  : 50,   message: { error: "Too many authentication attempts." }, standardHeaders: true, legacyHeaders: false });
app.use(globalLimiter);

app.use("/api/auth",        authLimiter, authRouter);
app.use("/api/users",       usersRouter);
app.use("/api/classes",     classesRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/subjects",    subjectsRouter);
app.use("/api/approvals",   approvalsRouter);
app.use("/api/profiles",    profilesRouter);

app.get("/",       (_req, res) => res.json({ name: "NetClass API", version: "3.0.0", status: "running 🎓" }));
app.get("/health", (_req, res) => res.json({ status: "healthy", uptime: process.uptime(), env: process.env.NODE_ENV ?? "development" }));

app.listen(PORT, () => {
  console.log(`\n🎓 NetClass API  →  http://localhost:${PORT}`);
  console.log(`🌍 Env: ${process.env.NODE_ENV ?? "development"}  |  JWT: ${process.env.JWT_SECRET ? "✅" : "❌"}  |  DB: ${process.env.DATABASE_URL ? "✅" : "❌"}  |  SMTP: ${process.env.SMTP_HOST ? "✅" : "📋 console"}\n`);
});
