// components/DatePickerField.tsx
// Cross-platform date picker field for iOS and Android.
// On Android: opens the system date picker dialog imperatively (no visible component while closed).
// On iOS: shows an inline spinner picker below the trigger button.
//
// The `value` and `onChange` always use YYYY-MM-DD strings — the same format
// the database stores. The component handles converting to/from JS Date internally.
//
// The .web.tsx sibling handles the web browser case.

import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { useState } from 'react'
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

interface Props {
  label?: string
  value: string           // YYYY-MM-DD, or '' if not set
  onChange: (date: string) => void  // called with YYYY-MM-DD string
  placeholder?: string
}

// Converts a Date object → "YYYY-MM-DD" string in local time.
// We use local-time methods (not toISOString) to avoid off-by-one-day
// bugs at timezone boundaries.
function toYMD(date: Date): string {
  const yyyy = date.getFullYear()
  const mm   = String(date.getMonth() + 1).padStart(2, '0')
  const dd   = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Formats a YYYY-MM-DD string for human-readable display, e.g. "March 15, 2024".
// We append T12:00:00 to avoid midnight UTC being shifted to the previous day
// in some timezones when the Date constructor parses a date-only string.
function formatDisplay(ymd: string): string {
  if (!ymd) return ''
  return new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function DatePickerField({ value, onChange, placeholder = 'Select a date' }: Props) {
  // iOS only — controls whether the inline spinner is visible
  const [showIOSPicker, setShowIOSPicker] = useState(false)

  // The Date object used by the picker. Falls back to today if no value set.
  const pickerDate = value ? new Date(`${value}T12:00:00`) : new Date()

  function handlePress() {
    if (Platform.OS === 'android') {
      // Android uses an imperative API — no JSX needed, just open a dialog.
      DateTimePickerAndroid.open({
        value: pickerDate,
        mode: 'date',
        is24Hour: true,
        onChange: (_event, date) => {
          if (_event.type === 'set' && date) {
            onChange(toYMD(date))
          }
        },
      })
    } else {
      // iOS: toggle the inline picker
      setShowIOSPicker(prev => !prev)
    }
  }

  const displayText = value ? formatDisplay(value) : ''

  return (
    <View>
      {/* Tappable row showing the formatted date (or placeholder) */}
      <TouchableOpacity style={styles.trigger} onPress={handlePress} activeOpacity={0.7}>
        <Text style={displayText ? styles.dateText : styles.placeholderText}>
          {displayText || placeholder}
        </Text>
        <Text style={styles.icon}>📅</Text>
      </TouchableOpacity>

      {/* iOS only: inline spinner that appears below the trigger when open */}
      {Platform.OS === 'ios' && showIOSPicker && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="spinner"
          onChange={(_event, date) => {
            // On iOS, onChange fires on every scroll tick.
            // Only commit and close when the user taps "Done" (type === 'set').
            if (_event.type === 'set' && date) {
              onChange(toYMD(date))
              setShowIOSPicker(false)
            } else if (_event.type === 'dismissed') {
              setShowIOSPicker(false)
            }
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
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
