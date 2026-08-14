import { createContext, useContext } from 'react'

const ModeContext = createContext({ agency: false })

// agency=true: stessa app, ma senza alcun accesso all'Anagrafica.
// Niente login diverso: solo un percorso URL diverso (/agenzia) che attiva questa modalità.
export function ModeProvider({ agency, children }) {
  return <ModeContext.Provider value={{ agency }}>{children}</ModeContext.Provider>
}

export function useMode() {
  const { agency } = useContext(ModeContext)
  return {
    agency,
    homePath: agency ? '/agenzia' : '/',
    transferPath: id => (agency ? '/agenzia/t/' + id : '/t/' + id),
  }
}
