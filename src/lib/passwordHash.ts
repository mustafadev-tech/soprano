import { scryptSync, timingSafeEqual } from 'crypto';

const PASSWORD_HASH_PREFIX = 'scrypt';

interface ParsedPasswordHash {
  salt: string;
  hash: Buffer;
}

function parsePasswordHash(storedHash: string): ParsedPasswordHash | null {
  const [algorithm, salt, encodedHash] = storedHash.split('$');

  if (algorithm !== PASSWORD_HASH_PREFIX || !salt || !encodedHash) {
    return null;
  }

  try {
    return {
      salt,
      hash: Buffer.from(encodedHash, 'base64url'),
    };
  } catch {
    return null;
  }
}

export function verifyPasswordHash(password: string, storedHash: string): boolean {
  const parsedHash = parsePasswordHash(storedHash);

  if (!parsedHash) {
    return false;
  }

  const derivedHash = scryptSync(password, parsedHash.salt, parsedHash.hash.length);

  return (
    derivedHash.length === parsedHash.hash.length &&
    timingSafeEqual(derivedHash, parsedHash.hash)
  );
}
