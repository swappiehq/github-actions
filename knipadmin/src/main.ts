import * as core from '@actions/core'
import * as github from '@actions/github'
import { knipadmin } from './knipadmin'

console.time('Done')

async function main() {
  const token = core.getInput('token', { required: true })
  const baseReportPath = core.getInput('base-report', { required: true })
  const nextReportPath = core.getInput('next-report', { required: true })
  const commit = core.getInput('commit', { required: true })

  const { repo: { owner, repo }, ref } = github.context

  const prNumber = computePrNumber(ref)

  if (!prNumber) {
    core.setFailed('Could not parse .ref into a pr number')
    return
  }

  const book = await knipadmin({
    nextReportPath,
    baseReportPath,
  })

  const kit = github.getOctokit(token)

  const knipComments = await findKnipComments({
    repo,
    owner,
    prNumber,
    kit
  })

  const body = createBody(book.display({
    displayCommit: commit.slice(0, 7),
    commitUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}/commits/${commit}`
  }))

  if (knipComments.length === 0) {
    await kit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    })
  } else if (knipComments.length === 1) {
    const [comment] = knipComments

    await kit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: comment.id,
      body,
    })
  } else {
    throw new Error('somehow got more than 1 comments?')
  }

  if (!book.isEmpty()) {
    let added = 0

    for (const [file, evs] of book.map.entries()) {
      for (const ev of evs) {
        const [action, issueType, issue] = ev
        if (action === 'added') {
          added += 1
          core.info(`- ${file} has issue "${issueType}" for ${issue.name} (${issue.line}:${issue.col})`)
        }
      }
    }

    if (added > 0) {
      core.setFailed(`Failed because this PR added knip issues`)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => {
    console.timeEnd('Done')
  })

function createBody(body: string) {
  return body.trim() + '\n\n#knip'
}

function computePrNumber(ref: string): number | undefined {
  return ref.split('/')
    .map(it => parseInt(it, 10))
    .find(it => !isNaN(it))
}

type FindKnipComments = {
  kit: ReturnType<typeof github.getOctokit>
  owner: string
  repo: string
  prNumber: number
}
async function findKnipComments({ kit, owner, repo, prNumber }: FindKnipComments) {
  const comments = await kit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
  })

  const C_KNIP_REGEXP = /#knip/

  const knips = comments.data
    .filter(it => it.performed_via_github_app?.slug === 'github-actions')
    .filter(it => C_KNIP_REGEXP.test(it.body ?? ''))

  return knips
}
