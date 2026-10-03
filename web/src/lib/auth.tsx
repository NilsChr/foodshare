import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { pb, type User } from './pb'

const AuthContext = createContext<User | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(pb.authStore.isValid ? (pb.authStore.record as User) : null)

  useEffect(() => {
    const off = pb.authStore.onChange(() => setUser(pb.authStore.isValid ? (pb.authStore.record as User) : null))
    // Refresh the token (and user record) on start; drop it if the server rejects it.
    if (pb.authStore.isValid) pb.collection('users').authRefresh().catch(() => pb.authStore.clear())
    return off
  }, [])

  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>
}

export function useUser() {
  return useContext(AuthContext)
}

/** Use inside authenticated routes only. */
export function useMe() {
  const user = useContext(AuthContext)
  if (!user) throw new Error('Not signed in')
  return user
}
