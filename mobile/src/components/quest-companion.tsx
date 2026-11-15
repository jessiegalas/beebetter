import { Image } from 'react-native';

const poses = {
  adventure: require('../../assets/pixel/companion/adventure.png'),
  resting: require('../../assets/pixel/companion/resting.png'),
};

export function QuestCompanion({ pose }: { pose: keyof typeof poses }) {
  return <Image source={poses[pose]} resizeMode="contain" style={{ width: 72, height: 72 }}
    accessible={false} aria-hidden resizeMethod="scale" />;
}
