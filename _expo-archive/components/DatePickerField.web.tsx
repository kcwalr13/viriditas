// components/DatePickerField.web.tsx
// Web-specific date picker field.
// Expo/Metro automatically uses this file instead of DatePickerField.tsx for web builds.
//
// Approach: a styled TouchableOpacity shows the formatted date. Underneath it sits a
// transparent native <input type="date"> that covers the same area. When the user taps
// anywhere on the row, the browser's built-in date picker opens.
//
// This gives the same native calendar picker experience on every browser
// without any extra libraries.

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

interface Props {
  label?: string
  value: string            // YYYY-MM-DD, or '' if not set
  onChange: (date: string) => void  // called with YYYY-MM-DD string
  placeholder?: string
}

// Formats a YYYY-MM-DD string for human-readable display, e.g. "March 15, 2024".
// T12:00:00 prevents midnight UTC shifting to the previous local day.
function formatDisplay(ymd: string): string {
  if (!ymd) return ''
  return new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function DatePickerField({ value, onChange, placeholder = 'Select a date' }: Props) {
  const displayText = value ? formatDisplay(value) : ''

  return (
    // `overflow: 'hidden'` so the transparent <input> doesn't bleed outside the border radius
    <View style={styles.wrapper}>
      {/* Visible styled row */}
      <View style={styles.trigger} pointerEvents="none">
        <Text style={displayText ? styles.dateText : styles.placeholderText}>
          {displayText || placeholder}
        </Text>
        <Text style={styles.icon}>📅</Text>
      </View>

      {/*
        Transparent native date input layered on top of the visible row.
        react-native-web maps <input> props through to the DOM element,
        so `type`, `value`, and `onChange` work as regular HTML attributes.
        opacity: 0 hides the browser default styling while keeping it clickable.
      */}
      {/* @ts-expect-error — we're intentionally rendering a web-native <input> here */}
      <input
        type="date"
        value={value || ''}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
          // Remove default appearance so it doesn't peek through on some browsers
          border: 'none',
          background: 'transparent',
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 20,
    position: 'relative', // needed for the absolute-positioned input overlay
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  dateText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  placeholderText: {
    fontSize: 16,
    color: '#aaa',
    flex: 1,
  },
  icon: {
    fontSize: 18,
    marginLeft: 8,
  },
})
