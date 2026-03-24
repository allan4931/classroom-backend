/**
 * Authentication & RBAC middleware
 */
import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JWTPayload } from "../lib/jwt.js";

/** Verify JWT and attach user to request */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized", message: "No token provided." });
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized", message: "Invalid or expired token." });
  }
}

/** Require specific roles — call AFTER requireAuth */
export function requireRole(...roles: Array<"admin" | "teacher" | "student">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!req.user?.role || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Forbidden",
        message: `Access restricted to: ${roles.join(", ")}`,
      });
    }
    next();
  };
}

/** Optional auth — attaches user if token present but doesn't block */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  if (token) {
    try { req.user = verifyToken(token); } catch { /* ignore */ }
  }
  next();
}
