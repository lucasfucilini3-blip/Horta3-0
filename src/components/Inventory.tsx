import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc as firestoreDeleteDoc, serverTimestamp, orderBy, where, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { InventoryItem, InventoryCategory, Category } from '../types';
import { Plus, Search, Filter, MoreVertical, Edit2, Trash2, AlertTriangle, Package, X as CloseIcon, ArrowDownCircle, Settings2, Tag, ShoppingCart, Scroll } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, handleFirestoreError, OperationType } from '../App';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CATEGORIES: { value: InventoryCategory; label: string; color: string }[] = [
  { value: 'seed', label: 'Sementes', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'fertilizer', label: 'Fertilizantes', color: 'bg-amber-100 text-amber-700' },
  { value: 'produce', label: 'Produção', color: 'bg-blue-100 text-blue-700' },
  { value: 'tool', label: 'Ferramentas', color: 'bg-slate-100 text-slate-700' },
  { value: 'other', label: 'Outros', color: 'bg-purple-100 text-purple-700' },
];

export default function Inventory() {
  const { profile } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setModalOpen] = useState(false);
  const [isStockModalOpen, setStockModalOpen] = useState(false);
  const [isCategoryModalOpen, setCategoryModalOpen] = useState(false);
  const [isHistoryModalOpen, setHistoryModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [stockItem, setStockItem] = useState<InventoryItem | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [modalType, setModalType] = useState<'input' | 'dispatch'>('input');
  const [searchTerm, setSearchTerm] = useState('');
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);

  useEffect(() => {
    if (editingItem) {
      setModalType(editingItem.type);
    } else {
      setModalType('input');
    }
  }, [editingItem, isModalOpen]);
  
  const [filterCategory, setFilterCategory] = useState<string>('all');

  useEffect(() => {
    if (!historyItem) {
      setHistoryLogs([]);
      return;
    }

    // 1. Specific history logs (new system)
    const qHistory = query(
      collection(db, 'inventory_history'),
      where('itemId', '==', historyItem.id),
      orderBy('date', 'desc')
    );

    // 2. Financial transactions for legacy stock entries (old system fallback)
    const qTransactions = query(
      collection(db, 'transactions'),
      where('category', '==', 'Compra de Insumos'),
      orderBy('date', 'desc')
    );

    // 3. Match crop transplant entries from production docs (case-insensitive client-side filtering)
    const normalizedCropName = historyItem.name.replace(/^(Mudas?\s+de\s+)/i, '').trim().toLowerCase();
    const qProduction = query(
      collection(db, 'production')
    );

    let rawHistory: any[] = [];
    let rawTrans: any[] = [];
    let rawProd: any[] = [];

    const handleMerge = (hist: any[], trans: any[], prodList: any[]) => {
      // Map transactions to history log objects if they aren't already represented in hist
      const mappedTrans = trans
        .filter(t => {
          const desc = t.description || '';
          // Transaction description must mention our item name
          if (!desc.toLowerCase().includes(historyItem.name.toLowerCase())) return false;
          
          // To prevent duplicates between new inventory_history and transactions (since both are created now)
          // we filter out transactions with timestamps within 1 minute of an existing history log
          const tTime = t.date ? (t.date.seconds ? t.date.seconds * 1000 : new Date(t.date).getTime()) : 0;
          const hasDuplicateHist = hist.some(h => {
            const hTime = h.date ? (h.date.seconds ? h.date.seconds * 1000 : new Date(h.date).getTime()) : 0;
            return Math.abs(tTime - hTime) < 60000; // 60 seconds
          });
          
          return !hasDuplicateHist;
        })
        .map(t => {
          const desc = t.description || '';
          
          let quantity = 0;
          let supplier = '';
          
          // E.g. "Compra de estoque: Adubo (10kg)" or "Compra de estoque: Adubo (10kg) - Fornecedor: Silva"
          const qtyMatch = desc.match(/\(([\d,.]+)\s*(\w+)?\)/);
          if (qtyMatch) {
            quantity = Number(qtyMatch[1].replace(',', '.'));
          }
          
          const supplierMatch = desc.match(/fornecedor:\s*([^-)(]+)/i) || desc.match(/de onde:\s*([^-)(]+)/i);
          if (supplierMatch) {
            supplier = supplierMatch[1].trim();
          }

          return {
            id: `trans-${t.id}`,
            itemId: historyItem.id,
            itemName: historyItem.name,
            quantity: quantity || 0,
            unit: historyItem.unit,
            costPrice: quantity ? t.amount / quantity : 0,
            price: historyItem.price || 0,
            type: 'add_stock',
            description: desc,
            supplier: supplier || null,
            date: t.date,
            isFromTransaction: true
          };
        });

      // Synthesize logs for historical transplants from the productions list
      const mappedProdLogs: any[] = [];
      const isMudasCategory = historyItem.category === 'Mudas' || historyItem.name.toLowerCase().includes('muda');

      if (isMudasCategory) {
        prodList.forEach(p => {
          const isTransplanted = p.productionType === 'bed' && (p.plantingSource === 'internal_seedlings' || p.transplantDate);
          if (!isTransplanted) return;
          
          const qty = p.quantityPlanted || 0;
          const totalCost = p.totalCost || 0;
          const unitCost = qty > 0 ? totalCost / qty : 0;
          
          const sowingDate = p.plantingDate || p.createdAt || p.date;
          const transplantDate = p.transplantDate || p.updatedAt || p.date;
          
          const tTime = transplantDate ? (transplantDate.seconds ? transplantDate.seconds * 1000 : new Date(transplantDate).getTime()) : 0;
          
          const hasAddDuplicate = hist.some(h => {
            if (h.type !== 'add_stock') return false;
            const hTime = h.date ? (h.date.seconds ? h.date.seconds * 1000 : new Date(h.date).getTime()) : 0;
            return Math.abs(tTime - hTime) < 30 * 60 * 1000; // 30 mins
          });
          
          const hasUseDuplicate = hist.some(h => {
            if (h.type !== 'use_stock') return false;
            const hTime = h.date ? (h.date.seconds ? h.date.seconds * 1000 : new Date(h.date).getTime()) : 0;
            return Math.abs(tTime - hTime) < 30 * 60 * 1000; // 30 mins
          });
          
          if (!hasAddDuplicate) {
            mappedProdLogs.push({
              id: `prod-add-${p.id}`,
              itemId: historyItem.id,
              itemName: historyItem.name,
              quantity: qty,
              unit: historyItem.unit || 'mudas',
              costPrice: unitCost,
              price: 0,
              type: 'add_stock',
              description: `Entrada via produção de mudas (Estufa de Origem) [Histórico Sincronizado]`,
              date: sowingDate || transplantDate
            });
          }
          
          if (!hasUseDuplicate) {
            mappedProdLogs.push({
              id: `prod-use-${p.id}`,
              itemId: historyItem.id,
              itemName: historyItem.name,
              quantity: -qty,
              unit: historyItem.unit || 'mudas',
              costPrice: unitCost,
              price: 0,
              type: 'use_stock',
              description: `Saída via transplante para canteiro de destino: ${p.bed || 'Canteiro'} [Histórico Sincronizado]`,
              date: transplantDate
            });
          }
        });
      }

      // Combine and sort by date descending
      const combined = [...hist, ...mappedTrans, ...mappedProdLogs];
      combined.sort((a, b) => {
        const aTime = a.date ? (a.date.seconds ? a.date.seconds * 1000 : new Date(a.date).getTime()) : 0;
        const bTime = b.date ? (b.date.seconds ? b.date.seconds * 1000 : new Date(b.date).getTime()) : 0;
        return bTime - aTime;
      });

      setHistoryLogs(combined);
    };

    const unsubHistory = onSnapshot(qHistory, (snapshot) => {
      rawHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      handleMerge(rawHistory, rawTrans, rawProd);
    }, (error) => {
      console.error("Erro ao carregar historico:", error);
    });

    const unsubTrans = onSnapshot(qTransactions, (snapshot) => {
      rawTrans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      handleMerge(rawHistory, rawTrans, rawProd);
    }, (error) => {
      console.error("Erro ao carregar transações financeiras para histórico:", error);
    });

    const unsubProd = onSnapshot(qProduction, (snapshot) => {
      rawProd = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((p: any) => (p.crop || '').trim().toLowerCase() === normalizedCropName);
      handleMerge(rawHistory, rawTrans, rawProd);
    }, (error) => {
      console.error("Erro ao carregar produções antigas para histórico de mudas:", error);
    });

    return () => {
      unsubHistory();
      unsubTrans();
      unsubProd();
    };
  }, [historyItem]);

  useEffect(() => {
    const q = query(collection(db, 'inventory'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setItems(newItems);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inventory');
    });

    const catQ = query(collection(db, 'categories'), where('type', '==', 'inventory'), orderBy('name', 'asc'));
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
      name: formData.get('name') as string,
      type: formData.get('type') as 'input' | 'dispatch',
      category: formData.get('category') as InventoryCategory,
      quantity: Number(formData.get('quantity')),
      unit: formData.get('unit') as string,
      minStock: Number(formData.get('minStock')),
      price: Number(formData.get('price')) || 0,
      costPrice: Number(formData.get('costPrice')) || 0,
      lastUpdated: serverTimestamp(),
    };

    try {
      if (editingItem) {
        await updateDoc(doc(db, 'inventory', editingItem.id), data);
        if (editingItem.quantity !== data.quantity) {
          const diff = data.quantity - editingItem.quantity;
          await addDoc(collection(db, 'inventory_history'), {
            itemId: editingItem.id,
            itemName: data.name,
            quantity: diff,
            unit: data.unit,
            costPrice: data.costPrice,
            price: data.price,
            type: diff > 0 ? 'adjustment_in' : 'adjustment_out',
            description: `Ajuste manual de estoque (Anterior: ${editingItem.quantity}, Atual: ${data.quantity})`,
            date: serverTimestamp()
          });
        }
      } else {
        const docRef = await addDoc(collection(db, 'inventory'), data);
        await addDoc(collection(db, 'inventory_history'), {
          itemId: docRef.id,
          itemName: data.name,
          quantity: data.quantity,
          unit: data.unit,
          costPrice: data.costPrice,
          price: data.price,
          type: 'initial',
          description: 'Cadastro inicial de estoque',
          date: serverTimestamp()
        });
      }
      setModalOpen(false);
      setEditingItem(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleAddStock = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!stockItem) return;
    const formData = new FormData(e.currentTarget);
    const addQuantity = Number(formData.get('quantity'));
    const totalCost = Number(formData.get('cost'));
    const unitCost = totalCost / addQuantity;
    const supplier = (formData.get('supplier') as string) || '';

    try {
      const newTotalQuantity = stockItem.quantity + addQuantity;
      const newCostPrice = ((stockItem.quantity * (stockItem.costPrice || 0)) + (addQuantity * unitCost)) / newTotalQuantity;

      // Update inventory
      await updateDoc(doc(db, 'inventory', stockItem.id), {
        quantity: increment(addQuantity),
        costPrice: newCostPrice,
        lastUpdated: serverTimestamp()
      });

      // Create financial transaction
      await addDoc(collection(db, 'transactions'), {
        type: 'expense',
        amount: totalCost,
        description: `Compra de estoque: ${stockItem.name} (${addQuantity}${stockItem.unit})${supplier ? ` - Fornecedor: ${supplier}` : ''}`,
        category: 'Compra de Insumos',
        date: serverTimestamp()
      });

      // Create inventory history entry
      await addDoc(collection(db, 'inventory_history'), {
        itemId: stockItem.id,
        itemName: stockItem.name,
        quantity: addQuantity,
        unit: stockItem.unit,
        costPrice: unitCost,
        price: stockItem.price || 0,
        type: 'add_stock',
        description: `Entrada via compra de estoque${supplier ? ` (Fornecedor: ${supplier})` : ''}`,
        supplier: supplier || null,
        date: serverTimestamp()
      });

      setStockModalOpen(false);
      setStockItem(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este item?')) return;
    try {
      await firestoreDeleteDoc(doc(db, 'inventory', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'inventory');
    }
  };

  const handleAddCategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;

    try {
      if (editingCategory) {
        await updateDoc(doc(db, 'categories', editingCategory.id), { name });
        setEditingCategory(null);
      } else {
        await addDoc(collection(db, 'categories'), { name, type: 'inventory' });
      }
      (e.target as HTMLFormElement).reset();
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

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const inputItems = filteredItems.filter(item => item.type === 'input' || !item.type); // Fallback for old items
  const dispatchItems = filteredItems.filter(item => item.type === 'dispatch');

  const InventoryTable = ({ items, title, icon: Icon }: { items: InventoryItem[], title: string, icon: any }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
        <Icon size={20} className="text-emerald-600" />
        <h3 className="font-bold text-slate-800 text-sm md:text-base">{title}</h3>
        <span className="ml-auto px-2 py-1 bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap">
          {items.length} Itens
        </span>
      </div>
      <div className="overflow-x-auto scrollbar-hide">
        <table className="w-full text-left border-collapse min-w-[600px] md:min-w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 md:px-6 py-4 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Item</th>
              <th className="px-4 md:px-6 py-4 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Categoria</th>
              <th className="px-4 md:px-6 py-4 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Quantidade</th>
              <th className="px-4 md:px-6 py-4 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">
                {title.includes('Entrada') ? 'Custo Unitário' : (profile?.role === 'owner' ? 'Custo/Preço' : 'Preço de Venda')}
              </th>
              <th className="px-4 md:px-6 py-4 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">
                Valor Total
              </th>
              <th className="px-4 md:px-6 py-4 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-4 md:px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                      <Package size={18} className="md:w-5 md:h-5" />
                    </div>
                    <span className="font-semibold text-slate-800 text-sm md:text-base truncate max-w-[120px] md:max-w-none">{item.name}</span>
                  </div>
                </td>
                <td className="px-4 md:px-6 py-4">
                  <span className="px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs font-bold bg-slate-100 text-slate-700 whitespace-nowrap">
                    {item.category}
                  </span>
                </td>
                <td className="px-4 md:px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-900 text-sm md:text-base whitespace-nowrap">{item.quantity} {item.unit}</span>
                    {item.quantity <= item.minStock && (
                      <span className="text-[9px] md:text-[10px] text-rose-500 font-bold flex items-center gap-1">
                        <AlertTriangle size={10} /> Baixo
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 md:px-6 py-4">
                  <div className="flex flex-col">
                    {(profile?.role === 'owner' || item.type === 'input') && (
                      <div className="flex flex-col">
                        {item.type === 'input' && <span className="text-[9px] text-slate-400 uppercase font-bold">Custo Unit.</span>}
                        <span className="text-sm md:text-base font-bold text-slate-900 whitespace-nowrap">R$ {item.costPrice?.toFixed(2) || '0.00'}</span>
                      </div>
                    )}
                    {item.type === 'dispatch' && profile?.role === 'owner' && (
                      <span className="text-[10px] md:text-xs text-slate-400 whitespace-nowrap italic">Custo: R$ {item.costPrice?.toFixed(2) || '0.00'}</span>
                    )}
                    {item.type === 'dispatch' && (
                      <span className="text-[10px] md:text-xs font-bold text-emerald-600 whitespace-nowrap">Venda: R$ {item.price?.toFixed(2) || '0.00'}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 md:px-6 py-4">
                  <div className="flex flex-col">
                    {(profile?.role === 'owner' || item.type === 'input') ? (
                      <span className="text-sm md:text-base font-bold text-slate-900 whitespace-nowrap">
                        R$ {(item.quantity * (item.costPrice || 0)).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-sm md:text-base font-bold text-emerald-600 whitespace-nowrap">
                        R$ {(item.quantity * (item.price || 0)).toFixed(2)}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Total</span>
                  </div>
                </td>
                <td className="px-4 md:px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1 md:gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => { setStockItem(item); setStockModalOpen(true); }}
                      className="p-1.5 md:p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                      title="Adicionar Estoque"
                    >
                      <Plus size={16} className="md:w-[18px] md:h-[18px]" />
                    </button>
                    <button 
                      onClick={() => { setHistoryItem(item); setHistoryModalOpen(true); }}
                      className="p-1.5 md:p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      title="Histórico de Entradas"
                    >
                      <Scroll size={16} className="md:w-[18px] md:h-[18px]" />
                    </button>
                    <button 
                      onClick={() => { setEditingItem(item); setModalOpen(true); }}
                      className="p-1.5 md:p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                    >
                      <Edit2 size={16} className="md:w-[18px] md:h-[18px]" />
                    </button>
                    <button 
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 md:p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                    >
                      <Trash2 size={16} className="md:w-[18px] md:h-[18px]" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 md:px-6 py-12 text-center text-slate-400 italic">
                  Nenhum item encontrado nesta seção.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">Estoque</h2>
          <p className="text-slate-500 mt-1 text-sm md:text-base">Gerencie seus insumos e produtos para expedição.</p>
        </div>
        <div className="flex gap-2 md:gap-3">
          <button 
            onClick={() => setCategoryModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 md:px-6 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-sm active:scale-95 text-sm md:text-base"
          >
            <Settings2 size={18} className="md:w-5 md:h-5" />
            Categorias
          </button>
          <button 
            onClick={() => { setEditingItem(null); setModalOpen(true); }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 md:px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95 text-sm md:text-base"
          >
            <Plus size={18} className="md:w-5 md:h-5" />
            Novo Item
          </button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar no estoque..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm md:text-base"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="text-slate-400 shrink-0" size={20} />
          <select 
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="flex-1 md:flex-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm md:text-base"
          >
            <option value="all">Todas Categorias</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <InventoryTable 
          items={inputItems} 
          title="Estoque de Entrada (Insumos)" 
          icon={Package} 
        />
        
        <InventoryTable 
          items={dispatchItems} 
          title="Estoque de Expedição (Produtos)" 
          icon={ShoppingCart} 
        />
      </div>

      {/* Category Management Modal */}
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
                  <h3 className="text-2xl font-bold text-slate-900">Gerenciar Categorias</h3>
                  <button onClick={() => setCategoryModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                    <CloseIcon size={24} />
                  </button>
                </div>

                <form onSubmit={handleAddCategory} className="flex gap-2 mb-8">
                  <input 
                    name="name" 
                    required 
                    key={editingCategory?.id || 'new'}
                    defaultValue={editingCategory?.name}
                    placeholder={editingCategory ? "Editar nome..." : "Nova categoria..."}
                    className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button 
                    type="submit"
                    className="bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                  >
                    {editingCategory ? <Edit2 size={24} /> : <Plus size={24} />}
                  </button>
                  {editingCategory && (
                    <button 
                      type="button"
                      onClick={() => setEditingCategory(null)}
                      className="bg-slate-100 text-slate-600 p-3 rounded-xl hover:bg-slate-200 transition-all"
                    >
                      <CloseIcon size={24} />
                    </button>
                  )}
                </form>

                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {categories.length === 0 ? (
                    <p className="text-center text-slate-400 py-4">Nenhuma categoria cadastrada.</p>
                  ) : (
                    categories.map(cat => (
                      <div key={cat.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-3">
                          <Tag size={18} className="text-emerald-600" />
                          <span className="font-bold text-slate-700">{cat.name}</span>
                        </div>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => setEditingCategory(cat)}
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100">
                  <button 
                    onClick={() => setCategoryModalOpen(false)}
                    className="w-full px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isStockModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setStockModalOpen(false)}
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
                  <h3 className="text-2xl font-bold text-slate-900">Adicionar Estoque</h3>
                  <button onClick={() => setStockModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                    <CloseIcon size={24} />
                  </button>
                </div>

                <form onSubmit={handleAddStock} className="space-y-6">
                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                    <p className="text-sm font-bold text-blue-700">Item: {stockItem?.name}</p>
                    <p className="text-xs text-blue-600">Estoque atual: {stockItem?.quantity} {stockItem?.unit}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Tipo de Estoque</label>
                    <select 
                      name="type" 
                      required 
                      value={modalType}
                      onChange={(e) => setModalType(e.target.value as 'input' | 'dispatch')}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="input">Entrada de Insumos (Seeds, Adubos, etc)</option>
                      <option value="dispatch">Expedição (Produtos para Venda)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Qtd a Adicionar</label>
                      <input 
                        name="quantity" 
                        type="number" 
                        step="0.01"
                        required 
                        placeholder="0.00"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Custo Total (R$)</label>
                      <input 
                        name="cost" 
                        type="number" 
                        step="0.01"
                        required 
                        placeholder="0,00"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Fornecedor / Origem (Opcional)</label>
                    <input 
                      name="supplier" 
                      type="text" 
                      placeholder="Ex: Agropecuária Silva, Mercado..."
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <p className="text-xs text-slate-400 italic">
                    * Esta ação aumentará o estoque e gerará uma despesa no financeiro.
                  </p>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => setStockModalOpen(false)}
                      className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                    >
                      Confirmar Compra
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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
                    {editingItem ? 'Editar Item' : 'Novo Item'}
                  </h3>
                  <button onClick={() => setModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                    <CloseIcon size={24} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Tipo de Estoque</label>
                    <select 
                      name="type" 
                      required 
                      defaultValue={editingItem?.type || 'input'}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="input">Entrada de Insumos (Seeds, Adubos, etc)</option>
                      <option value="dispatch">Expedição (Produtos para Venda)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Nome do Item</label>
                    <input 
                      name="name" 
                      required 
                      defaultValue={editingItem?.name}
                      placeholder="Ex: Alface Crespa"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Categoria</label>
                      <select 
                        name="category" 
                        required 
                        defaultValue={editingItem?.category}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Selecione...</option>
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Unidade</label>
                      <input 
                        name="unit" 
                        required 
                        defaultValue={editingItem?.unit || 'unidade'}
                        placeholder="Ex: kg, g, un"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {(profile?.role === 'owner' || modalType === 'input') && (
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">Custo Unitário (R$)</label>
                        <input 
                          name="costPrice" 
                          type="number" 
                          step="0.01"
                          defaultValue={editingItem?.costPrice || 0}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    )}
                    {modalType === 'dispatch' && (
                      <div className={cn("space-y-2", profile?.role !== 'owner' && "col-span-2")}>
                        <label className="text-sm font-bold text-slate-700 ml-1">Preço de Venda (R$)</label>
                        <input 
                          name="price" 
                          type="number" 
                          step="0.01"
                          defaultValue={editingItem?.price || 0}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Quantidade Atual</label>
                      <input 
                        name="quantity" 
                        type="number" 
                        step="0.01"
                        required 
                        defaultValue={editingItem?.quantity || 0}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Estoque Mínimo</label>
                      <input 
                        name="minStock" 
                        type="number" 
                        step="0.01"
                        required 
                        defaultValue={editingItem?.minStock || 0}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button" 
                      onClick={() => setModalOpen(false)}
                      className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                    >
                      Salvar Item
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {isHistoryModalOpen && historyItem && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setHistoryModalOpen(false); setHistoryItem(null); }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
            >
              <div className="p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                      <Scroll size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl md:text-2xl font-bold text-slate-900">Histórico de Entradas</h3>
                      <p className="text-xs md:text-sm text-slate-500">Item: <span className="font-bold text-slate-700">{historyItem.name}</span> ({historyItem.quantity} {historyItem.unit} atual)</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setHistoryModalOpen(false); setHistoryItem(null); }} 
                    className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-all"
                  >
                    <CloseIcon size={24} />
                  </button>
                </div>

                <div className="overflow-y-auto max-h-[50vh] pr-2 space-y-4">
                  {historyLogs.length === 0 ? (
                    <div className="border border-dashed border-slate-200 rounded-2xl p-8 text-center space-y-3">
                      <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center mx-auto text-slate-400">
                        <Scroll size={20} />
                      </div>
                      <p className="text-sm font-medium text-slate-600">Sem lançamentos registrados no histórico.</p>
                      
                      {/* Synthesized fallback starting state */}
                      <div className="bg-slate-50 rounded-xl p-4 text-left border border-slate-100 max-w-md mx-auto">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Cadastro</span>
                          <span className="text-xs text-slate-500 font-medium">
                            {historyItem.lastUpdated ? (
                              typeof historyItem.lastUpdated.toDate === 'function' ? 
                              historyItem.lastUpdated.toDate().toLocaleDateString('pt-BR') : 
                              new Date(historyItem.lastUpdated.seconds * 1000 || historyItem.lastUpdated).toLocaleDateString('pt-BR')
                            ) : new Date().toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-700">Quantidade Atual Registrada</p>
                        <p className="text-lg font-extrabold text-indigo-600 mt-1">
                          + {historyItem.quantity} {historyItem.unit}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1 italic">
                          * Este é o saldo atual registrado como ponto de partida.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="relative border-l-2 border-slate-100 ml-4 pl-6 space-y-4 py-2">
                      {historyLogs.map((log) => {
                        const quantityNum = Number(log.quantity) || 0;
                        const isPositive = quantityNum > 0;
                        const qtyText = isPositive ? `+${log.quantity}` : `${log.quantity}`;
                        const badgeColor = 
                          log.type === 'initial' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                          log.type === 'add_stock' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                          log.type === 'use_stock' ? 'bg-rose-100 text-rose-800 border-rose-200' :
                          log.type === 'harvest' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                          log.type === 'adjustment_in' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                          log.type === 'adjustment_out' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                          log.type === 'use_planting' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                          'bg-indigo-50 text-indigo-700 border-indigo-100';

                        const typeLabel = 
                          log.type === 'initial' ? 'Cadastro Inicial' :
                          log.type === 'add_stock' ? 'Entrada / Compra' :
                          log.type === 'use_stock' ? 'Saída de Mudas / Uso' :
                          log.type === 'harvest' ? 'Colheita' :
                          log.type === 'adjustment_in' ? 'Ajuste de Entrada' :
                          log.type === 'adjustment_out' ? 'Ajuste de Saída' :
                          log.type === 'use_planting' ? 'Consumo Insumo' :
                          'Movimentação';

                        const logDateStr = log.date ? (
                          typeof log.date.toDate === 'function' ? 
                          log.date.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 
                          new Date(log.date.seconds * 1000 || log.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        ) : '';

                        return (
                          <div key={log.id} className="relative group">
                            {/* Dot indicator */}
                            <div className={cn(
                              "absolute -left-[31px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ring-4 ring-white transition-all",
                              isPositive ? "bg-emerald-500 scale-125" : "bg-orange-500 scale-125"
                            )} />
                            
                            <div className="bg-slate-50 hover:bg-indigo-50/40 transition-all rounded-xl p-4 border border-slate-100 space-y-2">
                              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border whitespace-nowrap", badgeColor)}>
                                    {typeLabel}
                                  </span>
                                  <span className="text-[11px] text-slate-400 font-semibold">{logDateStr}</span>
                                </div>
                                <div className="text-right">
                                  <span className={cn(
                                    "text-sm font-extrabold whitespace-nowrap",
                                    isPositive ? "text-emerald-600 font-extrabold" : "text-slate-600 font-bold"
                                  )}>
                                    {qtyText} {log.unit}
                                  </span>
                                </div>
                              </div>

                              <p className="text-xs font-semibold text-slate-700">{log.description}</p>

                              {log.supplier && (
                                <p className="text-[11px] font-bold text-indigo-600 bg-indigo-50/50 inline-block px-2 py-0.5 rounded-lg border border-indigo-100/50">
                                  Fornecedor: <span className="text-slate-700">{log.supplier}</span>
                                </p>
                              )}

                              {/* Unit or cost price if item has price metrics */}
                              {((log.costPrice && log.costPrice > 0) || (log.price && log.price > 0)) && (
                                <div className="pt-2 border-t border-slate-200/50 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-500">
                                  {log.costPrice && log.costPrice > 0 && (
                                    <span>Custo Unit.: <strong className="text-slate-700">R$ {log.costPrice.toFixed(2)}</strong></span>
                                  )}
                                  {log.price && log.price > 0 && (
                                    <span>Preço Venda: <strong className="text-slate-700">R$ {log.price.toFixed(2)}</strong></span>
                                  )}
                                  {log.costPrice && log.costPrice > 0 && log.quantity && (
                                    <span className="ml-auto">Custo Total: <strong className="text-slate-800">R$ {Math.abs(Number(log.quantity) * log.costPrice).toFixed(2)}</strong></span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-8 pt-4 border-t border-slate-100 flex justify-end">
                  <button 
                    onClick={() => { setHistoryModalOpen(false); setHistoryItem(null); }}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-100 text-sm"
                  >
                    Fechar Histórico
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

const X = ({ size, className }: { size: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  </svg>
);
