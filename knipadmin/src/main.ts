import * as core from '@actions/core'
import * as github from '@actions/github'
import { Octokit } from '@octokit/core'
import { knipadmin } from './lib'

console.time('Done')

async function main() {
  const token = core.getInput('token', { required: true })

  console.log('hewo')
  const repo = core.getInput('repo', { required: true })
  const owner = core.getInput('owner', { required: true })
  const branch = core.getInput('branch', { required: true })

  const kit = github.getOctokit(token)

  console.log(branch)

  const pr = await findPR(kit, { repo, owner, branch })

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
  branch: string
}
async function findPR(kit: Octokit, { owner, repo, branch }: FindPrProps) {
  const query = `
query ($owner: String!, $repo: String!, $branch: String!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(
      headRefName: $branch
      first: 1
      orderBy: {field: CREATED_AT, direction: DESC}
    ) {
      nodes {
        id
        createdAt
        updatedAt
        changedFiles
        url
        number
        state
        reviews(first: 30) {
          nodes {
            id
            state
          }
        }
        labels(first: 30) {
          nodes {
            id
            name
          }
        }
      }
    }
  }
}
`
  const res = await kit.graphql<{
    repository?: {
      pullRequests?: {
        nodes: Array<{
          id: string
          createdAt: string
          updatedAt: string
          changedFiles: number
          url: string
          number: number
          state: 'OPEN' | 'CLOSED' | 'MERGED'
          reviews?: {
            nodes: Array<{
              id: string
              state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'
            }>
          }
          labels?: {
            nodes: Array<{
              id: string
              name: string
            }>
          }
        }>
      }
    }
  }>(query, {
    owner,
    repo,
    branch,
  })

  const [node] = res.repository?.pullRequests?.nodes || []

  if (!node) {
    return null
  }

  return {
    id: node.id,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    changedFiles: node.changedFiles,
    url: node.url,
    number: node.number,
    state: node.state,
    labels: node.labels?.nodes ?? [],
    reviews: node.reviews?.nodes ?? [],
  }
}
