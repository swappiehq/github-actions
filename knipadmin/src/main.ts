import * as core from '@actions/core'
import * as github from '@actions/github'
import { Octokit } from '@octokit/core'
import { knipadmin } from './lib'

console.time('Done')

async function main() {
  const token = core.getInput('token', { required: true })
  const repo = core.getInput('repo', { required: true })
  const owner = core.getInput('owner', { required: true })
  const ref = core.getInput('ref', { required: true })
  const baseReportPath = core.getInput('base-report', { required: true })
  const nextReportPath = core.getInput('next-report', { required: true })

  const kit = github.getOctokit(token)

  const prNumber: number | undefined = ref.split('/')
    .map(it => parseInt(it, 10))
    .find(it => !isNaN(it))

  if (!prNumber) {
    throw new Error(`Could not parse .ref, got ${ref}`)
  }

  const pr = await findPR(kit, { repo, owner, prNumber })

  const json = await knipadmin({
    nextReportPath,
    baseReportPath,
  })

  await comment(kit, { prId: pr.id, body: json })
}

main()
  .catch(console.error)
  .finally(() => {
    console.timeEnd('Done')
  })

type CommentProps = {
  prId: string
  body: string
}
async function comment(kit: Octokit, { prId, body }: CommentProps) {

}

interface PrQuery {
  owner: string
  repo: string
  prNumber: number
}
async function findPR(kit: Octokit, { owner, repo, prNumber }: PrQuery) {
  const query = `
query ($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
    	author {
        login
      }
      id
      url
      state
    }
  }
}
`
  const res = await kit.graphql<{
    repository?: {
      pullRequest?: {
        author: {
          login: string
        }
        id: string
        url: string
        state: string
      }
    }
  }>(query, {
    owner,
    repo,
    prNumber,
  })

  const it = res?.repository?.pullRequest ?? null

  if (!it) {
    throw new Error(`Could not find PR by the id ${prNumber}`)
  }

  return it
}
