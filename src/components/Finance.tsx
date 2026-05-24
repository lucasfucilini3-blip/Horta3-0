import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, where, limit, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Transaction, TransactionType, Category } from '../types';
import { Plus, Search, Filter, ArrowUpCircle, ArrowDownCircle, DollarSign, Calendar, Tag, ChevronRight, X, Edit2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, handleFirestoreError, OperationType } from '../App';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Finance() {
  const { profile } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setModalOpen] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [lastCategory, setLastCategory] = useState<string>(localStorage.getItem('last_fin_category') || '');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<TransactionType | 'all'>('all');

  useEffect(() => {
    const q = query(collection(db, 'transactions'), orderBy('date', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(newTransactions);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    const catQ = query(collection(db, 'categories'), where('type', '==', 'transaction'), orderBy('name', 'asc'));
    const catUnsubscribe = onSnapshot(catQ, (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
      setLoading(false);
    });

    return () => { unsubscribe(); catUnsubscribe(); };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      type: formData.get('type') as TransactionType,
      amount: Number(formData.get('amount')),
      description: formData.get('description') as string,
      category: formData.get('category') as string,
      date: editingTransaction ? editingTransaction.date : serverTimestamp(),
    };

    try {
      if (editingTransaction) {
        await updateDoc(doc(db, 'transactions', editingTransaction.id), data);
      } else {
        await addDoc(collection(db, 'transactions'), data);
        localStorage.setItem('last_fin_category', data.category);
        setLastCategory(data.category);
      }
      setModalOpen(false);
      setEditingTransaction(null);
    } catch (error) {
      handleFirestoreError(error, editingTransaction ? OperationType.UPDATE : OperationType.WRITE, 'transactions');
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await addDoc(collection(db, 'categories'), {
        name: newCatName.trim(),
        type: 'transaction',
        createdAt: serverTimestamp()
      });
      setNewCatName('');
      setIsAddingCategory(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'categories');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'transactions', id));
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'transactions');
    }
  };

  const filteredTransactions = transactions.filter(t => 
    filterType === 'all' || t.type === filterType
  );

  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((acc, t) => acc + t.amount, 0);

  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => acc + t.amount, 0);

  const [sales, setSales] = useState<any[]>([]);
  useEffect(() => {
    const q = query(collection(db, 'sales'), where('status', 'in', ['ordered', 'pending_delivery', 'delivered', 'pending']));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const totalReceivable = sales.reduce((acc, s) => acc + (s.total || 0), 0);

  return (
    <div className="space-y-6 md:space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">Financeiro</h2>
          <p className="text-slate-500 mt-1 text-sm md:text-base">Controle suas receitas e despesas.</p>
        </div>
        <button 
          onClick={() => setModalOpen(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95 text-sm md:text-base"
        >
          <Plus size={20} />
          Lançar Despesa
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
              <ArrowUpCircle size={20} />
            </div>
            <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Entradas</span>
          </div>
          <p className="text-xl md:text-2xl font-black text-emerald-600">R$ {totalIncome.toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
              <ArrowDownCircle size={20} />
            </div>
            <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Saídas</span>
          </div>
          <p className="text-xl md:text-2xl font-black text-rose-600">R$ {totalExpense.toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <DollarSign size={20} />
            </div>
            <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">A Receber</span>
          </div>
          <p className="text-xl md:text-2xl font-black text-blue-600">R$ {totalReceivable.toFixed(2)}</p>
        </div>
        <div className="bg-slate-900 p-5 md:p-6 rounded-2xl shadow-xl shadow-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-slate-800 text-emerald-400 rounded-lg">
              <DollarSign size={20} />
            </div>
            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Saldo Total</span>
          </div>
          <p className="text-xl md:text-2xl font-black text-white">R$ {(totalIncome - totalExpense).toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-slate-900">Transações Recentes</h3>
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-slate-400 shrink-0" />
            <select 
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="flex-1 md:flex-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Todas</option>
              <option value="income">Receitas</option>
              <option value="expense">Despesas</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredTransactions.map((t) => (
            <div key={t.id} className="p-4 md:p-6 flex items-center justify-between hover:bg-slate-50 transition-colors group">
              <div className="flex items-center gap-3 md:gap-4 min-w-0">
                <div className={cn(
                  "w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0 border",
                  t.type === 'income' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100"
                )}>
                  {t.type === 'income' ? <ArrowUpCircle size={20} className="md:w-6 md:h-6" /> : <ArrowDownCircle size={20} className="md:w-6 md:h-6" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-900 text-sm md:text-base truncate">{t.description}</p>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3 mt-0.5 md:mt-1">
                    <span className="flex items-center gap-1 text-[10px] md:text-xs text-slate-400 font-medium whitespace-nowrap">
                      <Calendar size={12} />
                      {t.date?.toDate ? format(t.date.toDate(), "dd/MM/yyyy", { locale: ptBR }) : '...'}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] md:text-xs text-slate-400 font-medium truncate">
                      <Tag size={12} />
                      {t.category}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 md:gap-4 ml-4 shrink-0">
                <div className="text-right">
                  <p className={cn(
                    "text-sm md:text-lg font-black whitespace-nowrap",
                    t.type === 'income' ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {t.type === 'income' ? '+' : '-'} R$ {t.amount.toFixed(2)}
                  </p>
                  {t.relatedSaleId && (
                    <span className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Venda Vinculada</span>
                  )}
                </div>
                <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => {
                      setEditingTransaction(t);
                      setModalOpen(true);
                    }}
                    className="p-1.5 md:p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Edit2 size={16} className="md:w-[18px] md:h-[18px]" />
                  </button>
                  <button 
                    onClick={() => setDeletingId(t.id)}
                    className="p-1.5 md:p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Excluir"
                  >
                    <Trash2 size={16} className="md:w-[18px] md:h-[18px]" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filteredTransactions.length === 0 && (
            <div className="p-20 text-center text-slate-400">
              <DollarSign size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium">Nenhuma transação encontrada.</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingId(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden p-8 text-center"
            >
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Confirmar Exclusão</h3>
              <p className="text-slate-500 mb-8 text-sm">
                Deseja realmente excluir este lançamento financeiro? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeletingId(null)}
                  className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDelete(deletingId)}
                  className="flex-1 px-6 py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-100"
                >
                  Sim, Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Category Modal */}
      <AnimatePresence>
        {isAddingCategory && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingCategory(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden p-8"
            >
              <h3 className="text-xl font-bold text-slate-900 mb-4">Nova Categoria</h3>
              <div className="space-y-4">
                <input 
                  autoFocus
                  placeholder="Nome da categoria"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
                />
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsAddingCategory(false)}
                    className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleCreateCategory}
                    disabled={!newCatName.trim()}
                    className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalOpen(false)}
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
                  <h3 className="text-2xl font-bold text-slate-900">
                    {editingTransaction ? 'Editar Lançamento' : 'Lançar Transação'}
                  </h3>
                  <button onClick={() => { setModalOpen(false); setEditingTransaction(null); }} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                    <ChevronRight size={24} className="rotate-90" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Tipo</label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="cursor-pointer">
                        <input 
                          type="radio" 
                          name="type" 
                          value="income" 
                          className="peer hidden" 
                          defaultChecked={editingTransaction?.type === 'income'}
                        />
                        <div className="p-4 border border-slate-200 rounded-xl text-center font-bold text-slate-500 peer-checked:bg-emerald-600 peer-checked:text-white peer-checked:border-emerald-600 transition-all">
                          Entrada
                        </div>
                      </label>
                      <label className="cursor-pointer">
                        <input 
                          type="radio" 
                          name="type" 
                          value="expense" 
                          className="peer hidden" 
                          defaultChecked={editingTransaction ? editingTransaction.type === 'expense' : true}
                        />
                        <div className="p-4 border border-slate-200 rounded-xl text-center font-bold text-slate-500 peer-checked:bg-rose-600 peer-checked:text-white peer-checked:border-rose-600 transition-all">
                          Saída
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Descrição</label>
                    <input 
                      name="description" 
                      required 
                      defaultValue={editingTransaction?.description}
                      placeholder="Ex: Compra de Fertilizante"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Valor (R$)</label>
                      <input 
                        name="amount" 
                        type="number" 
                        step="0.01"
                        required 
                        defaultValue={editingTransaction?.amount}
                        placeholder="0,00"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Categoria</label>
                      <div className="flex gap-2">
                        <select 
                          name="category" 
                          required 
                          defaultValue={editingTransaction?.category || lastCategory}
                          className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                        <button 
                          type="button"
                          onClick={() => setIsAddingCategory(true)}
                          className="p-3 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl hover:bg-emerald-100 transition-colors shadow-sm"
                          title="Adicionar Nova Categoria"
                        >
                          <Plus size={20} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => { setModalOpen(false); setEditingTransaction(null); }}
                      className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                    >
                      {editingTransaction ? 'Salvar Alterações' : 'Salvar Lançamento'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
