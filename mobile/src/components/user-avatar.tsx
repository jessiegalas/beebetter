import { useState } from 'react';
import { Image, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Radii, useBeePalette } from '@/constants/theme';

export function UserAvatar({ uri, size = 40 }: { uri?: string; size?: number }) {
  const c = useBeePalette();
  const [failedUri, setFailedUri] = useState<string>();
  return <View accessible={false} style={{ width: size, height: size, borderRadius: Radii.pill, overflow: 'hidden', backgroundColor: c.surfaceMuted }}>
    {uri && failedUri !== uri ? <Image source={{ uri }} resizeMode="cover" style={{ width: size, height: size }} onError={() => setFailedUri(uri)} /> :
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Circle cx="20" cy="13" r="7" fill={c.foreground} />
        <Path d="M8 34v-2a12 12 0 0 1 24 0v2Z" fill={c.foreground} />
      </Svg>}
  </View>;
}
