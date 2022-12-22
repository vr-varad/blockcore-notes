import { ChangeDetectorRef, Component } from '@angular/core';
import { Router } from '@angular/router';
import { ApplicationState } from '../services/applicationstate.service';
import { Utilities } from '../services/utilities.service';
import { relayInit, Relay } from 'nostr-tools';
import * as moment from 'moment';
import { DataValidation } from '../services/data-validation.service';
import { NostrEvent, NostrProfile } from '../services/interfaces';
import { ProfileService } from '../services/profile.service';
import { SettingsService } from '../services/settings.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
})
export class HomeComponent {
  publicKey?: string | null;

  constructor(public appState: ApplicationState, private cd: ChangeDetectorRef, public settings: SettingsService, public profiles: ProfileService, private validator: DataValidation, private utilities: Utilities, private router: Router) {
    this.appState.title = 'Blockcore Notes';
    this.appState.showBackButton = false;
    console.log('NG ON INIT FOR CTOR!!!');
  }

  ngAfterViewInit() {
    console.log('ngAfterViewInit');
  }

  ngAfterContentInit() {
    console.log('ngAfterContentInit');
  }

  optionsUpdated() {
    // this.allComplete = this.task.subtasks != null && this.task.subtasks.every(t => t.completed);
    // Parse existing content.
    this.events = this.validator.filterEvents(this.events);
  }

  activeOptions() {
    let options = '';

    if (this.settings.options.hideSpam) {
      options += ' Spam: Filtered';
    } else {
      options += ' Spam: Allowed';
    }

    if (this.settings.options.hideInvoice) {
      options += ' Invoices: Hidden';
    } else {
      options += ' Invoices: Displayed';
    }

    return options;
  }

  public trackByFn(index: number, item: NostrEvent) {
    return item.id;
  }

  events: NostrEvent[] = [];
  sub: any;
  relay?: Relay;
  initialLoad = true;

  onConnected(relay?: Relay) {
    if (!relay) {
      return;
    }

    const fiveMinutesAgo = moment().subtract(5, 'minutes').unix();

    this.sub = relay.sub([{ kinds: [1], since: fiveMinutesAgo }], {});

    this.events = [];

    this.sub.on('event', (event: any) => {
      if (this.settings.options.paused) {
        return;
      }

      // Validate the event:
      const valid = this.validator.validateEvent(event);

      if (!valid) {
        debugger;
        console.log('INVALID EVENT!');
        return;
      }

      const parsed = this.validator.sanitizeEvent(event);
      // console.log('we got the event we wanted:', parsed);

      const allowed = this.validator.filterEvent(event);

      if (!allowed) {
        return;
      }

      // If not initial load, we'll grab the profile.
      if (!this.initialLoad) {
        this.fetchProfiles(relay, [parsed.pubkey]);
      }

      this.events.unshift(parsed);

      if (this.events.length > 100) {
        this.events.length = 80;
      }
    });

    this.sub.on('eose', () => {
      this.initialLoad = false;

      const pubKeys = this.events.map((e) => {
        return e.pubkey;
      });

      // Initial load completed, let's go fetch profiles for those initial events.
      this.fetchProfiles(relay, pubKeys);

      this.cd.detectChanges();
    });
  }

  fetchProfiles(relay: Relay, authors: string[]) {
    const filteredAuthors = authors.filter((a) => {
      return this.profiles.profiles[a] == null;
    });

    // console.log('authors:', authors);
    // console.log('filteredAuthors:', filteredAuthors);

    if (filteredAuthors.length === 0) {
      return;
    }

    const profileSub = relay.sub([{ kinds: [0], authors: filteredAuthors }], {});

    profileSub.on('event', async (event: any) => {
      const valid = this.validator.validateProfile(event);

      if (!valid) {
        debugger;
        console.log('INVALID EVENT!');
        return;
      }

      const parsed = this.validator.sanitizeProfile(event);

      // const parsed = this.validator.sanitizeProfile(event);

      // const test1 = JSON.parse('{"name":"stat","picture":"https://i.imgur.com/s1scsdH_d.webp?maxwidth=640&amp;shape=thumb&amp;fidelity=medium","about":"senior software engineer at amazon\\n\\n#bitcoin","nip05":"stat@no.str.cr"}');
      // console.log('WHAT IS WRONG WITH THIS??');
      // console.log(test1);

      try {
        const parsedProfile = JSON.parse(parsed.content) as NostrProfile;

        this.profiles.profiles[parsed.pubkey] = parsedProfile;

        const displayName = encodeURIComponent(parsedProfile.name);

        const url = `https://www.nostr.directory/.well-known/nostr.json?name=${displayName}`;

        const rawResponse = await fetch(url, {
          method: 'GET',
          mode: 'cors',
        });

        if (rawResponse.status === 200) {
          const content = await rawResponse.json();
          const directoryPublicKey = content.names[displayName];

          if (parsed.pubkey === directoryPublicKey) {
            parsedProfile.verified = true;
          } else {
            parsedProfile.verified = false;
            console.warn('Nickname reuse:', url);
          }
        } else {
          parsedProfile.verified = false;
        }
      } catch (err) {
        console.warn('This profile was not parsed due to errors:', parsed.content);
      }
    });

    profileSub.on('eose', () => {
      profileSub.unsub();
    });
  }

  ngOnDestroy() {
    if (this.sub) {
      this.sub.unsub();
    }
  }

  async ngOnInit() {
    if (this.relay) {
      return;
    }

    // const relay = relayInit('wss://relay.nostr.info');
    this.relay = relayInit('wss://relay.damus.io');

    this.relay.on('connect', () => {
      console.log(`connected to ${this.relay?.url}`);
      this.onConnected(this.relay);
    });

    this.relay.on('disconnect', () => {
      console.log(`DISCONNECTED! ${this.relay?.url}`);
    });

    this.relay.on('notice', () => {
      console.log(`NOTICE FROM ${this.relay?.url}`);
    });

    this.relay.connect();
  }
}
