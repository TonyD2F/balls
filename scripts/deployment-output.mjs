#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const project = process.cwd()
const directory = resolve(project, 'dist')
const output = join(process.env.OPENCODE_WEB_DIR, 'deployment-output.json')
writeFileSync(output, JSON.stringify({ project, directory }))
console.log(`Declared deployment output: ${directory}`)
