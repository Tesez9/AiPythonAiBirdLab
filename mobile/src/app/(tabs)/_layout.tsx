import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Tabs } from 'expo-router/js-tabs'

import { colors } from '@/lib/theme'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              color={typeof color === 'string' ? color : colors.primary}
              name="bird"
              size={size}
            />
          ),
          title: 'Аналіз',
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              color={typeof color === 'string' ? color : colors.primary}
              name="history"
              size={size}
            />
          ),
          title: 'Історія',
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              color={typeof color === 'string' ? color : colors.primary}
              name="chart-box-outline"
              size={size}
            />
          ),
          title: 'Статистика',
        }}
      />
    </Tabs>
  )
}
