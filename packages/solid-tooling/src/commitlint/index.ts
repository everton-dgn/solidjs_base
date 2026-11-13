import conventional from '@commitlint/config-conventional'

type CommitlintConfig = Readonly<Record<string, unknown>>

const WARNING = 1
const ERROR = 2
const MAX_LINE_LENGTH = 100

// The spread keeps the parser preset of config-conventional, which this
// package installs, so the application only declares @commitlint/cli.
const commitlint: CommitlintConfig = {
  ...conventional,
  rules: {
    ...conventional.rules,
    'header-max-length': [ERROR, 'always', MAX_LINE_LENGTH],
    'body-max-line-length': [WARNING, 'always', MAX_LINE_LENGTH],
    'footer-leading-blank': [ERROR, 'always'],
    'footer-max-line-length': [WARNING, 'always', MAX_LINE_LENGTH]
  }
}

export default commitlint
