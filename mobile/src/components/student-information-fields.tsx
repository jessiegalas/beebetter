import { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { BeeBetterColors as C } from '@/constants/theme';
import { PROGRAMS, YEARS, LIMITS, cleanName, cleanStudentNumber, normalizeProgram, normalizeYear, type StudentFields, type EnrollmentOption, type StudentErrors } from '@/lib/student-validation';

export function StudentInformationFields({ value, onChange, options, errors, loading, loadError, onRetry, original }: {
  value: StudentFields; onChange: (value: StudentFields) => void; options: EnrollmentOption[]; errors: StudentErrors; loading: boolean; loadError: string | null; onRetry: () => void; original?: StudentFields;
}) {
  const [touched, setTouched] = useState<Partial<Record<keyof StudentFields, boolean>>>({});
  const [other, setOther] = useState(() => !!value.course && !(PROGRAMS as readonly string[]).includes(normalizeProgram(value.course)));
  const update = (field: keyof StudentFields, text: string) => {
    setTouched(previous => ({ ...previous, [field]: true }));
    onChange({ ...value, [field]: text, ...(['course', 'year_level', 'campus'].includes(field) ? { section: '' } : {}) });
  };
  const message = (field: keyof StudentFields) => (touched[field] || !!value[field]) && errors[field] ? <ThemedText style={s.error} accessibilityLiveRegion="polite">{errors[field]}</ThemedText> : null;
  const textField = (field: 'name' | 'student_number' | 'goal' | 'course', label: string, placeholder: string) => <View style={s.field}>
    <ThemedText style={s.label}>{label} *</ThemedText>
    <TextInput accessibilityLabel={label + ', required'} value={value[field]} onChangeText={text => update(field, field === 'name' ? cleanName(text) : field === 'student_number' ? cleanStudentNumber(text) : text)} onBlur={() => setTouched(previous => ({ ...previous, [field]: true }))} maxLength={LIMITS[field]} keyboardType={field === 'student_number' ? 'number-pad' : 'default'} autoCapitalize={field === 'student_number' ? 'none' : 'words'} autoCorrect={false} style={[s.input, errors[field] && touched[field] && s.invalid]} placeholder={placeholder} placeholderTextColor={C.muted} />
    {message(field)}
    {field === 'name' && <ThemedText style={s.hint}>Up to 30 characters</ThemedText>}
    {field === 'student_number' && <ThemedText style={s.hint}>Exactly 9 digits</ThemedText>}
  </View>;
  const legacyOption = (field: 'course' | 'year_level' | 'campus' | 'section', choices: string[]) => original?.[field] === value[field] && value[field] && !choices.includes(value[field]) ? [value[field], ...choices] : choices;
  const campuses = legacyOption('campus', Array.from(new Set(options.map(o => o.campus))).sort());
  const sections = legacyOption('section', Array.from(new Set(options.filter(o => o.course === normalizeProgram(value.course) && o.year_level === normalizeYear(value.year_level) && o.campus === value.campus).map(o => o.section))).sort());
  return <View style={s.form}>
    <ThemedText style={s.hint}>* Required. Use your official student information.</ThemedText>
    {textField('name', 'Full name', 'e.g. Maria Dela Cruz')}
    {textField('student_number', 'Student number', '202311197')}
    <StudentSelect label="Course / Program" value={other ? 'Others' : normalizeProgram(value.course)} options={[...PROGRAMS, 'Others']} onChange={text => { setOther(text === 'Others'); update('course', text === 'Others' ? '' : text); }} />
    {other ? textField('course', 'Specify program', 'e.g. BSEd') : message('course')}
    <StudentSelect label="Year level" value={value.year_level} options={legacyOption('year_level', [...YEARS])} onChange={text => update('year_level', text)} />{message('year_level')}
    {loading && <ActivityIndicator color={C.honeyDark} />}
    {!!loadError && <View><ThemedText style={s.error}>{loadError}</ThemedText><TouchableOpacity style={s.button} accessibilityRole="button" onPress={onRetry}><ThemedText>Try again</ThemedText></TouchableOpacity></View>}
    {!loading && !loadError && !options.length && <ThemedText style={s.hint}>Campus and section options are not available yet. Please contact your school administrator.</ThemedText>}
    <StudentSelect label="Campus" value={value.campus} options={campuses} onChange={text => update('campus', text)} />{message('campus')}
    <StudentSelect label="Section" value={value.section} options={sections} onChange={text => update('section', text)} emptyText={value.course && value.year_level && value.campus ? 'No sections available for this combination. Contact your school administrator.' : 'Choose your program, year and campus first.'} />{message('section')}
    {textField('goal', 'Your goal', 'What would you like to improve?')}
  </View>;
}
export function StudentSelect({ label, value, options, onChange, emptyText = 'No options available yet.' }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void; emptyText?: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = options.filter(option => option.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <View style={s.field}><ThemedText style={s.label}>{label} *</ThemedText>
    <TouchableOpacity style={[s.input, s.row]} accessibilityRole="button" accessibilityLabel={label + ', ' + (value || 'choose an option')} accessibilityState={{ expanded: open }} onPress={() => { setSearch(''); setOpen(true); }}><ThemedText style={s.copy}>{value || 'Choose ' + label.toLowerCase()}</ThemedText><Ionicons name="chevron-down" size={18} color={C.muted} /></TouchableOpacity>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}><KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><SafeAreaView style={s.sheet} edges={['bottom']} accessibilityViewIsModal>
      <View style={s.row}><ThemedText style={[s.label, s.copy]}>Choose {label.toLowerCase()}</ThemedText><TouchableOpacity style={s.button} accessibilityRole="button" accessibilityLabel="Close options" onPress={() => setOpen(false)}><Ionicons name="close" size={24} color={C.ink} /></TouchableOpacity></View>
      {options.length > 6 && <TextInput style={s.input} placeholder="Search options" accessibilityLabel={'Search ' + label} value={search} onChangeText={setSearch} maxLength={80} autoCorrect={false} />}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.list}>
        {filtered.map(option => <TouchableOpacity key={option} style={[s.option, value === option && s.selected]} accessibilityRole="button" accessibilityState={{ selected: value === option }} onPress={() => { onChange(option); setOpen(false); }}><ThemedText style={s.copy}>{option}</ThemedText>{value === option && <Ionicons name="checkmark" size={18} color={C.honeyDeep} />}</TouchableOpacity>)}
        {!filtered.length && <ThemedText style={s.hint}>{options.length ? 'No matching options.' : emptyText}</ThemedText>}
      </ScrollView>
    </SafeAreaView></KeyboardAvoidingView></Modal>
  </View>;
}
const s = StyleSheet.create({
  form: { gap: 12, marginBottom: 16 }, field: { gap: 5 }, label: { fontSize: 12, lineHeight: 18, fontWeight: '800', color: C.ink },
  hint: { fontSize: 12, lineHeight: 18, color: C.muted }, error: { fontSize: 12, lineHeight: 18, color: C.danger },
  input: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.surfaceMuted, color: C.ink, fontSize: 14 }, invalid: { borderColor: C.danger },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, copy: { flex: 1, color: C.ink, fontSize: 14 },
  button: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(45,36,29,0.35)' },
  sheet: { maxHeight: '85%', padding: 20, backgroundColor: C.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, width: '100%', maxWidth: 640, alignSelf: 'center' },
  list: { gap: 8, paddingVertical: 12 }, option: { minHeight: 48, padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card }, selected: { backgroundColor: C.honeySoft },
});
