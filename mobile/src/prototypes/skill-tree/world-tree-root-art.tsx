import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ArtPixelDp, Pixel } from '@/constants/tokens';

const bark = Pixel.worldTree;

export function rootNodeLayout(width: number, index: number, largeText: boolean) {
  const axis = Math.floor(width / (2 * ArtPixelDp)) * ArtPixelDp;
  const centered = largeText || width < 320;
  const sideClearance = centered ? 36 : 198;
  const nodeWidth = Math.min(centered ? 288 : 144, Math.floor((width - sideClearance) / 6) * 6);
  const side = centered ? 0 : index % 2 === 0 ? -1 : 1;
  return { axis, side, nodeWidth, left: axis + 84 * side - nodeWidth / 2 };
}

export function RootStem({ axis, top = 0, end = false }: { axis: number; top?: number; end?: boolean }) {
  return <View pointerEvents="none" accessible={false} aria-hidden
    style={[styles.stem, { left: axis - 6, top, bottom: end ? 12 : 0 }]}>
    <View style={styles.grain} />
  </View>;
}

export function RootKnot({ axis, top, side = 0 }: { axis: number; top: number; side?: number }) {
  const left = side < 0 ? axis - 24 : axis - 9;
  const fork = side < 0 ? 'M0 18H9V12H15V6H24V18H15V24H0Z'
    : 'M6 6H15V12H21V18H33V24H18V18H12V15H6Z';
  return <Svg pointerEvents="none" accessible={false} aria-hidden width={side === 0 ? 18 : 33} height={30}
    style={{ position: 'absolute', left, top }} viewBox={side === 0 ? '0 0 18 30' : '0 0 33 30'}>
    {side !== 0 && <Path d={fork} fill={bark.barkShade} />}
    <Path d={side < 0 ? 'M18 3H30V9H33V18H30V27H21V21H15V12H18Z'
      : 'M3 3H15V9H18V18H15V27H6V21H0V12H3Z'} fill={bark.barkMid} />
    <Path d={side < 0 ? 'M21 6H27V12H24V18H21Z' : 'M6 6H12V12H9V18H6Z'} fill={bark.barkLight} />
  </Svg>;
}

const styles = StyleSheet.create({
  stem: { position: 'absolute', width: 12, backgroundColor: bark.barkShade },
  grain: { position: 'absolute', left: 3, width: 3, top: 0, bottom: 0, backgroundColor: bark.barkMid },
});
