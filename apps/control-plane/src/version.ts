/**
 * Single source of truth for the shipped version. app.ts /api/v1/meta,
 * metrics agencyos_build_info, and OTel tracing all read this — never hardcode
 * a version string in three places (docs-check enforces the invariant).
 */
export const AGENCY_OS_VERSION = "0.14.1";
export const AGENCY_OS_VERSION_CODENAME = "autonomous-enterprise";