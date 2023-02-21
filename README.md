# Reusable Github Actions

Contains few reusable actions to create automatic PRs to update NodeJS & Python.

## How to use
1. Add this example configuration here into your repository in `.github/workflows/update-asdf.yml`
```yaml
name: "Create update PRs"
description: "Updates Python & Node to latest version every morning"

on:
  schedule:
    # Every 5:30 AM in UTC
    - cron: '30 5 * * *'
  workflow_dispatch: {}

# TODO: Once dependabot supports asdf directly this should not be used anymore https://github.com/dependabot/dependabot-core/issues/1033
jobs:
  updatePython:
    name: "Update asdf Python"
    permissions:
      contents: write
      pull-requests: write
    runs-on: ubuntu-latest
    steps:
      - uses: swappiehq/github-actions/actions/update-python@main
  updateNode:
    name: "Update asdf NodeJS"
    permissions:
      contents: write
      pull-requests: write
    runs-on: ubuntu-latest
    steps:
      - uses: swappiehq/github-actions/actions/update-nodejs@main
```
2. Allow Github actions to create pull requests to your repository in `Settings->Actions->Workflow Permissions`
<img src="docs/assets/allow-github-action-pull-requests.png">

## License

[MIT](LICENSE)
