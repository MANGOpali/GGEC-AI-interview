import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
export function createVault(key) {
  const bytes = Buffer.from(key, 'base64');
  if (bytes.length !== 32)
    throw new Error('DATA_ENCRYPTION_KEY must be 32 random bytes encoded as base64.');
  return {
    seal(value) {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', bytes, iv);
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(value), 'utf8'),
        cipher.final(),
      ]);
      return {
        v: 1,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      };
    },
    open(value) {
      if (value?.purged === true) return {};
      const d = createDecipheriv('aes-256-gcm', bytes, Buffer.from(value.iv, 'base64'));
      d.setAuthTag(Buffer.from(value.tag, 'base64'));
      return JSON.parse(
        Buffer.concat([d.update(Buffer.from(value.ciphertext, 'base64')), d.final()]).toString(
          'utf8',
        ),
      );
    },
  };
}
