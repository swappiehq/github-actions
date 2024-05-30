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
    return fmt.render()
  }

  const groups = new Map<string, Issue[]>()
  for (const issue of issues) {
    const group = groups.get(issue.key) ?? []
    group.push(issue)
    groups.set(issue.key, group)
  }

  fmt.block(() => {
    fmt.fire().push('Hi there, we got issues with `i18n` files!')
  })

  fmt.block(() => {
    fmt.push('Below are the keys which have objects as values and which shapes are inconsistent across locales.')
    fmt.push('This is problematic because our systems will get different JSON value for the keys depending on the locale used.')
    fmt.push('It could lead to some weird/unexpected bugs while rendering.')
  })

  for (const [key, issues] of groups) {
    fmt.line(() => {
      fmt.h4().push('key').code(key)
    })

    fmt.quote()
      .push(issues.map(it => Fmt.code(it.file)).join(', '))
      .eol()
  }

  fmt.eol(2)

  fmt.block(() => {
    fmt.italic('This report is generated against').link(`\`${commit.text}\``, commit.url)
  })

  return fmt.render()
}
