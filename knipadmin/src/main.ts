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

  const kit = github.getOctokit(token)

  const prId: number | undefined = ref.split('/')
    .map(it => parseInt(it, 10))
    .find(it => !isNaN(it))

  if (!prId) {
    throw new Error(`Could not parse .ref, got ${ref}`)
  }

  const pr = await findPR(kit, { repo, owner, prId })

  console.log(pr)
}

main()
  .catch(console.error)
  .finally(() => {
    console.timeEnd('Done')
  })

interface FindPrProps {
  owner: string
  repo: string
  prId: number
}
async function findPR(kit: Octokit, { owner, repo, prId }: FindPrProps) {
  const query = `
query ($owner: String!, $repo: String!, $prId: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prId) {
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
    prId,
  })

  const it = res?.repository?.pullRequest ?? null

  if (!it) {
    throw new Error(`Could not find PR by the id ${prId}`)
  }

  return it
}
