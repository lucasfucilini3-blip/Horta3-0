import React, { useEffect, useState, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { 
  onAuthStateChanged, 
  signOut, 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query, orderBy, limit, getDocs, addDoc, updateDoc, serverTimestamp, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, UserRole } from './types';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  DollarSign, 
  BarChart3, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  User as UserIcon,
  ChevronRight,
  Plus,
  AlertCircle,
  Sprout,
  Leaf,
  Wifi,
  WifiOff,
  RefreshCw,
  Cloud,
  CreditCard,
  Download,
  Info,
  ExternalLink,
  Copy,
  Check,
  HelpCircle,
  Smartphone,
  Share,
  ListTodo,
  CheckCircle2,
  Calendar,
  ClipboardList
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import Inventory from './components/Inventory';
import Sales from './components/Sales';
import Finance from './components/Finance';
import Reports from './components/Reports';
import Admin from './components/Admin';
import Customers from './components/Customers';
import Production from './components/Production';
import Tasks from './components/Tasks';
import BedRecords from './components/BedRecords';

// --- Utils ---
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Error Handling ---
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Context ---
interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithEmail: (username: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// --- Offline Support Hook ---
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

// --- PWA Support Hook ---
function usePWA() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    setIsInIframe(window.self !== window.top);

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstallPrompt(null);
      }
    } catch (err) {
      console.error("Installation failed:", err);
    }
  };

  return { installPrompt, isInstalled, installApp, isInIframe };
}

const SyncStatus = () => {
  const isOnline = useOnlineStatus();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      // Forcing a refresh from server by querying a collection
      // Firestore automatically syncs when online, but this gives visual feedback
      await getDocs(query(collection(db, 'sales'), limit(1)));
      await new Promise(resolve => setTimeout(resolve, 1000)); // Visual feedback
    } catch (error) {
      console.error("Sync error:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300",
      isOnline ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
    )}>
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center",
        isOnline ? "bg-emerald-100" : "bg-rose-100"
      )}>
        {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider">
          {isOnline ? "Conectado" : "Offline"}
        </p>
        <p className="text-[10px] opacity-70 truncate">
          {isOnline ? "Sincronizado com a nuvem" : "Salvando localmente..."}
        </p>
      </div>
      {isOnline && (
        <button 
          onClick={handleSync}
          disabled={isSyncing}
          className={cn(
            "p-1.5 hover:bg-emerald-200/50 rounded-lg transition-colors",
            isSyncing && "animate-spin"
          )}
          title="Sincronizar agora"
        >
          <RefreshCw size={14} />
        </button>
      )}
    </div>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// --- Components ---
interface SidebarItemProps {
  to: string;
  icon: any;
  label: string;
  active: boolean;
  onClick?: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ to, icon: Icon, label, active, onClick }) => (
  <Link
    to={to}
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
      active 
        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" 
        : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
    )}
  >
    <Icon size={20} className={cn("transition-transform duration-200", !active && "group-hover:scale-110")} />
    <span className="font-medium">{label}</span>
    {active && <motion.div layoutId="active-pill" className="ml-auto w-1.5 h-1.5 rounded-full bg-white" />}
  </Link>
);

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { profile, logout } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const { installPrompt, isInstalled, installApp, isInIframe } = usePWA();
  const [copied, setCopied] = useState(false);
  const [isHelpModalOpen, setHelpModalOpen] = useState(false);

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const [installTab, setInstallTab] = useState<'android' | 'ios'>(isIOS ? 'ios' : 'android');

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Painel', show: true },
    { to: '/prontuario', icon: ClipboardList, label: 'Prontuário Horta', show: true },
    { to: '/tarefas', icon: ListTodo, label: 'Tarefas', show: profile?.role === 'owner' || profile?.permissions.canManageTasks },
    { to: '/estoque', icon: Package, label: 'Estoque', show: profile?.role === 'owner' || profile?.permissions.canManageInventory },
    { to: '/producao', icon: BarChart3, label: 'Produção', show: profile?.role === 'owner' || profile?.permissions.canManageProduction },
    { to: '/vendas', icon: ShoppingCart, label: 'Vendas', show: profile?.role === 'owner' || profile?.permissions.canManageSales },
    { to: '/clientes', icon: UserIcon, label: 'Clientes', show: profile?.role === 'owner' || profile?.permissions.canManageCustomers },
    { to: '/financeiro', icon: DollarSign, label: 'Financeiro', show: profile?.role === 'owner' || profile?.permissions.canViewFinance },
    { to: '/relatorios', icon: BarChart3, label: 'Relatórios', show: profile?.role === 'owner' || profile?.permissions.canViewReports },
    { to: '/configuracoes', icon: Settings, label: 'Configurações', show: profile?.role === 'owner' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden">
      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 transition-transform duration-300 lg:relative lg:translate-x-0 shrink-0 shadow-2xl lg:shadow-none print:hidden",
        !isSidebarOpen && "-translate-x-full"
      )}>
        <div className="h-full flex flex-col p-6">
          <div className="flex items-center justify-between mb-10 px-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                <Sprout size={24} />
              </div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">HortaManager</h1>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 space-y-1.5">
            {navItems.filter(i => i.show).map((item) => (
              <SidebarItem 
                key={item.to} 
                to={item.to}
                icon={item.icon}
                label={item.label}
                active={location.pathname === item.to}
                onClick={() => setSidebarOpen(false)}
              />
            ))}
          </nav>

          <div className="mt-auto pt-6 border-t border-slate-100 space-y-4">
            {isInIframe ? (
              <div className="space-y-2">
                <a 
                  href={window.location.href} 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center gap-3 w-full px-4 py-3 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl transition-all shadow-lg shadow-emerald-100 group"
                >
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ExternalLink size={16} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold">Abrir para Instalar</p>
                    <p className="text-[10px] opacity-70">Necessário para baixar</p>
                  </div>
                </a>
                <button 
                  onClick={copyLink}
                  className="flex items-center gap-3 w-full px-4 py-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all text-xs font-bold"
                >
                  {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  {copied ? 'Link Copiado!' : 'Copiar Link do App'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {installPrompt && (
                  <button 
                    onClick={installApp}
                    className="flex items-center gap-3 w-full px-4 py-3 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl transition-all shadow-lg shadow-emerald-100 group"
                  >
                    <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Download size={16} />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold">Instalar App</p>
                      <p className="text-[10px] opacity-70">Acesso rápido offline</p>
                    </div>
                  </button>
                )}
                
                {!isInstalled && (
                  <button 
                    onClick={() => setHelpModalOpen(true)}
                    className="flex items-center gap-3 w-full px-4 py-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all text-xs font-bold"
                  >
                    <HelpCircle size={14} />
                    Como Instalar?
                  </button>
                )}
              </div>
            )}
            
            <SyncStatus />
            
            <div className="flex items-center gap-3 px-2 mb-6">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold shrink-0">
                {profile?.displayName?.[0] || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{profile?.displayName}</p>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{profile?.role === 'owner' ? 'Dono' : 'Funcionário'}</p>
              </div>
            </div>
            <button 
              onClick={logout}
              className="flex items-center gap-3 w-full px-4 py-3 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors group"
            >
              <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
              <span className="font-medium">Sair</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Help Modal */}
      <AnimatePresence>
        {isHelpModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHelpModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden z-10"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Baixar no Celular</h3>
                    <p className="text-xs text-slate-500 mt-1">Tenha acesso rápido offline na sua horta</p>
                  </div>
                  <button onClick={() => setHelpModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>

                {isInIframe ? (
                  <div className="space-y-6">
                    <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                      <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                      <div className="space-y-1">
                        <p className="font-bold text-amber-900 text-sm">Modo de Visualização (Preview)</p>
                        <p className="text-xs text-amber-700 leading-relaxed">
                          Você está visualizando o app dentro do editor. Para conseguir instalar no celular, você precisa abrir o link real em uma janela completa fora do editor.
                        </p>
                      </div>
                    </div>
                    
                    <a 
                      href={window.location.href} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3.5 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 hover:scale-[1.02] shadow-lg shadow-emerald-100 active:scale-95 transition-all text-sm"
                    >
                      <ExternalLink size={18} />
                      Abrir em Tela Inteira para Instalar
                    </a>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Native Install Button Trigger if present */}
                    {installPrompt && (
                      <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-3">
                        <p className="text-xs font-bold text-emerald-800">Seu dispositivo suporta o download automático!</p>
                        <button 
                          onClick={() => { installApp(); setHelpModalOpen(false); }}
                          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm"
                        >
                          <Download size={16} />
                          Instalar com 1 Clique agora
                        </button>
                      </div>
                    )}

                    {/* Tabs for Manual Install */}
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setInstallTab('android')}
                        className={cn(
                          "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                          installTab === 'android' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        🤖 Celular Android
                      </button>
                      <button
                        type="button"
                        onClick={() => setInstallTab('ios')}
                        className={cn(
                          "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                          installTab === 'ios' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        🍏 iPhone (iOS)
                      </button>
                    </div>

                    {/* Step-by-step guides */}
                    <div className="space-y-4">
                      {installTab === 'ios' ? (
                        <div className="space-y-4">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
                              <Share size={18} />
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-sm">1. Toque no ícone de Compartilhar</p>
                              <p className="text-xs text-slate-500">Localizado na barra inferior do seu navegador Safari.</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                              <Plus size={18} />
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-sm">2. Adicionar à Tela de Início</p>
                              <p className="text-xs text-slate-500">Role a lista de opções para baixo e clique em "Adicionar à Tela de Início".</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                              <Smartphone size={18} />
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-sm">1. Abra no Chrome ou Edge</p>
                              <p className="text-xs text-slate-500">Certifique-se de que está usando um navegador padrão do Android.</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                              <Menu size={18} />
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-sm">2. Selecione no Menu</p>
                              <p className="text-xs text-slate-500">Clique nas opções de três pontinhos no canto superior e selecione "Instalar aplicativo" ou "Adicionar à tela de início".</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">💡 HortaManager Offline</p>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Ao adicionar o app à sua tela de início, ele abrirá em tela cheia como se fosse um app comum e salvará suas atividades na horta mesmo se você estiver sem internet!
                      </p>
                    </div>

                    <button 
                      onClick={() => setHelpModalOpen(false)}
                      className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <main className="flex-1 flex flex-col min-w-0 relative bg-slate-50/50">
        {!useOnlineStatus() && (
          <div className="bg-rose-500 text-white text-center py-1.5 text-[10px] font-bold uppercase tracking-widest animate-pulse z-50 print:hidden">
            Modo Offline Ativo • Os dados serão sincronizados quando houver conexão
          </div>
        )}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 sticky top-0 z-30 lg:hidden print:hidden">
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
              <Sprout size={18} />
            </div>
            <h1 className="text-lg font-bold text-slate-800">HortaManager</h1>
          </div>
          <div className="flex items-center gap-1">
            {!isInstalled && (
              <button 
                onClick={() => setHelpModalOpen(true)}
                className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-sm active:scale-95 border border-emerald-100 animate-pulse"
                title="Informações de como instalar"
              >
                <Smartphone size={14} />
                <span>Instalar</span>
              </button>
            )}
            {isInstalled && <div className="w-10" />}
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6 lg:p-10 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

// --- Pages ---
const Dashboard = () => {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    salesToday: 0,
    pendingOrders: 0,
    lowStockItems: 0,
    receivables: 0
  });
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [criticalStock, setCriticalStock] = useState<any[]>([]);
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch Stats - Today's Sales
    const salesQ = query(collection(db, 'sales'), where('createdAt', '>=', today));
    const unsubscribeSales = onSnapshot(salesQ, (snapshot) => {
      const sales = snapshot.docs.map(d => d.data());
      const total = sales
        .filter(s => s.status === 'paid' || s.status === 'confirmed')
        .reduce((acc, s) => acc + (s.total || 0), 0);
      setStats(prev => ({ ...prev, salesToday: total }));
    }, (error) => console.error("Dashboard Sales Error:", error));

    // Pending Orders & Receivables
    const pendingQ = query(collection(db, 'sales'), where('status', 'in', ['ordered', 'pending_delivery', 'delivered', 'pending']));
    const unsubscribePending = onSnapshot(pendingQ, (snapshot) => {
      const pendingSales = snapshot.docs.map(d => d.data());
      const totalReceivable = pendingSales.reduce((acc, s) => acc + (s.total || 0), 0);
      setStats(prev => ({ 
        ...prev, 
        pendingOrders: snapshot.size,
        receivables: totalReceivable
      }));
    }, (error) => console.error("Dashboard Pending Error:", error));

    // Stock
    const stockQ = query(collection(db, 'inventory'));
    const unsubscribeStock = onSnapshot(stockQ, (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const lowStock = items.filter(i => i.quantity <= (i.minStock || 0));
      setStats(prev => ({ ...prev, lowStockItems: lowStock.length }));
      setCriticalStock(lowStock.slice(0, 5));
    }, (error) => console.error("Dashboard Stock Error:", error));

    // Recent Sales
    const recentQ = query(collection(db, 'sales'), orderBy('createdAt', 'desc'), limit(10));
    const unsubscribeRecent = onSnapshot(recentQ, (snapshot) => {
      setRecentSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => console.error("Dashboard Recent Sales Error:", error));

    // Pending Tasks
    const tasksQ = query(collection(db, 'tasks'), where('completed', '==', false), orderBy('createdAt', 'desc'), limit(5));
    const unsubscribeTasks = onSnapshot(tasksQ, (snapshot) => {
      setPendingTasks(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => console.error("Dashboard Tasks Error:", error));

    return () => {
      unsubscribeSales();
      unsubscribePending();
      unsubscribeStock();
      unsubscribeRecent();
      unsubscribeTasks();
    };
  }, [refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">Olá, {profile?.displayName}! 👋</h2>
          <p className="text-slate-500 mt-1 text-sm md:text-base">Aqui está o que está acontecendo na sua horta hoje.</p>
        </div>
        <button 
          onClick={handleRefresh}
          className="self-start sm:self-auto p-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 transition-all shadow-sm active:scale-95"
          title="Atualizar Painel"
        >
          <motion.div
            animate={{ rotate: refreshKey * 360 }}
            transition={{ duration: 0.5 }}
          >
            <RefreshCw size={20} />
          </motion.div>
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {[
          { label: 'Vendas Hoje', value: `R$ ${stats.salesToday.toFixed(2)}`, color: 'bg-emerald-500', icon: DollarSign },
          { label: 'A Receber', value: `R$ ${stats.receivables.toFixed(2)}`, color: 'bg-blue-500', icon: CreditCard },
          { label: 'Pedidos Pendentes', value: stats.pendingOrders.toString(), color: 'bg-amber-500', icon: ShoppingCart },
          { label: 'Itens em Baixa', value: stats.lowStockItems.toString(), color: 'bg-rose-500', icon: Package },
        ].map((stat, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={stat.label} 
            className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-2 rounded-lg text-white", stat.color)}>
                <stat.icon size={20} />
              </div>
            </div>
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Tasks Section on Dashboard */}
      <div className="bg-white p-5 md:p-8 rounded-2xl border border-slate-200 shadow-sm mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <ListTodo size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Tarefas Pendentes</h3>
              <p className="text-sm text-slate-500">O que precisa ser feito.</p>
            </div>
          </div>
          <Link 
            to="/tarefas" 
            className="text-sm font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-4 py-2 rounded-xl transition-all"
          >
            Ver Todas
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pendingTasks.map((task) => (
            <motion.div 
              layout
              key={task.id} 
              className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100 group hover:border-indigo-200 hover:bg-white transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <button 
                  onClick={async () => {
                    try {
                      await updateDoc(doc(db, 'tasks', task.id), {
                        completed: true,
                        completedAt: serverTimestamp()
                      });
                    } catch (e) {
                      console.error(e);
                      alert('Erro ao concluir tarefa.');
                    }
                  }}
                  className="w-10 h-10 rounded-full border-2 border-slate-200 flex items-center justify-center text-transparent hover:border-indigo-500 hover:text-indigo-500 transition-all shrink-0 bg-white"
                >
                  <Check size={20} strokeWidth={3} />
                </button>
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate">{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn(
                      "text-[8px] uppercase font-black px-1.5 py-0.5 rounded-full border",
                      task.priority === 'high' ? "text-rose-600 border-rose-100 bg-rose-50" :
                      task.priority === 'medium' ? "text-amber-600 border-amber-100 bg-amber-50" :
                      "text-blue-600 border-blue-100 bg-blue-50"
                    )}>
                      {task.priority}
                    </span>
                    {task.dueDate && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Calendar size={10} />
                        {format(task.dueDate.toDate(), "dd/MM", { locale: ptBR })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ChevronRight size={20} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
            </motion.div>
          ))}
          {pendingTasks.length === 0 && (
            <div className="col-span-full py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <CheckCircle2 size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="text-slate-400 font-medium font-bold uppercase tracking-wider text-[10px]">Todas as tarefas concluídas!</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        <div className="bg-white p-5 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Últimas Vendas</h3>
          <div className="space-y-3">
            {recentSales.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between p-3 md:p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                    <ShoppingCart size={16} className="md:w-[18px] md:h-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate text-sm md:text-base">{sale.customerName}</p>
                    <p className="text-[10px] md:text-xs text-slate-500">
                      {sale.createdAt?.toDate ? format(sale.createdAt.toDate(), "HH:mm", { locale: ptBR }) : '...'} • {sale.items.length} itens
                    </p>
                  </div>
                </div>
                <p className="font-bold text-slate-900 text-sm md:text-base whitespace-nowrap ml-2">R$ {sale.total.toFixed(2)}</p>
              </div>
            ))}
            {recentSales.length === 0 && <p className="text-center text-slate-400 py-4">Nenhuma venda recente.</p>}
          </div>
        </div>

        <div className="bg-white p-5 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Estoque Crítico</h3>
          <div className="space-y-3">
            {criticalStock.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 md:p-4 rounded-xl bg-rose-50 border border-rose-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-700 shrink-0">
                    <AlertCircle size={16} className="md:w-[18px] md:h-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate text-sm md:text-base">{item.name}</p>
                    <p className="text-[10px] md:text-xs text-rose-600 font-medium truncate">Apenas {item.quantity} {item.unit} restantes</p>
                  </div>
                </div>
                <Link to="/estoque" className="text-xs md:text-sm font-bold text-rose-700 hover:underline whitespace-nowrap ml-2">Repor</Link>
              </div>
            ))}
            {criticalStock.length === 0 && <p className="text-center text-slate-400 py-4">Estoque em dia!</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

const Login = () => {
  const { signIn, signInWithEmail } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAuthLoading(true);
    try {
      await signInWithEmail(username, password);
    } catch (err: any) {
      // Show the actual error message if it's one of our custom ones or a clear Firebase error
      const errorMessage = err.message || 'Usuário ou senha incorretos';
      setError(errorMessage);
      console.error('Login error details:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-emerald-900 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-10 left-10 w-64 h-64 bg-white rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-emerald-400 rounded-full blur-3xl" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md p-10 rounded-[2.5rem] shadow-2xl relative z-10"
      >
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-200 mb-4 transform -rotate-6">
            <Sprout size={32} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">HortaManager</h1>
          <p className="text-slate-500 mt-1 text-sm font-medium">Gestão interna da empresa.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 ml-1 uppercase">Usuário</label>
            <input 
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Digite seu usuário"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 ml-1 uppercase">Senha</label>
            <input 
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-xs font-bold">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={authLoading}
            className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all active:scale-95 shadow-lg shadow-emerald-100 disabled:opacity-50"
          >
            {authLoading ? 'Entrando...' : 'Entrar no Sistema'}
          </button>
        </form>

        <p className="text-center text-slate-400 text-[10px] mt-8 uppercase font-bold tracking-widest">
          Acesso restrito a funcionários autorizados
        </p>
      </motion.div>
    </div>
  );
};

// --- App Root ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.role === 'owner') {
      const checkBackup = async () => {
        try {
          const lastBackupRef = doc(db, 'system', 'last_backup');
          const lastBackupSnap = await getDoc(lastBackupRef);
          const now = new Date();
          const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
          
          if (!lastBackupSnap.exists() || lastBackupSnap.data()?.date?.toDate() < threeDaysAgo) {
            console.log('Starting automatic backup...');
            const collectionsToBackup = ['users', 'customers', 'categories', 'inventory', 'sales', 'transactions', 'production'];
            const backupData: any = {};
            for (const colName of collectionsToBackup) {
              const snapshot = await getDocs(collection(db, colName));
              backupData[colName] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            await addDoc(collection(db, 'backups'), {
              date: serverTimestamp(),
              type: 'automatic',
              data: JSON.stringify(backupData)
            });
            await setDoc(lastBackupRef, { date: serverTimestamp() });
            console.log('Automatic backup performed');
          }
        } catch (error) {
          console.error('Backup error:', error);
        }
      };
      
      // Delay backup check to not interfere with initial load
      const backupTimeout = setTimeout(checkBackup, 10000);
      return () => clearTimeout(backupTimeout);
    }
  }, [profile?.role]);

  useEffect(() => {
    // Safety timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 8000);

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      clearTimeout(timeout);
      try {
        setUser(u);
        if (u) {
          const docRef = doc(db, 'users', u.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const profileData = docSnap.data() as UserProfile;
            setProfile(profileData);
          } else {
            // New user - default to employee unless it's the owner email
            const userEmail = u.email?.toLowerCase() || '';
            const isOwner = userEmail === 'lucasfucilini3@gmail.com' || 
                           userEmail === 'lucas@hortamanager.com' || 
                           userEmail.includes('lucas.master');
            const newProfile: UserProfile = {
              uid: u.uid,
              email: u.email || '',
              displayName: u.displayName || 'Usuário',
              role: isOwner ? 'owner' : 'employee',
              permissions: {
                canManageInventory: isOwner,
                canManageSales: isOwner,
                canViewFinance: isOwner,
                canViewReports: isOwner,
                canManageCustomers: isOwner,
                canManageProduction: isOwner,
                canManageTasks: isOwner,
              }
            };
            await setDoc(docRef, newProfile);
            setProfile(newProfile);
          }
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.error('Auth state error:', error);
      } finally {
        setLoading(false);
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const signInWithEmail = async (username: string, pass: string) => {
    const cleanUsername = username.trim();
    // Normalize email: if it's just 'lucas', it becomes 'lucas@hortamanager.com'
    let email = (cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@hortamanager.com`).toLowerCase();
    
    // Master Reset logic: if user is 'RESET_LUCAS' and password is correct, use a fresh email
    if (cleanUsername.toUpperCase() === 'RESET_LUCAS' && pass === 'Lgf091723') {
      email = `lucas.master.${Date.now()}@hortamanager.com`;
    }

    try {
      // Try to sign in
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error: any) {
      // Auto-bootstrap 'Lucas' owner account if it doesn't exist
      // Check for 'lucas', 'lucas@hortamanager.com', 'lucasfucilini3@gmail.com' or 'RESET_LUCAS'
      const isInitialLucas = (
        cleanUsername.toLowerCase() === 'lucas' || 
        email.includes('lucas.master') ||
        email === 'lucas@hortamanager.com' || 
        email === 'lucasfucilini3@gmail.com'
      ) && pass === 'Lgf091723';
      
      if (isInitialLucas) {
        // If login failed, check if it's because user doesn't exist
        // Firebase often returns 'auth/invalid-credential' for both wrong pass and user not found
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
          try {
            // Try to create the user
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(userCredential.user, { displayName: 'Lucas' });
            return;
          } catch (createError: any) {
            // If email already in use, it means the user exists but password might be different
            if (createError.code === 'auth/email-already-in-use') {
              throw new Error('A conta de dono já existe mas a senha informada está incorreta. Se você esqueceu a senha, tente usar o usuário "RESET_LUCAS" com a senha padrão para criar um novo acesso de emergência.');
            }
            throw createError;
          }
        }
      }
      
      // If we are here, it's a normal login failure
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        throw new Error('Usuário ou senha incorretos. Verifique os dados e tente novamente.');
      }
      throw error;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signInWithEmail, logout }}>
      <Router>
        {!user ? (
          <Routes>
            <Route path="*" element={<Login />} />
          </Routes>
        ) : (
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/prontuario" element={<BedRecords />} />
              <Route 
                path="/tarefas" 
                element={profile?.role === 'owner' || profile?.permissions.canManageTasks ? <Tasks /> : <Navigate to="/" />} 
              />
              <Route 
                path="/estoque" 
                element={profile?.role === 'owner' || profile?.permissions.canManageInventory ? <Inventory /> : <Navigate to="/" />} 
              />
              <Route 
                path="/producao" 
                element={profile?.role === 'owner' || profile?.permissions.canManageProduction ? <Production /> : <Navigate to="/" />} 
              />
              <Route 
                path="/vendas" 
                element={profile?.role === 'owner' || profile?.permissions.canManageSales ? <Sales /> : <Navigate to="/" />} 
              />
              <Route 
                path="/clientes" 
                element={profile?.role === 'owner' || profile?.permissions.canManageCustomers ? <Customers /> : <Navigate to="/" />} 
              />
              <Route 
                path="/financeiro" 
                element={profile?.role === 'owner' || profile?.permissions.canViewFinance ? <Finance /> : <Navigate to="/" />} 
              />
              <Route 
                path="/relatorios" 
                element={profile?.role === 'owner' || profile?.permissions.canViewReports ? <Reports /> : <Navigate to="/" />} 
              />
              <Route 
                path="/configuracoes" 
                element={profile?.role === 'owner' ? <Admin /> : <Navigate to="/" />} 
              />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Layout>
        )}
      </Router>
    </AuthContext.Provider>
  );
}

const Placeholder = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center h-full text-slate-400">
    <Sprout size={64} className="mb-4 opacity-20" />
    <h2 className="text-2xl font-bold">{title}</h2>
    <p>Funcionalidade em desenvolvimento...</p>
  </div>
);
