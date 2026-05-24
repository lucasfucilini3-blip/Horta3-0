import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy, getDoc, increment, where, deleteDoc, getDocs, limit, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Sale, SaleStatus, InventoryItem, SaleItem, Customer, Production, PaymentMethod } from '../types';
import { Plus, Search, Filter, ShoppingCart, CheckCircle, XCircle, Clock, ChevronDown, Trash2, Package, X, Calendar, CreditCard, DollarSign, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, handleFirestoreError, OperationType } from '../App';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STATUS_CONFIG: any = {
  ordered: { label: 'Pedido Feito', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: ShoppingCart },
  pending_delivery: { label: 'Pendente de Entrega', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  delivered: { label: 'Entregue', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Package },
  paid: { label: 'Pago', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  cancelled: { label: 'Cancelado', color: 'bg-rose-100 text-rose-700 border-rose-200', icon: XCircle },
  // Fallbacks for old data
  pending: { label: 'Pendente', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  confirmed: { label: 'Pago', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
};

const PAYMENT_OPTIONS = ['Pix', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência Bancária'];

export default function Sales() {
  const { profile } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [harvestedProductions, setHarvestedProductions] = useState<Production[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<SaleStatus | 'all'>('all');

  // New Sale State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedItems, setSelectedItems] = useState<SaleItem[]>([]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<PaymentMethod[]>([]);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'sales'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newSales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
      setSales(newSales);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
    });

    const invQ = query(collection(db, 'inventory'), orderBy('name', 'asc'));
    const invUnsubscribe = onSnapshot(invQ, (snapshot) => {
      const newItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setInventory(newItems);
    });

    const prodQ = query(collection(db, 'production'), where('status', '==', 'harvested'), where('remainingQuantity', '>', 0));
    const prodUnsubscribe = onSnapshot(prodQ, (snapshot) => {
      setHarvestedProductions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Production)));
    });

    const custQ = query(collection(db, 'customers'), orderBy('companyName', 'asc'));
    const custUnsubscribe = onSnapshot(custQ, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      setLoading(false);
    });

    return () => { unsubscribe(); invUnsubscribe(); prodUnsubscribe(); custUnsubscribe(); };
  }, []);

  const handleAddItem = (id: string, type: 'inventory' | 'production') => {
    const item = type === 'inventory' 
      ? inventory.find(i => i.id === id)
      : harvestedProductions.find(p => p.id === id);
    
    if (!item) return;

    const name = type === 'inventory' ? (item as InventoryItem).name : (item as Production).crop;
    const price = type === 'inventory' ? ((item as InventoryItem).price || 0) : 0;
    const existing = selectedItems.find(si => si.itemId === id);
    
    if (existing) {
      setSelectedItems(selectedItems.map(si => 
        si.itemId === id ? { ...si, quantity: si.quantity + 1 } : si
      ));
    } else {
      setSelectedItems([...selectedItems, { itemId: id, name, quantity: 1, price }]);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    setSelectedItems(selectedItems.filter(si => si.itemId !== itemId));
  };

  const handleUpdateItem = (itemId: string, field: keyof SaleItem, value: any) => {
    setSelectedItems(selectedItems.map(si => 
      si.itemId === itemId ? { ...si, [field]: value } : si
    ));
  };

  const handleAddPaymentMethod = (method: string) => {
    if (selectedPaymentMethods.find(pm => pm.method === method)) return;
    const total = selectedItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const currentPaid = selectedPaymentMethods.reduce((acc, pm) => acc + pm.amount, 0);
    const remaining = Math.max(0, total - currentPaid);
    setSelectedPaymentMethods([...selectedPaymentMethods, { method, amount: remaining }]);
  };

  const handleRemovePaymentMethod = (method: string) => {
    setSelectedPaymentMethods(selectedPaymentMethods.filter(pm => pm.method !== method));
  };

  const handleUpdatePaymentAmount = (method: string, amount: number) => {
    setSelectedPaymentMethods(selectedPaymentMethods.map(pm => 
      pm.method === method ? { ...pm, amount } : pm
    ));
  };

  const handleOpenModal = (sale?: Sale) => {
    if (sale) {
      setEditingSaleId(sale.id);
      const customer = customers.find(c => c.companyName === sale.customerName);
      setSelectedCustomerId(customer?.id || '');
      setSelectedItems(sale.items);
      setDeliveryDate(sale.deliveryDate?.toDate ? format(sale.deliveryDate.toDate(), 'yyyy-MM-dd') : '');
      setSelectedPaymentMethods(sale.paymentMethods || []);
    } else {
      setEditingSaleId(null);
      setSelectedCustomerId('');
      setSelectedItems([]);
      setDeliveryDate('');
      setSelectedPaymentMethods([]);
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (selectedItems.length === 0 || !selectedCustomerId) return;
    setSaving(true);

    const customer = customers.find(c => c.id === selectedCustomerId);
    const total = selectedItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    
    // Generate a unique sale ID and number if it's a new sale
    const saleId = editingSaleId || `sale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const dateStr = format(now, 'yyyyMMdd');
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    const generatedSaleNumber = `V-${dateStr}-${randomStr}`;

    const saleData: any = {
      customerName: customer?.companyName || 'Cliente Desconhecido',
      customerPhone: customer?.phone || '',
      items: selectedItems,
      total,
      status: editingSaleId ? sales.find(s => s.id === editingSaleId)?.status || 'ordered' : 'ordered' as SaleStatus,
      deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
      paymentMethods: selectedPaymentMethods,
      createdAt: editingSaleId ? sales.find(s => s.id === editingSaleId)?.createdAt : serverTimestamp(),
    };

    if (!editingSaleId) {
      saleData.saleNumber = generatedSaleNumber;
    }

    try {
      if (editingSaleId) {
        await updateDoc(doc(db, 'sales', editingSaleId), saleData);
      } else {
        await setDoc(doc(db, 'sales', saleId), saleData);
      }
      setModalOpen(false);
      handleOpenModal(); // Reset state
    } catch (error: any) {
      setError('Erro ao salvar venda: ' + (error.message || 'Erro desconhecido'));
      handleFirestoreError(error, OperationType.WRITE, 'sales');
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = async (sale: Sale) => {
    setError(null);
    const nextStatusMap: Record<string, SaleStatus | null> = {
      ordered: 'pending_delivery',
      pending_delivery: 'delivered',
      delivered: 'paid',
      pending: 'pending_delivery', // Old status fallback
      paid: null,
      confirmed: null, // Old status fallback
      cancelled: null
    };

    const nextStatus = nextStatusMap[sale.status];
    if (!nextStatus) return;

    if (nextStatus === 'paid') {
      if (!sale.paymentMethods || sale.paymentMethods.length === 0) {
        setError('Para confirmar o pagamento, defina a forma de pagamento editando o pedido.');
        handleOpenModal(sale);
        return;
      }

      try {
        setSaving(true);
        const updatedItems = [];
        for (const item of sale.items) {
          let itemCost = 0;
          let productionId = null;

          const invRef = doc(db, 'inventory', item.itemId);
          const invSnap = await getDoc(invRef);
          
          if (invSnap.exists()) {
            const invData = invSnap.data() as InventoryItem;
            itemCost = invData.costPrice || 0;
            await updateDoc(invRef, {
              quantity: increment(-item.quantity),
              lastUpdated: serverTimestamp()
            });

            const prodQ = query(
              collection(db, 'production'), 
              where('crop', '==', invData.name),
              where('status', '==', 'harvested'),
              where('remainingQuantity', '>', 0),
              orderBy('harvestDate', 'asc'),
              limit(1)
            );
            const prodSnap = await getDocs(prodQ);
            if (!prodSnap.empty) {
              const oldestProd = prodSnap.docs[0];
              productionId = oldestProd.id;
              await updateDoc(doc(db, 'production', oldestProd.id), {
                remainingQuantity: increment(-item.quantity)
              });
            }
          } else {
            const prodRef = doc(db, 'production', item.itemId);
            const prodSnap = await getDoc(prodRef);
            if (prodSnap.exists()) {
              const prodData = prodSnap.data() as Production;
              itemCost = prodData.unitCost || 0;
              productionId = prodSnap.id;
              await updateDoc(prodRef, {
                remainingQuantity: increment(-item.quantity)
              });
            }
          }
          updatedItems.push({ ...item, cost: itemCost, productionId });
        }

        await updateDoc(doc(db, 'sales', sale.id), {
          status: 'paid',
          confirmedAt: serverTimestamp(),
          items: updatedItems
        });

        // Use setDoc with a predictable ID to prevent duplicates in finance
        await setDoc(doc(db, 'transactions', `sale_${sale.id}`), {
          type: 'income',
          amount: sale.total,
          description: `Venda ${sale.saleNumber} - ${sale.customerName}`,
          category: 'Venda de Produção',
          date: serverTimestamp(),
          relatedSaleId: sale.id
        });
      } catch (error: any) {
        setError('Erro ao avançar status: ' + (error.message || 'Erro desconhecido'));
        handleFirestoreError(error, OperationType.WRITE, 'sales');
      } finally {
        setSaving(false);
      }
    } else {
      try {
        setSaving(true);
        await updateDoc(doc(db, 'sales', sale.id), {
          status: nextStatus
        });
      } catch (error: any) {
        setError('Erro ao avançar status: ' + (error.message || 'Erro desconhecido'));
        handleFirestoreError(error, OperationType.WRITE, 'sales');
      } finally {
        setSaving(false);
      }
    }
  };

  const cancelSale = async (id: string) => {
    try {
      await updateDoc(doc(db, 'sales', id), { status: 'cancelled' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'sales');
    }
  };

  const deleteSale = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'sales', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'sales');
    }
  };

  const revertToPrevious = async (sale: Sale) => {
    setError(null);
    const prevStatusMap: Record<string, SaleStatus | null> = {
      ordered: null,
      pending_delivery: 'ordered',
      delivered: 'pending_delivery',
      paid: 'delivered',
      confirmed: 'delivered', // Old status fallback
      pending: null, // Old status fallback
      cancelled: 'ordered'
    };

    const prevStatus = prevStatusMap[sale.status];
    if (!prevStatus) return;

    try {
      setSaving(true);
      if (sale.status === 'paid' || sale.status === 'confirmed') {
        for (const item of sale.items) {
          const invRef = doc(db, 'inventory', item.itemId);
          const invSnap = await getDoc(invRef);
          
          if (invSnap.exists()) {
            await updateDoc(invRef, {
              quantity: increment(item.quantity),
              lastUpdated: serverTimestamp()
            });
          } else {
            const prodRef = doc(db, 'production', item.itemId);
            const prodSnap = await getDoc(prodRef);
            if (prodSnap.exists()) {
              await updateDoc(prodRef, {
                remainingQuantity: increment(item.quantity)
              });
            }
          }
        }

        const transRef = doc(db, 'transactions', `sale_${sale.id}`);
        const transSnap = await getDoc(transRef);
        if (transSnap.exists()) {
          await deleteDoc(transRef);
        }

        // Fallback for old transactions that might not have the predictable ID
        const transQ = query(collection(db, 'transactions'), where('relatedSaleId', '==', sale.id));
        const transSnapOld = await getDocs(transQ);
        for (const transDoc of transSnapOld.docs) {
          if (transDoc.id !== `sale_${sale.id}`) {
            await deleteDoc(doc(db, 'transactions', transDoc.id));
          }
        }
      }

      await updateDoc(doc(db, 'sales', sale.id), {
        status: prevStatus,
        confirmedAt: null
      });
    } catch (error: any) {
      setError('Erro ao reverter status: ' + (error.message || 'Erro desconhecido'));
      handleFirestoreError(error, OperationType.WRITE, 'sales');
    } finally {
      setSaving(false);
    }
  };

  const filteredSales = sales.filter(sale => {
    const searchLower = searchTerm.toLowerCase();
    const matchesCustomer = sale.customerName.toLowerCase().includes(searchLower);
    const matchesItems = sale.items.some(item => item.name.toLowerCase().includes(searchLower));
    const matchesPayments = sale.paymentMethods?.some(pm => pm.method.toLowerCase().includes(searchLower));
    const matchesPhone = sale.customerPhone?.toLowerCase().includes(searchLower);
    
    const matchesSearch = matchesCustomer || matchesItems || matchesPayments || matchesPhone;
    const matchesStatus = filterStatus === 'all' || sale.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 md:space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">Vendas e Pedidos</h2>
          <p className="text-slate-500 mt-1 text-sm md:text-base">Lance novos pedidos e confirme vendas.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95 text-sm md:text-base"
        >
          <Plus size={20} />
          Novo Pedido
        </button>
      </header>

      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por cliente, produto, pagamento..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm md:text-base"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="text-slate-400 shrink-0" size={20} />
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="flex-1 md:flex-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm md:text-base"
          >
            <option value="all">Todos Status</option>
            <option value="ordered">Pedidos Feitos</option>
            <option value="pending_delivery">Pendentes de Entrega</option>
            <option value="delivered">Entregues</option>
            <option value="paid">Pagos</option>
            <option value="cancelled">Cancelados</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredSales.map((sale) => (
          <motion.div 
            layout
            key={sale.id} 
            className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 md:gap-6">
              <div className="flex items-start gap-3 md:gap-4">
                <div className={cn(
                  "w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center border shrink-0",
                  (STATUS_CONFIG[sale.status] || STATUS_CONFIG.ordered).color
                )}>
                  {(() => {
                    const config = STATUS_CONFIG[sale.status] || STATUS_CONFIG.ordered;
                    const Icon = config.icon;
                    return <Icon size={20} className="md:w-6 md:h-6" />;
                  })()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-base md:text-lg font-bold text-slate-900 truncate">{sale.customerName}</h4>
                    <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{sale.saleNumber || 'S/N'}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 md:gap-1">
                    <p className="text-[10px] md:text-xs text-slate-500">
                      Status: {(STATUS_CONFIG[sale.status] || STATUS_CONFIG.ordered).label}
                    </p>
                    <p className="text-[10px] md:text-xs text-slate-500">
                      Lançado: {sale.createdAt?.toDate ? format(sale.createdAt.toDate(), "dd/MM/yy HH:mm", { locale: ptBR }) : '...'}
                    </p>
                    {sale.deliveryDate && (
                      <p className="text-[10px] md:text-xs font-bold text-emerald-600 flex items-center gap-1">
                        <Calendar size={10} className="md:w-3 md:h-3" />
                        Entrega: {format(sale.deliveryDate.toDate(), "dd 'de' MMMM", { locale: ptBR })}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 lg:px-10">
                <div className="flex flex-col gap-2 md:gap-3">
                  <div className="flex flex-wrap gap-1.5 md:gap-2">
                    {sale.items.map((item, i) => (
                      <span key={i} className="px-2 md:px-3 py-0.5 md:py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] md:text-xs font-medium whitespace-nowrap">
                        {item.quantity}x {item.name}
                      </span>
                    ))}
                  </div>
                  {sale.paymentMethods && sale.paymentMethods.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 md:gap-2">
                      {sale.paymentMethods.map((pm, i) => (
                        <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-md text-[9px] md:text-[10px] font-bold flex items-center gap-1 whitespace-nowrap">
                          <CreditCard size={10} />
                          {pm.method}: R$ {pm.amount.toFixed(2)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between lg:justify-end gap-4 md:gap-8 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
                <div className="text-left lg:text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</p>
                  <p className="text-lg md:text-xl font-black text-slate-900">R$ {sale.total.toFixed(2)}</p>
                </div>

                  <div className="flex items-center gap-1 md:gap-2">
                    <button 
                      onClick={() => handleOpenModal(sale)}
                      className="p-1.5 md:p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-all"
                      title="Editar Pedido"
                    >
                      <Edit2 size={16} className="md:w-[18px] md:h-[18px]" />
                    </button>
                    <button 
                      onClick={() => deleteSale(sale.id)}
                      className="p-1.5 md:p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all"
                      title="Excluir Pedido"
                    >
                      <Trash2 size={16} className="md:w-[18px] md:h-[18px]" />
                    </button>
                    {sale.status !== 'paid' && sale.status !== 'confirmed' && sale.status !== 'cancelled' && (
                      <>
                        <button 
                          onClick={() => advanceStatus(sale)}
                          className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                        >
                          {(sale.status === 'ordered' || sale.status === 'pending') && 'Pendente Entrega'}
                          {sale.status === 'pending_delivery' && 'Confirmar Entrega'}
                          {sale.status === 'delivered' && 'Confirmar Pagamento'}
                        </button>
                        <button 
                          onClick={() => cancelSale(sale.id)}
                          className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl font-bold text-sm hover:bg-rose-50 hover:text-rose-600 transition-all"
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                    {(sale.status === 'paid' || sale.status === 'confirmed') && (
                      <span className="text-emerald-600 font-bold text-sm flex items-center gap-1">
                        <CheckCircle size={16} /> Pago
                      </span>
                    )}
                    {sale.status !== 'ordered' && sale.status !== 'pending' && (
                      <button 
                        onClick={() => revertToPrevious(sale)}
                        className="text-slate-400 hover:text-emerald-600 text-xs font-bold transition-all underline underline-offset-2"
                      >
                        Voltar Etapa
                      </button>
                    )}
                  </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

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
              className="relative bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-bold text-slate-900">{editingSaleId ? 'Editar Pedido' : 'Novo Pedido'}</h3>
                  <button onClick={() => setModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                    <XCircle size={24} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                  {error && (
                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-sm font-medium flex items-center gap-2">
                      <XCircle size={18} />
                      {error}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Cliente</label>
                      <select 
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                        required 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Selecione um cliente</option>
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>{c.companyName} ({c.contactName})</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1">Data Prevista de Entrega</label>
                      <input 
                        type="date"
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-sm font-bold text-slate-700 ml-1">Produtos da Horta (Estoque de Expedição)</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border border-slate-100 rounded-xl">
                      {inventory.filter(item => item.type === 'dispatch').map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleAddItem(item.id, 'inventory')}
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 border border-transparent transition-all text-left"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-slate-700">{item.name}</span>
                            <span className="text-[10px] text-slate-400">Qtd: {item.quantity} {item.unit}</span>
                          </div>
                          <Plus size={16} className="text-emerald-600" />
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2">
                      {selectedItems.map((item, index) => (
                        <div key={index} className="flex items-center gap-3 p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                          <span className="flex-1 font-bold text-slate-800">{item.name}</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              value={item.quantity}
                              onChange={(e) => handleUpdateItem(item.itemId, 'quantity', Number(e.target.value))}
                              className="w-16 px-2 py-1 bg-white border border-emerald-200 rounded-lg text-center font-bold"
                            />
                            <span className="text-xs font-bold text-slate-400">x</span>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                              <input 
                                type="number" 
                                step="0.01"
                                value={item.price}
                                onChange={(e) => handleUpdateItem(item.itemId, 'price', Number(e.target.value))}
                                className="w-24 pl-7 pr-2 py-1 bg-white border border-emerald-200 rounded-lg font-bold"
                              />
                            </div>
                            <button 
                              type="button"
                              onClick={() => handleRemoveItem(item.itemId)}
                              className="p-1 text-rose-500 hover:bg-rose-100 rounded-lg"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-sm font-bold text-slate-700 ml-1">Formas de Pagamento</label>
                    <div className="flex flex-wrap gap-2">
                      {PAYMENT_OPTIONS.map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleAddPaymentMethod(opt)}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                            selectedPaymentMethods.find(pm => pm.method === opt)
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    
                    {selectedPaymentMethods.length > 0 && (
                      <div className="space-y-2">
                        {selectedPaymentMethods.map(pm => (
                          <div key={pm.method} className="flex items-center gap-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                            <span className="flex-1 font-bold text-slate-700 text-sm">{pm.method}</span>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                              <input 
                                type="number" 
                                step="0.01"
                                value={pm.amount}
                                onChange={(e) => handleUpdatePaymentAmount(pm.method, Number(e.target.value))}
                                className="w-32 pl-7 pr-2 py-1 bg-white border border-blue-200 rounded-lg font-bold text-sm"
                              />
                            </div>
                            <button 
                              type="button"
                              onClick={() => handleRemovePaymentMethod(pm.method)}
                              className="p-1 text-rose-500 hover:bg-rose-100 rounded-lg"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total do Pedido</p>
                      <p className="text-2xl font-black text-emerald-600">
                        R$ {selectedItems.reduce((acc, item) => acc + (item.price * item.quantity), 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button 
                        type="button" 
                        onClick={() => setModalOpen(false)}
                        className="px-6 py-4 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button 
                        type="submit"
                        disabled={selectedItems.length === 0 || saving}
                        className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saving ? 'Salvando...' : editingSaleId ? 'Salvar Alterações' : 'Lançar Pedido'}
                      </button>
                    </div>
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
