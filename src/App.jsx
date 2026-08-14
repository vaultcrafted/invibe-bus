import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Transfer from './pages/Transfer'
import Share from './pages/Share'
import Roster from './pages/Roster'
import { ModeProvider } from './lib/mode.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/share/:id" element={<Share />} />
      <Route path="/" element={<ModeProvider agency={false}><Home /></ModeProvider>} />
      <Route path="/t/:id" element={<ModeProvider agency={false}><Transfer /></ModeProvider>} />
      <Route path="/roster" element={<Roster />} />
      <Route path="/agenzia" element={<ModeProvider agency={true}><Home /></ModeProvider>} />
      <Route path="/agenzia/t/:id" element={<ModeProvider agency={true}><Transfer /></ModeProvider>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
