export class Fmt {
  private display = ''

  static link(text: string, url: string) {
    return `[${text}](${url})`
  }

  static code(str: string) {
    return '`' + str + '`'
  }

  static italic(str: string) {
    return '_' + str.trim() + '_'
  }

  static brackets(str: string) {
    return '(' + str.trim() + ')'
  }

  render() {
    return this.display.trim()
  }

  link(text: string, url: string) {
    this.display += Fmt.link(text, url)
    this._()
    return this
  }

  line(fn: () => void) {
    fn()
    this.eol()
    return this
  }

  block(fn: () => void) {
    fn()
    this.eol(2)
    return this
  }

  h3() {
    this.display += '###'
    this._()
    return this
  }

  h4() {
    this.display += '####'
    this._()
    return this
  }

  bullet() {
    this.display += '-'
    this._()
    return this
  }

  quote() {
    this.display += '>'
    this._()
    return this
  }

  push(str: string) {
    this.display += str.trim()
    this._()
    return this
  }

  italic(str: string) {
    this.display += Fmt.italic(str)
    this._()
    return this
  }

  brackets(fn: () => void) {
    this.display += '('
    fn()
    this.trimEnd()
    this.display += ')'
    this._()
    return this
  }

  trimEnd() {
    this.display = this.display.trimEnd()
    return this
  }

  code(str: string) {
    this.display += Fmt.code(str)
    this._()
    return this
  }

  rocket() {
    this.display += '🚀'
    this._()
    return this
  }

  book() {
    this.display += '📖'
    this._()
    return this
  }

  fire() {
    this.display += '🔥'
    this._()
    return this
  }

  _() {
    this.display += ' '
    return this
  }

  eol(repeat = 1) {
    this.trimEnd()
    for (let i = 0; i < repeat; i += 1) {
      this.display += '\n'
    }
    return this
  }
}
