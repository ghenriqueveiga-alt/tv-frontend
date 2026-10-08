import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ServerTimeService {
  private readonly localOffsetHours = -new Date().getTimezoneOffset() / 60;
  private readonly offsetMs =
    ((environment.timezoneOffsetHours ?? 0) - this.localOffsetHours) * 3600000;
  readonly ready = signal(true);

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  getDayOfWeek(): number {
    const d = this.now().getDay();
    return d === 0 ? 7 : d;
  }
}
