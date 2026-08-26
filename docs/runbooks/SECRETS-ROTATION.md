# Secrets Rotation
Backend seam: SECRET_BACKEND=env|mock|vault|aws-sm|doppler (packages/core/src/secrets.ts)
Strict mode: STRICT_SECRET_BACKEND=true forbids plain-env sensitive keys in production (config gate + resolver double-check)
Rotate MODEL_PROVIDER_API_KEY/GITHUB_TOKEN/WEBHOOK_SECRET at provider, then update backend entry; rolling restart not required for provider keys read per-call.
