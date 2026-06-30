import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy, getDoc, increment, where, deleteDoc, getDocs, limit, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Sale, SaleStatus, InventoryItem, SaleItem, Customer, Production, PaymentMethod, ProduceCatalogItem } from '../types';
import { Plus, Search, Filter, ShoppingCart, CheckCircle, XCircle, Clock, ChevronDown, Trash2, Package, X, Calendar, CreditCard, DollarSign, Edit2, Store, Truck, RotateCcw, AlertTriangle, RefreshCw, ClipboardList } from 'lucide-react';
import HarvestReport from './HarvestReport';
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

const formatUnit = (unit: string, qty: number = 1) => {
  const u = (unit || '').toLowerCase().trim();
  if (
    u === 'pé' || 
    u === 'pe' || 
    u === 'pés' || 
    u === 'pes' || 
    u === 'pés de alface' || 
    u === 'pé de alface' ||
    u === 'pacote' ||
    u === 'pacotes' ||
    u.includes('pe de') ||
    u.includes('pe d') ||
    u.includes('pé de') ||
    u.includes('pés de')
  ) {
    return 'pct';
  }
  return unit;
};

const isMuda = (item: any) => {
  const cat = (item.category || '').toLowerCase().trim();
  return cat === 'muda' || cat === 'mudas';
};

const isPeUnitOrName = (item: any) => {
  const u = (item.unit || '').toLowerCase().trim();
  const n = (item.name || '').toLowerCase().trim();
  const cat = (item.category || '').toLowerCase().trim();

  // If explicitly "processados" or similar, it's a sales/processed item, NOT raw garden item
  if (
    cat === 'processados' ||
    cat === 'processadas' ||
    cat === 'processado' ||
    cat === 'procecados' ||
    cat === 'procecado' ||
    cat === 'procecada' ||
    cat === 'procecidas'
  ) {
    return false;
  }

  // If explicitly "produção" or similar, it's a raw garden item colhido
  if (
    cat === 'produção' ||
    cat === 'producao' ||
    cat === 'produçao' ||
    cat === 'colheita' ||
    cat === 'produce' ||
    cat.startsWith('produ')
  ) {
    return true;
  }

  // Otherwise fallback to unit/name check
  return (
    u === 'pé' ||
    u === 'pe' ||
    u === 'pés' ||
    u === 'pes' ||
    u.startsWith('pé ') ||
    u.startsWith('pe ') ||
    u.startsWith('pés ') ||
    u.startsWith('pes ') ||
    u.includes(' de alface') || 
    n.startsWith('pé ') ||
    n.startsWith('pe ') ||
    n.includes(' pé ') ||
    n.includes(' pe ')
  );
};

export default function Sales() {
  const { profile } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [harvestedProductions, setHarvestedProductions] = useState<Production[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [produceCatalog, setProduceCatalog] = useState<ProduceCatalogItem[]>([]);
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

  // Specific States for Delivery Editing in Modal
  const [isDeliveryEditing, setIsDeliveryEditing] = useState(false);
  const [deliveryAddressEditing, setDeliveryAddressEditing] = useState('');
  const [deliveryObservationsEditing, setDeliveryObservationsEditing] = useState('');
  const [deliveryClientPhoneEditing, setDeliveryClientPhoneEditing] = useState('');
  const [customCustomerNameEditing, setCustomCustomerNameEditing] = useState('');
  const [showEditCustomerSuggestions, setShowEditCustomerSuggestions] = useState(false);
  const [editCustomerSearchTerm, setEditCustomerSearchTerm] = useState('');

  // New Fair (Modo Feira) States
  const [activeTab, setActiveTab] = useState<'individual' | 'feira' | 'delivery' | 'colheita'>('individual');

  // Venda Delivery States
  const [deliveryClientName, setDeliveryClientName] = useState('');
  const [deliveryClientPhone, setDeliveryClientPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryDateInput, setDeliveryDateInput] = useState('');
  const [deliveryObservations, setDeliveryObservations] = useState('');
  const [deliverySelectedItems, setDeliverySelectedItems] = useState<SaleItem[]>([]);
  const [deliveryPaymentMethod, setDeliveryPaymentMethod] = useState<string>('Pagar na Entrega');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);

  const [lastMatchingSaleForDelivery, setLastMatchingSaleForDelivery] = useState<Sale | null>(null);
  const [lastMatchingSaleForEditing, setLastMatchingSaleForEditing] = useState<Sale | null>(null);

  useEffect(() => {
    const cleanPhone = deliveryClientPhone.replace(/\D/g, '');
    if (cleanPhone.length >= 8) {
      const match = sales.find(s => s.customerPhone && s.customerPhone.replace(/\D/g, '') === cleanPhone);
      setLastMatchingSaleForDelivery(match || null);
    } else {
      setLastMatchingSaleForDelivery(null);
    }
  }, [deliveryClientPhone, sales]);

  useEffect(() => {
    const cleanPhone = deliveryClientPhoneEditing.replace(/\D/g, '');
    if (cleanPhone.length >= 8) {
      const match = sales.find(s => s.customerPhone && s.customerPhone.replace(/\D/g, '') === cleanPhone);
      setLastMatchingSaleForEditing(match || null);
    } else {
      setLastMatchingSaleForEditing(null);
    }
  }, [deliveryClientPhoneEditing, sales]);

  const [fairs, setFairs] = useState<any[]>([]);
  const [activeFair, setActiveFair] = useState<any | null>(null);
  const [loadingFair, setLoadingFair] = useState(true);
  const [newFairName, setNewFairName] = useState('');
  const [selectedLoadQuantities, setSelectedLoadQuantities] = useState<Record<string, number>>({});
  const [showCloseFairModal, setShowCloseFairModal] = useState(false);
  const [closingPix, setClosingPix] = useState(0);
  const [closingCash, setClosingCash] = useState(0);
  const [closingCard, setClosingCard] = useState(0);
  const [closingReturnToInventory, setClosingReturnToInventory] = useState(true);
  const [closingSaving, setClosingSaving] = useState(false);
  const [quickPaymentMethod, setQuickPaymentMethod] = useState<string>('Dinheiro');

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

    const catQ = query(collection(db, 'produce_catalog'), orderBy('name', 'asc'));
    const catUnsubscribe = onSnapshot(catQ, (snapshot) => {
      setProduceCatalog(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    }, (error) => {
      console.error("Erro ao carregar catálogo de produtos:", error);
    });

    const fairsQ = query(collection(db, 'fairs'), orderBy('date', 'desc'));
    const fairsUnsubscribe = onSnapshot(fairsQ, (snapshot) => {
      const allFairs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFairs(allFairs);
      const active = allFairs.find((f: any) => f.status === 'active');
      setActiveFair(active || null);
      setLoadingFair(false);
    }, (error) => {
      console.error("Erro ao carregar faturamento de feiras:", error);
      setLoadingFair(false);
    });

    return () => { 
      unsubscribe(); 
      invUnsubscribe(); 
      prodUnsubscribe(); 
      custUnsubscribe(); 
      fairsUnsubscribe();
      catUnsubscribe();
    };
  }, []);

  const handleAddItem = (id: string, type: 'inventory' | 'production' | 'catalog') => {
    let name = '';
    let price = 0;

    if (type === 'inventory') {
      const item = inventory.find(i => i.id === id);
      if (!item) return;
      name = item.name;
      price = item.price || 0;
    } else if (type === 'production') {
      const item = harvestedProductions.find(p => p.id === id);
      if (!item) return;
      name = item.crop;
      price = 0;
    } else if (type === 'catalog') {
      const item = produceCatalog.find(c => c.id === id);
      if (!item) return;
      name = item.name;
      price = item.defaultPrice || 0;
    } else {
      return;
    }

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
      setDeliveryDate(sale.deliveryDate?.toDate ? format(sale.deliveryDate.toDate(), 'yyyy-MM-dd') : (sale.deliveryDate ? format(new Date(sale.deliveryDate), 'yyyy-MM-dd') : ''));
      setSelectedPaymentMethods(sale.paymentMethods || []);
      
      // Load delivery states
      setIsDeliveryEditing(!!sale.isDelivery);
      setDeliveryAddressEditing(sale.deliveryAddress || '');
      setDeliveryObservationsEditing(sale.observations || '');
      setDeliveryClientPhoneEditing(sale.customerPhone || '');
      setCustomCustomerNameEditing(sale.customerName || '');
      setEditCustomerSearchTerm(sale.customerName || '');
    } else {
      setEditingSaleId(null);
      setSelectedCustomerId('');
      setSelectedItems([]);
      setDeliveryDate('');
      setSelectedPaymentMethods([]);
      
      // Reset delivery states
      setIsDeliveryEditing(false);
      setDeliveryAddressEditing('');
      setDeliveryObservationsEditing('');
      setDeliveryClientPhoneEditing('');
      setCustomCustomerNameEditing('');
      setEditCustomerSearchTerm('');
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (selectedItems.length === 0) {
      setError("Adicione pelo menos um produto.");
      return;
    }
    if (!isDeliveryEditing && !selectedCustomerId) {
      setError("Selecione um cliente.");
      return;
    }
    if (isDeliveryEditing && !customCustomerNameEditing.trim()) {
      setError("Por favor, preencha o nome do cliente.");
      return;
    }
    setSaving(true);

    let customerName = 'Cliente Desconhecido';
    let customerPhone = '';

    if (isDeliveryEditing) {
      customerName = customCustomerNameEditing.trim();
      customerPhone = deliveryClientPhoneEditing.trim();
    } else {
      const customer = customers.find(c => c.id === selectedCustomerId);
      customerName = customer?.companyName || 'Cliente Desconhecido';
      customerPhone = customer?.phone || '';
    }

    const total = selectedItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    
    // Generate a unique sale ID and number if it's a new sale
    const saleId = editingSaleId || `sale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const dateStr = format(now, 'yyyyMMdd');
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    const prefix = isDeliveryEditing ? 'D' : 'V';
    const generatedSaleNumber = `${prefix}-${dateStr}-${randomStr}`;

    const originalSale = editingSaleId ? sales.find(s => s.id === editingSaleId) : null;
    let fallbackStatus: SaleStatus = isDeliveryEditing ? 'pending_delivery' : 'ordered';
    if (originalSale) {
      fallbackStatus = originalSale.status;
    }

    const saleData: any = {
      customerName,
      customerPhone,
      items: selectedItems,
      total,
      status: fallbackStatus,
      deliveryDate: deliveryDate ? new Date(deliveryDate + 'T12:00:00') : null,
      paymentMethods: selectedPaymentMethods,
      createdAt: editingSaleId ? (originalSale?.createdAt || serverTimestamp()) : serverTimestamp(),
    };

    if (isDeliveryEditing) {
      saleData.isDelivery = true;
      saleData.deliveryAddress = deliveryAddressEditing.trim();
      saleData.observations = deliveryObservationsEditing.trim();
    } else {
      saleData.isDelivery = false;
      saleData.deliveryAddress = '';
      saleData.observations = '';
    }

    if (!editingSaleId) {
      saleData.saleNumber = generatedSaleNumber;
    } else if (originalSale?.saleNumber) {
      saleData.saleNumber = originalSale.saleNumber;
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

  const handleAddDeliveryItem = (id: string, type: 'inventory' | 'production' | 'catalog') => {
    let name = '';
    let price = 0;

    if (type === 'inventory') {
      const item = inventory.find(i => i.id === id);
      if (!item) return;
      name = item.name;
      price = item.price || 0;
    } else if (type === 'production') {
      const item = harvestedProductions.find(p => p.id === id);
      if (!item) return;
      name = item.crop;
      price = 0;
    } else if (type === 'catalog') {
      const item = produceCatalog.find(c => c.id === id);
      if (!item) return;
      name = item.name;
      price = item.defaultPrice || 0;
    } else {
      return;
    }

    const existing = deliverySelectedItems.find(si => si.itemId === id);
    if (existing) {
      setDeliverySelectedItems(deliverySelectedItems.map(si => 
        si.itemId === id ? { ...si, quantity: si.quantity + 1 } : si
      ));
    } else {
      setDeliverySelectedItems([...deliverySelectedItems, { itemId: id, name, quantity: 1, price }]);
    }
  };

  const handleRemoveDeliveryItem = (itemId: string) => {
    setDeliverySelectedItems(deliverySelectedItems.filter(si => si.itemId !== itemId));
  };

  const handleUpdateDeliveryItem = (itemId: string, field: keyof SaleItem, value: any) => {
    setDeliverySelectedItems(deliverySelectedItems.map(si => 
      si.itemId === itemId ? { ...si, [field]: value } : si
    ));
  };

  const handleSubmitDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!deliveryClientName.trim()) {
      setError("Por favor, informe o nome do cliente.");
      return;
    }
    if (deliverySelectedItems.length === 0) {
      setError("Selecione pelo menos 1 (um) produto.");
      return;
    }
    setSaving(true);

    const total = deliverySelectedItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const saleId = `sale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const dateStr = format(now, 'yyyyMMdd');
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    const generatedSaleNumber = `D-${dateStr}-${randomStr}`;

    const parsedDeliveryDate = deliveryDateInput ? new Date(deliveryDateInput + 'T12:00:00') : new Date();

    const saleData: any = {
      saleNumber: generatedSaleNumber,
      customerName: deliveryClientName.trim(),
      customerPhone: deliveryClientPhone.trim() || '',
      deliveryAddress: deliveryAddress.trim() || '',
      observations: deliveryObservations.trim() || '',
      items: deliverySelectedItems,
      total,
      status: 'pending_delivery' as SaleStatus,
      deliveryDate: parsedDeliveryDate,
      isDelivery: true,
      paymentMethods: [{ method: deliveryPaymentMethod, amount: total }],
      createdAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'sales', saleId), saleData);
      
      // Reset form variables
      setDeliveryClientName('');
      setDeliveryClientPhone('');
      setDeliveryAddress('');
      setDeliveryDateInput('');
      setDeliveryObservations('');
      setDeliverySelectedItems([]);
      setDeliveryPaymentMethod('Pagar na Entrega');
      setCustomerSearchTerm('');
      
      alert(`Venda Delivery cadastrada com sucesso! Número do pedido: ${generatedSaleNumber}`);
      setActiveTab('individual');
    } catch (err: any) {
      setError('Erro ao salvar venda delivery: ' + (err.message || 'Erro desconhecido'));
      handleFirestoreError(err, OperationType.WRITE, 'sales');
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
          let invSnap = await getDoc(invRef);
          let targetInvRef = invRef;

          if (!invSnap.exists()) {
            // Check if there is an inventory item with the same name
            const invByNameQ = query(collection(db, 'inventory'), where('name', '==', item.name), limit(1));
            const invByNameSnap = await getDocs(invByNameQ);
            if (!invByNameSnap.empty) {
              invSnap = invByNameSnap.docs[0];
              targetInvRef = doc(db, 'inventory', invSnap.id);
            }
          }
          
          if (invSnap.exists()) {
            const invData = invSnap.data() as InventoryItem;
            itemCost = invData.costPrice || 0;
            await updateDoc(targetInvRef, {
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
            let prodSnap = await getDoc(prodRef);
            let targetProdRef = prodRef;

            if (!prodSnap.exists()) {
              // Check if there is a production record with the same crop name
              const prodByCropQ = query(
                collection(db, 'production'),
                where('crop', '==', item.name),
                where('status', '==', 'harvested'),
                where('remainingQuantity', '>', 0),
                orderBy('harvestDate', 'asc'),
                limit(1)
              );
              const prodByCropSnap = await getDocs(prodByCropQ);
              if (!prodByCropSnap.empty) {
                prodSnap = prodByCropSnap.docs[0];
                targetProdRef = doc(db, 'production', prodSnap.id);
              }
            }

            if (prodSnap.exists()) {
              const prodData = prodSnap.data() as Production;
              itemCost = prodData.unitCost || 0;
              productionId = prodSnap.id;
              await updateDoc(targetProdRef, {
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

  // Carrega lista com todos os itens de expedição com quantidade inicial 0
  useEffect(() => {
    if (activeTab === 'feira' && !activeFair) {
      const initialLoads: Record<string, number> = {};
      inventory.filter(item => item.type === 'dispatch' && !isPeUnitOrName(item) && !isMuda(item)).forEach(item => {
        initialLoads[item.id] = 0;
      });
      setSelectedLoadQuantities(initialLoads);
      
      const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      const dayName = days[new Date().getDay()];
      setNewFairName(`Feira de ${dayName} - ${format(new Date(), 'dd/MM/yyyy')}`);
    }
  }, [activeTab, activeFair, inventory]);

  const handleStartFair = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const itemsToLoad = Object.entries(selectedLoadQuantities)
        .map(([id, qty]) => {
          const invItem = inventory.find(i => i.id === id);
          if (!invItem || Number(qty) <= 0) return null;
          return {
            itemId: id,
            name: invItem.name,
            unit: invItem.unit,
            price: invItem.price || 0,
            costPrice: invItem.costPrice || 0,
            initialQty: qty,
            soldQty: 0,
            remainingQty: qty,
            lostQty: 0,
            returnedToInventory: false
          };
        })
        .filter(Boolean) as any[];

      if (itemsToLoad.length === 0) {
        setError('Por favor, defina pelo menos um produto com quantidade maior que zero para carregar.');
        return;
      }

      setSaving(true);
      const fairId = `fair_${Date.now()}`;
      const fairData = {
        name: newFairName.trim() || `Feira - ${format(new Date(), 'dd/MM/yyyy')}`,
        date: new Date(),
        status: 'active',
        items: itemsToLoad,
        totalSalesAmount: 0,
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, 'fairs', fairId), fairData);

      for (const item of itemsToLoad) {
        const invRef = doc(db, 'inventory', item.itemId);
        await updateDoc(invRef, {
          quantity: increment(-item.initialQty),
          lastUpdated: serverTimestamp()
        });

        await addDoc(collection(db, 'inventory_history'), {
          itemId: item.itemId,
          itemName: item.name,
          quantity: -item.initialQty,
          unit: item.unit,
          type: 'use_stock',
          description: `Carga carregada para ${fairData.name}`,
          date: serverTimestamp()
        });
      }

      setSelectedLoadQuantities({});
    } catch (err: any) {
      console.error(err);
      setError('Erro ao iniciar feira: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateFairItemQty = async (itemId: string, saleChange: number, lossChange: number) => {
    if (!activeFair) return;
    
    const updatedItems = activeFair.items.map((item: any) => {
      if (item.itemId !== itemId) return item;
      
      const newSold = Math.max(0, item.soldQty + saleChange);
      const newLost = Math.max(0, (item.lostQty || 0) + lossChange);
      const newRemaining = Math.max(0, item.initialQty - newSold - newLost);
      
      return {
        ...item,
        soldQty: newSold,
        lostQty: newLost,
        remainingQty: newRemaining
      };
    });
    
    const newTotal = updatedItems.reduce((acc: number, item: any) => acc + (item.price * item.soldQty), 0);
    
    await updateDoc(doc(db, 'fairs', activeFair.id), {
      items: updatedItems,
      totalSalesAmount: newTotal
    });
  };

  const handleFairItemInputChange = async (itemId: string, field: 'remainingQty' | 'lostQty' | 'price', value: number) => {
    if (!activeFair) return;
    
    const updatedItems = activeFair.items.map((item: any) => {
      if (item.itemId !== itemId) return item;
      
      let newPrice = item.price;
      let newRemaining = item.remainingQty;
      let newLost = item.lostQty || 0;
      
      if (field === 'price') newPrice = value;
      if (field === 'remainingQty') newRemaining = Math.max(0, Math.min(item.initialQty - newLost, value));
      if (field === 'lostQty') newLost = Math.max(0, Math.min(item.initialQty - newRemaining, value));
      
      const newSold = Math.max(0, item.initialQty - newRemaining - newLost);
      
      return {
        ...item,
        price: newPrice,
        remainingQty: newRemaining,
        lostQty: newLost,
        soldQty: newSold
      };
    });
    
    const newTotal = updatedItems.reduce((acc: number, item: any) => acc + (item.price * item.soldQty), 0);
    
    await updateDoc(doc(db, 'fairs', activeFair.id), {
      items: updatedItems,
      totalSalesAmount: newTotal
    });
  };

  const handleOpenCloseFairModal = () => {
    if (!activeFair) return;
    const total = activeFair.totalSalesAmount || 0;
    setClosingPix(total);
    setClosingCash(0);
    setClosingCard(0);
    setClosingReturnToInventory(true);
    setShowCloseFairModal(true);
  };

  const handleConfirmCloseFair = async () => {
    if (!activeFair) return;
    setClosingSaving(true);
    setError(null);
    
    try {
      await updateDoc(doc(db, 'fairs', activeFair.id), {
        status: 'closed',
        closedAt: serverTimestamp(),
        closingReturnToInventory,
        closingPayments: {
          pix: closingPix,
          cash: closingCash,
          card: closingCard
        }
      });

      for (const item of activeFair.items) {
        if (closingReturnToInventory && item.remainingQty > 0) {
          const invRef = doc(db, 'inventory', item.itemId);
          await updateDoc(invRef, {
            quantity: increment(item.remainingQty),
            lastUpdated: serverTimestamp()
          });

          await addDoc(collection(db, 'inventory_history'), {
            itemId: item.itemId,
            itemName: item.name,
            quantity: item.remainingQty,
            unit: item.unit,
            type: 'add_stock',
            description: `Retorno de sobra de feira (${activeFair.name})`,
            date: serverTimestamp()
          });
        } else if (!closingReturnToInventory && item.remainingQty > 0) {
          await addDoc(collection(db, 'inventory_history'), {
            itemId: item.itemId,
            itemName: item.name,
            quantity: -item.remainingQty,
            unit: item.unit,
            type: 'use_stock',
            description: `Sobra de feira não retornada (${activeFair.name})`,
            date: serverTimestamp()
          });
        }

        if (item.lostQty > 0) {
          await addDoc(collection(db, 'inventory_history'), {
            itemId: item.itemId,
            itemName: item.name,
            quantity: -item.lostQty,
            unit: item.unit,
            type: 'use_stock',
            description: `Perda registrada na ${activeFair.name}`,
            date: serverTimestamp()
          });
        }
      }

      const totalAmount = activeFair.totalSalesAmount;
      if (totalAmount > 0) {
        const paymentsToLog = [
          { method: 'Pix', amt: closingPix },
          { method: 'Dinheiro', amt: closingCash },
          { method: 'Cartão', amt: closingCard }
        ].filter(p => p.amt > 0);

        if (paymentsToLog.length === 0) {
          await addDoc(collection(db, 'transactions'), {
            type: 'income',
            amount: totalAmount,
            description: `Faturamento Feira - ${activeFair.name}`,
            category: 'Venda de Produção',
            date: serverTimestamp(),
            relatedFairId: activeFair.id
          });
        } else {
          for (const pay of paymentsToLog) {
            await addDoc(collection(db, 'transactions'), {
              type: 'income',
              amount: pay.amt,
              description: `Fechamento Feira (${pay.method}) - ${activeFair.name}`,
              category: 'Venda de Produção',
              date: serverTimestamp(),
              relatedFairId: activeFair.id
            });
          }
        }
      }

      setShowCloseFairModal(false);
    } catch (err: any) {
      console.error(err);
      setError('Erro ao concluir fechamento da feira: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setClosingSaving(false);
    }
  };

  const handleDeleteFair = async (fairId: string) => {
    if (confirm('Tem certeza que deseja excluir o histórico desta feira?')) {
      try {
        await deleteDoc(doc(db, 'fairs', fairId));
      } catch (err) {
        console.error(err);
      }
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
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">Vendas e Faturamento</h2>
          <p className="text-slate-500 mt-1 text-sm md:text-base">Controle seus pedidos agendados ou registre vendas de forma ultra-rápida na feira.</p>
        </div>
        {activeTab === 'individual' && (
          <button 
            onClick={() => handleOpenModal()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95 text-sm md:text-base"
          >
            <Plus size={20} />
            Novo Pedido
          </button>
        )}
      </header>

      {/* Tabs Seletoras */}
      <div className="flex bg-slate-100 p-1 rounded-2xl w-full max-w-3xl shadow-sm border border-slate-200">
        <button
          onClick={() => setActiveTab('individual')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 md:gap-2 py-3 rounded-xl transition-all cursor-pointer",
            activeTab === 'individual' 
              ? "bg-white text-emerald-700 shadow-md" 
              : "text-slate-500 hover:text-slate-800"
          )}
        >
          <Calendar size={15} />
          <span className="text-[11px] sm:text-xs md:text-sm font-black">
            <span className="hidden md:inline">Pedidos </span>Individuais
          </span>
        </button>
        <button
          onClick={() => setActiveTab('feira')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 md:gap-2 py-3 rounded-xl transition-all cursor-pointer",
            activeTab === 'feira' 
              ? "bg-white text-emerald-700 shadow-md" 
              : "text-slate-500 hover:text-slate-800"
          )}
        >
          <Store size={15} />
          <span className="text-[11px] sm:text-xs md:text-sm font-black">
            <span className="hidden md:inline">Modo </span>Feira
          </span>
        </button>
        <button
          onClick={() => setActiveTab('delivery')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 md:gap-2 py-3 rounded-xl transition-all cursor-pointer",
            activeTab === 'delivery' 
              ? "bg-white text-emerald-700 shadow-md" 
              : "text-slate-500 hover:text-slate-800"
          )}
        >
          <Truck size={15} />
          <span className="text-[11px] sm:text-xs md:text-sm font-black">
            <span className="hidden md:inline">Venda </span>Delivery
          </span>
        </button>
        <button
          onClick={() => setActiveTab('colheita')}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 md:gap-2 py-3 rounded-xl transition-all cursor-pointer",
            activeTab === 'colheita' 
              ? "bg-white text-emerald-700 shadow-md" 
              : "text-slate-500 hover:text-slate-800"
          )}
        >
          <ClipboardList size={15} />
          <span className="text-[11px] sm:text-xs md:text-sm font-black">
            Lista <span className="hidden md:inline">de Colheita</span>
          </span>
        </button>
      </div>

      {activeTab === 'individual' && (
        <>
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
            {filteredSales.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 text-slate-400 shadow-sm">
                <ShoppingCart className="mx-auto text-slate-300 mb-3" size={40} />
                <p className="font-bold text-slate-500">Nenhum pedido individual encontrado</p>
                <p className="text-xs text-slate-400 mt-1">Sua lista está limpa. Clique em "Novo Pedido" para lançar uma entrega.</p>
              </div>
            ) : (
              filteredSales.map((sale) => (
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
                        <div className="flex items-center flex-wrap gap-2">
                          <h4 className="text-base md:text-lg font-bold text-slate-900 truncate">{sale.customerName}</h4>
                          <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{sale.saleNumber || 'S/N'}</span>
                          {sale.isDelivery && (
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-150 rounded-lg px-2 py-0.5 text-[9px] md:text-[10px] font-black uppercase tracking-wider">
                              <Truck size={10} /> Delivery
                            </span>
                          )}
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
                              Entrega: {sale.deliveryDate?.toDate ? format(sale.deliveryDate.toDate(), "dd 'de' MMMM", { locale: ptBR }) : format(new Date(sale.deliveryDate), "dd 'de' MMMM", { locale: ptBR })}
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
                        {sale.isDelivery && (
                          <div className="border-t border-slate-100/70 pt-2 lg:border-t-0 lg:pt-0 space-y-1.5 text-[11px] text-slate-500 font-medium">
                            {sale.customerPhone && (
                              <p className="flex items-center gap-1">
                                <span className="font-extrabold text-slate-700">Telefone:</span> {sale.customerPhone}
                              </p>
                            )}
                            {sale.deliveryAddress && (
                              <p className="flex items-start gap-1.5 leading-relaxed">
                                <span className="font-extrabold text-slate-700">Endereço:</span> {sale.deliveryAddress}
                              </p>
                            )}
                            {sale.observations && (
                              <div className="flex items-start gap-1 p-2 bg-amber-50/60 text-amber-800 border border-amber-100/60 rounded-xl mt-1 text-[10px] leading-relaxed max-w-sm font-semibold">
                                <span className="font-black not-italic text-amber-900 uppercase text-[9px] tracking-wider block mt-0.5 mr-1 shrink-0">Obs:</span>
                                <span>{sale.observations}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between lg:justify-end gap-4 md:gap-8 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 font-sans">
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
                              type="button"
                              onClick={() => advanceStatus(sale)}
                              className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                            >
                              {(sale.status === 'ordered' || sale.status === 'pending') && 'Pendente Entrega'}
                              {sale.status === 'pending_delivery' && 'Confirmar Entrega'}
                              {sale.status === 'delivered' && 'Confirmar Pagamento'}
                            </button>
                            <button 
                              type="button"
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
                            type="button"
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
              ))
            )}
          </div>
        </>
      )}

      {activeTab === 'delivery' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2">
              <Truck className="text-emerald-600" size={24} />
              Preenchimento Rápido - Venda Delivery
            </h3>
            <p className="text-slate-500 text-sm mt-1">Lançamento simplificado de entregas agendadas com múltiplos produtos e controle de endereço.</p>
          </div>

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-bold leading-relaxed flex items-center gap-2">
              <XCircle className="text-rose-500 shrink-0" size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Dados do Cliente e Entrega */}
            <form onSubmit={handleSubmitDelivery} className="lg:col-span-5 bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-5">
              <h4 className="text-base font-black text-slate-800 border-b border-slate-100 pb-2 mb-4">
                1. Informações de Entrega
              </h4>

              {/* Data de Entrega */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">Data de Entrega *</label>
                <div className="flex gap-2">
                  <input 
                    type="date"
                    value={deliveryDateInput}
                    onChange={(e) => setDeliveryDateInput(e.target.value)}
                    required
                    className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-bold text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const today = format(new Date(), 'yyyy-MM-dd');
                      setDeliveryDateInput(today);
                    }}
                    className="px-3 py-2 text-xs font-bold bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 rounded-xl hover:text-emerald-600 transition-all shadow-sm"
                  >
                    Hoje
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      setDeliveryDateInput(format(tomorrow, 'yyyy-MM-dd'));
                    }}
                    className="px-3 py-2 text-xs font-bold bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 rounded-xl hover:text-emerald-600 transition-all shadow-sm"
                  >
                    Amanhã
                  </button>
                </div>
              </div>

              {/* Nome do Cliente */}
              <div className="space-y-2 relative">
                <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">Nome do Cliente *</label>
                <div className="relative">
                  <input 
                    type="text"
                    required
                    placeholder="Ex: João Silva ou Busque..."
                    value={deliveryClientName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDeliveryClientName(val);
                      setCustomerSearchTerm(val);
                      setShowCustomerSuggestions(true);
                    }}
                    onFocus={() => setShowCustomerSuggestions(true)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-bold text-slate-800"
                  />
                  {showCustomerSuggestions && customers.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-50">
                      {customers
                        .filter(c => 
                          (c.companyName?.toLowerCase() || '').includes(customerSearchTerm.toLowerCase()) || 
                          (c.contactName?.toLowerCase() || '').includes(customerSearchTerm.toLowerCase())
                        )
                        .map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setDeliveryClientName(c.companyName);
                              if (c.phone) setDeliveryClientPhone(c.phone);
                              setShowCustomerSuggestions(false);
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-50 hover:text-emerald-700 transition-colors text-xs font-medium text-slate-705"
                          >
                            <span className="font-bold text-slate-900 block">{c.companyName}</span>
                            {c.contactName && <span className="text-[10px] text-slate-400 font-medium">Contato: {c.contactName}</span>}
                            {c.phone && <span className="text-[10px] text-slate-450 ml-2">({c.phone})</span>}
                          </button>
                        ))}
                      <div className="p-2 bg-slate-50 flex justify-between items-center text-[10px] text-slate-400">
                        <span>Clientes Cadastrados</span>
                        <button 
                          type="button" 
                          onClick={() => setShowCustomerSuggestions(false)}
                          className="font-black text-rose-500 uppercase tracking-widest hover:underline"
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Telefone */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">Telefone</label>
                <input 
                  type="text"
                  placeholder="Ex: (11) 99999-9999"
                  value={deliveryClientPhone}
                  onChange={(e) => setDeliveryClientPhone(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-semibold"
                />
                
                <AnimatePresence>
                  {lastMatchingSaleForDelivery && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="bg-emerald-50 border border-emerald-150 p-3.5 rounded-xl space-y-2 mt-1.5 shadow-sm"
                    >
                      <div className="flex items-start gap-2 text-xs font-bold text-emerald-800">
                        <AlertTriangle size={15} className="shrink-0 text-emerald-600 mt-0.5" />
                        <div>
                          <span>Encontramos dados de um pedido anterior de <b>{lastMatchingSaleForDelivery.customerName}</b> para este telefone.</span>
                          {lastMatchingSaleForDelivery.deliveryAddress && (
                            <span className="block text-[10px] text-emerald-600 mt-1 font-medium truncate">Endereço: {lastMatchingSaleForDelivery.deliveryAddress}</span>
                          )}
                          {lastMatchingSaleForDelivery.observations && (
                            <span className="block text-[10px] text-emerald-600 font-medium truncate">Obs: {lastMatchingSaleForDelivery.observations}</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDeliveryClientName(lastMatchingSaleForDelivery.customerName);
                          if (lastMatchingSaleForDelivery.deliveryAddress) setDeliveryAddress(lastMatchingSaleForDelivery.deliveryAddress);
                          if (lastMatchingSaleForDelivery.observations) setDeliveryObservations(lastMatchingSaleForDelivery.observations);
                          setLastMatchingSaleForDelivery(null); // Clear suggestion after pulling
                        }}
                        className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] rounded-lg transition-colors cursor-pointer"
                      >
                        Puxar Nome, Endereço e Observações
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Endereço */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">Endereço de Entrega</label>
                <input 
                  type="text"
                  placeholder="Ex: Rua das Flores, 123 - Centro"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-semibold"
                />
              </div>

              {/* Forma de Pagamento */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">Forma de Pagamento Predefinida</label>
                <select
                  value={deliveryPaymentMethod}
                  onChange={(e) => setDeliveryPaymentMethod(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-bold text-slate-700"
                >
                  <option value="Pagar na Entrega">Pagar na Entrega (A definir)</option>
                  <option value="Pix">Pix</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Cartão de Crédito">Cartão de Crédito</option>
                  <option value="Cartão de Débito">Cartão de Débito</option>
                  <option value="Transferência Bancária">Transferência Bancária</option>
                </select>
              </div>

              {/* Observações */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">Observações do Pedido</label>
                <textarea 
                  rows={2}
                  placeholder="Ex: Deixar na portaria, ligar ao chegar, troco para 100 reais, etc..."
                  value={deliveryObservations}
                  onChange={(e) => setDeliveryObservations(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm resize-none"
                />
              </div>

              {/* Finalizar Button */}
              <button
                type="submit"
                disabled={saving}
                className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-emerald-100 transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer active:scale-[0.98]"
              >
                {saving ? (
                  <>
                    <RefreshCw className="animate-spin text-white" size={18} />
                    Salvando Pedido...
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    Finalizar e Salvar Delivery
                  </>
                )}
              </button>
            </form>

            {/* Seleção de Produtos */}
            <div className="lg:col-span-7 space-y-6">
              {/* Painel de seleção de produtos */}
              <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="text-base font-black text-slate-800">
                    2. Escolha os Produtos
                  </h4>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-bold">
                    Catálogo de Produtos
                  </span>
                </div>

                {/* Filtro de busca de produtos */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Buscar produto por nome..." 
                    value={productSearchTerm}
                    onChange={(e) => setProductSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>

                {/* Lista de produtos do catálogo */}
                <div className="space-y-2">
                  <span className="text-xs font-black uppercase text-slate-400 tracking-wider">Produtos do Catálogo de Produção</span>
                  <div className="flex flex-col gap-2 max-h-96 overflow-y-auto p-1.5 border border-slate-100 rounded-2xl bg-slate-50/50 scrollbar-thin">
                    {produceCatalog
                      .filter(item => item.name.toLowerCase().includes(productSearchTerm.toLowerCase()))
                      .map(item => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-white hover:bg-emerald-50/20 border border-slate-100/90 shadow-sm gap-3 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-xs sm:text-sm font-black text-slate-800 block truncate">{item.name}</span>
                            <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500 mt-0.5">
                              <span className="font-semibold text-slate-400">Unidade: <b className="text-slate-600">{formatUnit(item.unit)}</b></span>
                              <span className="text-slate-300">•</span>
                              {item.defaultPrice !== undefined ? (
                                <span className="font-extrabold text-emerald-600">R$ {item.defaultPrice.toFixed(2)}/{formatUnit(item.unit)}</span>
                              ) : (
                                <span className="text-slate-400 font-medium">Sem preço padrão</span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddDeliveryItem(item.id, 'catalog')}
                            className="shrink-0 px-3 py-1.5 sm:py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer active:scale-95 border border-emerald-100/50"
                          >
                            <Plus size={13} className="stroke-[3]" />
                            <span className="hidden sm:inline">Adicionar</span>
                            <span className="sm:hidden">Add</span>
                          </button>
                        </div>
                      ))}
                    {produceCatalog.filter(item => item.name.toLowerCase().includes(productSearchTerm.toLowerCase())).length === 0 && (
                      <div className="col-span-full py-6 text-center text-slate-400 text-xs font-medium">
                        Nenhum produto cadastrado no catálogo de produção com este nome.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Resumo e lista de itens adicionados */}
              <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <h4 className="text-base font-black text-slate-800">
                    3. Itens Selecionados no Pedido
                  </h4>
                </div>

                {deliverySelectedItems.length === 0 ? (
                  <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center text-slate-400 text-xs font-medium flex flex-col items-center justify-center gap-2">
                    <ShoppingCart size={28} className="text-slate-300" />
                    <span>Nenhum item adicionado ainda. Clique nos produtos acima para montar o pedido!</span>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {deliverySelectedItems.map((item) => {
                      const baseItem = inventory.find(i => i.id === item.itemId);
                      const unit = formatUnit(baseItem?.unit || 'un', item.quantity);
                      return (
                        <div key={item.itemId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-emerald-50/20 border border-emerald-100/70 rounded-2xl transition-all">
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-slate-800 text-sm block truncate">{item.name}</span>
                            <span className="text-[10px] text-slate-400">R$ {item.price.toFixed(2)} por {unit}</span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 justify-between sm:justify-end w-full sm:w-auto border-t border-slate-100 sm:border-0 pt-3 sm:pt-0 mt-1 sm:mt-0">
                            {/* Controle de Quantidade */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleUpdateDeliveryItem(item.itemId, 'quantity', Math.max(1, item.quantity - 1))}
                                className="w-7 h-7 bg-white border border-slate-200 rounded-lg flex items-center justify-center font-bold text-slate-600 hover:bg-slate-50 transition-colors text-xs cursor-pointer"
                              >
                                -
                              </button>
                              <input 
                                type="number" 
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleUpdateDeliveryItem(item.itemId, 'quantity', Math.max(1, Number(e.target.value)))}
                                className="w-10 py-1 bg-white border border-slate-200 rounded-lg text-center font-black text-xs text-slate-850"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateDeliveryItem(item.itemId, 'quantity', item.quantity + 1)}
                                className="w-7 h-7 bg-white border border-slate-200 rounded-lg flex items-center justify-center font-bold text-slate-600 hover:bg-slate-50 transition-colors text-xs cursor-pointer"
                              >
                                +
                              </button>
                            </div>

                            {/* Preço Unitário Editable */}
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-slate-400">R$</span>
                              <input 
                                type="number" 
                                step="0.01"
                                min="0"
                                value={item.price}
                                onChange={(e) => handleUpdateDeliveryItem(item.itemId, 'price', Math.max(0, Number(e.target.value)))}
                                className="w-14 px-1.5 py-1 bg-white border border-slate-200 rounded-lg font-bold text-xs text-slate-800 text-right"
                              />
                            </div>

                            {/* Subtotal e Botão Excluir */}
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-700 min-w-[65px] text-right">
                                R$ {(item.price * item.quantity).toFixed(2)}
                              </span>
                              <button 
                                type="button"
                                onClick={() => handleRemoveDeliveryItem(item.itemId)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all cursor-pointer"
                                title="Remover item"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Resumo Totalizador */}
                    <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200 flex items-center justify-between mt-4">
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Total Geral do Pedido</p>
                        <p className="text-xs text-slate-500">Forma de recebimento sugerida: <b>{deliveryPaymentMethod}</b></p>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-black text-slate-900">
                          R$ {deliverySelectedItems.reduce((acc, item) => acc + (item.price * item.quantity), 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'colheita' && (
        <HarvestReport
          sales={sales}
          produceCatalog={produceCatalog}
          inventory={inventory}
        />
      )}

      {activeTab === 'feira' && (
        <div className="space-y-6">
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-sm font-medium flex items-center gap-2">
              <XCircle size={18} />
              {error}
            </div>
          )}

          {activeFair ? (
            /* ================= FEIRA EM ANDAMENTO (DASHBOARD) ================= */
            <div className="space-y-6">
              <div className="bg-emerald-50 border border-emerald-100 rounded-[2rem] p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm animate-none">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-emerald-800 text-[10px] font-black tracking-widest uppercase bg-emerald-100 px-3 py-1 rounded-full animate-none">Sessão da Feira Ativa</span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-950 mt-3">{activeFair.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 font-medium">Iniciada em: {activeFair.date?.toDate ? format(activeFair.date.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : ''}</p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenCloseFairModal}
                  className="w-full md:w-auto bg-emerald-600 text-white rounded-2xl px-6 py-4 font-black shadow-lg shadow-emerald-250 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] text-sm md:text-base cursor-pointer"
                >
                  <CheckCircle size={20} />
                  🏁 Fechar e Dar Baixa na Feira
                </button>
              </div>

              {/* Grid de 3 Cards de Métricas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Faturamento Realizado</span>
                  <span className="text-3xl font-black text-emerald-600 block mt-2">R$ {(activeFair.totalSalesAmount || 0).toFixed(2)}</span>
                  <span className="text-[10px] text-slate-400 mt-1 block font-medium">Calculado automaticamente a partir das vendas registradas</span>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Estoque Inicial Carregado</span>
                  <span className="text-2xl font-bold text-slate-800 block mt-2">
                    R$ {activeFair.items.reduce((acc: number, item: any) => acc + ((item.price || 0) * (item.initialQty || 0)), 0).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 block font-medium">Valor total das mercadorias levadas para a feira</span>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Valor Restante das Sobras</span>
                  <span className="text-2xl font-bold text-amber-600 block mt-2">
                    R$ {activeFair.items.reduce((acc: number, item: any) => acc + ((item.price || 0) * (item.remainingQty || 0)), 0).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 block font-medium">Valor correspondente aos produtos que restaram</span>
                </div>
              </div>

              {/* Informação do Checkout da feira */}
              <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-xl text-xs text-amber-805 flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Como funciona o controle ágil da feira?</p>
                  <p className="mt-0.5 opacity-90 leading-relaxed">Você pode clicar nos botões rápidos de <strong className="font-black">+ Venda</strong> e <strong className="font-black">+ Perda</strong> para registrar as saídas na correria. Se não tiver tempo, não se preocupe! No final da feira, basta preencher a <strong className="font-bold">Sobra Final</strong> (recontar produtos) que o sistema deduzirá as vendas e calculará seu faturamento total automaticamente!</p>
                </div>
              </div>

              {/* Grid de Cards de Produtos Ativos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {activeFair.items.map((item: any) => {
                  const soldPct = Math.min(100, Math.round(((item.soldQty || 0) / (item.initialQty || 1)) * 100)) || 0;
                  return (
                    <div key={item.itemId} className="bg-white rounded-3xl border border-slate-200 p-5 md:p-6 shadow-sm hover:shadow-md transition-all flex flex-col space-y-4">
                      {/* Topo Item */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="font-black text-slate-800 text-lg truncate" title={item.name}>{item.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-slate-400 font-semibold">Preço Unitário:</span>
                            <div className="relative flex items-center">
                              <span className="text-xs font-bold text-slate-400 mr-0.5">R$</span>
                              <input 
                                type="number" 
                                step="0.50"
                                value={item.price}
                                onChange={(e) => handleFairItemInputChange(item.itemId, 'price', Number(e.target.value))}
                                className="w-16 px-1 py-0.5 border border-slate-200 rounded text-xs font-black text-slate-700 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-center"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="bg-slate-100 px-3 py-1.5 rounded-xl text-right shrink-0">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Restante</span>
                          <span className="text-lg font-black text-slate-700">
                            {item.remainingQty} <span className="text-xs font-normal text-slate-400">{formatUnit(item.unit, item.remainingQty)}</span>
                          </span>
                        </div>
                      </div>

                      {/* Progresso visual */}
                      <div>
                        <div className="flex justify-between text-xs font-bold text-slate-500 mb-1 font-sans">
                          <span>Vendidos: {item.soldQty} de {item.initialQty} {formatUnit(item.unit, item.initialQty)}</span>
                          <span>{soldPct}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-150">
                          <div 
                            className="bg-emerald-500 h-full rounded-full transition-all duration-300" 
                            style={{ width: `${soldPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Botoes Táteis Super Rápidos */}
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block text-center tracking-wider">Painel de Cliques Rápidos</span>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => handleUpdateFairItemQty(item.itemId, 1, 0)}
                            disabled={item.remainingQty <= 0}
                            className="h-16 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-700 active:scale-[0.95] disabled:opacity-40 disabled:pointer-events-none transition-all flex flex-col items-center justify-center shadow-lg shadow-emerald-100 cursor-pointer"
                          >
                            <span className="text-[10px] uppercase tracking-wider opacity-90 font-bold">Vendido (+1)</span>
                            <span className="text-base font-black text-white">+ R$ {item.price.toFixed(2)}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateFairItemQty(item.itemId, 0, 1)}
                            disabled={item.remainingQty <= 0}
                            className="h-16 bg-amber-500 text-white rounded-xl font-black hover:bg-amber-600 active:scale-[0.95] disabled:opacity-40 disabled:pointer-events-none transition-all flex flex-col items-center justify-center shadow-lg shadow-amber-100 cursor-pointer"
                          >
                            <span className="text-[10px] uppercase tracking-wider opacity-90 font-bold">Perda (+1)</span>
                            <span className="text-sm font-black text-white">Rachou / Perda</span>
                          </button>
                        </div>

                        {/* Corretores pequenininhos embaixo */}
                        <div className="flex justify-between items-center text-xs px-1 font-sans">
                          <button
                            type="button"
                            onClick={() => handleUpdateFairItemQty(item.itemId, -1, 0)}
                            disabled={item.soldQty <= 0}
                            className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg transition-all disabled:opacity-30 disabled:pointer-events-none font-bold"
                          >
                            Desfazer Venda (-1)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateFairItemQty(item.itemId, 0, -1)}
                            disabled={item.lostQty <= 0}
                            className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg transition-all disabled:opacity-30 disabled:pointer-events-none font-bold"
                          >
                            Desfazer Perda (-1)
                          </button>
                        </div>
                      </div>

                      {/* Recortadores manuais no final */}
                      <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Preencher Sobra Final</label>
                          <div className="relative">
                            <input 
                              type="number"
                              min="0"
                              max={item.initialQty}
                              value={item.remainingQty}
                              onChange={(e) => handleFairItemInputChange(item.itemId, 'remainingQty', Number(e.target.value))}
                              className="bg-slate-50 border border-slate-200 font-bold px-3 py-2 text-center text-sm text-slate-800 rounded-xl focus:ring-1 focus:ring-emerald-500 focus:outline-none w-full"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{formatUnit(item.unit, item.remainingQty)}</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Perdas Totais</label>
                          <div className="relative">
                            <input 
                              type="number"
                              min="0"
                              max={item.initialQty}
                              value={item.lostQty || 0}
                              onChange={(e) => handleFairItemInputChange(item.itemId, 'lostQty', Number(e.target.value))}
                              className="bg-slate-50 border border-slate-200 font-bold px-3 py-2 text-center text-sm text-slate-800 rounded-xl focus:ring-1 focus:ring-emerald-500 focus:outline-none w-full"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{formatUnit(item.unit, item.lostQty || 0)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ================= REGISTRAR / CARREGAR PARA NOVA FEIRA ================= */
            <div className="space-y-8">
              <form onSubmit={handleStartFair} className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Truck className="text-emerald-600 shrink-0" size={24} />
                    Carregar Carga e Iniciar Sessão de Feira
                  </h3>
                  <p className="text-slate-400 text-xs mt-1 leading-relaxed animate-none">Você está carregando as mercadorias para vender hoje na feira. Essas mercadorias serão deduzidas temporariamente do seu estoque de expedição principal e alocadas na feira. No encerramento da feira, as sobras serão devolvidas automaticamente ao estoque!</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-sm font-bold text-slate-700 ml-1">Identificação / Nome da Feira</label>
                    <input 
                      type="text" 
                      value={newFairName}
                      onChange={(e) => setNewFairName(e.target.value)}
                      placeholder="Ex: Feira de Quarta-feira - Centro"
                      required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-bold text-slate-700 ml-1 block">Estoque de Expedição (Escolha o que levar no caminhão)</label>
                  
                  {inventory.filter(item => item.type === 'dispatch' && !isPeUnitOrName(item) && !isMuda(item)).length === 0 ? (
                    <div className="bg-slate-50 p-8 text-center border border-slate-200 rounded-2xl text-slate-400">
                      <p className="font-bold">Nenhum produto cadastrado no Estoque de Expedição.</p>
                      <p className="text-xs mt-1">Vá até o menu de Estoque e adicione produtos do tipo "Expedição" primeiro.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto p-1">
                      {inventory.filter(item => item.type === 'dispatch' && !isPeUnitOrName(item) && !isMuda(item)).map(item => {
                        const currentVal = selectedLoadQuantities[item.id] || 0;
                        return (
                          <div 
                            key={item.id}
                            className={cn(
                              "p-3 rounded-2xl border transition-all flex flex-col justify-between space-y-2",
                              currentVal > 0 
                                ? "bg-emerald-50/50 border-emerald-500" 
                                : "bg-slate-50 border-slate-200 hover:border-slate-300"
                            )}
                          >
                            <div>
                              <span className="font-bold text-slate-800 text-sm block truncate" title={item.name}>{item.name}</span>
                              <span className="text-[10px] text-slate-400 block font-semibold">Preço ref: R$ {(item.price || 0).toFixed(2)}</span>
                              <span className="text-[10px] text-slate-400 block">Estoque atual: {item.quantity} {formatUnit(item.unit, item.quantity)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                                <button 
                                  type="button"
                                  onClick={() => setSelectedLoadQuantities({
                                    ...selectedLoadQuantities,
                                    [item.id]: Math.max(0, currentVal - 1)
                                  })}
                                  className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 border border-slate-205 font-bold active:scale-90 flex items-center justify-center shrink-0"
                                >
                                  -
                                </button>
                                <input 
                                  type="number" 
                                  min="0"
                                  max={item.quantity}
                                  value={currentVal || ''}
                                  onChange={(e) => setSelectedLoadQuantities({
                                    ...selectedLoadQuantities,
                                    [item.id]: Math.min(item.quantity, Math.max(0, Number(e.target.value)))
                                  })}
                                  placeholder="0"
                                  className="w-12 h-7 text-center bg-transparent border-0 font-bold text-xs focus:ring-0 focus:outline-none"
                                />
                                <button 
                                  type="button"
                                  onClick={() => setSelectedLoadQuantities({
                                    ...selectedLoadQuantities,
                                    [item.id]: Math.min(item.quantity, currentVal + 1)
                                  })}
                                  className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 border border-slate-205 font-bold active:scale-90 flex items-center justify-center shrink-0"
                                >
                                  +
                                </button>
                              </div>
                              <span className="text-xs text-slate-450 font-black truncate shrink-0">{formatUnit(item.unit, currentVal || 1)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-105 flex justify-end">
                  <button 
                    type="submit"
                    disabled={saving}
                    className="w-full sm:w-auto px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                  >
                    <Truck size={20} />
                    {saving ? 'Iniciando Feira...' : '🚚 Iniciar Feira com os Produtos Carregados'}
                  </button>
                </div>
              </form>

              {/* HISTORICO DE FEIRAS ANTERIORES */}
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <RotateCcw size={22} className="text-slate-500" />
                  Histórico de Feiras Anteriores
                </h3>

                <div className="space-y-3">
                  {fairs.filter(f => f.status === 'closed').length === 0 ? (
                    <div className="bg-white p-8 text-center border border-slate-200 rounded-3xl text-slate-400 shadow-sm">
                      <p className="font-semibold text-slate-500">Nenhuma feira anterior encerrada foi encontrada.</p>
                      <p className="text-xs text-slate-400 mt-1 font-medium">Seus dados consolidados de feiras livre encerradas aparecerão listados aqui.</p>
                    </div>
                  ) : (
                    fairs.filter(f => f.status === 'closed').map(fair => {
                      const totalSoldQty = fair.items?.reduce((acc: number, item: any) => acc + (item.soldQty || 0), 0) || 0;
                      const faturamento = fair.totalSalesAmount || 0;
                      return (
                        <div key={fair.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4 hover:border-slate-350 transition-all">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                            <div>
                              <span className="text-[9px] text-emerald-800 font-extrabold tracking-widest uppercase bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full w-fit block animate-none">Feira Encerrada</span>
                              <h4 className="font-black text-slate-800 mt-2 text-lg">{fair.name}</h4>
                              <p className="text-xs text-slate-400 font-medium">Realizada em: {fair.date?.toDate ? format(fair.date.toDate(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ''}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-left sm:text-right">
                                <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Faturamento Realizado</span>
                                <span className="font-black text-emerald-600 text-xl block">R$ {faturamento.toFixed(2)}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteFair(fair.id)}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all shrink-0 cursor-pointer"
                                title="Excluir do Histórico"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>

                          {/* Itens detalhados */}
                          <div className="border-t border-slate-100 pt-3 flex flex-col gap-1.5 font-sans">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Balanço das Saídas:</span>
                            <div className="flex flex-wrap gap-2">
                              {fair.items?.map((item: any, i: number) => (
                                <span key={i} className="px-2.5 py-1 bg-slate-50 text-slate-600 border border-slate-150 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                                  <strong>{item.name}:</strong> 
                                  <span className="text-emerald-650 font-black">{item.soldQty} vend.</span> | 
                                  <span className="text-slate-500 font-medium">{item.remainingQty} sob.</span> | 
                                  <span className="text-amber-600 font-medium">{item.lostQty || 0} perdas</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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

                  {/* Tipo de Lançamento Toggle */}
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase text-slate-400 tracking-wider ml-1">Tipo de Pedido</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-fit border border-slate-200">
                      <button
                        type="button"
                        onClick={() => {
                          setIsDeliveryEditing(false);
                        }}
                        className={cn(
                          "px-4 py-2 rounded-lg transition-all text-xs font-extrabold flex items-center gap-1.5 cursor-pointer",
                          !isDeliveryEditing 
                            ? "bg-white text-emerald-800 shadow-sm" 
                            : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        Pedido Padrão / Ponto de Venda
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDeliveryEditing(true);
                          // If customer select has some value, pre-fill text client fields dynamically
                          if (selectedCustomerId && !customCustomerNameEditing) {
                            const cust = customers.find(c => c.id === selectedCustomerId);
                            if (cust) {
                              setCustomCustomerNameEditing(cust.companyName);
                              setDeliveryClientPhoneEditing(cust.phone || '');
                            }
                          }
                        }}
                        className={cn(
                          "px-4 py-2 rounded-lg transition-all text-xs font-extrabold flex items-center gap-1.5 cursor-pointer",
                          isDeliveryEditing 
                            ? "bg-white text-emerald-800 shadow-sm" 
                            : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        <Truck size={14} /> Venda Delivery / Entrega
                      </button>
                    </div>
                  </div>

                  {isDeliveryEditing ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-slate-100 bg-slate-50/30 p-4 rounded-2xl">
                      {/* Customer Name input with dropdown suggestions */}
                      <div className="space-y-2 relative">
                        <label className="text-sm font-bold text-slate-700 ml-1">Nome do Cliente *</label>
                        <div className="relative">
                          <input 
                            type="text"
                            required
                            placeholder="Ex: João Silva ou Busque..."
                            value={customCustomerNameEditing}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomCustomerNameEditing(val);
                              setEditCustomerSearchTerm(val);
                              setShowEditCustomerSuggestions(true);
                            }}
                            onFocus={() => setShowEditCustomerSuggestions(true)}
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-bold text-slate-850"
                          />
                          {showEditCustomerSuggestions && customers.length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-50">
                              {customers
                                .filter(c => 
                                  (c.companyName?.toLowerCase() || '').includes(editCustomerSearchTerm.toLowerCase()) || 
                                  (c.contactName?.toLowerCase() || '').includes(editCustomerSearchTerm.toLowerCase())
                                )
                                .map(c => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                      setCustomCustomerNameEditing(c.companyName);
                                      if (c.phone) setDeliveryClientPhoneEditing(c.phone);
                                      setShowEditCustomerSuggestions(false);
                                    }}
                                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 hover:text-emerald-700 transition-colors text-xs font-medium text-slate-700"
                                  >
                                    <span className="font-bold text-slate-900 block">{c.companyName}</span>
                                    {c.contactName && <span className="text-[10px] text-slate-400 font-medium">Contato: {c.contactName}</span>}
                                    {c.phone && <span className="text-[10px] text-slate-450 ml-2">({c.phone})</span>}
                                  </button>
                                ))}
                              <div className="p-2 bg-slate-50 flex justify-between items-center text-[10px] text-slate-400">
                                <span>Contatos Cadastrados</span>
                                <button 
                                  type="button" 
                                  onClick={() => setShowEditCustomerSuggestions(false)}
                                  className="font-black text-rose-500 uppercase tracking-widest hover:underline"
                                >
                                  Fechar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Phone Input */}
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">Telefone</label>
                        <input 
                          type="text"
                          placeholder="Ex: (11) 99999-9999"
                          value={deliveryClientPhoneEditing}
                          onChange={(e) => setDeliveryClientPhoneEditing(e.target.value)}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-semibold text-slate-800"
                        />
                        
                        <AnimatePresence>
                          {lastMatchingSaleForEditing && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="bg-emerald-50 border border-emerald-150 p-3.5 rounded-xl space-y-2 mt-1.5 shadow-sm"
                            >
                              <div className="flex items-start gap-2 text-xs font-bold text-emerald-800">
                                <AlertTriangle size={15} className="shrink-0 text-emerald-600 mt-0.5" />
                                <div>
                                  <span>Encontramos dados de um pedido anterior de <b>{lastMatchingSaleForEditing.customerName}</b> para este telefone.</span>
                                  {lastMatchingSaleForEditing.deliveryAddress && (
                                    <span className="block text-[10px] text-emerald-600 mt-1 font-medium truncate">Endereço: {lastMatchingSaleForEditing.deliveryAddress}</span>
                                  )}
                                  {lastMatchingSaleForEditing.observations && (
                                    <span className="block text-[10px] text-emerald-600 font-medium truncate">Obs: {lastMatchingSaleForEditing.observations}</span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setCustomCustomerNameEditing(lastMatchingSaleForEditing.customerName);
                                  if (lastMatchingSaleForEditing.deliveryAddress) setDeliveryAddressEditing(lastMatchingSaleForEditing.deliveryAddress);
                                  if (lastMatchingSaleForEditing.observations) setDeliveryObservationsEditing(lastMatchingSaleForEditing.observations);
                                  setLastMatchingSaleForEditing(null); // Clear suggestion after pulling
                                }}
                                className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] rounded-lg transition-colors cursor-pointer"
                              >
                                Puxar Nome, Endereço e Observações
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Delivery Date */}
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">Data de Entrega *</label>
                        <input 
                          type="date"
                          required
                          value={deliveryDate}
                          onChange={(e) => setDeliveryDate(e.target.value)}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-bold text-slate-700"
                        />
                      </div>

                      {/* Delivery Address */}
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">Endereço de Entrega</label>
                        <input 
                          type="text"
                          placeholder="Ex: Rua das Flores, 123 - Centro"
                          value={deliveryAddressEditing}
                          onChange={(e) => setDeliveryAddressEditing(e.target.value)}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-semibold text-slate-800"
                        />
                      </div>

                      {/* Observations */}
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">Observações da Entrega</label>
                        <textarea 
                          rows={2}
                          placeholder="Ponto de referência, observações de troco..."
                          value={deliveryObservationsEditing}
                          onChange={(e) => setDeliveryObservationsEditing(e.target.value)}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-semibold text-slate-800"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-slate-100 bg-slate-50/30 p-4 rounded-2xl">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">Cliente *</label>
                        <select 
                          value={selectedCustomerId}
                          onChange={(e) => setSelectedCustomerId(e.target.value)}
                          required 
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800 text-sm"
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
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1 block">Produtos da Horta (Estoque de Expedição)</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border border-slate-100 rounded-xl bg-slate-50/50">
                        {inventory.filter(item => item.type === 'dispatch' && !isPeUnitOrName(item) && !isMuda(item)).map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleAddItem(item.id, 'inventory')}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-white hover:bg-emerald-50 hover:border-emerald-200 border border-slate-200 transition-all text-left"
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-slate-800 truncate">{item.name}</span>
                              <span className="text-[10px] text-slate-400">Qtd: {item.quantity} {formatUnit(item.unit, item.quantity)}</span>
                            </div>
                            <Plus size={14} className="text-emerald-600 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700 ml-1 block">Catálogo de Produtos (Produção)</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border border-slate-100 rounded-xl bg-slate-50/50">
                        {produceCatalog.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleAddItem(item.id, 'catalog')}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-white hover:bg-emerald-50 hover:border-emerald-200 border border-slate-200 transition-all text-left"
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold text-slate-800 truncate">{item.name}</span>
                              <span className="text-[10px] text-slate-400">Preço: R$ {(item.defaultPrice || 0).toFixed(2)}/{formatUnit(item.unit)}</span>
                            </div>
                            <Plus size={14} className="text-emerald-600 shrink-0" />
                          </button>
                        ))}
                      </div>
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

        {showCloseFairModal && activeFair && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCloseFairModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-xl rounded-[2rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-black text-slate-950">Fechamento de Caixa</h3>
                    <p className="text-xs text-slate-400 mt-1 font-medium">Consolide os faturamentos e o estoque final da feira.</p>
                  </div>
                  <button onClick={() => setShowCloseFairModal(false)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full cursor-pointer">
                    <XCircle size={24} />
                  </button>
                </div>

                <div className="space-y-6 max-h-[65vh] overflow-y-auto pr-2">
                  {/* Resumo financeiro de vendas e perdas */}
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-150 space-y-3 font-sans">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500 font-medium">Faturamento Estimado:</span>
                      <span className="font-extrabold text-slate-800">R$ {activeFair.totalSalesAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500 font-medium">Quantidade Vendida:</span>
                      <span className="font-bold text-slate-800">{activeFair.items.reduce((acc: number, item: any) => acc + item.soldQty, 0)} unidades</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500 font-medium">Perdas Totais:</span>
                      <span className="font-bold text-amber-600">{activeFair.items.reduce((acc: number, item: any) => acc + (item.lostQty || 0), 0)} unidades</span>
                    </div>
                  </div>

                  {/* Toggle para devolução automatica */}
                  <label className="flex items-start gap-3 p-4 bg-emerald-50/40 border border-emerald-100 rounded-2xl cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={closingReturnToInventory}
                      onChange={(e) => setClosingReturnToInventory(e.target.checked)}
                      className="mt-1 h-4.5 w-4.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                    />
                    <div className="font-sans">
                      <p className="text-sm font-bold text-slate-800">Retornar sobras ao estoque principal</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Se ativado, as sobras ({activeFair.items.reduce((acc: number, item: any) => acc + item.remainingQty, 0)} un) retornam para o seu estoque principal automaticamente. Se desmarcado, as sobras serão perdidas permanentemente.</p>
                    </div>
                  </label>

                  {/* Desdobramento Financeiro Detalhado */}
                  <div className="space-y-4">
                    <label className="text-sm font-bold text-slate-700 ml-1 block">Faturamento por Forma de Recebimento</label>
                    <p className="text-xs text-slate-405 -mt-2 leading-relaxed">Distribua o faturamento total da feira (R$ {activeFair.totalSalesAmount.toFixed(2)}) entre os meios de pagamento recebidos:</p>

                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Recebido via Pix / Transferências</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                          <input 
                            type="number" 
                            step="0.01"
                            value={closingPix || ''}
                            onChange={(e) => setClosingPix(Number(e.target.value))}
                            placeholder="0.00"
                            className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Recebido via Dinheiro (Espécie)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                          <input 
                            type="number" 
                            step="0.01"
                            value={closingCash || ''}
                            onChange={(e) => setClosingCash(Number(e.target.value))}
                            placeholder="0.00"
                            className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-205 rounded-xl font-bold font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Recebido via Cartão (Crédito / Débito)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                          <input 
                            type="number" 
                            step="0.01"
                            value={closingCard || ''}
                            onChange={(e) => setClosingCard(Number(e.target.value))}
                            placeholder="0.00"
                            className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-205 rounded-xl font-bold font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Somatório de validação de caixa amigável */}
                    {(() => {
                      const totalReported = (closingPix || 0) + (closingCash || 0) + (closingCard || 0);
                      const difference = totalReported - activeFair.totalSalesAmount;
                      const isMatched = Math.abs(difference) < 0.05;
                      return (
                        <div className={cn(
                          "p-3 rounded-xl text-xs font-bold flex justify-between font-sans",
                          isMatched 
                            ? "bg-emerald-50 text-emerald-850" 
                            : "bg-amber-50 text-amber-850"
                        )}>
                          <span>Soma Informada: R$ {totalReported.toFixed(2)}</span>
                          <span>
                            {isMatched 
                              ? "✓ Caixa Consolidado" 
                              : `Diferença: ${difference > 0 ? '+' : ''} R$ ${difference.toFixed(2)}`
                            }
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 flex items-center justify-end gap-3 mt-6">
                  <button 
                    type="button" 
                    onClick={() => setShowCloseFairModal(false)}
                    className="px-5 py-3 rounded-xl font-bold text-slate-650 hover:bg-slate-50 transition-all text-sm cursor-pointer"
                  >
                    Voltar
                  </button>
                  <button 
                    type="button"
                    onClick={handleConfirmCloseFair}
                    disabled={closingSaving}
                    className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-50 font-sans text-sm cursor-pointer"
                  >
                    {closingSaving ? "Processando fechamento..." : "🏁 Confirmar Encerramento"}
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
