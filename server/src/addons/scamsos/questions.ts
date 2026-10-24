/** The five quick questions. Pure data (no Node imports) so the client can render the form from the same source. */
export interface Option { id: string; label: string }
export interface Question { key: "happened" | "method" | "amount" | "when" | "contact"; label: string; multi: boolean; options: Option[] }

export const QUESTIONS: Question[] = [
  { key: "happened", label: "What happened?", multi: true, options: [
    { id: "sent_money", label: "I sent money" },
    { id: "shared_code_or_password", label: "I shared a code or password" },
    { id: "clicked_link", label: "I clicked a link" },
    { id: "gave_remote_access", label: "I gave someone remote access to my device" },
    { id: "shared_id_details", label: "I shared ID details (SSN, license, passport…)" },
    { id: "nothing_yet", label: "Nothing yet, I'm just worried" },
  ] },
  { key: "method", label: "How did the money move?", multi: false, options: [
    { id: "card", label: "Credit or debit card" },
    { id: "bank_transfer", label: "Bank transfer or a payment app (Zelle-style)" },
    { id: "wire", label: "Wire transfer" },
    { id: "gift_cards", label: "Gift cards" },
    { id: "crypto", label: "Cryptocurrency" },
    { id: "not_applicable", label: "Not applicable" },
  ] },
  { key: "amount", label: "Roughly how much?", multi: false, options: [
    { id: "none", label: "No money sent" },
    { id: "under_100", label: "Under $100" },
    { id: "100_1000", label: "$100 to $1,000" },
    { id: "1000_10000", label: "$1,000 to $10,000" },
    { id: "over_10000", label: "Over $10,000" },
  ] },
  { key: "when", label: "When did it happen?", multi: false, options: [
    { id: "within_hour", label: "Within the last hour" },
    { id: "today", label: "Today" },
    { id: "this_week", label: "This week" },
    { id: "longer_ago", label: "Longer ago" },
  ] },
  { key: "contact", label: "How were you contacted?", multi: false, options: [
    { id: "text", label: "Text message" },
    { id: "call", label: "Phone call" },
    { id: "email", label: "Email" },
    { id: "social_media", label: "Social media" },
    { id: "other", label: "Something else" },
  ] },
];

export const labelOf = (key: Question["key"], id: string): string => QUESTIONS.find((q) => q.key === key)?.options.find((o) => o.id === id)?.label ?? id;
export const idsOf = (key: Question["key"]): [string, ...string[]] => QUESTIONS.find((q) => q.key === key)!.options.map((o) => o.id) as [string, ...string[]];
