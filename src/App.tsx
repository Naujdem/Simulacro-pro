import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from '@/lib/useSession';
import Layout from '@/components/Layout';
import AuthPage from '@/features/auth/AuthPage';
import HomePage from '@/features/exams/HomePage';
import LibraryPage from '@/features/exams/LibraryPage';
import ImportPage from '@/features/import/ImportPage';
import PracticePage from '@/features/practice/PracticePage';
import ResultsPage from '@/features/results/ResultsPage';
import StatsPage from '@/features/stats/StatsPage';
import ProfilePage from '@/features/profile/ProfilePage';

export default function App() {
  const { session, loading } = useSession();
  if (loading) return <p className="p-6">Cargando…</p>;
  if (!session) return <AuthPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="new" element={<ImportPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="practice/:examId" element={<PracticePage />} />
      <Route path="results" element={<ResultsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
