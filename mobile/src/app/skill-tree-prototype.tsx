import { useMemo } from 'react';
import { useUserData } from '@/hooks/use-user-data';
import ForestPrototype from '@/prototypes/skill-tree/forest-prototype';
import { createProofSource } from '@/prototypes/skill-tree/proof-roots-data';
import { supabase } from '@/supabase';

export default function SkillTreePrototypeScreen() {
  const { user, access } = useUserData();
  const owner = access === 'active' ? user?.id : undefined;
  const source = useMemo(() => owner ? createProofSource(supabase, owner) : undefined, [owner]);

  return owner && source ? <ForestPrototype key={owner} source={source} /> : null;
}
