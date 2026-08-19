import { createContext, useContext } from 'react'

const TurnoContext = createContext(null)

export function TurnoProvider({ turno, children }) {
  return <TurnoContext.Provider value={turno}>{children}</TurnoContext.Provider>
}

// turno = { id, codice, nome, attivo }
export function useTurno() {
  return useContext(TurnoContext)
}
