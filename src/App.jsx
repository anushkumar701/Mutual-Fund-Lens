// App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import Footer from './components/Footer';
import BackToTop from './components/BackToTop';
import Dashboard from './pages/Dashboard';
import Screener from './pages/Screener';
import Compare from './pages/Compare';
import SIPCalculator from './pages/SIPCalculator';
import { ToastProvider } from './components/Toast';

// Apply theme immediately before first paint
const savedTheme = localStorage.getItem('fundlens_theme');
if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <NavBar />
        <main className="md:mt-16 mt-14 min-h-screen flex flex-col">
          <div className="flex-1">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/screener" element={<Screener />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/sip" element={<SIPCalculator />} />
            </Routes>
          </div>
          <Footer />
        </main>
        <BackToTop />
      </BrowserRouter>
    </ToastProvider>
  );
}

