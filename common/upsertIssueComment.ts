import { getOctokit } from '@actions/github'

type Comment = Awaited<ReturnType<ReturnType<typeof getOctokit>['rest']['issues']['listComments']>>['data'][number]

type Props = {
  repo: string
  owner: string
  prNumber: number
  kit: ReturnType<typeof getOctokit>
  body: string
  pickComment: (comment: Comment) => boolean
}

export async function upsertIssueComment({
  repo,
  owner,
  prNumber,
  kit,
  body,
  pickComment,
}: Props) {
  let listCommentsResponse = await kit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
  })

  const comments = listCommentsResponse.data.filter(it => pickComment(it))

  if (comments.length === 0) {
    await kit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    })
  } else if (comments.length === 1) {
    const [comment] = comments

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
