import * as core from '@actions/core'
import * as github from '@actions/github'
import { Octokit } from '@octokit/core'

interface FindRefProps {
  owner: string
  repo: string
  branch: string
}

async function findRef(kit: Octokit, { owner, repo, branch }: FindRefProps): Promise<{ id: string, name: string, prefix: string } | undefined> {
  const query = `
query ($owner: String!, $repo: String!, $branch: String!) {
  repository(owner: $owner, name: $repo) {
    ref(qualifiedName: $branch) {
      id
      name
      prefix
    }
  }
}
`

  const res = await kit.graphql<{
    repository?: {
      ref?: {
        id: string
        name: string
        prefix: string
      }
    }
  }>(query, { owner, repo, branch })

  return res?.repository?.ref
}

async function deleteRef(kit: Octokit, { refId }: { refId: string }) {
  const query = `
mutation ($refId: ID!) {
  deleteRef(input: {refId: $refId}) {
    __typename
  }
}
`

  const res = await kit.graphql<{
    deleteRef?: {
      __typename: string
    }
  }>(query, { refId })

  return !!res.deleteRef
}

async function main() {
  const token = core.getInput('token', { required: true })
  const repo = core.getInput('repo', { required: true })
  const owner = core.getInput('owner', { required: true })
  const branch = core.getInput('branch', { required: true })

  const kit = github.getOctokit(token)

  const ref = await findRef(kit, { owner, repo, branch })

  if (!ref) {
    core.setFailed('could not find the ref')
    return
  }

  const deleted = await deleteRef(kit, { refId: ref.id })

  if (!deleted) {
    core.setFailed('could not delete the ref')
  }
}

main().catch((e) => {
  core.setFailed(e)
})
