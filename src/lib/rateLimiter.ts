import rateLimit from 'express-rate-limit';

// Store failed login attempts in memory
const failedAttempts = new Map<string, { count: number; lastAttempt: number; lockUntil?: number }>();

// Clean old attempts every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of failedAttempts.entries()) {
    if (now - data.lastAttempt > 15 * 60 * 1000) {
      failedAttempts.delete(email);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Clear all failed attempts on startup
failedAttempts.clear();

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 attempts per window
  message: { error: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  handler: (req, res, next) => {
    const email = req.body?.email;
    if (!email) return next();
    
    const attempts = failedAttempts.get(email);
    const now = Date.now();
    
    // Check if account is locked
    if (attempts?.lockUntil && attempts.lockUntil > now) {
      const remainingTime = Math.ceil((attempts.lockUntil - now) / 1000 / 60);
      return res.status(429).json({ 
        error: `Account locked due to too many failed attempts. Try again in ${remainingTime} minutes.`,
        locked: true,
        remainingTime 
      });
    }
    
    // If too many attempts, lock account for 30 minutes
    if (attempts?.count >= 5) {
      failedAttempts.set(email, {
        count: attempts.count + 1,
        lastAttempt: now,
        lockUntil: now + (30 * 60 * 1000) // 30 minutes
      });
      
      return res.status(429).json({ 
        error: "Too many failed login attempts. Account locked for 30 minutes.",
        locked: true 
      });
    }
    
    next();
  }
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Max 3 registration attempts per hour
  message: { error: "Too many registration attempts. Please try again later." },
  standardHeaders: true
});

export function recordFailedAttempt(email: string) {
  const now = Date.now();
  const current = failedAttempts.get(email) || { count: 0, lastAttempt: 0 };
  
  failedAttempts.set(email, {
    count: current.count + 1,
    lastAttempt: now
  });
}

export function clearFailedAttempts(email: string) {
  failedAttempts.delete(email);
}

export function checkPasswordStrength(password: string): { isStrong: boolean; issues: string[] } {
  const issues: string[] = [];
  
  if (password.length < 6) {
    issues.push("Password must be at least 6 characters long");
  }
  
  // Only require complexity for new passwords (8+ chars)
  if (password.length >= 8) {
    if (!/[A-Z]/.test(password)) {
      issues.push("Password must contain at least one uppercase letter");
    }
    
    if (!/[a-z]/.test(password)) {
      issues.push("Password must contain at least one lowercase letter");
    }
    
    if (!/[0-9]/.test(password)) {
      issues.push("Password must contain at least one number");
    }
  }
  
  // Always block obviously weak passwords
  const commonPasswords = ['password', '123456', 'qwerty', 'abc123'];
  if (commonPasswords.includes(password.toLowerCase())) {
    issues.push("Password is too common. Please choose a stronger password");
  }
  
  return {
    isStrong: issues.length === 0,
    issues
  };
}
