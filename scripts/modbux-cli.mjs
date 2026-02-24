#!/usr/bin/env node

import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const HELP_TEXT = `modbux-cli

Usage:
  modbux-cli health [--info-file <path>]
  modbux-cli channels [--info-file <path>]
  modbux-cli invoke <channel> [--args <json-array>] [--info-file <path>]
  modbux-cli action <action> [--payload <json-object>] [--info-file <path>]
  modbux-cli invoke <channel> [--args <json-array>] --host <host> --port <port> --token <token>

Examples:
  modbux-cli channels
  modbux-cli invoke get_app_version
  modbux-cli action workspace.get
  modbux-cli action connection.open --payload '{"connectionId":"conn-1"}'
  modbux-cli invoke create_server --args '[{"uuid":"demo","config":{"protocol":"tcp","port":1502}}]'
`

const main = async () => {
  const { options, positional } = parseArgs(process.argv.slice(2))

  if (positional.length === 0 || positional[0] === 'help' || positional[0] === '--help') {
    console.log(HELP_TEXT)
    return
  }

  const command = positional[0]
  const connection = await resolveConnection(options)

  if (command === 'health') {
    const response = await request(connection, '/health', { method: 'GET', auth: false })
    console.log(JSON.stringify(response, null, 2))
    return
  }

  if (command === 'channels') {
    const response = await request(connection, '/channels', { method: 'GET' })
    console.log(JSON.stringify(response, null, 2))
    return
  }

  if (command === 'invoke') {
    const channel = positional[1]
    if (!channel) {
      throw new Error('Missing channel for invoke command')
    }

    const args = parseArgsJson(options.args)
    const response = await request(connection, '/invoke', {
      method: 'POST',
      body: { channel, args }
    })
    console.log(JSON.stringify(response, null, 2))
    return
  }

  if (command === 'action') {
    const action = positional[1]
    if (!action) {
      throw new Error('Missing action name for action command')
    }
    const payload = parseObjectJson(options.payload)
    const response = await request(connection, '/ui/action', {
      method: 'POST',
      body: { action, payload }
    })
    console.log(JSON.stringify(response, null, 2))
    return
  }

  throw new Error(`Unknown command: ${command}`)
}

const parseArgs = (argv) => {
  const options = {}
  const positional = []

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      positional.push(token)
      continue
    }

    const key = token.slice(2)
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for option: ${token}`)
    }
    options[key] = value
    i++
  }

  return { options, positional }
}

const parseArgsJson = (value) => {
  if (!value) return []
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('--args must be valid JSON')
  }
  if (!Array.isArray(parsed)) {
    throw new Error('--args must be a JSON array')
  }
  return parsed
}

const parseObjectJson = (value) => {
  if (!value) return {}
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('--payload must be valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--payload must be a JSON object')
  }
  return parsed
}

const resolveConnection = async (options) => {
  if (options.host && options.port && options.token) {
    return {
      host: options.host,
      port: Number(options.port),
      token: options.token
    }
  }

  const infoPath =
    options['info-file'] ?? process.env.MODBUX_CLI_INFO_FILE ?? defaultInfoFilePath()
  const content = await readFile(infoPath, 'utf8')
  const parsed = JSON.parse(content)
  if (!parsed.host || !parsed.port || !parsed.token) {
    throw new Error(`Invalid connection info: ${infoPath}`)
  }

  return {
    host: parsed.host,
    port: Number(parsed.port),
    token: parsed.token
  }
}

const defaultInfoFilePath = () => {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return join(process.env.APPDATA, 'modbux', 'cli-api.json')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'modbux', 'cli-api.json')
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'modbux', 'cli-api.json')
}

const request = async (connection, path, options) => {
  const headers = { 'Content-Type': 'application/json' }
  if (options.auth !== false) {
    headers.Authorization = `Bearer ${connection.token}`
  }

  const response = await fetch(`http://${connection.host}:${connection.port}${path}`, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: HTTP ${response.status}`)
  }
  return payload
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
