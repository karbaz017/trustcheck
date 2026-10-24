// 9+ digits, or an explicit "+" / parentheses. Keeps dates like 2026-10-24 (8 digits) intact.
const isPhone = (m: string) => m.replace(/\D/g, "").length >= 9 || /^\+|\(/.test(m);

/** Removes personal identifiers before any text goes to Gemini or search. Order matters: most specific first. */
export function redact(text: string): string {
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[ssn]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    // IPv6: full form, or compressed with "::" (so clock times like 10:30:45 are left alone)
    .replace(/\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b/gi, "[ip]")
    .replace(/(?<![\w:])(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?(?![\w:])/gi, "[ip]")
    // Phones: needs separators or a leading +; bare digit runs are handled by the number rule below
    .replace(/(?<![\w])\+?\d[\d\s().-]{7,}\d(?![\w])/g, (m) => (/^\+?\d+$/.test(m) ? m : isPhone(m) ? "[phone]" : m))
    .replace(/\b\d{8,}\b/g, "[number]");
}
