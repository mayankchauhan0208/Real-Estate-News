import crypto from "node:crypto";
import { identityFor, semanticIdentityMatches } from "./publication-ledger.js";

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MAX_CAS_RETRIES = 4;

function parseJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

function encode(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8").toString("base64");
}

function decode(value) {
  return JSON.parse(Buffer.from(String(value || ""), "base64").toString("utf8"));
}

function emptyRemoteState() {
  return { version: 2, updatedAt: new Date(0).toISOString(), claims: [] };
}

export class GitHubPublicationClaimStore {
  constructor({ token, repository, branch, path = ".state/publication-claims.json", fetchImpl = fetch, ttlMs = DEFAULT_TTL_MS, baseUrl = "https://api.github.com" } = {}) {
    if (!token || !repository) throw new Error("GITHUB_PUBLICATION_CLAIM_CONFIGURATION_MISSING");
    this.token = token;
    this.repository = repository;
    this.branch = branch || "main";
    this.path = path;
    this.fetchImpl = fetchImpl;
    this.ttlMs = ttlMs;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  endpoint() {
    return `${this.baseUrl}/repos/${this.repository}/contents/${this.path}`;
  }

  headers() {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    };
  }

  async read() {
    const response = await this.fetchImpl(`${this.endpoint()}?ref=${encodeURIComponent(this.branch)}`, {
      headers: this.headers()
    });
    if (response.status === 404) return { sha: null, state: emptyRemoteState() };
    const body = await response.text();
    if (!response.ok) throw new Error(`GITHUB_CLAIM_READ_HTTP_${response.status}`);
    const payload = parseJson(body, null);
    if (!payload?.content) throw new Error("GITHUB_CLAIM_STATE_INVALID");
    const state = decode(payload.content);
    if (![1, 2].includes(state.version) || !Array.isArray(state.claims)) throw new Error("GITHUB_CLAIM_STATE_CORRUPT");
    return { sha: payload.sha || null, state };
  }

  async compareAndSwap(expectedSha, state, message) {
    const response = await this.fetchImpl(this.endpoint(), {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({
        message: `${message} [skip ci]`,
        content: encode(state),
        branch: this.branch,
        ...(expectedSha ? { sha: expectedSha } : {})
      })
    });
    return { ok: response.ok, conflict: response.status === 409, status: response.status };
  }

  async claim({ article, dedupeIds = [], mode = "NORMAL" }) {
    const identity = identityFor(article, dedupeIds);
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt += 1) {
      const current = await this.read();
      const now = Date.now();
      const active = current.state.claims.find((claim) =>
        (claim.status === "PUBLISHED" || (claim.status === "CLAIMED" && Date.parse(claim.expiresAt || "") > now)) &&
        (claim.identityKeys.some((key) => identity.identityKeys.includes(key)) ||
          semanticIdentityMatches(claim, identity))
      );
      if (active) return { acquired: false, existing: active };
      const claim = {
        claimId: crypto.randomUUID(),
        status: "CLAIMED",
        identityKeys: identity.identityKeys,
        semanticIdentity: identity.semanticIdentity,
        publishedCity: identity.publishedCity || identity.city?.[0] || "",
        canonicalEventCity: identity.canonicalEventCity || identity.semanticIdentity?.canonicalEventCity || identity.city?.[0] || "",
        canonicalEventFingerprint: identity.semanticIdentity?.canonicalEventFingerprint || "",
        semanticClusterId: identity.semanticIdentity?.semanticClusterId || "",
        city: identity.city,
        originMode: mode,
        claimedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + this.ttlMs).toISOString()
      };
      const next = {
        version: current.state.version >= 2 ? 2 : 1,
        updatedAt: new Date(now).toISOString(),
        claims: [...current.state.claims.filter((item) => item.status === "PUBLISHED" || Date.parse(item.expiresAt || "") > now), claim]
      };
      const result = await this.compareAndSwap(current.sha, next, `Claim publication ${claim.claimId}`);
      if (result.ok) return { acquired: true, ...claim };
      if (!result.conflict) throw new Error(`GITHUB_CLAIM_WRITE_HTTP_${result.status}`);
    }
    throw new Error("GITHUB_CLAIM_CAS_RETRIES_EXHAUSTED");
  }

  async finalize(claim, status) {
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt += 1) {
      const current = await this.read();
      const found = current.state.claims.find((item) => item.claimId === claim.claimId);
      if (!found) return;
      const nextClaims = current.state.claims.map((item) => item.claimId === claim.claimId
        ? { ...item, status, finalizedAt: new Date().toISOString() }
        : item);
      const result = await this.compareAndSwap(current.sha, { version: current.state.version >= 2 ? 2 : 1, updatedAt: new Date().toISOString(), claims: nextClaims }, `Finalize publication ${claim.claimId}`);
      if (result.ok) return;
      if (!result.conflict) throw new Error(`GITHUB_CLAIM_FINALIZE_HTTP_${result.status}`);
    }
    throw new Error("GITHUB_CLAIM_FINALIZE_CAS_RETRIES_EXHAUSTED");
  }
}

export function createGitHubPublicationClaimStore(env = process.env, options = {}) {
  if (String(env.GITHUB_ACTIONS || "").toLowerCase() !== "true") return null;
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) return null;
  return new GitHubPublicationClaimStore({
    token: env.GITHUB_TOKEN,
    repository: env.GITHUB_REPOSITORY,
    branch: env.GITHUB_REF_NAME || "main",
    path: env.PUBLICATION_CLAIM_PATH || ".state/publication-claims.json",
    ...options
  });
}
