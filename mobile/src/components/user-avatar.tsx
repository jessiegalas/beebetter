import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Text } from '@/components/ui/text';
import { Typography, useBeePalette } from '@/constants/theme';

export function UserAvatar({ uri, name = 'Explorer', size = 40 }: { uri?: string; name?: string; size?: number }) {
  const c = useBeePalette();
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase() || 'E';
  return <Avatar alt={name + "'s avatar"} style={{ width: size, height: size }}>
    {uri ? <AvatarImage key={uri} source={{ uri }} /> : null}
    <AvatarFallback style={{ backgroundColor: c.surfaceMuted }}>
      <Text style={[Typography.label, { color: c.foreground }]}>{initials}</Text>
    </AvatarFallback>
  </Avatar>;
}
