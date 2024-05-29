import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const cwd = process.cwd()

type PhraseKey = string
type PhraseValue = string | string[] | object[] | object

type PhraseJson = {
  [key: PhraseKey]: PhraseValue
}

type Filename = string

type ValuePair = [Filename, PhraseValue | null]

type PhraseLintProps = {
  dir: string
  mainEntry: string
}

export enum IssueKind {
  MissingProp = 'Missing property',
}

export type Issue = {
  file: Filename
  key: string
  issueKind: IssueKind
}

export async function phraselint({ dir, mainEntry }: PhraseLintProps) {
  const baseDir = path.resolve(cwd, dir)

  const files = (await fs.readdir(baseDir))
    .filter(it => it.endsWith('.json'))

  const map = new Map<Filename, PhraseJson>()

  for (const file of files) {
    const json = JSON.parse(await fs.readFile(path.join(baseDir, file), 'utf8')) as PhraseJson
    map.set(file, json)
  }

  const issues: Issue[] = []

  for (const [key, value] of Object.entries(map.get(mainEntry) ?? {})) {
    const values: ValuePair[] = files
      .map(file => {
        const value = map.get(file)?.[key] ?? null
        return [file, value]
      })

    issues.push(...inspect(key, values))
  }

  return issues
}

export function inspect(key: string, values: ValuePair[]): Issue[] {
  const issues: Issue[] = []

  issues.push(...inspectMissingProp(key, values))

  return issues
}

function inspectMissingProp(key: string, values: ValuePair[]): Issue[] {
  const propsCount = new Map<Filename, number>(values.filter(([, value]) => value !== null).map(([file, value]) => {
    let count = 0
    try {
      count = Object.keys(value as object).length
    } catch { }
    return [file, count]
  }))

  const byCount = new Map<number, Filename[]>()

  for (const [file, count] of propsCount.entries()) {
    const files = byCount.get(count) ?? []
    files.push(file)
    byCount.set(count, files)
  }

  if (byCount.size <= 1) {
    return []
  }

  // we say first group is the true, all others lacking something
  const [, ...troubleGroup] = [...byCount].sort((a, b) => b[0] - a[0])

  const issues: Issue[] = []

  for (const [, files] of troubleGroup) {
    for (const file of files) {
      issues.push({
        issueKind: IssueKind.MissingProp,
        file,
        key
      })
    }
  }

  return issues
}
