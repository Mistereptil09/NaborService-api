import { createContext, useContext } from 'react'

export interface AppState {
  jwt: string | null
  baseUrl: string
}

interface AppContextValue {
  appState: AppState
  setAppState: React.Dispatch<React.SetStateAction<AppState>>
}

export const AppContext = createContext<AppContextValue>({
  appState: { jwt: null, baseUrl: 'http://localhost:3000' },
  setAppState: () => {},
})

export function useAppContext() {
  return useContext(AppContext)
}
