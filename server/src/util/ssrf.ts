import { isIP } from "node:net";

/** True for loopback, private, link-local, CGNAT, metadata and other non-public addresses. */
export function isPrivateAddress(addr: string): boolean {
  const kind = isIP(addr);
  if (kind === 4) return isPrivateV4(addr);
  if (kind === 6) {
    const a = addr.toLowerCase();
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateV4(mapped[1]);
    const mappedHex = a.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16), lo = parseInt(mappedHex[2], 16);
      return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return (
      a === "::" || a === "::1" ||
      /^f[cd][0-9a-f]{2}:/.test(a) || // unique local fc00::/7
      /^fe[89ab][0-9a-f]:/.test(a) || // link local fe80::/10
      /^ff[0-9a-f]{2}:/.test(a) // multicast
    );
  }
  return true; // not a valid IP: refuse
}

function isPrivateV4(addr: string): boolean {
  const [a, b] = addr.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast, reserved, broadcast
  );
}
