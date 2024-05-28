import * as core from '@actions/core'
import * as github from '@actions/github'
import { Fmt, knipadmin } from './knipadmin'

console.time('Done')

async function main() {
  const token = core.getInput('token', { required: true })
  const baseReportPath = core.getInput('base-report', { required: true })
  const nextReportPath = core.getInput('next-report', { required: true })

  const { repo: { owner, repo }, sha, ref } = github.context

  const shortCommit = sha.slice(0, 7)
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

  if (book.isEmpty()) {
    // delete all related #knip comments if book is empty
    // because otherwise there is nothing to report on:
    // no issues were added or fixed
    core.debug('book is empty')

    for (const it of knipComments) {
      core.debug(`deleting ${it.id} comment`)
      await kit.rest.issues.deleteComment({
        owner,
        repo,
        comment_id: it.id,
      })
    }

    return
  }

  const body = createBody(book.display(shortCommit))

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
