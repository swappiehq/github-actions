import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

const tmpDir = os.tmpdir()

const C_SECOND = 1_000
const C_APP_TIMEOUT = 60 * C_SECOND

type Tag = 'base' | 'next'

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

export async function knipadmin() {
  const report = await tryReadStdin<Report>()

  if (!report) {
    throw new Error('Could not read report from stdin')
  }

  const knipDir = path.join(tmpDir, 'knip')

  await fs.mkdir(knipDir, { recursive: true })
  const existingReports = await fs.readdir(knipDir)

  if (existingReports.length === 0) {
    const fullPath = await writeReport(knipDir, 'base', report)
    console.log(`✅ Base report saved at ${fullPath}`)
    return
  }

  const baseReport = await readReport(knipDir, 'base')

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

  console.log(evidenceBook.dump())
}

async function readReport(baseDir: string, tag: Tag): Promise<Report> {
  return JSON.parse(await fs.readFile(path.join(baseDir, createReportFilename(tag)), 'utf8'))
}

async function writeReport(baseDir: string, tag: Tag, report: Report) {
  const content = Buffer.from(JSON.stringify(report))
  const fullPath = path.join(baseDir, createReportFilename(tag))
  await fs.writeFile(fullPath, content)
  return fullPath
}

function createReportFilename(tag: Tag) {
  return `issues.${tag}.json`
}

function tryReadStdin<T>(): Promise<T | undefined> {
  const sleeping = sleep(C_APP_TIMEOUT)

  return Promise.race([
    sleeping.wait,
    readStdin().then(it => {
      sleeping.cancel()
      return JSON.parse(it)
    })
  ])
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    process.stdin.setEncoding('utf8')
    let buffer = ''
    process.stdin.on('data', (chunk) => {
      buffer += chunk
    })
    process.stdin.on('end', () => {
      resolve(buffer)
    })
  })
}

function sleep(timeout: number) {
  let id: NodeJS.Timeout | null = null

  const promise = new Promise(resolve => {
    id = setTimeout(() => resolve(undefined), timeout)
  })

  const self = {
    wait: promise,
    cancel() {
      id?.unref()
    }
  }

  return self
}

class EvidenceBook {
  /**
  * file => Evidence
  */
  map: Map<string, Evidence[]> = new Map()

  set(): never {
    throw new Error('use insert()')
  }

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

  dump() {
    console.log(JSON.stringify(Object.fromEntries(this.map), null, 2))
  }
}
