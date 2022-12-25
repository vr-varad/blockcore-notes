import { Injectable } from '@angular/core';
import { Circle, NostrEventDocument, NostrNoteDocument, NostrProfile, NostrProfileDocument } from './interfaces';
import { StorageService } from './storage.service';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class CirclesService {
  private table;

  // Just a basic observable that triggers whenever any profile has changed.
  #circlesChangedSubject: BehaviorSubject<void> = new BehaviorSubject<void>(undefined);

  get notesChanged$(): Observable<void> {
    return this.#circlesChangedSubject.asObservable();
  }

  #changed() {
    this.#circlesChangedSubject.next(undefined);
  }

  constructor(private storage: StorageService) {
    this.table = this.storage.table<Circle>('circles');
  }

  async #filter(predicate: (value: Circle, key: string) => boolean): Promise<Circle[]> {
    const iterator = this.table.iterator<string, Circle>({ keyEncoding: 'utf8', valueEncoding: 'json' });

    // Add default that cannot be removed. It is where people go when group is deleted or when none is picked or could be found (matched).
    const items = [{ id: '', name: 'Following', color: '#e91e63' }];

    for await (const [key, value] of iterator) {
      if (predicate(value, key)) {
        value.id = key;
        items.push(value);
      }
    }

    return items;
  }

  async list() {
    return this.#filter((value, key) => true);
  }

  /** Circles are upserts, we replace the existing circles and only keep latest. */
  async putCircle(document: Circle | any) {
    const id = document.id;

    // Remove the id from the document before we persist.
    delete document.id;

    document.created = Math.floor(Date.now() / 1000);

    console.log(document);

    await this.table.put(id, document);

    this.#changed();
  }

  async deleteCircle(id: string) {
    await this.table.del(id);

    this.#changed();
  }

  /** Wipes all circles. */
  async wipe() {
    for await (const [key, value] of this.table.iterator({})) {
      await this.table.del(key);
    }

    this.#changed();
  }
}
