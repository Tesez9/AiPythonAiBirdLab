jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
)

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const React = jest.requireActual('react')
  const { Text } = jest.requireActual('react-native')

  return function MockIcon({ name }: { name: string }) {
    return React.createElement(Text, null, name)
  }
})

jest.setTimeout(15000)
