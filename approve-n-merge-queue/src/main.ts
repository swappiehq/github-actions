import * as core from '@actions/core'
import * as github from '@actions/github'
import { Octokit } from '@octokit/core'

interface ApprovePrProps {
  prId: string
  body: string
}
async function approvePR(kit: Octokit, { prId, body }: ApprovePrProps): Promise<{ approved: boolean }> {
  const query = `
mutation ($prId: ID!, $body: String!) {
  addPullRequestReview(input: {pullRequestId: $prId, event: APPROVE, body: $body}) {
    reviewEdge {
      cursor
      node {
        id
        state
      }
    }
  }
}
`

  try {
    await kit.graphql<{}>(query, { prId, body })
    return { approved: true }
  } catch (e) {
    console.error('could not approve', e)
    return { approved: false }
  }
}

interface EnqueuePrProps {
  prId: string
}
async function enqueuePR(kit: Octokit, { prId }: EnqueuePrProps): Promise<{ enqueued: boolean }> {
  const query = `
mutation ($prId: ID!) {
  enqueuePullRequest(input: {pullRequestId: $prId}) {
    clientMutationId
    mergeQueueEntry {
      position
    }
  }
}
`

  try {
    await kit.graphql<{}>(query, { prId })
    return { enqueued: true }
  } catch (e) {
    console.error('could not enqueue', e)
    return { enqueued: false }
  }
}

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
        mergeQueueEntry {
          id
          state
        }
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
          mergeQueueEntry?: {
            id: string
            state: 'AWAITING_CHECKS' | 'LOCKED' | 'MERGEABLE' | 'QUEUED' | 'UNMERGEABLE'
          }
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
    mergeQueueEntry: node.mergeQueueEntry,
  }
}

async function main() {
  const token = core.getInput('token', { required: true })
  const repo = core.getInput('repo', { required: true })
  const owner = core.getInput('owner', { required: true })
  const branch = core.getInput('branch', { required: true })
  const stopLabels = core
    .getInput('stop-labels', { required: false, trimWhitespace: true })
    .toLowerCase()
    .split(',')
    .map((str) => str.trim())

  const kit = github.getOctokit(token)

  const pr = await findPR(kit, { repo, owner, branch })

  if (!pr) {
    core.info(`could not find PR`)
    return
  }

  if (pr.state === 'CLOSED' || pr.state === 'MERGED') {
    core.info('PR seems to be closed or merged')
    return
  }

  const shouldIgnoreDueToLabels = pr.labels.some((label) => stopLabels.includes(label.name.toLowerCase()))
  if (shouldIgnoreDueToLabels) {
    core.info('ignoring merging due to labels')
    return
  }

  const changesRequested = pr.reviews.some((review) => review.state === 'CHANGES_REQUESTED')
  if (changesRequested) {
    core.info('changes are requested so this PR is ignored')
    return
  }

  const alreadyApproved = pr.reviews.some((review) => review.state === 'APPROVED')
  if (!alreadyApproved) {
    core.debug('time to approve this PR')
    const approveResult = await approvePR(kit, {
      body: 'Looks good 🚀',
      prId: pr.id,
    })

    if (!approveResult.approved) {
      core.setFailed(`Could not approve PR #${pr.number}`)
      return
    }
  } else {
    core.debug('skip approving this PR')
  }

  const mergeQueueState = pr.mergeQueueEntry?.state ?? 'MERGEABLE'

  if (mergeQueueState === 'MERGEABLE' || mergeQueueState === 'AWAITING_CHECKS') {
    core.debug('time to enqueue this PR')
    const enqueueResult = await enqueuePR(kit, { prId: pr.id })

    if (!enqueueResult.enqueued) {
      core.setFailed(`Could not enqueue PR #${pr.number}`)
      return
    }
  } else {
    console.log(pr)
    core.setFailed('PR seems to be unmergeable')
  }
}

main().catch((e) => {
  core.setFailed(e)
})
