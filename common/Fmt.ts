export class Fmt {
  display = ''

  link(text: string, url: string) {
    this._()
    this.display += `[${text}](${url})`
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
    this.display += '_' + str.trim() + '_'
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
    this.display += '`' + str.trim() + '`'
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
