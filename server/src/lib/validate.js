const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUsername(username) {
  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    return "Username must be 3-32 characters: letters, numbers, underscore, or hyphen.";
  }
  return null;
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 10) {
    return "Password must be at least 10 characters.";
  }
  return null;
}

export function validateEmail(email) {
  if (email == null || email === "") return null; // optional field
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return "Invalid email address.";
  }
  return null;
}
