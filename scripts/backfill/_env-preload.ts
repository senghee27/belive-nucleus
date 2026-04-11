/**
 * _env-preload.ts — Side-effect-only env loader.
 *
 * Import this at the very top of any backfill script BEFORE any module
 * that reads process.env at load time (e.g. lib/incidents.ts instantiates
 * the Anthropic client at import time). Because TypeScript/ESM static
 * imports execute in source order, putting this import first guarantees
 * process.env is populated before lib code runs.
 *
 * Behavior:
 *   1. loadEnvConfig(cwd) — picks up .env.local etc. via Next's rules
 *   2. If --env <path> is present in process.argv, load that file and
 *      overwrite any keys it defines. The flag is stripped from argv so
 *      downstream positional-arg parsing still works.
 *
 * Handles Vercel's env pull format: values that originally had trailing
 * newlines are written as double-quoted strings containing literal \n,
 * which this parser unescapes + trims.
 */

import * as fs from 'node:fs'
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

const envFlagIdx = process.argv.indexOf('--env')
if (envFlagIdx >= 0 && envFlagIdx + 1 < process.argv.length) {
  const envPath = process.argv[envFlagIdx + 1]
  process.argv.splice(envFlagIdx, 2)

  if (!fs.existsSync(envPath)) {
    console.error(`❌ env file not found: ${envPath}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(envPath, 'utf-8')
  let overridden = 0
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()

    if (value.startsWith('"') && value.endsWith('"')) {
      // Double-quoted: unescape common sequences, then trim.
      // Vercel's env pull writes values with literal \n inside quotes
      // for variables that had trailing newlines in storage.
      value = value.slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .trim()
    } else if (value.startsWith("'") && value.endsWith("'")) {
      // Single-quoted: literal value, no escape processing.
      value = value.slice(1, -1)
    }

    process.env[key] = value
    overridden++
  }
  console.log(`[env-preload] loaded ${overridden} keys from ${envPath}`)
}

export {} // make this a module
