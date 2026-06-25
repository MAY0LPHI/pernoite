import "@/App.css";
import { HashRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import HomePage from "@/pages/HomePage";
import SessionPage from "@/pages/SessionPage";
import ScanPage from "@/pages/ScanPage";
import ReviewPage from "@/pages/ReviewPage";
import HistoryPage from "@/pages/HistoryPage";
import HistoryDetailPage from "@/pages/HistoryDetailPage";
import SectorsManagePage from "@/pages/SectorsManagePage";
import BatchScanPage from "@/pages/BatchScanPage";

function App() {
  return (
    <div className="App grain-bg min-h-screen text-foreground">
      <HashRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/session/:id" element={<SessionPage />} />
          <Route path="/session/:id/sector/:sectorId" element={<ScanPage />} />
          <Route path="/session/:id/sector/:sectorId/batch" element={<BatchScanPage />} />
          <Route path="/session/:id/review" element={<ReviewPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:id" element={<HistoryDetailPage />} />
          <Route path="/sectors" element={<SectorsManagePage />} />
        </Routes>
      </HashRouter>
      <Toaster richColors position="top-center" theme="dark" />
    </div>
  );
}

export default App;
