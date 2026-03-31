// components/PageContainer.tsx
// A layout wrapper that constrains content width on wide desktop screens.
//
// On mobile (iOS/Android), this renders as a transparent passthrough —
// no visual change, no layout impact.
//
// On web, it centers content horizontally and caps it at 600px so the app
// doesn't look stretched across a 1440px desktop monitor. This gives the
// app a clean, app-like feel even when accessed via browser.

import { View, StyleSheet, Platform } from 'react-native'
import { ReactNode } from 'react'

type Props = {
  children: ReactNode
}

export default function PageContainer({ children }: Props) {
  // On native, render children directly with no wrapper overhead
  if (Platform.OS !== 'web') {
    return <>{children}</>
  }

  // On web, center within a full-height column and cap the width
  return (
    <View style={styles.outer}>
      <View style={styles.inner}>
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: 'center',   // center the inner container horizontally
    backgroundColor: '#fff',
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: 800,          // comfortable reading width on desktop
  },
})
