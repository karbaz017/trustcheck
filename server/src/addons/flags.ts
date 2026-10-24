export type Feature = "calculators" | "emailCheck" | "scamsos";
const ENV: Record<Feature, string> = { calculators: "FEATURE_CALCULATORS", emailCheck: "FEATURE_EMAIL_CHECK", scamsos: "FEATURE_SCAMSOS" };

/** Read at call time so tests and restarts see changes. Anything other than "true"/"1" is off. */
export const isOn = (f: Feature): boolean => ["true", "1"].includes((process.env[ENV[f]] ?? "").toLowerCase());
export const features = () => ({ calculators: isOn("calculators"), emailCheck: isOn("emailCheck"), scamsos: false });
