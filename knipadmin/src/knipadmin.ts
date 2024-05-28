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

const issueDesc = new Map<string, { title: string, desc: string }>([
  ['files', { title: 'Unused files', desc: 'Unable to find a reference to this file' }],
  ['dependencies', { title: 'Unused dependencies', desc: 'Unable to find a reference to this dependency' }],
  ['unlisted', { title: 'Unlisted dependencies', desc: 'Used dependencies not listed in package.json' }],
  ['unresolved', { title: 'Unresolved imports', desc: 'Unable to resolve this (import) specifier' }],
  ['exports', { title: 'Unused exports', desc: 'Unable to find a reference to this export' }],
  ['types', { title: 'Unused exported types', desc: 'Unable to find a reference to this exported type' }],
  ['nsExports', { title: 'Exports in used namespace', desc: 'Namespace with export is referenced, but not export itself' }],
  ['nsTypes', { title: 'Exported types in used namespace', desc: 'Namespace with type is referenced, but not type itself' }],
  ['enumMembers', { title: 'Unused exported enum members', desc: 'Unable to find a reference to this enum member' }],
  ['classMembers', { title: 'Unused exported class members', desc: 'Unable to find a reference to this class member' }],
  ['duplicates', { title: 'Duplicate exports', desc: 'This is exported more than once' }],
])

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

      evs.sort((a, b) => sortableActionRatio(a[0]) - sortableActionRatio(b[0]))

      const added = evs.filter(it => it[0] === 'added')
      const deleted = evs.filter(it => it[0] === 'deleted')

      fmt.line(() => {
        fmt.h3().book().code(file)
      })

      if (added.length > 0) {
        fmt.line(() => {
          fmt.quote().code(`+${added.length} issues`)
        })
      }
      if (deleted.length > 0) {
        fmt.line(() => {
          fmt.quote().code(`-${deleted.length} issues`)
        })
      }

      for (const it of evs) {
        const [action, issueType, issue] = it
        const issueText = issueDesc.get(issueType)!

        fmt.bullet()

        if (action === 'added') {
          fmt.line(() => {
            fmt
              .fire()
              .push(issueText.title.toLowerCase())
              .code(issue.name).push('at line:')
              .code(issue.line.toString())
          })
        } else if (action === 'deleted') {
          fmt.line(() => {
            fmt
              .rocket()
              .push('thank you for fixing')
              .push(issueText.title.toLowerCase())
              .brackets(() => {
                fmt.code(issue.name)
              })
          })
        }
      }
    }

    return fmt.display.trim()
  }
}

export class Fmt {
  display = ''

  line(fn: () => void) {
    fn()
    this.eol()
    return this
  }

  h3() {
    this.display += '###'
    this._()
    return this
  }

  h4() {
    this.display += '####'
    this._()
    return this
  }

  bullet() {
    this.display += '-'
    this._()
    return this
  }

  quote() {
    this.display += '>'
    this._()
    return this
  }

  push(str: string) {
    this.display += str.trim()
    this._()
    return this
  }

  brackets(fn: () => void) {
    this.display += '('
    fn()
    this.display += ')'
    this._()
    return this
  }

  code(str: string) {
    this.display += '`' + str.trim() + '`'
    this._()
    return this
  }

  rocket() {
    this.display += '🚀'
    this._()
    return this
  }

  book() {
    this.display += '📖'
    this._()
    return this
  }

  fire() {
    this.display += '🔥'
    this._()
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

function sortableActionRatio(action: Action): number {
  if (action === 'added') {
    return 3
  }
  if (action === 'deleted') {
    return 2
  }
  return 1
}
