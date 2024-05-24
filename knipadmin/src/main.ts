import * as core from '@actions/core'
import * as github from '@actions/github'
import { Octokit } from '@octokit/core'
import { knipadmin } from './lib'

console.time('Done')

async function main() {
  const token = core.getInput('token', { required: true })

  console.log('hewo')
  // const repo = core.getInput('repo', { required: true })
  // const owner = core.getInput('owner', { required: true })
  // const branch = core.getInput('branch', { required: true })
  //
  // const kit = github.getOctokit(token)
  //
  // const pr = await findPR(kit, { repo, owner, branch })
  //
  // console.log(pr)
}

main()
  .catch(console.error)
  .finally(() => {
    console.timeEnd('Done')
  })
