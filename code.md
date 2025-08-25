最高です！SSOT（中央JSON）を取り込んだ設計はしっかりしてます。
その上で、**いま直すと効く“必須修正（Blocker）”**と**改善提案**をまとめました。必要箇所はそのまま貼れる最小差分も添えます。

---

## ✅ 全体所感

* Provider 抽象 + FileJsonTokenProvider（AES-GCM, atomic rename, locking）＝◎
* `invalid_grant` 自動リカバリも実装済み＝◎
* 後方互換（SSOT未設定なら従来ルート）維持＝◎

---

## 🔴 Blocker（必ず直したい）

### 1) DB UPDATE が列不足（`saveUserAccessToken`）

**現状**：UPDATE で `refresh_token_updated_date` / `refresh_token_expires_in` / `app_id` を更新していません。
**影響**：メタ情報が古いまま残る／`app_id` 紐付けが更新されない。

**修正差分：`UserAccessToken_AuthorizationCodeManager.js`**

```diff
-      await db.run(`
-          UPDATE ebay_oauth_tokens 
-          SET access_token = ?, 
-              refresh_token = ?, 
-              access_token_updated_date = ?, 
-              expires_in = ?,
-              token_type = ?,
-              updated_at = ?
-          WHERE account_name = ?
-        `, [
-          encryptedAccessToken,
-          encryptedRefreshToken,
-          tokenData.accessTokenUpdatedDate || now,
-          tokenData.expiresIn,
-          tokenData.tokenType || 'Bearer',
-          now,
-          accountName
-        ]);
+      await db.run(`
+          UPDATE ebay_oauth_tokens 
+          SET access_token = ?, 
+              refresh_token = ?, 
+              access_token_updated_date = ?, 
+              expires_in = ?,
+              refresh_token_updated_date = ?,
+              refresh_token_expires_in = ?,
+              token_type = ?,
+              app_id = ?,
+              updated_at = ?
+          WHERE account_name = ?
+        `, [
+          encryptedAccessToken,
+          encryptedRefreshToken,
+          tokenData.accessTokenUpdatedDate || now,
+          tokenData.expiresIn,
+          tokenData.refreshTokenUpdatedDate || now,
+          tokenData.refreshTokenExpiresIn || 47304000,
+          tokenData.tokenType || 'Bearer',
+          tokenData.appId || this.defaultAppId,
+          now,
+          accountName
+        ]);
```

---

### 2) SSOTロックが **全App共通の単一ロック** になっている

`FileJsonTokenProvider` の `lockFile` が `filePath.lock` 固定のため、**別Appの更新も相互にブロック**します。

**修正差分：`FileJsonTokenProvider.js`**

```diff
-  constructor({ filePath, masterKey, namespace = 'ebay-oauth' }) {
+  constructor({ filePath, masterKey, namespace = 'ebay-oauth' }) {
     ...
-    this.lockFile = `${this.filePath}.lock`;
+    this.lockDir = `${this.filePath}.locks`;
```

```diff
-  async withLock(appId, fn, ttlMs = 5000) {
+  async withLock(appId, fn, ttlMs = 5000) {
+    await fs.mkdir(this.lockDir, { recursive: true });
-    const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
+    const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
+    const lf = path.join(this.lockDir, `${this.ns}.${appId}.lock`);
     const start = Date.now();
     let acquired = false;
     while (!acquired) {
       try {
-        await fs.writeFile(this.lockFile, token, { flag: 'wx' });
+        await fs.writeFile(lf, token, { flag: 'wx' });
         acquired = true;
       } catch (e) {
         if (e.code !== 'EEXIST') throw e;
+        // stale lock 回収（TTL超過）
+        try {
+          const st = await fs.stat(lf);
+          if (Date.now() - st.mtimeMs > ttlMs) {
+            await fs.unlink(lf);
+            continue;
+          }
+        } catch {}
         if (Date.now() - start > ttlMs) throw new Error('FileJsonTokenProvider: lock timeout');
         await new Promise(r => setTimeout(r, 120));
       }
     }
     try {
       return await fn();
     } finally {
       try {
-        const cur = await fs.readFile(this.lockFile, 'utf8');
-        if (cur === token) await fs.unlink(this.lockFile);
+        const cur = await fs.readFile(lf, 'utf8');
+        if (cur === token) await fs.unlink(lf);
       } catch {}
     }
   }
```

---

### 3) 初回投入時に **SSOTへも書き込む**

`setRefreshToken()` は DB/ローカルJSONへは保存しますが、SSOTは**最初のリフレッシュまで未登録**。
**提案**：初回投入で **SSOTにも version=1 で保存**。

**修正差分：`UserAccessToken_AuthorizationCodeManager.js`（`setRefreshToken` の最後）**

```diff
       await this.saveUserAccessToken(accountName, tokenData);
+      if (this.tokenProvider) {
+        await this.tokenProvider.set(actualAppId, refreshToken, 1);
+      }
```

---

### 4) SSOT用の鍵は**固定文字列のデフォルト**をやめる

`new FileJsonTokenProvider({ masterKey: options.masterKey || 'default-secure-key-for-local-storage' })` は危険。
**必須**：`masterKey` が無ければ SSOT無効 or エラーに。

**修正差分：`UserAccessToken_AuthorizationCodeManager.js`（コンストラクタ）**

```diff
-    this.tokenProvider = options.tokenProvider || (
-      options.ssotJsonPath
-        ? new FileJsonTokenProvider({
-          filePath: options.ssotJsonPath,
-          masterKey: options.masterKey || 'default-secure-key-for-local-storage',
-          namespace: options.tokenNamespace || 'ebay-oauth'
-        })
-        : null
-    );
+    this.tokenProvider = options.tokenProvider || (
+      options.ssotJsonPath && options.masterKey
+        ? new FileJsonTokenProvider({
+            filePath: options.ssotJsonPath,
+            masterKey: options.masterKey,
+            namespace: options.tokenNamespace || 'ebay-oauth'
+          })
+        : null
+    );
```

同様に、`LocalSharedTokenManager` 生成時の fallback もやめるのが安全です（無ければ使わない）：

```diff
-      this.fileTokenManager = new LocalSharedTokenManager({
-        masterKey: options.masterKey || 'default-secure-key-for-local-storage',
-        tokenFilePath: options.tokenFilePath
-      });
+      this.fileTokenManager = options.masterKey
+        ? new LocalSharedTokenManager({
+            masterKey: options.masterKey,
+            tokenFilePath: options.tokenFilePath
+          })
+        : null;
```

---

### 5) 環境切替：`tokenUrl` を `PRODUCTION/SANDBOX` で自動切替

ドキュメントに反し、現在は常に本番URL。
**修正差分：`src/config.js`**

```diff
-    tokenUrl: options.tokenUrl || 'https://api.ebay.com/identity/v1/oauth2/token',
+    tokenUrl: options.tokenUrl || (
+      (config?.environment || (options.environment || process.env.EBAY_ENVIRONMENT || 'PRODUCTION'))
+        .toUpperCase() === 'SANDBOX'
+        ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
+        : 'https://api.ebay.com/identity/v1/oauth2/token'
+    ),
```

（もしくは、先に `const environment = …` を作ってから `environment` で分岐）

---

### 6) 機密ログを抑制

`ApplicationAccessToken_ClientCredentialsManager` が `Basic ...` の先頭をログ出力しています。
規定では**一部でも出さない**のが無難。コメントアウト推奨。

```diff
-  console.log('Auth header:', `Basic ${auth.substring(0, 20)}...`);
+  // Avoid logging auth header for security
```

---

## 🟡 Should / Nice-to-have

* **Env の扱い**：`EBAY_INITIAL_REFRESH_TOKEN` は「**SSOT未登録のときだけ初期投入**」に限定（すでに実質そうな設計ですが、READMEにも明記を）。
* **Jest設定**：`tests/providers/...` を動かすなら `package.json` に

  ```json
  "devDependencies": { "jest": "^29", "@jest/globals": "^29" },
  "type": "module",
  "scripts": { "test": "jest" }
  ```

  を追加。`tests` ディレクトリも作成。
* **namespace の使いどころ**：今はロック名くらいでしか使ってないので、将来的に `apps` 配下を `apps[namespace][appId]` に分けるとマルチ環境運用がしやすいです。
* **`invalid_grant` リトライのロック**：リカバリ側も `withLock` 下でやると二重再試行の可能性がさらに下がります（現状でも大きな問題は起きにくい）。

---

## 運用メモ（最終確認）

* **各アプリは同じ `OAUTH_SSOT_JSON` と `EBAY_MASTER_KEY` を使用**（違う鍵だと復号できません）
* **環境変数は初期投入専用**。以降は SSOT を正とする
* **ロックファイル**のTTL超過回収（上記差分で実装）でゾンビロックに強くなる

---

## まとめ

設計はとても良いです。上の **6点（Blocker）** を入れれば、
「**最新版への自動収斂＋競合防止＋自己回復**」がより堅牢に完成します。

必要なら、この6点を反映した **完全パッチ版** もすぐまとめます。
