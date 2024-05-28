import * as core from '@actions/core'
import * as github from '@actions/github'
import { knipadmin } from './knipadmin'

console.time('Done')

const C_KNIP_REGEXP = /#knip/

async function main() {
  const token = core.getInput('token', { required: true })
  const ref = core.getInput('ref', { required: true })
  const baseReportPath = core.getInput('base-report', { required: true })
  const nextReportPath = core.getInput('next-report', { required: true })

  const { owner, repo } = github.context.repo

  const kit = github.getOctokit(token)

  const prNumber: number | undefined = ref.split('/')
    .map(it => parseInt(it, 10))
    .find(it => !isNaN(it))

  if (!prNumber) {
    throw new Error(`Could not parse .ref, got ${ref}`)
  }

  const book = await knipadmin({
    nextReportPath,
    baseReportPath,
  })

  core.info(book.dump())

  const comments = await kit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
  })

  const knips = comments.data
    .filter(it => it.performed_via_github_app?.slug === 'github-actions')
    .filter(it => C_KNIP_REGEXP.test(it.body ?? ''))

  if (knips.length === 0) {
    await kit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: createBody(book.display()),
    })
  } else if (knips.length === 1) {
    const comment = knips[0]

    await kit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: comment.id,
      body: createBody(book.display())
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
