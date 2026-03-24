/**
 * Input validation and sanitisation helpers.
 *
 * validateMeaningfulName — rejects pure gibberish like "@@##wedwer$$$":
 *   • Must contain at least one run of 2+ consecutive alphabetic characters (a real word fragment)
 *   • No more than 40% of characters may be special/punctuation
 *   • Allowed chars in names: letters, digits, spaces, hyphens, apostrophes, parentheses, &, /
 */

/** Checks that a name contains actual words, not random characters */
export function validateMeaningfulName(value: string): { valid: boolean; error?: string } {
  if (!value || typeof value !== "string") {
    return { valid: false, error: "Value is required." };
  }

  const trimmed = value.trim();

  // Must have at least 2 consecutive alphabetic characters (one real word fragment)
  if (!/[a-zA-Z]{2,}/.test(trimmed)) {
    return {
      valid: false,
      error: "Name must contain at least one recognisable word (2+ letters in sequence).",
    };
  }

  // Count special characters (anything that is not letter, digit, space, or common name punctuation)
  const allowed = /[a-zA-Z0-9\s\-'&\/().]/;
  const specialCount = trimmed.split("").filter(c => !allowed.test(c)).length;
  const ratio = specialCount / trimmed.length;

  if (ratio > 0.3) {
    return {
      valid: false,
      error: "Name contains too many special characters. Please use a meaningful name.",
    };
  }

  return { valid: true };
}

export function validateEmail(email: string): { valid: boolean; sanitized?: string; error?: string } {
  if (!email || typeof email !== "string") return { valid: false, error: "Email is required." };
  const sanitized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitized)) return { valid: false, error: "Invalid email format." };
  if (sanitized.length > 254) return { valid: false, error: "Email is too long." };
  return { valid: true, sanitized };
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== "string") return { valid: false, error: "Password is required." };
  if (password.length < 6)   return { valid: false, error: "Password must be at least 6 characters." };
  if (password.length > 128) return { valid: false, error: "Password is too long." };
  return { valid: true };
}

export function validateName(name: string): { valid: boolean; sanitized?: string; error?: string } {
  if (!name || typeof name !== "string") return { valid: false, error: "Name is required." };
  const sanitized = name.replace(/\s+/g, " ").trim();
  if (sanitized.length < 2)   return { valid: false, error: "Name must be at least 2 characters." };
  if (sanitized.length > 100) return { valid: false, error: "Name is too long." };
  return { valid: true, sanitized };
}

export function validateRole(role: string): { valid: boolean; sanitized?: string; error?: string } {
  if (!role || typeof role !== "string") return { valid: false, error: "Role is required." };
  const sanitized = role.trim().toLowerCase();
  if (!["admin", "teacher", "student"].includes(sanitized)) return { valid: false, error: "Invalid role." };
  return { valid: true, sanitized };
}
