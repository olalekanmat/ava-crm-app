import * as Location from 'expo-location';

export interface Fix {
  lat: number;
  lng: number;
  accuracy?: number;
  at: string;
}

/** Current device position. Asks for permission the first time; throws a readable error otherwise. */
export async function currentFix(): Promise<Fix> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new Error('Location permission is off. Allow location for Ava in your device settings to check in.');
  }
  const pos = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Could not get a GPS fix. Move near a window or outdoors and try again.')), 20000)),
  ]);
  return {
    lat: +pos.coords.latitude.toFixed(6),
    lng: +pos.coords.longitude.toFixed(6),
    accuracy: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : undefined,
    at: new Date(pos.timestamp || Date.now()).toISOString(),
  };
}
