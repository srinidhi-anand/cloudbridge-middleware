/**
 * config.ts — CloudBridge Configuration Loader
 *
 * Responsibilities:
 *   1. Load .env file into process.env (dotenv)
 *   2. Detect which auth strategy to use per provider
 *   3. Validate all values with Zod — exit immediately if invalid
 *   4. Verify referenced key files exist on disk
 *   5. Return a fully typed, safe config object
 *
 * Rules:
 *   - Never log credential values — only log field names in errors
 *   - Never use non-null assertion (!) on env vars — let Zod catch missing values
 *   - Validation runs once at startup, never per-request
 *
 * Node.js version: 24.x LTS
 */

import "dotenv/config";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";

// ─────────────────────────────────────────────────────────────
// Auth strategy schemas
// Each provider has multiple supported strategies.
// Zod discriminatedUnion validates the complete strategy object
// based on the 'type' field — missing required fields produce
// a clear, specific error message.
// ─────────────────────────────────────────────────────────────

const AwsAuthSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("iam-role"),
    // No credentials needed — auto-detected from instance metadata,
    // ECS task role, or Lambda execution role
  }),
  z.object({
    type: z.literal("assume-role"),
    roleArn: z.string().min(1, "AWS_ROLE_ARN is required for assume-role auth"),
    sessionName: z.string().default("cloudbridge-session"),
    externalId: z.string().optional(),
  }),
  z.object({
    type: z.literal("access-key"),
    accessKeyId: z
      .string()
      .min(1, "AWS_ACCESS_KEY_ID is required for access-key auth"),
    secretAccessKey: z
      .string()
      .min(1, "AWS_SECRET_ACCESS_KEY is required for access-key auth"),
    sessionToken: z.string().optional(),
  }),
  z.object({
    type: z.literal("oidc"),
    roleArn: z.string().min(1, "AWS_ROLE_ARN is required for oidc auth"),
    tokenFile: z
      .string()
      .min(1, "AWS_WEB_IDENTITY_TOKEN_FILE is required for oidc auth"),
  }),
]);

const AzureAuthSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("managed-identity"),
    clientId: z.string().optional(), // only needed for user-assigned MI
  }),
  z.object({
    type: z.literal("service-principal"),
    tenantId: z
      .string()
      .min(1, "AZURE_TENANT_ID is required for service-principal auth"),
    clientId: z
      .string()
      .min(1, "AZURE_CLIENT_ID is required for service-principal auth"),
    clientSecret: z
      .string()
      .min(1, "AZURE_CLIENT_SECRET is required for service-principal auth"),
  }),
  z.object({
    type: z.literal("sp-certificate"),
    tenantId: z
      .string()
      .min(1, "AZURE_TENANT_ID is required for sp-certificate auth"),
    clientId: z
      .string()
      .min(1, "AZURE_CLIENT_ID is required for sp-certificate auth"),
    certificatePath: z
      .string()
      .min(
        1,
        "AZURE_CLIENT_CERTIFICATE_PATH is required for sp-certificate auth",
      ),
  }),
  z.object({
    type: z.literal("connection-string"),
    connectionString: z
      .string()
      .min(
        1,
        "AZURE_STORAGE_CONNECTION_STRING is required for connection-string auth",
      ),
  }),
]);

const GcpAuthSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("service-account"),
    keyFile: z
      .string()
      .min(1, "GCP_KEY_FILE is required for service-account auth"),
  }),
  z.object({
    type: z.literal("workload-identity"),
    // Auto-detected from GOOGLE_APPLICATION_CREDENTIALS env var
  }),
  z.object({
    type: z.literal("adc"),
    // Application Default Credentials
    // Requires: gcloud auth application-default login
  }),
]);

// ─────────────────────────────────────────────────────────────
// Full config schema
// ─────────────────────────────────────────────────────────────

const CloudBridgeConfigSchema = z.object({
  app: z.object({
    port: z.coerce.number().min(1).max(65535).default(3000),
    nodeEnv: z
      .enum(["development", "staging", "production"])
      .default("development"),
    logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
    logFormat: z.enum(["json", "pretty"]).default("pretty"),
  }),

  auth: z.object({
    jwtSecret: z
      .string()
      .min(
        32,
        "JWT_SECRET must be at least 32 characters — generate with: node -e \"console.log(crypto.randomBytes(64).toString('hex'))\"",
      ),
    apiKey: z.string().optional(),
  }),

  providers: z.object({
    aws: z
      .object({
        enabled: z.boolean().default(true),
        region: z
          .string()
          .min(1, "AWS_REGION is required")
          .default("ap-south-1"),
        auth: AwsAuthSchema,
      })
      .optional(),

    azure: z
      .object({
        enabled: z.boolean().default(true),
        accountName: z
          .string()
          .min(1, "AZURE_STORAGE_ACCOUNT_NAME is required"),
        auth: AzureAuthSchema,
      })
      .optional(),

    gcp: z
      .object({
        enabled: z.boolean().default(true),
        projectId: z.string().min(1, "GCP_PROJECT_ID is required"),
        auth: GcpAuthSchema,
      })
      .optional(),
  }),

  redis: z
    .object({
      url: z.string().url("REDIS_URL must be a valid URL"),
      password: z.string().optional(),
    })
    .optional(),

  vault: z
    .object({
      addr: z.string().url("VAULT_ADDR must be a valid URL"),
      token: z
        .string()
        .min(1, "VAULT_TOKEN is required when VAULT_ADDR is set"),
      namespace: z.string().optional(),
      mountPath: z.string().default("secret"),
    })
    .optional(),
});

export type CloudBridgeConfig = z.infer<typeof CloudBridgeConfigSchema>;
export type AwsAuth = z.infer<typeof AwsAuthSchema>;
export type AzureAuth = z.infer<typeof AzureAuthSchema>;
export type GcpAuth = z.infer<typeof GcpAuthSchema>;

// ─────────────────────────────────────────────────────────────
// Config loader
// Called once at process startup. Exits with a clear error
// message if anything is missing or invalid.
// ─────────────────────────────────────────────────────────────

export function loadConfig(): CloudBridgeConfig {
  const raw = {
    app: {
      port: process.env.PORT,
      nodeEnv: process.env.NODE_ENV,
      logLevel: process.env.LOG_LEVEL,
      logFormat: process.env.LOG_FORMAT,
    },

    auth: {
      jwtSecret: process.env.JWT_SECRET,
      apiKey: process.env.API_KEY,
    },

    providers: {
      aws: process.env.AWS_REGION
        ? {
            enabled: true,
            region: process.env.AWS_REGION,
            auth: detectAwsAuth(),
          }
        : undefined,

      azure: process.env.AZURE_STORAGE_ACCOUNT_NAME
        ? {
            enabled: true,
            accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME,
            auth: detectAzureAuth(),
          }
        : undefined,

      gcp: process.env.GCP_PROJECT_ID
        ? {
            enabled: true,
            projectId: process.env.GCP_PROJECT_ID,
            auth: detectGcpAuth(),
          }
        : undefined,
    },

    redis: process.env.REDIS_URL
      ? {
          url: process.env.REDIS_URL,
          password: process.env.REDIS_PASSWORD,
        }
      : undefined,

    vault: process.env.VAULT_ADDR
      ? {
          addr: process.env.VAULT_ADDR,
          token: process.env.VAULT_TOKEN ?? "",
          namespace: process.env.VAULT_NAMESPACE,
          mountPath: process.env.VAULT_MOUNT_PATH,
        }
      : undefined,
  };

  // ── Schema validation ────────────────────────────────────────
  // safeParse gives us control over the error format.
  // We log only field names, never values.
  const result = CloudBridgeConfigSchema.safeParse(raw);

  if (!result.success) {
    console.error("\n❌ CloudBridge configuration error\n");
    result.error.issues.forEach((issue) => {
      const fieldPath = issue.path.join(".");
      console.error(`   ${fieldPath}: ${issue.message}`);
    });
    console.error("\n   Check .env.example for required variables.\n");
    process.exit(1);
  }

  // ── File existence validation ────────────────────────────────
  // Schema validated the config shape. Now verify that files
  // referenced in the config actually exist on disk.
  validateKeyFiles(result.data);

  // ── Success ──────────────────────────────────────────────────
  // Log what was detected — never log credential values.
  const providers = getEnabledProviders(result.data);
  const authSummary = getAuthSummary(result.data);

  console.info("\n✅ CloudBridge configuration loaded");
  console.info(`   Node.js:   ${process.version}`);
  console.info(`   Env:       ${result.data.app.nodeEnv}`);
  console.info(`   Port:      ${result.data.app.port}`);
  console.info(
    `   Providers: ${providers.length > 0 ? providers.join(", ") : "none configured"}`,
  );
  console.info(`   Auth:      ${authSummary}`);
  console.info(
    `   Redis:     ${result.data.redis ? "configured" : "in-memory fallback"}`,
  );
  console.info(
    `   Vault:     ${result.data.vault ? "configured" : "not configured"}\n`,
  );

  return result.data;
}

// ─────────────────────────────────────────────────────────────
// Auth strategy detection
//
// Priority order is most-specific to least-specific.
// This matches the AWS SDK provider chain pattern.
// Each function returns a plain object — Zod validates it
// in the schema above.
// ─────────────────────────────────────────────────────────────

function detectAwsAuth(): AwsAuth {
  // OIDC takes precedence — most specific, requires both vars
  if (process.env.AWS_ROLE_ARN && process.env.AWS_WEB_IDENTITY_TOKEN_FILE) {
    return {
      type: "oidc",
      roleArn: process.env.AWS_ROLE_ARN,
      tokenFile: process.env.AWS_WEB_IDENTITY_TOKEN_FILE,
    };
  }
  // AssumeRole — role ARN without token file
  if (process.env.AWS_ROLE_ARN) {
    return {
      type: "assume-role",
      roleArn: process.env.AWS_ROLE_ARN,
      sessionName: process.env.AWS_ROLE_SESSION_NAME ?? "cloudbridge-session",
      externalId: process.env.AWS_EXTERNAL_ID,
    };
  }
  // Static access key — for local dev only
  if (process.env.AWS_ACCESS_KEY_ID) {
    return {
      type: "access-key",
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    };
  }
  // Default: IAM role via instance metadata / ECS / Lambda
  return { type: "iam-role" };
}

function detectAzureAuth(): AzureAuth {
  // Connection string — most explicit, local dev only
  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    return {
      type: "connection-string",
      connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
    };
  }
  // Service principal with certificate
  if (process.env.AZURE_CLIENT_CERTIFICATE_PATH) {
    return {
      type: "sp-certificate",
      tenantId: process.env.AZURE_TENANT_ID ?? "",
      clientId: process.env.AZURE_CLIENT_ID ?? "",
      certificatePath: process.env.AZURE_CLIENT_CERTIFICATE_PATH,
    };
  }
  // Service principal with client secret
  if (process.env.AZURE_CLIENT_SECRET) {
    return {
      type: "service-principal",
      tenantId: process.env.AZURE_TENANT_ID ?? "",
      clientId: process.env.AZURE_CLIENT_ID ?? "",
      clientSecret: process.env.AZURE_CLIENT_SECRET,
    };
  }
  // Default: Managed Identity (system-assigned or user-assigned)
  return {
    type: "managed-identity",
    clientId: process.env.AZURE_CLIENT_ID, // undefined = system-assigned MI
  };
}

function detectGcpAuth(): GcpAuth {
  // Service account key file — explicit path in env
  if (process.env.GCP_KEY_FILE) {
    return {
      type: "service-account",
      keyFile: process.env.GCP_KEY_FILE,
    };
  }
  // Workload Identity / GKE — GOOGLE_APPLICATION_CREDENTIALS points to token
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return { type: "workload-identity" };
  }
  // Default: Application Default Credentials
  // Requires: gcloud auth application-default login
  return { type: "adc" };
}

// ─────────────────────────────────────────────────────────────
// File validation
// Runs after schema validation passes.
// Checks that credential files referenced in config actually exist.
// ─────────────────────────────────────────────────────────────

function validateKeyFiles(config: CloudBridgeConfig): void {
  const filesToCheck: Array<{ filePath: string; label: string; hint: string }> =
    [];

  if (config.providers?.gcp?.auth.type === "service-account") {
    filesToCheck.push({
      filePath: config.providers.gcp.auth.keyFile,
      label: "GCP service account key",
      hint: "Follow secrets/README.md → GCP Service Account JSON section",
    });
  }

  if (config.providers?.azure?.auth.type === "sp-certificate") {
    filesToCheck.push({
      filePath: config.providers.azure.auth.certificatePath,
      label: "Azure service principal certificate",
      hint: "Follow secrets/README.md → Azure Service Principal Certificate section",
    });
  }

  const missing: string[] = [];

  for (const file of filesToCheck) {
    const resolved = path.resolve(file.filePath);
    if (!fs.existsSync(resolved)) {
      console.error(`❌ ${file.label} not found: ${resolved}`);
      console.error(`   → ${file.hint}`);
      missing.push(resolved);
    }
  }

  if (missing.length > 0) {
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers — for success logging only
// These never access credential values
// ─────────────────────────────────────────────────────────────

function getEnabledProviders(config: CloudBridgeConfig): string[] {
  const enabled: string[] = [];
  if (config.providers?.aws?.enabled) enabled.push("AWS");
  if (config.providers?.azure?.enabled) enabled.push("Azure");
  if (config.providers?.gcp?.enabled) enabled.push("GCP");
  return enabled;
}

function getAuthSummary(config: CloudBridgeConfig): string {
  const methods: string[] = [];
  if (config.providers?.aws?.auth.type)
    methods.push(`AWS:${config.providers.aws.auth.type}`);
  if (config.providers?.azure?.auth.type)
    methods.push(`Azure:${config.providers.azure.auth.type}`);
  if (config.providers?.gcp?.auth.type)
    methods.push(`GCP:${config.providers.gcp.auth.type}`);
  if (config.auth.apiKey) methods.push("api-key");
  return methods.length > 0 ? methods.join(", ") : "jwt-only";
}
