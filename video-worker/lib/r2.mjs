// R2 (Cloudflare's S3-compatible storage) for the worker. Thin: every key name
// comes from src/ad-videos/worker-protocol.mjs, every decision from the jobs.
// Private bucket `fundhub-ad-video`. Never prints a credential.

import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const need = (env, name) => {
  const v = String(env[name] ?? "").trim();
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

export function r2FromEnv(env = process.env) {
  const accountId = need(env, "CLOUDFLARE_ACCOUNT_ID");
  const bucket = need(env, "R2_BUCKET_AD_VIDEO");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: need(env, "R2_ACCESS_KEY_ID"), secretAccessKey: need(env, "R2_SECRET_ACCESS_KEY") },
  });

  return {
    bucket,
    async putFile(key, path, contentType) {
      const { size } = await stat(path);
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: createReadStream(path), ContentLength: size, ContentType: contentType,
      }));
    },
    async getFile(key, path) {
      const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      await pipeline(Readable.from(r.Body), createWriteStream(path));
    },
    async has(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (err) {
        if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return false;
        throw err;
      }
    },
    /** A GET link that lasts `seconds` (spec 9.5: 24 hours for Submagic and Meta). */
    signedUrl(key, seconds = 86_400) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: seconds });
    },
  };
}
