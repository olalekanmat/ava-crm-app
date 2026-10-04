import { Redirect } from 'expo-router';

/** Google and Microsoft send people back here after sign-in; the sign-in screen takes it from there. */
export default function OAuthRedirect() {
  return <Redirect href="/" />;
}
