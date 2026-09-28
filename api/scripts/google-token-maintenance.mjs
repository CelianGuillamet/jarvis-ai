/** Called only with stopped writers, a local target and a protected full backup. */
export async function sealGoogleTokens(client, cipher) {
  await client.query('BEGIN');
  try {
    await client.query('LOCK TABLE "GoogleOAuthToken" IN ACCESS EXCLUSIVE MODE');
    const { rows } = await client.query('SELECT id, "refreshToken", "accessToken" FROM "GoogleOAuthToken"');
    for (const row of rows) {
      const seal = (value, field) => {
        if (value === null) return null;
        const context = `google:${row.id}:${field}`;
        const plaintext = value.startsWith('v1.') ? cipher.decrypt(value, context) : value;
        const encrypted = cipher.encrypt(plaintext, context);
        if (cipher.decrypt(encrypted, context) !== plaintext) throw new Error('Encryption verification failed.');
        return encrypted;
      };
      await client.query('UPDATE "GoogleOAuthToken" SET "refreshToken"=$1, "accessToken"=$2 WHERE id=$3', [
        seal(row.refreshToken, 'refresh'), seal(row.accessToken, 'access'), row.id,
      ]);
    }
    await client.query('COMMIT');
    return { sealedRecords: rows.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
