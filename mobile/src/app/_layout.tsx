import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

import { colors } from '@/lib/theme'

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
          headerShown: false,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="analysis/[id]" />
      </Stack>
    </>
  )
}
