import type { Request, Response, NextFunction } from "express";
import type { ArcjetNodeRequest } from "@arcjet/node";
import aj from "../config/arcjet.js";

const securityMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // In development pass straight through — Arcjet is in DRY_RUN already
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }

  try {
    const arcjetReq: ArcjetNodeRequest = {
      headers:  req.headers,
      method:   req.method,
      url:      req.originalUrl ?? req.url,
      socket:   { remoteAddress: req.socket?.remoteAddress ?? req.ip ?? "0.0.0.0" },
    };

    const decision = await aj.protect(arcjetReq);

    if (decision.isDenied()) {
      if (decision.reason.isBot()) {
        res.status(403).json({ error: "Automated requests are not allowed." });
        return;
      }
      if (decision.reason.isRateLimit()) {
        res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
        return;
      }
      res.status(403).json({ error: "Request blocked by security policy." });
      return;
    }

    next();
  } catch (e) {
    // Fail open — never break the API over a security middleware error
    console.error("Arcjet middleware error:", e);
    next();
  }
};

export default securityMiddleware;
