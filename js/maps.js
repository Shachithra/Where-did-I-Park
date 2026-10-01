// Google Maps hand-off. Walking directions: you're on foot, heading back to the car.
// The Maps URLs API opens the Google Maps app on Android/iOS when installed, the website otherwise.

export function directionsUrl({ latitude, longitude }) {
  const dest = `${latitude},${longitude}`;
  const params = new URLSearchParams({ api: '1', destination: dest, travelmode: 'walking' });
  return `https://www.google.com/maps/dir/?${params}`;
}

export function formatCoords({ latitude, longitude }) {
  const lat = `${Math.abs(latitude).toFixed(5)}° ${latitude >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(longitude).toFixed(5)}° ${longitude >= 0 ? 'E' : 'W'}`;
  return { lat, lng };
}
