import * as assert from 'node:assert'
import { Issue, IssueKind, inspect } from './phraselint'
import { test } from 'node:test'

test(IssueKind.MissingProp, async (t) => {
  await t.test('should find a missing property when majority of other keys have it', () => {
    const actual = inspect('my-key', [
      ['en.json', {
        one: 1,
        two: 2,
      }],
      ['sv.json', {
        one: 3,
        two: 4,
      }],
      ['fi.json', {
        one: 10,
      }],
    ])
    const expected: Issue[] = [{
      key: 'my-key',
      file: 'fi.json',
      issueKind: IssueKind.MissingProp,
    }]
    assert.deepStrictEqual(actual, expected)
  })
  await t.test('should find a missing property in other smaller groups of outliers', () => {
    const actual = inspect('my-key', [
      ['en.json', {
        one: 1,
        two: 2,
        three: 3,
      }],
      ['et.json', {
        one: 1,
        two: 2,
        three: 3,
      }],
      ['sv.json', {
        one: 3,
        two: 4,
      }],
      ['fi.json', {
        one: 10,
      }],
    ])
    const expected: Issue[] = [{
      key: 'my-key',
      file: 'sv.json',
      issueKind: IssueKind.MissingProp,
    }, {
      key: 'my-key',
      file: 'fi.json',
      issueKind: IssueKind.MissingProp,
    }]
    assert.deepStrictEqual(actual, expected)
  })
  await t.test('should report correctly when some pairs have null', () => {
    const actual = inspect('my-key', [
      ['en.json', {
        one: 1,
        two: 2,
      }],
      ['sv.json', {
        one: 3,
        two: 4,
      }],
      ['es.json', null],
      ['et.json', {
        one: 1,
      }],
    ])
    const expected: Issue[] = [{
      key: 'my-key',
      file: 'et.json',
      issueKind: IssueKind.MissingProp,
    }]
    assert.deepStrictEqual(actual, expected)
  })
})
