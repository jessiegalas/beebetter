import { Redirect } from 'expo-router';

export default function WellnessCheckInLink() {
  return <Redirect href={{ pathname: '/', params: { checkIn: '1' } }} />;
}
