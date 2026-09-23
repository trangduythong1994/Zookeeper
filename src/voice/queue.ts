export type SpeechPriority = "arrival" | "standard";

type QueueEntry<T> = {
  priority: SpeechPriority;
  value: T;
};

export class SpeechQueue<T> {
  private readonly entries: QueueEntry<T>[] = [];

  enqueue(value: T, priority: SpeechPriority): void {
    const entry = { value, priority };
    if (priority === "standard") {
      this.entries.push(entry);
      return;
    }

    const firstStandard = this.entries.findIndex((candidate) => candidate.priority === "standard");
    if (firstStandard === -1) this.entries.push(entry);
    else this.entries.splice(firstStandard, 0, entry);
  }

  dequeue(): T | undefined {
    return this.entries.shift()?.value;
  }

  drain(): T[] {
    return this.entries.splice(0).map((entry) => entry.value);
  }

  get size(): number {
    return this.entries.length;
  }
}
