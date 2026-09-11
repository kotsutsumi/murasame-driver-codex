export class BoundedTailBuffer {
  #value = "";
  #bytes = 0;
  #truncated = false;

  constructor(readonly limit: number) {}

  append(value: string): boolean {
    if (value.length === 0) return false;
    this.#value += value;
    this.#bytes += new TextEncoder().encode(value).byteLength;
    if (this.limit === 0) {
      const wasTruncated = !this.#truncated;
      this.#value = "";
      this.#bytes = 0;
      this.#truncated = true;
      return wasTruncated;
    }
    if (this.#bytes <= this.limit) return false;

    const characters = [...this.#value];
    let start = characters.length;
    let bytes = 0;
    while (start > 0) {
      const characterBytes = new TextEncoder().encode(characters[start - 1] ?? "").byteLength;
      if (bytes + characterBytes > this.limit) break;
      bytes += characterBytes;
      start -= 1;
    }
    this.#value = characters.slice(start).join("");
    this.#bytes = bytes;
    const wasTruncated = !this.#truncated;
    this.#truncated = true;
    return wasTruncated;
  }

  get value(): string {
    return this.#value;
  }

  get bytes(): number {
    return this.#bytes;
  }

  get truncated(): boolean {
    return this.#truncated;
  }
}
