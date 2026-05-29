import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, updateDoc, doc, deleteDoc, orderBy, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db, auth, dbImportData } from '../firebase';
import { UserProfile, UserPermissions, Category } from '../types';
import { User as UserIcon, Shield, ShieldCheck, Trash2, Edit2, CheckCircle2, XCircle, Tag, Plus, X, Package, DollarSign, UserPlus, RefreshCcw, Download, Upload, AlertTriangle, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, handleFirestoreError, OperationType } from '../App';
import { addDoc, deleteDoc as firestoreDeleteDoc } from 'firebase/firestore';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut, updatePassword, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Admin() {
  const { profile: currentUserProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCategoryModalOpen, setCategoryModalOpen] = useState(false);
  const [isUserModalOpen, setUserModalOpen] = useState(false);
  const [newUserLoading, setNewUserLoading] = useState(false);
  const [newUserError, setNewUserError] = useState('');
  const [isPasswordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [selectedUserForReset, setSelectedUserForReset] = useState<UserProfile | null>(null);
  const [isResetModalOpen, setResetModalOpen] = useState(false);
  const [isWipeDataModalOpen, setWipeDataModalOpen] = useState(false);
  const [wipeLoading, setWipeLoading] = useState(false);
  const [wipeError, setWipeError] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [isSqlModalOpen, setSqlModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleWipeData = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setWipeLoading(true);
    setWipeError('');
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;

    try {
      // Verify password first
      if (auth.currentUser?.email) {
        await signInWithEmailAndPassword(auth, auth.currentUser.email, password);
      } else {
        throw new Error('Usuário não autenticado');
      }

      const collections = ['customers', 'categories', 'inventory', 'sales', 'transactions', 'production', 'tasks', 'bed_records', 'backups'];
      const batch = writeBatch(db);

      for (const colName of collections) {
        const snapshot = await getDocs(collection(db, colName));
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
      }

      // Delete users except current owner
      const usersSnapshot = await getDocs(collection(db, 'users'));
      usersSnapshot.docs.forEach((doc) => {
        if (doc.id !== currentUserProfile?.uid) {
          batch.delete(doc.ref);
        }
      });

      await batch.commit();
      setWipeDataModalOpen(false);
      alert('Todos os dados foram apagados com sucesso!');
      window.location.reload();
    } catch (error: any) {
      setWipeError(error.message === 'auth/wrong-password' || error.code === 'auth/invalid-credential' 
        ? 'Senha incorreta' 
        : 'Erro ao apagar dados: ' + error.message);
    } finally {
      setWipeLoading(false);
    }
  };

  const handleExportBackup = async () => {
    setBackupLoading(true);
    try {
      const collections = ['users', 'customers', 'categories', 'inventory', 'sales', 'transactions', 'production', 'tasks', 'bed_records'];
      const backupData: any = {};

      for (const colName of collections) {
        const snapshot = await getDocs(collection(db, colName));
        backupData[colName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hortamanager_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Also save to Firestore as a backup log
      await addDoc(collection(db, 'backups'), {
        date: new Date().toISOString(),
        createdBy: currentUserProfile?.displayName,
        type: 'manual'
      });

    } catch (error: any) {
      alert('Erro ao gerar backup: ' + error.message);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    setImportError('');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const collections = ['users', 'customers', 'categories', 'inventory', 'sales', 'transactions', 'production', 'tasks', 'bed_records'];
        
        // Validação básica do JSON
        const keys = Object.keys(json);
        const hasSome = collections.some(col => keys.includes(col));
        if (!hasSome) {
          throw new Error('Formato de arquivo inválido. O arquivo JSON deve conter as coleções do sistema.');
        }

        if (!confirm('ATENÇÃO: Este processo irá apagar seus dados locais atuais de todas as tabelas (exceto seu próprio usuário) para carregar o backup. Deseja realmente prosseguir?')) {
          setImportLoading(false);
          e.target.value = '';
          return;
        }

        // Executa a importação em lote altamente otimizada sem travar o browser
        dbImportData(json, currentUserProfile);

        // Registrar o restore de backup
        await addDoc(collection(db, 'backups'), {
          date: new Date().toISOString(),
          createdBy: currentUserProfile?.displayName || 'Sistema',
          type: 'restore'
        });

        alert('Backup carregado e restaurado com sucesso! O sistema será reiniciado.');
        window.location.reload();
      } catch (error: any) {
        setImportError(error.message || 'Erro ao processar o arquivo JSON.');
        alert('Erro ao carregar backup: ' + (error.message || 'Formato incorreto.'));
      } finally {
        setImportLoading(false);
        e.target.value = '';
      }
    };

    reader.onerror = () => {
      setImportError('Erro ao ler o arquivo.');
      setImportLoading(false);
      e.target.value = '';
    };

    reader.readAsText(file);
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedUserForReset) return;
    
    setNewUserLoading(true);
    setNewUserError('');
    const formData = new FormData(e.currentTarget);
    const newPassword = formData.get('newPassword') as string;

    try {
      // To reset another user's password without Admin SDK:
      // 1. Delete the user document in Firestore (temporarily or just update it later)
      // 2. We can't delete the Auth user without their session.
      // 3. BUT we can use the secondary app to create a NEW user with the same email if we delete the old one.
      // Actually, without Admin SDK, we can't delete another user.
      
      // ALTERNATIVE: Just tell the user to delete and recreate.
      // But I can try to make it easier.
      
      alert('Para segurança do Firebase, apenas o próprio usuário pode alterar sua senha, ou o dono pode excluir o usuário e criá-lo novamente com a nova senha.');
      setResetModalOpen(false);
    } catch (error: any) {
      setNewUserError(error.message || 'Erro ao redefinir senha');
    } finally {
      setNewUserLoading(false);
    }
  };

  const handleChangeMyPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordLoading(true);
    setPasswordError('');
    setPasswordSuccess(false);
    const formData = new FormData(e.currentTarget);
    const newPassword = formData.get('newPassword') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas não coincidem');
      setPasswordLoading(false);
      return;
    }

    try {
      if (getAuth().currentUser) {
        await updatePassword(getAuth().currentUser!, newPassword);
        setPasswordSuccess(true);
        setTimeout(() => setPasswordModalOpen(false), 2000);
      }
    } catch (error: any) {
      setPasswordError(error.message || 'Erro ao alterar senha. Tente fazer login novamente.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setNewUserLoading(true);
    setNewUserError('');
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;
    const email = `${username}@hortamanager.com`;

    try {
      // Use a secondary app to create the user without logging out the owner
      const secondaryApp = getApps().find(a => a.name === 'Secondary') || initializeApp(firebaseConfig, 'Secondary');
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      await updateProfile(userCredential.user, { displayName: name });

      const newProfile: UserProfile = {
        uid: userCredential.user.uid,
        email: email,
        displayName: name,
        role: 'employee',
        permissions: {
          canManageInventory: formData.get('canManageInventory') === 'on',
          canManageSales: formData.get('canManageSales') === 'on',
          canViewFinance: formData.get('canViewFinance') === 'on',
          canViewReports: formData.get('canViewReports') === 'on',
          canManageCustomers: formData.get('canManageCustomers') === 'on',
          canManageProduction: formData.get('canManageProduction') === 'on',
          canManageTasks: formData.get('canManageTasks') === 'on',
        }
      };

      await setDoc(doc(db, 'users', userCredential.user.uid), newProfile);
      
      // Sign out from the secondary app and delete it
      await signOut(secondaryAuth);
      // Note: firebase/app doesn't have a direct 'deleteApp' in the standard SDK easily accessible here 
      // but creating a new one with a unique name or just letting it be is usually fine for this context.
      
      setUserModalOpen(false);
      (e.target as HTMLFormElement).reset();
    } catch (error: any) {
      setNewUserError(error.message || 'Erro ao criar usuário');
      console.error(error);
    } finally {
      setNewUserLoading(false);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('role', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newUsers = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as unknown as UserProfile));
      setUsers(newUsers);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const catQ = query(collection(db, 'categories'), orderBy('name', 'asc'));
    const catUnsubscribe = onSnapshot(catQ, (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
      setLoading(false);
    });

    return () => { unsubscribe(); catUnsubscribe(); };
  }, []);

  const handleAddCategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      type: formData.get('type') as 'inventory' | 'transaction'
    };

    try {
      await addDoc(collection(db, 'categories'), data);
      setCategoryModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'categories');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Excluir esta categoria?')) return;
    try {
      await firestoreDeleteDoc(doc(db, 'categories', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'categories');
    }
  };

  const togglePermission = async (userId: string, permission: keyof UserPermissions) => {
    const user = users.find(u => u.uid === userId);
    if (!user) return;

    const newPermissions = {
      ...user.permissions,
      [permission]: !user.permissions[permission]
    };

    try {
      await updateDoc(doc(db, 'users', userId), { permissions: newPermissions });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const changeRole = async (userId: string, role: 'owner' | 'employee') => {
    try {
      await updateDoc(doc(db, 'users', userId), { role });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  if (currentUserProfile?.role !== 'owner') {
    return <div className="p-10 text-center text-rose-600 font-bold">Acesso restrito ao proprietário.</div>;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Gerenciamento de Equipe</h2>
          <p className="text-slate-500 mt-1">Controle quem pode acessar cada parte do sistema.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setPasswordModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all active:scale-95"
          >
            <Shield size={20} />
            Alterar Minha Senha
          </button>
          <button 
            onClick={() => setUserModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95"
          >
            <UserPlus size={20} />
            Novo Usuário
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6">
        {users.map((user) => (
          <motion.div 
            layout
            key={user.uid} 
            className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black",
                  user.role === 'owner' ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                )}>
                  {user.displayName?.[0] || 'U'}
                </div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900">{user.displayName}</h4>
                  <p className="text-slate-500 font-medium">{user.email}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                      user.role === 'owner' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    )}>
                      {user.role === 'owner' ? 'Dono' : 'Funcionário'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-1 lg:px-10">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Permissões de Acesso</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { key: 'canManageInventory', label: 'Estoque', icon: Shield },
                    { key: 'canManageSales', label: 'Vendas', icon: Shield },
                    { key: 'canManageCustomers', label: 'Clientes', icon: Shield },
                    { key: 'canManageProduction', label: 'Produção', icon: Shield },
                    { key: 'canManageTasks', label: 'Tarefas', icon: Shield },
                    { key: 'canViewFinance', label: 'Financeiro', icon: Shield },
                    { key: 'canViewReports', label: 'Relatórios', icon: Shield },
                  ].map((perm) => (
                    <button
                      key={perm.key}
                      disabled={user.role === 'owner'}
                      onClick={() => togglePermission(user.uid, perm.key as keyof UserPermissions) }
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all",
                        user.role === 'owner' 
                          ? "bg-emerald-50 border-emerald-100 text-emerald-700 cursor-default"
                          : user.permissions[perm.key as keyof UserPermissions]
                            ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100"
                            : "bg-white border-slate-200 text-slate-400 hover:border-emerald-200 hover:text-emerald-600"
                      )}
                    >
                      <perm.icon size={20} />
                      <span className="text-[10px] font-black uppercase tracking-wider">{perm.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {user.uid !== currentUserProfile.uid && (
                  <>
                    <button 
                      onClick={() => changeRole(user.uid, user.role === 'owner' ? 'employee' : 'owner')}
                      className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all"
                    >
                      Mudar para {user.role === 'owner' ? 'Funcionário' : 'Dono'}
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedUserForReset(user);
                        setResetModalOpen(true);
                      }}
                      className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all"
                    >
                      Redefinir Senha
                    </button>
                    <button 
                      onClick={async () => {
                        if (confirm('Excluir este usuário?')) {
                          try {
                            await firestoreDeleteDoc(doc(db, 'users', user.uid));
                          } catch (error) {
                            handleFirestoreError(error, OperationType.DELETE, 'users');
                          }
                        }
                      }}
                      className="px-6 py-3 bg-rose-50 text-rose-600 rounded-xl font-bold text-sm hover:bg-rose-100 transition-all"
                    >
                      Excluir Usuário
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="pt-12 border-t border-slate-200">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Sistema e Segurança</h2>
            <p className="text-slate-500 mt-1">Backup, limpeza e migração de banco de dados.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Card 1: Backup e Restauração de Dados */}
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                  <Download size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Backup de Dados</h3>
                  <p className="text-sm text-slate-500">Baixe ou envie cópias de segurança do seu sistema.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <button 
                  onClick={handleExportBackup}
                  disabled={backupLoading || importLoading}
                  className="py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer"
                >
                  {backupLoading ? <RefreshCcw size={16} className="animate-spin" /> : <Download size={16} />}
                  Exportar JSON
                </button>
                <label 
                  className={cn(
                    "py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm text-center cursor-pointer",
                    (importLoading || backupLoading) && "opacity-50 pointer-events-none"
                  )}
                >
                  {importLoading ? <RefreshCcw size={16} className="animate-spin" /> : <Upload size={16} />}
                  {importLoading ? 'Lendo...' : 'Importar JSON'}
                  <input 
                    type="file" 
                    accept=".json" 
                    onChange={handleImportBackup} 
                    disabled={importLoading || backupLoading} 
                    className="hidden" 
                  />
                </label>
              </div>
              
              {importError && (
                <p className="text-xs text-rose-500 font-bold mt-1 text-center">{importError}</p>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-4 text-center uppercase tracking-widest font-bold">
              Backup automático realizado 2x por semana.
            </p>
          </div>

          {/* Card 2: Supabase / PostgreSQL Script definitions */}
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-violet-100 text-violet-600 rounded-xl">
                  <Database size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Script Supabase (SQL)</h3>
                  <p className="text-sm text-slate-500">Gere códigos SQL DDL estruturados para instanciar no seu Supabase.</p>
                </div>
              </div>
              <button 
                onClick={() => setSqlModalOpen(true)}
                className="w-full py-3 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Database size={16} />
                Obter Código SQL Supabase
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-4 text-center uppercase tracking-widest font-bold">
              Otimizado para PostgreSQL com chaves e índices.
            </p>
          </div>

          {/* Card 3: Limpeza completa */}
          <div className="bg-white p-8 rounded-2xl border border-rose-100 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-rose-100 text-rose-600 rounded-xl">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 text-rose-600">Zerar Sistema</h3>
                  <p className="text-sm text-slate-500">Apaga permanentemente todos os dados (exceto seu usuário).</p>
                </div>
              </div>
              <button 
                onClick={() => setWipeDataModalOpen(true)}
                className="w-full py-3 px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Trash2 size={16} />
                Zerar Todas as Informações
              </button>
            </div>
            <p className="text-[10px] text-rose-400 mt-4 text-center uppercase tracking-widest font-bold">
              Atenção: Ação irreversível!
            </p>
          </div>
        </div>
      </div>

      <div className="pt-12 border-t border-slate-200">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Categorias</h2>
            <p className="text-slate-500 mt-1">Gerencie as categorias de estoque e financeiro.</p>
          </div>
          <button 
            onClick={() => setCategoryModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
          >
            <Plus size={20} />
            Nova Categoria
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Package size={20} className="text-emerald-600" />
              Categorias de Estoque
            </h3>
            <div className="flex flex-wrap gap-2">
              {categories.filter(c => c.type === 'inventory').map(cat => (
                <div key={cat.id} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-sm border border-emerald-100 group">
                  {cat.name}
                  <button onClick={() => handleDeleteCategory(cat.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-emerald-400 hover:text-rose-600">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <DollarSign size={20} className="text-blue-600" />
              Categorias Financeiras
            </h3>
            <div className="flex flex-wrap gap-2">
              {categories.filter(c => c.type === 'transaction').map(cat => (
                <div key={cat.id} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl font-bold text-sm border border-blue-100 group">
                  {cat.name}
                  <button onClick={() => handleDeleteCategory(cat.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-rose-600">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Change My Password Modal */}
      <AnimatePresence>
        {isPasswordModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPasswordModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-bold text-slate-900">Alterar Minha Senha</h3>
                  <button onClick={() => setPasswordModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleChangeMyPassword} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Nova Senha</label>
                    <input 
                      name="newPassword" 
                      type="password"
                      required 
                      placeholder="••••••••"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Confirmar Nova Senha</label>
                    <input 
                      name="confirmPassword" 
                      type="password"
                      required 
                      placeholder="••••••••"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {passwordError && (
                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-sm font-bold flex items-center gap-2">
                      <XCircle size={18} />
                      {passwordError}
                    </div>
                  )}

                  {passwordSuccess && (
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-600 text-sm font-bold flex items-center gap-2">
                      <CheckCircle2 size={18} />
                      Senha alterada com sucesso!
                    </div>
                  )}

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => setPasswordModalOpen(false)}
                      className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      disabled={passwordLoading}
                      className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50"
                    >
                      {passwordLoading ? 'Alterando...' : 'Salvar Senha'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset User Password Modal */}
      <AnimatePresence>
        {isResetModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setResetModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Shield size={32} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Redefinir Senha</h3>
                <p className="text-slate-500 mb-8 text-sm">
                  Para segurança do sistema, para alterar a senha de <strong>{selectedUserForReset?.displayName}</strong>, você deve excluir o usuário e criá-lo novamente com a nova senha.
                </p>

                <div className="flex gap-3">
                  <button 
                    onClick={() => setResetModalOpen(false)}
                    className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Entendi
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* User Creation Modal */}
      <AnimatePresence>
        {isUserModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setUserModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-bold text-slate-900">Cadastrar Novo Funcionário</h3>
                  <button onClick={() => setUserModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleCreateUser} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Nome Completo</label>
                      <input 
                        name="name" 
                        required 
                        placeholder="Ex: João Silva"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Usuário (Login)</label>
                      <input 
                        name="username" 
                        required 
                        placeholder="Ex: joao.silva"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Senha Inicial</label>
                    <input 
                      name="password" 
                      type="password"
                      required 
                      placeholder="••••••••"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Definir Acessos Iniciais</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'canManageInventory', label: 'Estoque' },
                        { key: 'canManageSales', label: 'Vendas' },
                        { key: 'canManageCustomers', label: 'Clientes' },
                        { key: 'canManageProduction', label: 'Produção' },
                        { key: 'canManageTasks', label: 'Tarefas' },
                        { key: 'canViewFinance', label: 'Financeiro' },
                        { key: 'canViewReports', label: 'Relatórios' },
                      ].map((perm) => (
                        <label key={perm.key} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-emerald-50 transition-colors">
                          <input 
                            type="checkbox" 
                            name={perm.key}
                            className="w-5 h-5 text-emerald-600 rounded-lg border-slate-300 focus:ring-emerald-500"
                          />
                          <span className="text-sm font-bold text-slate-700">{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {newUserError && (
                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-sm font-bold flex items-center gap-2">
                      <XCircle size={18} />
                      {newUserError}
                    </div>
                  )}

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => setUserModalOpen(false)}
                      className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      disabled={newUserLoading}
                      className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50"
                    >
                      {newUserLoading ? 'Criando...' : 'Criar Usuário'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Category Modal */}
      <AnimatePresence>
        {isCategoryModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCategoryModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-bold text-slate-900">Nova Categoria</h3>
                  <button onClick={() => setCategoryModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleAddCategory} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Nome</label>
                    <input 
                      name="name" 
                      required 
                      placeholder="Ex: Sementes"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Tipo</label>
                    <select 
                      name="type" 
                      required 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="inventory">Estoque</option>
                      <option value="transaction">Financeiro</option>
                    </select>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => setCategoryModalOpen(false)}
                      className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                    >
                      Criar Categoria
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Wipe Data Modal */}
      <AnimatePresence>
        {isWipeDataModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setWipeDataModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <AlertTriangle size={32} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 text-center mb-2">Atenção!</h3>
                <p className="text-slate-500 text-center mb-8 text-sm">
                  Você está prestes a apagar <strong>TODOS</strong> os dados do sistema. Esta ação não pode ser desfeita.
                </p>

                <form onSubmit={handleWipeData} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Confirme sua Senha de Login</label>
                    <input 
                      name="password" 
                      type="password"
                      required 
                      placeholder="••••••••"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  {wipeError && (
                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-sm font-bold flex items-center gap-2">
                      <XCircle size={18} />
                      {wipeError}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setWipeDataModalOpen(false)}
                      className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      disabled={wipeLoading}
                      className="flex-1 px-6 py-4 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 disabled:opacity-50"
                    >
                      {wipeLoading ? 'Apagando...' : 'Sim, Apagar Tudo'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Supabase SQL DDL Modal */}
      <AnimatePresence>
        {isSqlModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSqlModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-4xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-violet-100 text-violet-600 rounded-xl">
                    <Database size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Script SQL para Supabase</h3>
                    <p className="text-xs text-slate-500 mt-1">Definições de tabelas, chaves e índices para Banco PostgreSQL / Supabase.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSqlModalOpen(false)}
                  className="p-2 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body / Code Area */}
              <div className="p-8 overflow-y-auto space-y-6 flex-1">
                <div className="bg-slate-900 p-6 rounded-2xl relative group border border-slate-800 shadow-inner">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(
`-- SQL para Supabase (PostgreSQL) - HortaManager
-- Adicione estas tabelas no "SQL Editor" do seu painel do Supabase.

-- Habilitar gerar UUIDs se necessário
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Perfis de Usuários (users)
CREATE TABLE IF NOT EXISTS public.users (
    uid TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'employee')) DEFAULT 'employee',
    permissions JSONB NOT NULL DEFAULT '{
        "canManageInventory": false,
        "canManageSales": false,
        "canViewFinance": false,
        "canViewReports": false,
        "canManageCustomers": false,
        "canManageProduction": false,
        "canManageTasks": false
    }'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabela de Categorias (categories)
CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('inventory', 'transaction')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_category_name_type UNIQUE (name, type)
);

-- 3. Tabela de Clientes (customers)
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    company_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabela de Itens de Estoque (inventory)
CREATE TABLE IF NOT EXISTS public.inventory (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('input', 'dispatch')),
    category TEXT NOT NULL,
    quantity NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    unit TEXT NOT NULL,
    price NUMERIC(12,2),
    cost_price NUMERIC(12,2),
    min_stock NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Tabela de Lotes de Produção (production)
CREATE TABLE IF NOT EXISTS public.production (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    crop TEXT NOT NULL,
    bed TEXT NOT NULL,
    planting_date TIMESTAMP WITH TIME ZONE NOT NULL,
    quantity_planted NUMERIC(12,2) NOT NULL,
    unit TEXT NOT NULL,
    inputs_used TEXT[] DEFAULT '{}'::TEXT[],
    production_type TEXT CHECK (production_type IN ('seedling', 'bed')),
    planting_source TEXT CHECK (planting_source IN ('seeds', 'internal_seedlings', 'purchased_seedlings')),
    transplant_date TIMESTAMP WITH TIME ZONE,
    estimated_harvest_date TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL CHECK (status IN ('growing', 'harvested', 'lost')) DEFAULT 'growing',
    is_continuous_harvest BOOLEAN DEFAULT FALSE,
    harvest_date TIMESTAMP WITH TIME ZONE,
    harvest_quantity NUMERIC(12,2),
    remaining_quantity NUMERIC(12,2),
    total_cost NUMERIC(12,2),
    unit_cost NUMERIC(12,2),
    logs JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Tabela de Vendas (sales)
CREATE TABLE IF NOT EXISTS public.sales (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    sale_number TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    items JSONB NOT NULL DEFAULT '[]'::JSONB,
    total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL CHECK (status IN ('ordered', 'pending_delivery', 'delivered', 'paid', 'cancelled', 'pending', 'confirmed')),
    delivery_date TIMESTAMP WITH TIME ZONE,
    payment_methods JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    confirmed_at TIMESTAMP WITH TIME ZONE
);

-- 7. Tabela de Transações Financeiras (transactions)
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount NUMERIC(12,2) NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    related_sale_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Tabela de Tarefas (tasks)
CREATE TABLE IF NOT EXISTS public.tasks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMP WITH TIME ZONE,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Tabela de Backups (backups)
CREATE TABLE IF NOT EXISTS public.backups (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by TEXT,
    type TEXT NOT NULL CHECK (type IN ('manual', 'auto', 'restore'))
);

-- Criar índices para otimização de consultas
CREATE INDEX IF NOT EXISTS idx_inventory_category ON public.inventory(category);
CREATE INDEX IF NOT EXISTS idx_production_status ON public.production(status);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_type_date ON public.transactions(type, date);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);

-- Comentários úteis
COMMENT ON TABLE public.users IS 'Perfis de acessos dos funcionários';
COMMENT ON TABLE public.inventory IS 'Estoque de insumos e expedição';
COMMENT ON TABLE public.production IS 'Plantios, canteiros e lotes de colheita';`
                      );
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="absolute top-4 right-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer z-10"
                  >
                    {copied ? 'Copiado!' : 'Copiar Script SQL'}
                  </button>
                  <pre className="font-mono text-xs text-slate-300 overflow-x-auto whitespace-pre leading-relaxed select-all">
{`-- SQL para Supabase (PostgreSQL) - HortaManager
-- Adicione estas tabelas no "SQL Editor" do seu painel do Supabase.

-- Habilitar gerar UUIDs se necessário
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Perfis de Usuários (users)
CREATE TABLE IF NOT EXISTS public.users (
    uid TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'employee')) DEFAULT 'employee',
    permissions JSONB NOT NULL DEFAULT '{
        "canManageInventory": false,
        "canManageSales": false,
        "canViewFinance": false,
        "canViewReports": false,
        "canManageCustomers": false,
        "canManageProduction": false,
        "canManageTasks": false
    }'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabela de Categorias (categories)
CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('inventory', 'transaction')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_category_name_type UNIQUE (name, type)
);

-- 3. Tabela de Clientes (customers)
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    company_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabela de Itens de Estoque (inventory)
CREATE TABLE IF NOT EXISTS public.inventory (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('input', 'dispatch')),
    category TEXT NOT NULL,
    quantity NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    unit TEXT NOT NULL,
    price NUMERIC(12,2),
    cost_price NUMERIC(12,2),
    min_stock NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Tabela de Lotes de Produção (production)
CREATE TABLE IF NOT EXISTS public.production (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    crop TEXT NOT NULL,
    bed TEXT NOT NULL,
    planting_date TIMESTAMP WITH TIME ZONE NOT NULL,
    quantity_planted NUMERIC(12,2) NOT NULL,
    unit TEXT NOT NULL,
    inputs_used TEXT[] DEFAULT '{}'::TEXT[],
    production_type TEXT CHECK (production_type IN ('seedling', 'bed')),
    planting_source TEXT CHECK (planting_source IN ('seeds', 'internal_seedlings', 'purchased_seedlings')),
    transplant_date TIMESTAMP WITH TIME ZONE,
    estimated_harvest_date TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL CHECK (status IN ('growing', 'harvested', 'lost')) DEFAULT 'growing',
    is_continuous_harvest BOOLEAN DEFAULT FALSE,
    harvest_date TIMESTAMP WITH TIME ZONE,
    harvest_quantity NUMERIC(12,2),
    remaining_quantity NUMERIC(12,2),
    total_cost NUMERIC(12,2),
    unit_cost NUMERIC(12,2),
    logs JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Tabela de Vendas (sales)
CREATE TABLE IF NOT EXISTS public.sales (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    sale_number TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    items JSONB NOT NULL DEFAULT '[]'::JSONB,
    total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL CHECK (status IN ('ordered', 'pending_delivery', 'delivered', 'paid', 'cancelled', 'pending', 'confirmed')),
    delivery_date TIMESTAMP WITH TIME ZONE,
    payment_methods JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    confirmed_at TIMESTAMP WITH TIME ZONE
);

-- 7. Tabela de Transações Financeiras (transactions)
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount NUMERIC(12,2) NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    related_sale_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Tabela de Tarefas (tasks)
CREATE TABLE IF NOT EXISTS public.tasks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMP WITH TIME ZONE,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Tabela de Backups (backups)
CREATE TABLE IF NOT EXISTS public.backups (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by TEXT,
    type TEXT NOT NULL CHECK (type IN ('manual', 'auto', 'restore'))
);

-- Criar índices para otimização de consultas
CREATE INDEX IF NOT EXISTS idx_inventory_category ON public.inventory(category);
CREATE INDEX IF NOT EXISTS idx_production_status ON public.production(status);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_type_date ON public.transactions(type, date);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);

-- Comentários úteis
COMMENT ON TABLE public.users IS 'Perfis de acessos dos funcionários';
COMMENT ON TABLE public.inventory IS 'Estoque de insumos e expedição';
COMMENT ON TABLE public.production IS 'Plantios, canteiros e lotes de colheita';`}
                  </pre>
                </div>
                
                <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl flex items-start gap-4">
                  <AlertTriangle className="text-amber-600 flex-shrink-0 mt-1" size={24} />
                  <div>
                    <h4 className="font-bold text-amber-800 text-sm">Práticas Recomendadas no Supabase</h4>
                    <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                      Ao usar este script no Supabase, configure o Row Level Security (RLS) se deseja restringir consultas anônimas diretas de clientes. Os relacionamentos de dados e formatos declarados acima preservam compatibilidade direta com a estrutura de documentos Firestore atual.
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-8 border-t border-slate-100 flex justify-end bg-slate-50 gap-3">
                <button 
                  onClick={() => setSqlModalOpen(false)}
                  className="px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  Fechar Janela
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
