import { readFile } from 'node:fs/promises'

type GenericIssue = {
  name: string
  line: number
  col: number
  pos: number
  sub?: GenericIssue
}

type Issue = {
  file: string
  owners: string[]
  unresolved: GenericIssue[]
  exports: GenericIssue[]
  types: GenericIssue[]
  duplicates: Array<[GenericIssue, GenericIssue]>
}

type IssueType = 'types' | 'unresolved' | 'exports'

type Action = 'added' | 'deleted' | 'none'

type Evidence = [Action, IssueType, GenericIssue]
type EvidenceInput = [Action, IssueType, GenericIssue[]]

type Report = {
  files: string[]
  issues: Issue[]
}

type Opts = {
  baseReportPath: string
  nextReportPath: string
}

export async function knipadmin(opts: Opts) {
  const report = await parseReport(opts.nextReportPath)
  const baseReport = await parseReport(opts.baseReportPath)

  const baseReportIssuesByFile = new Map(
    baseReport.issues.map(it => [it.file, it])
  )

  const evidenceBook = new EvidenceBook()

  for (const issue of report.issues) {
    const baseIssue = baseReportIssuesByFile.get(issue.file)

    // completely new file that has issues now
    if (!baseIssue) {
      evidenceBook.insert(issue.file, ['added', 'types', issue.types])
      evidenceBook.insert(issue.file, ['added', 'unresolved', issue.unresolved])
      evidenceBook.insert(issue.file, ['added', 'exports', issue.exports])
      continue
    }

    for (const prop of ['types', 'exports', 'unresolved'] as const) {
      for (const typeIssue of issue[prop]) {
        const knownIssue = baseIssue[prop].find(it => it.name === typeIssue.name)

        if (!knownIssue) {
          evidenceBook.insert(issue.file, ['added', prop, [typeIssue]])
        }
      }
      for (const typeIssue of baseIssue[prop]) {
        const knownIssue = issue[prop].find(it => it.name === typeIssue.name)

        if (!knownIssue) {
          evidenceBook.insert(issue.file, ['deleted', prop, [typeIssue]])
        }
      }
    }
  }

  return evidenceBook
}

async function parseReport(fullPath: string): Promise<Report> {
  return JSON.parse(await readFile(fullPath, 'utf8'))
}

export class EvidenceBook {
  /**
  * file => Evidence
  */
  map: Map<string, Evidence[]> = new Map()

  insert(file: string, [action, kind, issues]: EvidenceInput) {
    if (issues.length === 0) {
      return
    }

    const evs = this.get(file)

    for (const issue of issues) {
      evs.push([action, kind, issue])
    }
  }

  get(file: string): Evidence[] {
    let value = this.map.get(file)
    if (!value) {
      value = []
      this.map.set(file, value)
    }
    return value
  }

  json() {
    return Object.fromEntries(this.map)
  }

  dump() {
    return JSON.stringify(this.json(), null, 2)
  }

  isEmpty() {
    return this.map.size === 0
  }

  display(): string {
    const fmt = new Fmt()

    for (const [file, evs] of this.map) {
      if (evs.length === 0) {
        continue
      }

      const addedCount = evs.filter(it => it[0] === 'added')
      const deletedCount = evs.filter(it => it[0] === 'deleted')

      fmt.h3()._().book()._().code(file).eol()

      fmt.quote()._().push(`+ ${addedCount.length} issues`).eol()
      fmt.quote()._().push(`- ${deletedCount.length} issues`).eol()
    }

    return fmt.display.trim()
  }
}

export class Fmt {
  display = ''

  h3() {
    this.display += '###'
    return this
  }

  quote() {
    this.display += '>'
    return this
  }

  push(str: string) {
    this.display += str.trim()
    return this
  }

  brackets(fn: () => void) {
    this.display += '('
    fn()
    this.display += ')'
    return this
  }

  code(str: string) {
    this.display += '`' + str.trim() + '`'
    return this
  }

  rocket() {
    this.display += '🚀'
    return this
  }

  book() {
    this.display += '📖'
    return this
  }

  fire() {
    this.display += '🔥'
    return this
  }

  _() {
    this.display += ' '
    return this
  }

  eol() {
    this.display += '\n'
    return this
  }
}
