import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  FileUp,
  Layers,
  Lock,
  LogOut,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  Language,
  MAX_WORD_LENGTH,
  MIN_WORD_LENGTH,
  ManagedWord,
  WordBankStats,
  WordDifficulty,
  WordInput,
  normalizeWord,
  validateWordInput,
} from '@drawsomething/shared';
import {
  AdminUnauthorizedError,
  BulkCreateResult,
  adminBulkCreateWords,
  adminCheckSession,
  adminCreateWord,
  adminDeleteWord,
  adminListWords,
  adminLogin,
  adminResetWords,
  adminUpdateWord,
  clearStoredAdminToken,
  getStoredAdminToken,
} from '../api/adminApi';

interface AdminPageProps {
  onBackToGame: () => void;
}

const EMPTY_STATS: WordBankStats = {
  total: 0,
  byLanguage: {
    es: { easy: 0, hard: 0, total: 0 },
    en: { easy: 0, hard: 0, total: 0 },
  },
  categories: {
    es: [],
    en: [],
  },
};

export const AdminPage: React.FC<AdminPageProps> = ({ onBackToGame }) => {
  // Auth state
  const [checkingSession, setCheckingSession] = useState(() =>
    Boolean(getStoredAdminToken())
  );
  const [authenticated, setAuthenticated] = useState(false);
  const [usingDefaultPassword, setUsingDefaultPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Word bank state
  const [words, setWords] = useState<ManagedWord[]>([]);
  const [stats, setStats] = useState<WordBankStats>(EMPTY_STATS);
  const [loadingWords, setLoadingWords] = useState(false);

  // Filters
  const [filterLanguage, setFilterLanguage] = useState<Language | ''>('');
  const [filterDifficulty, setFilterDifficulty] = useState<WordDifficulty | ''>(
    ''
  );
  const [filterCategory, setFilterCategory] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Create / Edit modal state
  const [wordModalOpen, setWordModalOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<ManagedWord | null>(null);
  const [formWord, setFormWord] = useState('');
  const [formLanguage, setFormLanguage] = useState<Language>('es');
  const [formDifficulty, setFormDifficulty] = useState<WordDifficulty>('easy');
  const [formCategory, setFormCategory] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [savingWord, setSavingWord] = useState(false);

  // Bulk import modal state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkLanguage, setBulkLanguage] = useState<Language>('es');
  const [bulkDifficulty, setBulkDifficulty] = useState<WordDifficulty>('easy');
  const [bulkCategory, setBulkCategory] = useState('General');
  const [bulkText, setBulkText] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkCreateResult | null>(null);

  // Confirmation modals
  const [deleteTarget, setDeleteTarget] = useState<ManagedWord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (type: 'success' | 'error', message: string) => {
      setToast({ type, message });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(null), 3200);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleUnauthorized = useCallback(() => {
    clearStoredAdminToken();
    setAuthenticated(false);
    setWords([]);
    setStats(EMPTY_STATS);
    setLoginError('Tu sesión expiró. Vuelve a iniciar sesión.');
  }, []);

  // Verify existing session token on mount
  useEffect(() => {
    const token = getStoredAdminToken();
    if (!token) {
      setCheckingSession(false);
      return;
    }
    let cancelled = false;
    void adminCheckSession()
      .then((res) => {
        if (cancelled) return;
        setAuthenticated(true);
        setUsingDefaultPassword(res.usingDefaultPassword);
      })
      .catch(() => {
        if (cancelled) return;
        clearStoredAdminToken();
        setAuthenticated(false);
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 180);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchWords = useCallback(async () => {
    if (!authenticated) return;
    setLoadingWords(true);
    try {
      const res = await adminListWords({
        language: filterLanguage,
        difficulty: filterDifficulty,
        category: filterCategory,
        search: debouncedSearch,
      });
      setWords(res.words);
      setStats(res.stats);
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        handleUnauthorized();
      } else {
        showToast(
          'error',
          err instanceof Error ? err.message : 'No se pudieron cargar las palabras.'
        );
      }
    } finally {
      setLoadingWords(false);
    }
  }, [
    authenticated,
    filterLanguage,
    filterDifficulty,
    filterCategory,
    debouncedSearch,
    handleUnauthorized,
    showToast,
  ]);

  useEffect(() => {
    void fetchWords();
  }, [fetchWords]);

  const availableCategories = useMemo(() => {
    if (filterLanguage === 'es') return stats.categories.es;
    if (filterLanguage === 'en') return stats.categories.en;
    return Array.from(
      new Set([...stats.categories.es, ...stats.categories.en])
    ).sort((a, b) => a.localeCompare(b, 'es'));
  }, [filterLanguage, stats]);

  const totalCategoryCount = useMemo(() => {
    return new Set([...stats.categories.es, ...stats.categories.en]).size;
  }, [stats]);

  // Reset selected category if it does not exist in newly selected language
  useEffect(() => {
    if (filterCategory && !availableCategories.includes(filterCategory)) {
      setFilterCategory('');
    }
  }, [availableCategories, filterCategory]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) {
      setLoginError('Ingresa la contraseña de administrador.');
      return;
    }
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await adminLogin(passwordInput);
      setAuthenticated(true);
      setUsingDefaultPassword(res.usingDefaultPassword);
      setPasswordInput('');
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : 'No se pudo iniciar sesión.'
      );
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    clearStoredAdminToken();
    setAuthenticated(false);
    setWords([]);
    setStats(EMPTY_STATS);
    setPasswordInput('');
    setLoginError(null);
  };

  const openCreateModal = () => {
    setEditingWord(null);
    setFormWord('');
    setFormLanguage(filterLanguage || 'es');
    setFormDifficulty(filterDifficulty || 'easy');
    setFormCategory(filterCategory || '');
    setFormError(null);
    setWordModalOpen(true);
  };

  const openEditModal = (word: ManagedWord) => {
    setEditingWord(word);
    setFormWord(word.word);
    setFormLanguage(word.language);
    setFormDifficulty(word.difficulty);
    setFormCategory(word.category);
    setFormError(null);
    setWordModalOpen(true);
  };

  const handleSaveWord = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: WordInput = {
      word: formWord,
      category: formCategory,
      language: formLanguage,
      difficulty: formDifficulty,
    };

    const validation = validateWordInput(payload);
    if (!validation.ok) {
      setFormError(validation.error);
      return;
    }

    setSavingWord(true);
    setFormError(null);
    try {
      if (editingWord) {
        const res = await adminUpdateWord(editingWord.id, payload);
        setStats(res.stats);
        showToast('success', `Palabra "${res.word.word}" actualizada.`);
      } else {
        const res = await adminCreateWord(payload);
        setStats(res.stats);
        showToast('success', `Palabra "${res.word.word}" agregada.`);
      }
      setWordModalOpen(false);
      await fetchWords();
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        setWordModalOpen(false);
        handleUnauthorized();
      } else {
        setFormError(
          err instanceof Error ? err.message : 'Error al guardar la palabra.'
        );
      }
    } finally {
      setSavingWord(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await adminDeleteWord(deleteTarget.id);
      setStats(res.stats);
      setDeleteTarget(null);
      showToast('success', `Palabra "${res.deleted.word}" eliminada.`);
      await fetchWords();
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        setDeleteTarget(null);
        handleUnauthorized();
      } else {
        showToast(
          'error',
          err instanceof Error ? err.message : 'No se pudo eliminar la palabra.'
        );
      }
    } finally {
      setDeleting(false);
    }
  };

  const openBulkModal = () => {
    setBulkLanguage(filterLanguage || 'es');
    setBulkDifficulty(filterDifficulty || 'easy');
    setBulkCategory(filterCategory || (filterLanguage === 'en' ? 'Objects' : 'Objetos'));
    setBulkText('');
    setBulkError(null);
    setBulkResult(null);
    setBulkModalOpen(true);
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setBulkError('Escribe o pega al menos una palabra (una por línea).');
      return;
    }

    const defaultCat = bulkCategory.trim() || 'General';
    const items: WordInput[] = lines.map((line) => {
      const commaIdx = line.indexOf(',');
      if (commaIdx !== -1) {
        const rawWord = line.slice(0, commaIdx).trim();
        const rawCat = line.slice(commaIdx + 1).trim();
        return {
          word: rawWord,
          category: rawCat || defaultCat,
          language: bulkLanguage,
          difficulty: bulkDifficulty,
        };
      }
      return {
        word: line,
        category: defaultCat,
        language: bulkLanguage,
        difficulty: bulkDifficulty,
      };
    });

    setBulkLoading(true);
    setBulkError(null);
    try {
      const res = await adminBulkCreateWords(items);
      setBulkResult(res);
      setStats(res.stats);
      showToast(
        'success',
        `Importación completada: ${res.added.length} agregadas, ${res.skipped.length} omitidas.`
      );
      await fetchWords();
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        setBulkModalOpen(false);
        handleUnauthorized();
      } else {
        setBulkError(
          err instanceof Error ? err.message : 'Error al importar las palabras.'
        );
      }
    } finally {
      setBulkLoading(false);
    }
  };

  const handleResetDefaults = async () => {
    setResetting(true);
    try {
      const res = await adminResetWords();
      setStats(res.stats);
      setResetModalOpen(false);
      showToast('success', 'Banco de palabras restaurado al catálogo inicial.');
      await fetchWords();
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        setResetModalOpen(false);
        handleUnauthorized();
      } else {
        showToast(
          'error',
          err instanceof Error
            ? err.message
            : 'No se pudo restaurar el banco de palabras.'
        );
      }
    } finally {
      setResetting(false);
    }
  };

  // Live preview for Create/Edit modal
  const previewNormalized = normalizeWord(formWord);
  const hasInvalidChars =
    formWord.trim().length > 0 &&
    !/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/.test(formWord.trim());
  const previewLengthOk =
    previewNormalized.length >= MIN_WORD_LENGTH &&
    previewNormalized.length <= MAX_WORD_LENGTH &&
    !hasInvalidChars;

  const modalCategories = stats.categories[formLanguage];

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="arcade-card rounded-3xl px-8 py-6 text-center">
          <p className="font-display font-bold text-lg text-[#1E1B4B]">
            Verificando sesión de administrador...
          </p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 py-8">
        <div className="w-full max-w-md space-y-5 animate-pop-in">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FFBE0B] border-[3px] border-[#1E1B4B] shadow-[0_3px_0_#1E1B4B] text-xs sm:text-sm font-extrabold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              Zona de Administrador
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white drop-shadow-[0_4px_0_#1E1B4B]">
              Dibuja<span className="text-[#FFBE0B]">Ya!</span>
            </h1>
          </div>

          <form
            onSubmit={handleLogin}
            className="arcade-card rounded-3xl p-6 sm:p-8 space-y-5"
          >
            <div className="space-y-1">
              <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                <Lock className="w-6 h-6 text-[#FF4D6D]" />
                Administración de Palabras
              </h2>
              <p className="text-sm font-bold text-slate-600">
                Agrega, edita o elimina palabras del diccionario en español e
                inglés sin reiniciar las partidas.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="admin-password"
                className="block text-sm font-extrabold uppercase tracking-wide text-indigo-950"
              >
                Contraseña de administrador
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                  autoFocus
                  className="w-full pl-4 pr-12 py-3 rounded-2xl border-[3px] border-[#1E1B4B] bg-indigo-50/70 font-bold text-base focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#FFBE0B]/60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={
                    showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-xl text-slate-600 hover:bg-indigo-100 cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="p-3 rounded-2xl bg-rose-100 border-[2.5px] border-rose-600 text-rose-800 font-extrabold text-sm text-center">
                {loginError}
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              <button
                type="submit"
                disabled={loginLoading}
                className="arcade-btn w-full py-3 px-4 rounded-2xl bg-[#FFBE0B] text-[#1E1B4B] font-display font-bold text-lg cursor-pointer"
              >
                {loginLoading ? 'Verificando...' : 'Entrar al panel'}
              </button>
              <button
                type="button"
                onClick={onBackToGame}
                className="arcade-btn w-full py-2.5 px-4 rounded-2xl bg-white text-[#1E1B4B] font-display font-bold text-base flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver al juego
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] p-3 sm:p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <header className="arcade-card rounded-3xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#FFBE0B] border-[3px] border-[#1E1B4B] shadow-[0_3px_0_#1E1B4B] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-[#1E1B4B]" />
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
              Panel de Palabras
            </h1>
            <p className="text-xs sm:text-sm font-bold text-slate-600">
              DibujaYa! · Gestión en vivo del banco de palabras
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToGame}
            className="arcade-btn px-4 py-2 rounded-2xl bg-white text-[#1E1B4B] font-display font-bold text-sm flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al juego
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="arcade-btn px-4 py-2 rounded-2xl bg-rose-100 text-rose-900 font-display font-bold text-sm flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Default password warning */}
      {usingDefaultPassword && (
        <div className="arcade-card-sm rounded-2xl px-4 py-3 bg-amber-100 flex items-center gap-3 text-amber-950">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
          <p className="text-xs sm:text-sm font-extrabold">
            Estás usando la contraseña predeterminada. Configura la variable de
            entorno <code className="px-1.5 py-0.5 rounded bg-white/80">ADMIN_PASSWORD</code>{' '}
            en producción para proteger el acceso.
          </p>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-pop-in">
          <div
            className={`px-4 py-3 rounded-2xl border-[3px] border-[#1E1B4B] shadow-[0_4px_0_#1E1B4B] font-display font-bold text-sm flex items-center gap-2 ${
              toast.type === 'success'
                ? 'bg-[#06D6A0] text-[#1E1B4B]'
                : 'bg-[#FF4D6D] text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="arcade-card-sm rounded-2xl p-4 bg-white">
          <div className="flex items-center justify-between text-slate-600 text-xs font-extrabold uppercase">
            <span>Total de palabras</span>
            <BookOpen className="w-4 h-4 text-[#3A86FF]" />
          </div>
          <div className="font-display text-3xl font-bold mt-1 text-[#1E1B4B]">
            {stats.total}
          </div>
          <p className="text-xs font-bold text-slate-500 mt-0.5">
            En ambos idiomas
          </p>
        </div>

        <div className="arcade-card-sm rounded-2xl p-4 bg-amber-50">
          <div className="flex items-center justify-between text-amber-900 text-xs font-extrabold uppercase">
            <span>Español (ES)</span>
            <span className="px-2 py-0.5 rounded-full bg-[#FFBE0B] border-2 border-[#1E1B4B] text-[10px]">
              ES
            </span>
          </div>
          <div className="font-display text-3xl font-bold mt-1 text-[#1E1B4B]">
            {stats.byLanguage.es.total}
          </div>
          <p className="text-xs font-bold text-slate-600 mt-0.5">
            Fácil: {stats.byLanguage.es.easy} · Difícil:{' '}
            {stats.byLanguage.es.hard}
          </p>
        </div>

        <div className="arcade-card-sm rounded-2xl p-4 bg-sky-50">
          <div className="flex items-center justify-between text-sky-900 text-xs font-extrabold uppercase">
            <span>English (EN)</span>
            <span className="px-2 py-0.5 rounded-full bg-[#3A86FF] text-white border-2 border-[#1E1B4B] text-[10px]">
              EN
            </span>
          </div>
          <div className="font-display text-3xl font-bold mt-1 text-[#1E1B4B]">
            {stats.byLanguage.en.total}
          </div>
          <p className="text-xs font-bold text-slate-600 mt-0.5">
            Fácil: {stats.byLanguage.en.easy} · Difícil:{' '}
            {stats.byLanguage.en.hard}
          </p>
        </div>

        <div className="arcade-card-sm rounded-2xl p-4 bg-emerald-50">
          <div className="flex items-center justify-between text-emerald-900 text-xs font-extrabold uppercase">
            <span>Categorías</span>
            <Layers className="w-4 h-4 text-[#059669]" />
          </div>
          <div className="font-display text-3xl font-bold mt-1 text-[#1E1B4B]">
            {totalCategoryCount}
          </div>
          <p className="text-xs font-bold text-slate-600 mt-0.5">
            ES: {stats.categories.es.length} · EN: {stats.categories.en.length}
          </p>
        </div>
      </section>

      {/* Toolbar & Filters */}
      <section className="arcade-card rounded-3xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Language tabs */}
          <div className="inline-flex rounded-2xl border-[3px] border-[#1E1B4B] bg-indigo-50 p-1 gap-1">
            {(
              [
                { value: '', label: 'Todos' },
                { value: 'es', label: 'Español' },
                { value: 'en', label: 'English' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => setFilterLanguage(tab.value)}
                className={`px-3.5 py-1.5 rounded-xl font-display font-bold text-sm transition-colors cursor-pointer ${
                  filterLanguage === tab.value
                    ? 'bg-[#FFBE0B] text-[#1E1B4B] border-2 border-[#1E1B4B]'
                    : 'text-slate-700 hover:bg-white/70 border-2 border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openCreateModal}
              className="arcade-btn px-4 py-2 rounded-2xl bg-[#06D6A0] text-[#1E1B4B] font-display font-bold text-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nueva palabra
            </button>
            <button
              type="button"
              onClick={openBulkModal}
              className="arcade-btn px-4 py-2 rounded-2xl bg-[#2EC4B6] text-[#1E1B4B] font-display font-bold text-sm flex items-center gap-1.5 cursor-pointer"
            >
              <FileUp className="w-4 h-4" />
              Importar lista
            </button>
            <button
              type="button"
              onClick={() => setResetModalOpen(true)}
              className="arcade-btn px-3.5 py-2 rounded-2xl bg-slate-100 text-[#1E1B4B] font-display font-bold text-sm flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Restaurar
            </button>
          </div>
        </div>

        {/* Secondary filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar palabra o categoría..."
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl border-[2.5px] border-[#1E1B4B] bg-indigo-50/60 font-bold text-sm focus:outline-none focus:bg-white focus:ring-3 focus:ring-[#FFBE0B]/60"
            />
            {searchInput && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-indigo-100 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <select
            aria-label="Filtrar por dificultad"
            value={filterDifficulty}
            onChange={(e) =>
              setFilterDifficulty(e.target.value as WordDifficulty | '')
            }
            className="w-full px-3.5 py-2.5 rounded-2xl border-[2.5px] border-[#1E1B4B] bg-white font-bold text-sm focus:outline-none focus:ring-3 focus:ring-[#FFBE0B]/60"
          >
            <option value="">Todas las dificultades</option>
            <option value="easy">Fácil (100 pts)</option>
            <option value="hard">Difícil (200 pts)</option>
          </select>

          <select
            aria-label="Filtrar por categoría"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-2xl border-[2.5px] border-[#1E1B4B] bg-white font-bold text-sm focus:outline-none focus:ring-3 focus:ring-[#FFBE0B]/60"
          >
            <option value="">Todas las categorías</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Count line */}
        <div className="flex items-center justify-between text-xs font-extrabold text-slate-600 pt-1">
          <span>
            Mostrando {words.length} de {stats.total} palabras
          </span>
          {loadingWords && <span className="text-[#3A86FF]">Actualizando...</span>}
        </div>

        {/* Words Table (desktop) & Cards (mobile) */}
        {words.length === 0 ? (
          <div className="rounded-2xl border-[2.5px] border-dashed border-slate-300 p-8 text-center space-y-2">
            <p className="font-display font-bold text-lg text-slate-700">
              No hay palabras que coincidan con los filtros
            </p>
            <p className="text-sm font-bold text-slate-500">
              Prueba limpiando la búsqueda o agrega una nueva palabra.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto rounded-2xl border-[2.5px] border-[#1E1B4B]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-indigo-50 border-b-[2.5px] border-[#1E1B4B] text-xs font-extrabold uppercase text-indigo-950">
                    <th className="py-3 px-4">Palabra</th>
                    <th className="py-3 px-4">Categoría</th>
                    <th className="py-3 px-4">Idioma</th>
                    <th className="py-3 px-4">Dificultad</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-100 bg-white">
                  {words.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-amber-50/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display font-bold text-base tracking-wide text-[#1E1B4B]">
                            {item.word}
                          </span>
                          {item.normalized !== item.word && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">
                              {item.normalized}
                            </span>
                          )}
                          <span className="text-xs font-extrabold text-slate-400">
                            {item.normalized.length} letras
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2.5 py-1 rounded-xl bg-indigo-50 border-2 border-[#1E1B4B]/20 text-xs font-extrabold text-indigo-950">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full border-2 border-[#1E1B4B] text-xs font-extrabold ${
                            item.language === 'es'
                              ? 'bg-[#FFBE0B] text-[#1E1B4B]'
                              : 'bg-[#3A86FF] text-white'
                          }`}
                        >
                          {item.language.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full border-2 border-[#1E1B4B] text-xs font-extrabold ${
                            item.difficulty === 'easy'
                              ? 'bg-emerald-200 text-emerald-950'
                              : 'bg-[#FF4D6D] text-white'
                          }`}
                        >
                          {item.difficulty === 'easy'
                            ? 'Fácil · 100 pts'
                            : 'Difícil · 200 pts'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            aria-label={`Editar ${item.word}`}
                            className="arcade-btn px-3 py-1.5 rounded-xl bg-amber-100 text-[#1E1B4B] font-display font-bold text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            aria-label={`Eliminar ${item.word}`}
                            className="arcade-btn px-3 py-1.5 rounded-xl bg-rose-100 text-rose-900 font-display font-bold text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="grid grid-cols-1 gap-2.5 md:hidden">
              {words.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border-[2.5px] border-[#1E1B4B] p-3.5 bg-white flex items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-bold text-lg text-[#1E1B4B]">
                        {item.word}
                      </span>
                      {item.normalized !== item.word && (
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {item.normalized}
                        </span>
                      )}
                      <span className="text-xs font-extrabold text-slate-400">
                        {item.normalized.length} letras
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full border-2 border-[#1E1B4B] text-[10px] font-extrabold ${
                          item.language === 'es'
                            ? 'bg-[#FFBE0B] text-[#1E1B4B]'
                            : 'bg-[#3A86FF] text-white'
                        }`}
                      >
                        {item.language.toUpperCase()}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full border-2 border-[#1E1B4B] text-[10px] font-extrabold ${
                          item.difficulty === 'easy'
                            ? 'bg-emerald-200 text-emerald-950'
                            : 'bg-[#FF4D6D] text-white'
                        }`}
                      >
                        {item.difficulty === 'easy' ? 'Fácil 100' : 'Difícil 200'}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-[11px] font-extrabold text-indigo-950">
                        {item.category}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditModal(item)}
                      aria-label={`Editar ${item.word}`}
                      className="arcade-btn p-2 rounded-xl bg-amber-100 text-[#1E1B4B] cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      aria-label={`Eliminar ${item.word}`}
                      className="arcade-btn p-2 rounded-xl bg-rose-100 text-rose-900 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Create / Edit Modal */}
      {wordModalOpen && (
        <div className="fixed inset-0 z-50 bg-indigo-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveWord}
            className="arcade-card rounded-3xl w-full max-w-lg p-6 space-y-5 animate-pop-in"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold">
                {editingWord ? 'Editar palabra' : 'Nueva palabra'}
              </h2>
              <button
                type="button"
                aria-label="Cerrar modal"
                onClick={() => setWordModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-indigo-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="word-input"
                  className="text-sm font-extrabold uppercase text-indigo-950"
                >
                  Palabra (2 a 12 letras)
                </label>
                <span
                  className={`text-xs font-extrabold ${
                    previewLengthOk || formWord.trim() === ''
                      ? 'text-slate-500'
                      : 'text-rose-600'
                  }`}
                >
                  {previewNormalized.length}/{MAX_WORD_LENGTH} letras
                </span>
              </div>
              <input
                id="word-input"
                type="text"
                maxLength={20}
                value={formWord}
                onChange={(e) => setFormWord(e.target.value)}
                placeholder="Ej. MARIPOSA"
                autoFocus
                className="w-full px-4 py-3 rounded-2xl border-[3px] border-[#1E1B4B] bg-indigo-50/70 font-display font-bold text-xl uppercase tracking-wider focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#FFBE0B]/60"
              />

              {/* Live Scrabble preview */}
              <div className="min-h-11 rounded-2xl bg-indigo-50 border-2 border-indigo-200 px-3 py-2 flex flex-wrap items-center gap-1.5">
                {previewNormalized.length === 0 ? (
                  <span className="text-xs font-bold text-slate-400">
                    Vista previa en fichas Scrabble...
                  </span>
                ) : (
                  previewNormalized.split('').map((ch, idx) => (
                    <span
                      key={`${ch}-${idx}`}
                      className="scrabble-tile w-8 h-9 rounded-lg flex items-center justify-center font-bold text-base select-none"
                    >
                      {ch}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="word-language"
                  className="block text-sm font-extrabold uppercase text-indigo-950"
                >
                  Idioma
                </label>
                <select
                  id="word-language"
                  value={formLanguage}
                  onChange={(e) => setFormLanguage(e.target.value as Language)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border-[2.5px] border-[#1E1B4B] bg-white font-bold text-sm focus:outline-none focus:ring-3 focus:ring-[#FFBE0B]/60"
                >
                  <option value="es">Español (ES)</option>
                  <option value="en">English (EN)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="word-difficulty"
                  className="block text-sm font-extrabold uppercase text-indigo-950"
                >
                  Dificultad
                </label>
                <select
                  id="word-difficulty"
                  value={formDifficulty}
                  onChange={(e) =>
                    setFormDifficulty(e.target.value as WordDifficulty)
                  }
                  className="w-full px-3.5 py-2.5 rounded-2xl border-[2.5px] border-[#1E1B4B] bg-white font-bold text-sm focus:outline-none focus:ring-3 focus:ring-[#FFBE0B]/60"
                >
                  <option value="easy">Fácil · 100 pts</option>
                  <option value="hard">Difícil · 200 pts</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="word-category"
                className="block text-sm font-extrabold uppercase text-indigo-950"
              >
                Categoría
              </label>
              <input
                id="word-category"
                type="text"
                list="admin-category-suggestions"
                maxLength={40}
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder={
                  formLanguage === 'es'
                    ? 'Ej. Animales, Comida, Objetos...'
                    : 'Ej. Animals, Food, Objects...'
                }
                className="w-full px-4 py-2.5 rounded-2xl border-[2.5px] border-[#1E1B4B] bg-white font-bold text-sm focus:outline-none focus:ring-3 focus:ring-[#FFBE0B]/60"
              />
              <datalist id="admin-category-suggestions">
                {modalCategories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>

            {formError && (
              <div className="p-3 rounded-2xl bg-rose-100 border-[2.5px] border-rose-600 text-rose-800 font-extrabold text-sm">
                {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setWordModalOpen(false)}
                className="arcade-btn px-4 py-2.5 rounded-2xl bg-white text-[#1E1B4B] font-display font-bold text-sm cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingWord}
                className="arcade-btn px-5 py-2.5 rounded-2xl bg-[#FFBE0B] text-[#1E1B4B] font-display font-bold text-sm cursor-pointer"
              >
                {savingWord
                  ? 'Guardando...'
                  : editingWord
                    ? 'Guardar cambios'
                    : 'Agregar palabra'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Import Modal */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-indigo-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleBulkSubmit}
            className="arcade-card rounded-3xl w-full max-w-xl p-6 space-y-4 animate-pop-in max-h-[90dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold">
                Importar lista de palabras
              </h2>
              <button
                type="button"
                aria-label="Cerrar modal"
                onClick={() => setBulkModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-indigo-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs sm:text-sm font-bold text-slate-600">
              Escribe una palabra por línea. Puedes usar{' '}
              <code className="px-1.5 py-0.5 rounded bg-indigo-50">PALABRA</code>{' '}
              o{' '}
              <code className="px-1.5 py-0.5 rounded bg-indigo-50">
                PALABRA, Categoría
              </code>
              .
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-extrabold uppercase text-indigo-950">
                  Idioma
                </label>
                <select
                  value={bulkLanguage}
                  onChange={(e) => setBulkLanguage(e.target.value as Language)}
                  className="w-full px-3 py-2 rounded-xl border-[2.5px] border-[#1E1B4B] bg-white font-bold text-sm"
                >
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-extrabold uppercase text-indigo-950">
                  Dificultad
                </label>
                <select
                  value={bulkDifficulty}
                  onChange={(e) =>
                    setBulkDifficulty(e.target.value as WordDifficulty)
                  }
                  className="w-full px-3 py-2 rounded-xl border-[2.5px] border-[#1E1B4B] bg-white font-bold text-sm"
                >
                  <option value="easy">Fácil (100 pts)</option>
                  <option value="hard">Difícil (200 pts)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-extrabold uppercase text-indigo-950">
                  Categoría por defecto
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-[2.5px] border-[#1E1B4B] bg-white font-bold text-sm"
                />
              </div>
            </div>

            <textarea
              rows={6}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={'CABAÑA, Lugares\nKOALA, Animales\nCOMETA'}
              className="w-full p-3.5 rounded-2xl border-[2.5px] border-[#1E1B4B] bg-indigo-50/60 font-mono text-sm font-bold focus:outline-none focus:bg-white focus:ring-3 focus:ring-[#FFBE0B]/60"
            />

            {bulkError && (
              <div className="p-3 rounded-2xl bg-rose-100 border-[2.5px] border-rose-600 text-rose-800 font-extrabold text-sm">
                {bulkError}
              </div>
            )}

            {bulkResult && (
              <div className="rounded-2xl border-[2.5px] border-[#1E1B4B] bg-indigo-50 p-3.5 space-y-2 text-xs font-bold">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-emerald-800 font-extrabold">
                    Agregadas: {bulkResult.added.length}
                  </span>
                  <span className="text-amber-800 font-extrabold">
                    Omitidas: {bulkResult.skipped.length}
                  </span>
                </div>
                {bulkResult.skipped.length > 0 && (
                  <ul className="max-h-28 overflow-y-auto space-y-1 text-slate-700">
                    {bulkResult.skipped.map((item, idx) => (
                      <li key={`${item.word}-${idx}`}>
                        <strong>{item.word}</strong>: {item.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setBulkModalOpen(false)}
                className="arcade-btn px-4 py-2.5 rounded-2xl bg-white text-[#1E1B4B] font-display font-bold text-sm cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={bulkLoading}
                className="arcade-btn px-5 py-2.5 rounded-2xl bg-[#2EC4B6] text-[#1E1B4B] font-display font-bold text-sm cursor-pointer"
              >
                {bulkLoading ? 'Importando...' : 'Importar palabras'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-indigo-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="arcade-card rounded-3xl w-full max-w-md p-6 space-y-4 animate-pop-in">
            <h2 className="font-display text-2xl font-bold text-rose-700">
              Eliminar palabra
            </h2>
            <p className="text-sm font-bold text-slate-700">
              ¿Seguro que deseas eliminar{' '}
              <span className="font-display font-bold text-[#1E1B4B]">
                "{deleteTarget.word}"
              </span>{' '}
              ({deleteTarget.language.toUpperCase()} ·{' '}
              {deleteTarget.difficulty === 'easy' ? 'Fácil' : 'Difícil'})?
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="arcade-btn px-4 py-2 rounded-2xl bg-white text-[#1E1B4B] font-display font-bold text-sm cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="arcade-btn px-4 py-2 rounded-2xl bg-[#FF4D6D] text-white font-display font-bold text-sm cursor-pointer"
              >
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-indigo-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="arcade-card rounded-3xl w-full max-w-md p-6 space-y-4 animate-pop-in">
            <h2 className="font-display text-2xl font-bold text-[#1E1B4B]">
              Restaurar catálogo inicial
            </h2>
            <p className="text-sm font-bold text-slate-700">
              Esto reemplazará el banco actual con las palabras predeterminadas
              de DibujaYa! Se perderán las ediciones o palabras personalizadas.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="arcade-btn px-4 py-2 rounded-2xl bg-white text-[#1E1B4B] font-display font-bold text-sm cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={handleResetDefaults}
                className="arcade-btn px-4 py-2 rounded-2xl bg-[#FFBE0B] text-[#1E1B4B] font-display font-bold text-sm cursor-pointer"
              >
                {resetting ? 'Restaurando...' : 'Confirmar restauración'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
