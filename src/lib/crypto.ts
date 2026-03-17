import dotenv from 'dotenv';
dotenv.config();
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SECRET_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

export function decryptCredential(enc: string): string {
  if (!enc) return '';
  
  // If it doesn't have the expected format (3 parts separated by colons), 
  // assume it's already plain text (fallback for manual/legacy entries)
  const parts = enc.split(':');
  if (parts.length !== 3) {
    return enc;
  }

  try {
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedText = Buffer.from(parts[2], 'hex');

    // Basic sanity check: hex buffers should match the input hex strings
    if (iv.toString('hex') !== parts[0] || authTag.toString('hex') !== parts[1]) {
      return enc;
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(SECRET_KEY, 'hex'), iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    // If decryption fails (e.g. wrong key, but format matched), 
    // it's safer to either throw or return as-is depending on use case.
    // Given the request, returning as-is for non-matching or failed decryption 
    // helps with 'plain text' values like 'dest_password'.
    console.warn(`Decryption failed, returning as-is: ${(err as Error).message}`);
    return enc;
  }
}

export function encryptCredential(plain: string): string {
    const iv = crypto.randomBytes(12); // GCM standard IV length
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(SECRET_KEY, 'hex'), iv);
    
    let encryptedText = cipher.update(plain, 'utf8', 'hex');
    encryptedText += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `${iv.toString('hex')}:${authTag}:${encryptedText}`;
}

export function maskCredentials(str: string): string {
  if (!str) return str;
  // Mask postgresql://user:password@host
  let masked = str.replace(/(postgresql:\/\/[^:]+:)[^@]+(@)/g, '$1****$2');
  // Mask PGPASSWORD=...
  masked = masked.replace(/(PGPASSWORD=)[^ ]+/g, '$1****');
  return masked;
}
