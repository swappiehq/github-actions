import * as core from '@actions/core'
import * as github from '@actions/github'
import { Issue, phraselint } from './phraselint'
import { upsertIssueComment } from '../../common/upsertIssueComment'
import { Fmt } from '../../common/Fmt'

console.time('Done')

async function main() {
  const token = core.getInput('token', { required: true })
  const commit = core.getInput('commit', { required: true })
  const i18nBaseDir = core.getInput('dir', { required: true })
  const mainEntry = core.getInput('main-entry', { required: true })

  const { repo: { owner, repo }, ref } = github.context

  const prNumber = computePrNumber(ref)

  if (!prNumber) {
    core.setFailed('Could not parse .ref into a pr number')
    return
  }

  const issues = await phraselint({
    dir: i18nBaseDir,
    mainEntry,
  })

  const kit = github.getOctokit(token)

  const body = createBody(render({
    issues,
    commit: {
      text: commit.slice(0, 7),
      url: `https://github.com/${owner}/${repo}/pull/${prNumber}/commits/${commit}`
    }
  }))

  await upsertIssueComment({
    repo,
    owner,
    prNumber,
    kit,
    body,
    pickComment(it) {
      return it.performed_via_github_app?.slug === 'github-actions'
        && /#phrase/.test(it.body ?? '')
    },
  })
}

main()
  .catch(console.error)
  .finally(() => {
    console.timeEnd('Done')
  })

function createBody(body: string) {
  return body.trim() + '\n\n#phrase'
}

function computePrNumber(ref: string): number | undefined {
  return ref.split('/')
    .map(it => parseInt(it, 10))
    .find(it => !isNaN(it))
}

type Filename = string

type RenderProps = {
  issues: Issue[]
  commit: {
    url: string
    text: string
  }
}

function render({ issues, commit }: RenderProps): string {
  const fmt = new Fmt()

  if (issues.length === 0) {
    fmt.block(() => {
      fmt.rocket().push(`Translations look good!`)
    })
    fmt.block(() => {
      fmt.italic('This report is generated against').link(`\`${commit.text}\``, commit.url)
    })
    return fmt.display.trim()
  }

  fmt.block(() => {
    fmt.fire().push(`Found ${issues.length} issues with translations`)
  })

  const groups = new Map<Filename, Issue[]>()
  for (const it of issues) {
    const issues = groups.get(it.file) ?? []
    issues.push(it)
    groups.set(it.file, issues)
  }

  for (const [file, issues] of groups.entries()) {
    fmt.line(() => {
      fmt.h4().code(file)
    })

    for (const issue of issues) {
      fmt.line(() => {
        fmt.bullet().fire().push(issue.issueKind).push('at').code(issue.key)
      })
    }
  }

  fmt.eol()

  fmt.block(() => {
    fmt.italic('This report is generated against').link(`\`${commit.text}\``, commit.url)
  })

  return fmt.display.trim()
}
