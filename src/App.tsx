import SurprisePage from '@/features/exams/SurprisePage';
import SuggestionPage from '@/features/suggestions/SuggestionPage';
import SuggestionsListPage from '@/features/suggestions/SuggestionsListPage';
import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import SharedExamPage, { RETURN_KEY } from '@/features/share/SharedExamPage';
import SharedFolderPage from '@/features/share/SharedFolderPage';
import SharedLinksPage from '@/features/share/SharedLinksPage';
import { useSession } from '@/lib/useSession';
import Layout from '@/components/Layout';
import AuthPage from '@/features/auth/AuthPage';
import HomePage from '@/features/exams/HomePage';
import LibraryPage from '@/features/exams/LibraryPage';
import FolderPage from '@/features/exams/FolderPage';
import EditExamPage from '@/features/exams/EditExamPage';
import ImportPage from '@/features/import/ImportPage';
import JsonImportPage from '@/features/import/JsonImportPage';
import PracticePage from '@/features/practice/PracticePage';
import ResultsPage from '@/features/results/ResultsPage';
import ReviewPage from '@/features/results/ReviewPage';
import StatsPage from '@/features/stats/StatsPage';
import ProfilePage from '@/features/profile/ProfilePage';
import FlashcardsPage from '@/features/flashcards/FlashcardsPage';
import StudyPage from '@/features/flashcards/StudyPage';

export default function App() {
  const { session, loading } = useSession();
  const nav = useNavigate();
  const loc = useLocation();

  // Si alguien se registró desde un enlace compartido, después de entrar vuelve a ese enlace
  useEffect(() => {
    if (!session) return;
    try {
      const to = localStorage.getItem(RETURN_KEY);
      if (to) {
        localStorage.removeItem(RETURN_KEY);
        if ((to.startsWith('/s/') || to.startsWith('/b/')) && loc.pathname !== to) nav(to, { replace: true });
      }
    } catch {
      /* nada */
    }
  }, [session, nav, loc.pathname]);

  // Los enlaces compartidos se pueden abrir SIN iniciar sesión
  if (loc.pathname.startsWith('/s/') || loc.pathname.startsWith('/b/')) {
    return (
      <Routes>
        <Route path="/s/:shortId" element={<SharedExamPage session={session} sessionLoading={loading} />} />
        <Route path="/b/:shortId" element={<SharedFolderPage session={session} sessionLoading={loading} />} />
      </Routes>
    );
  }
  if (loading) return <p className="p-6">Cargando…</p>;
  if (!session) return <AuthPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="flashcards" element={<FlashcardsPage />} />
        <Route path="folders/:folderId" element={<FolderPage />} />
        <Route path="exams/:examId/edit" element={<EditExamPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="surprise" element={<SurprisePage />} />
        <Route path="new" element={<ImportPage />} />
        <Route path="import-json" element={<JsonImportPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="shared" element={<SharedLinksPage />} />
        <Route path="suggestions" element={<SuggestionsListPage />} />
        <Route path="suggestions/:id" element={<SuggestionPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="practice/:examId" element={<PracticePage />} />
      <Route path="flashcards/study" element={<StudyPage />} />
      <Route path="results" element={<ResultsPage />} />
      <Route path="suggestion" element={<SuggestionPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
