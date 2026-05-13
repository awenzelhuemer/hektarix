import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GeolocationService {
  watch(
    success: (position: [number, number]) => void,
    error: (message: string) => void = () => {},
    options: PositionOptions = { enableHighAccuracy: true, maximumAge: 3000 },
  ): number {
    return navigator.geolocation.watchPosition(
      (pos) => success([pos.coords.latitude, pos.coords.longitude]),
      (err) => error(err.message),
      options,
    );
  }

  clearWatch(id: number): void {
    navigator.geolocation.clearWatch(id);
  }

  getCurrentPosition(options: PositionOptions = { enableHighAccuracy: true }): Promise<[number, number]> {
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
        reject,
        options,
      ),
    );
  }
}
