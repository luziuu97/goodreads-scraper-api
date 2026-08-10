/**
 * Comparison result: negative = a < b, zero = a == b, positive = a > b
 */
type Comparator<T> = (a: T, b: T) => number;

/**
 * A max-heap of size N. When full and a new item compares greater than the minimum,
 * the minimum is evicted.
 * Internally implemented as a MIN-heap, so the root is always the SMALLEST item.
 */
export class BoundedTopHeap<T> {
  private data: T[] = [];
  private capacity: number;
  private comparator: Comparator<T>;

  constructor(capacity: number, comparator: Comparator<T>) {
    this.capacity = capacity;
    this.comparator = comparator;
  }

  push(item: T): void {
    if (this.data.length < this.capacity) {
      this.data.push(item);
      this._bubbleUp(this.data.length - 1);
    } else if (this.capacity > 0) {
      if (this.comparator(item, this.data[0]) > 0) {
        this.data[0] = item;
        this._bubbleDown(0);
      }
    }
  }

  toArray(): T[] {
    return [...this.data];
  }

  get size(): number {
    return this.data.length;
  }

  private _bubbleUp(index: number): void {
    const item = this.data[index];
    while (index > 0) {
      const parentIndex = (index - 1) >>> 1;
      const parent = this.data[parentIndex];
      if (this.comparator(item, parent) >= 0) {
        break;
      }
      this.data[index] = parent;
      index = parentIndex;
    }
    this.data[index] = item;
  }

  private _bubbleDown(index: number): void {
    const length = this.data.length;
    const item = this.data[index];
    while (true) {
      const leftChildIndex = (index << 1) + 1;
      const rightChildIndex = leftChildIndex + 1;
      let smallestIndex = index;

      if (leftChildIndex < length && this.comparator(this.data[leftChildIndex], this.data[smallestIndex]) < 0) {
        smallestIndex = leftChildIndex;
      }

      if (rightChildIndex < length && this.comparator(this.data[rightChildIndex], this.data[smallestIndex]) < 0) {
        smallestIndex = rightChildIndex;
      }

      if (smallestIndex === index) {
        break;
      }

      this.data[index] = this.data[smallestIndex];
      index = smallestIndex;
    }
    this.data[index] = item;
  }
}
