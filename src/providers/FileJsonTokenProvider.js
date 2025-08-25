// FileJsonTokenProvider.js - Centralized JSON (SSOT) management with locking + encryption + atomic rename
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { TokenProvider } from './TokenProvider.js';

export class FileJsonTokenProvider extends TokenProvider {
  /**
   * @param {{ filePath: string, masterKey: string, namespace?: string }} opts
   */
  constructor({ filePath, masterKey, namespace = 'ebay-oauth' }) {
    super();
    if (!filePath) {
      throw new Error('filePath is required');
    }
    if (!masterKey) {
      throw new Error('masterKey is required for FileJsonTokenProvider');
    }
    this.filePath = path.resolve(filePath);
    this.lockDir = `${this.filePath}.locks`;
    this.ns = namespace;
    // Machine-independent key derivation (for sharing)
    this.encKey = crypto.scryptSync(masterKey, 'ebay-ssot-tokens-salt-v1', 32);
  }

  // --- Encryption utilities (AES-256-GCM with AAD) ---
  encryptString(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encKey, iv);
    cipher.setAAD(Buffer.from('ebay-ssot'));
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `gcm:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
  }

  decryptString(data) {
    if (!data?.startsWith('gcm:')) {
      return data; // Backward compatibility (plain text assumed)
    }
    const [, ivB64, tagB64, encB64] = data.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const enc = Buffer.from(encB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAAD(Buffer.from('ebay-ssot'));
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  }

  // --- File I/O ---
  async readState() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      if (e.code === 'ENOENT') {
        return { version: 0, updatedAt: new Date().toISOString(), apps: {} };
      }
      throw e;
    }
  }

  async writeState(state) {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2));
    await fs.rename(tmp, this.filePath); // atomic
  }

  // --- App-specific locking (local/NFS compatible) ---
  async withLock(appId, fn, ttlMs = 5000) {
    await fs.mkdir(this.lockDir, { recursive: true });
    const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const lf = path.join(this.lockDir, `${this.ns}.${appId}.lock`);
    const start = Date.now();
    let acquired = false;
    while (!acquired) {
      try {
        await fs.writeFile(lf, token, { flag: 'wx' });
        acquired = true;
      } catch (e) {
        if (e.code !== 'EEXIST') {
          throw e;
        }
        // stale lock 回収（TTL超過）
        try {
          const st = await fs.stat(lf);
          if (Date.now() - st.mtimeMs > ttlMs) {
            await fs.unlink(lf);
            continue;
          }
        } catch {
          /* stat failed, continue */
        }
        if (Date.now() - start > ttlMs) {
          throw new Error('FileJsonTokenProvider: lock timeout');
        }
        await new Promise(r => setTimeout(r, 120));
      }
    }
    try {
      return await fn();
    } finally {
      try {
        const cur = await fs.readFile(lf, 'utf8');
        if (cur === token) {
          await fs.unlink(lf);
        }
      } catch {
        /* already released or missing */
      }
    }
  }

  // --- TokenProvider implementation ---
  async get(appId) {
    const state = await this.readState();
    const app = state.apps?.[appId];
    if (!app) {
      return null;
    }
    const rt = this.decryptString(app.refreshTokenEnc || app.refreshToken); // Backward compatibility
    return { refreshToken: rt, version: app.version ?? 0, updatedAt: app.updatedAt };
  }

  async set(appId, refreshToken, version) {
    return this.withLock(appId, async () => {
      const state = await this.readState();
      const enc = this.encryptString(refreshToken);
      state.apps = state.apps || {};
      state.apps[appId] = {
        refreshTokenEnc: enc,
        version,
        updatedAt: new Date().toISOString(),
      };
      state.version = (state.version ?? 0) + 1; // Global version increment (for audit)
      state.updatedAt = new Date().toISOString();
      await this.writeState(state);
      return { refreshToken, version, updatedAt: state.apps[appId].updatedAt };
    });
  }
}

export default FileJsonTokenProvider;