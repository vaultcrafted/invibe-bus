# Invibe Bus

Assegnazione dei gruppi ai bus per i transfer Invibe.

- **Login**: stesse credenziali della Staff App (Supabase auth condiviso).
- **Flusso**: crea un transfer → importa l'Excel (colonna A codice prenotazione,
  B pickup point, C pax) → aggiungi i bus scegliendo il taglio → seleziona i
  gruppi e assegnali; il contatore posti scala in tempo reale.
- **Divisione gruppo**: selezionando un solo gruppo che non ci sta, l'app
  propone di dividerlo tra due bus.
- **Link agenzia**: "Condividi" attiva un link `/share/{id}` in sola lettura,
  senza login, con liste per bus stampabili e aggiornate live (RLS: gli anonimi
  leggono solo i transfer con `condiviso = true`).
- **Export**: Excel con un foglio per bus + foglio "Non assegnati".

## Stack
React + Vite (PWA) · Supabase `kiqghrxygraijcozdmkp` (tabelle `bus_transfer`,
`bus_gruppi`, `bus_mezzi`, `bus_assegnazioni`, realtime attivo) · Vercel.

## Build
```
npm install && npx vite build
```
