import * as Y from 'yjs';

import type { Collab } from '@inkbrick/collab';

/**
 * Сеть в памяти для прототипа: обновление одного участника приходит остальным через `latencyMs`.
 * Участник в обрыве ничего не получает; при возврате связи участники обмениваются недостающим состоянием
 * (как первый шаг синхронизации настоящего транспорта).
 */
export interface NetworkPeer {
  id: string;
  ydoc: Y.Doc;
  collab: Collab;
  online: boolean;
}

export class MemoryNetwork {
  latencyMs = 300;

  private readonly peers: NetworkPeer[] = [];

  private readonly listeners = new Set<() => void>();

  private inFlight = 0;

  get pending(): number {
    return this.inFlight;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  add(peer: NetworkPeer): void {
    this.peers.push(peer);

    peer.collab.onLocalUpdate((update) => this.broadcast(peer, update));
  }

  setOnline(peer: NetworkPeer, online: boolean): void {
    if (peer.online === online) return;

    peer.online = online;

    if (online) {
      for (const other of this.peers) {
        if (other === peer || !other.online) continue;

        this.exchange(peer, other);
        this.exchange(other, peer);
      }
    }

    this.emit();
  }

  private exchange(from: NetworkPeer, to: NetworkPeer): void {
    const diff = Y.encodeStateAsUpdate(from.ydoc, Y.encodeStateVector(to.ydoc));

    this.deliver(to, diff);
  }

  private broadcast(from: NetworkPeer, update: Uint8Array): void {
    if (!from.online) return;

    for (const to of this.peers) {
      if (to !== from && to.online) this.deliver(to, update);
    }
  }

  private deliver(to: NetworkPeer, update: Uint8Array): void {
    this.inFlight++;
    this.emit();

    setTimeout(() => {
      this.inFlight--;

      if (to.online) to.collab.receive(update);

      this.emit();
    }, this.latencyMs);
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
