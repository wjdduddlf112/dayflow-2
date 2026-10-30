import { webcrypto, randomBytes, pbkdf2Sync } from "node:crypto";
import { writeFileSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
const destination = process.argv[2];
if (!destination)
  throw new Error(
    "Usage: DAYFLOW_PASSWORD=... npm run keys -- /secure/path/dayflow-secrets.txt (outside checkout)",
  );
const repository = realpathSync(resolve("."));
const parent = realpathSync(dirname(resolve(destination)));
if (parent === repository || parent.startsWith(repository + "/"))
  throw new Error("Choose a destination outside the repository.");
const password = process.env.DAYFLOW_PASSWORD;
if (!password || password.length < 12)
  throw new Error("DAYFLOW_PASSWORD must contain at least 12 characters.");
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 100000, 32, "sha256");
const pair = await webcrypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const pub = await webcrypto.subtle.exportKey("raw", pair.publicKey);
const priv = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
writeFileSync(
  destination,
  `AUTH_PASSWORD_HASH=100000:${salt.toString("base64")}:${hash.toString("base64")}\nSESSION_SECRET=${randomBytes(48).toString("base64url")}\nVAPID_PUBLIC_KEY=${Buffer.from(pub).toString("base64url")}\nVAPID_PRIVATE_KEY=${priv.d}\n`,
  { mode: 0o600, flag: "wx" },
);
console.log("Secrets saved to the requested private file. Never commit it.");
