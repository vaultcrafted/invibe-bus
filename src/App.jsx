import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Transfer from './pages/Transfer'
import Share from './pages/Share'
import Roster from './pages/Roster'

export default function App() {
  return (
    <Routes>
      <Route path="/share/:id" element={<Share />} />
      <Route path="/" element={<Home />} />
      <Route path="/t/:id" element={<Transfer />} />
      <Route path="/roster" element={<Roster />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
