/** A binary min-heap of cell indices keyed by a number (map generation and path fields). */
export class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number {
    return this.vals.length;
  }

  push(val: number, key: number): void {
    const k = this.keys;
    const v = this.vals;
    let i = v.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= key) break;
      k[i] = k[p]!;
      v[i] = v[p]!;
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }

  /** Remove and return the value with the smallest key (ties: first pushed is not guaranteed). */
  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const top = v[0]!;
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    const n = v.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && k[r]! < k[l]! ? r : l;
        if (k[c]! >= lastK) break;
        k[i] = k[c]!;
        v[i] = v[c]!;
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return top;
  }

  peekKey(): number {
    return this.keys[0]!;
  }
}
