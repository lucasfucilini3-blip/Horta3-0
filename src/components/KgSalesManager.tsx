import React, { useState, useMemo, useEffect } from 'react';
import { 
  Sale, 
  SaleItem, 
  ProduceCatalogItem, 
  InventoryItem, 
  Customer, 
  PaymentMethod,
  ThirdPartyPurchase,
  ThirdPartyStockItem
} from '../types';
import { 
  Plus, 
  Search, 
  Calendar, 
  Truck, 
  Scale, 
  ShoppingCart, 
  DollarSign, 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  Copy, 
  ExternalLink, 
  Trash2, 
  Edit2, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  AlertCircle, 
  Sparkles,
  ShoppingBag,
  Send,
  Printer,
  FileSpreadsheet,
  Package,
  Layers,
  ArrowRight,
  Info,
  Building2,
  User,
  UserCheck,
  UserPlus,
  X,
  Edit3,
  Save,
  Settings,
  RotateCcw,
  SlidersHorizontal,
  Shuffle
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { getCanonicalProductName, normalizeProductName } from '../productUtils';
import { cn, handleFirestoreError, OperationType } from '../App';

export interface KgSalesManagerProps {
  sales: Sale[];
  produceCatalog: ProduceCatalogItem[];
  inventory: InventoryItem[];
  customers: Customer[];
}

export interface ThirdPartyPreset {
  id: string;
  name: string;
  defaultCost: number;
  defaultPrice: number;
  unit: string;
}

// Lista padrão inicial de sugestões de produtos de terceiros para compra/revenda
export const DEFAULT_POPULAR_THIRD_PARTY_ITEMS: ThirdPartyPreset[] = [
  { id: 'tp_1', name: 'Alface Americana (Revenda)', defaultCost: 6.00, defaultPrice: 12.00, unit: 'kg' },
  { id: 'tp_2', name: 'Alface Crespa (Revenda)', defaultCost: 5.00, defaultPrice: 10.00, unit: 'kg' },
  { id: 'tp_3', name: 'Rúcula (Revenda)', defaultCost: 7.00, defaultPrice: 14.00, unit: 'kg' },
  { id: 'tp_4', name: 'Couve Manteiga (Revenda)', defaultCost: 5.00, defaultPrice: 10.00, unit: 'kg' },
  { id: 'tp_5', name: 'Espinafre (Revenda)', defaultCost: 6.00, defaultPrice: 12.00, unit: 'kg' },
  { id: 'tp_6', name: 'Agrião (Revenda)', defaultCost: 6.00, defaultPrice: 12.00, unit: 'kg' },
  { id: 'tp_7', name: 'Repolho Verde', defaultCost: 2.50, defaultPrice: 5.00, unit: 'kg' },
  { id: 'tp_8', name: 'Repolho Roxo', defaultCost: 3.50, defaultPrice: 7.00, unit: 'kg' },
  { id: 'tp_9', name: 'Brócolis Ninja', defaultCost: 7.00, defaultPrice: 14.00, unit: 'kg' },
  { id: 'tp_10', name: 'Couve-Flor', defaultCost: 6.00, defaultPrice: 12.00, unit: 'kg' },
  { id: 'tp_11', name: 'Tomate Italiano', defaultCost: 4.50, defaultPrice: 8.50, unit: 'kg' },
  { id: 'tp_12', name: 'Tomate Carmem / Longa Vida', defaultCost: 4.00, defaultPrice: 7.50, unit: 'kg' },
  { id: 'tp_13', name: 'Tomate Cereja', defaultCost: 6.00, defaultPrice: 12.00, unit: 'kg' },
  { id: 'tp_14', name: 'Batata Inglesa', defaultCost: 3.50, defaultPrice: 6.00, unit: 'kg' },
  { id: 'tp_15', name: 'Batata Doce', defaultCost: 3.00, defaultPrice: 5.50, unit: 'kg' },
  { id: 'tp_16', name: 'Cenoura Especial', defaultCost: 3.80, defaultPrice: 6.50, unit: 'kg' },
  { id: 'tp_17', name: 'Beterraba', defaultCost: 3.50, defaultPrice: 6.00, unit: 'kg' },
  { id: 'tp_18', name: 'Cebola Roxa', defaultCost: 4.50, defaultPrice: 7.90, unit: 'kg' },
  { id: 'tp_19', name: 'Cebola Nacional', defaultCost: 3.20, defaultPrice: 5.80, unit: 'kg' },
  { id: 'tp_20', name: 'Pimentão Verde', defaultCost: 4.00, defaultPrice: 7.00, unit: 'kg' },
  { id: 'tp_21', name: 'Pimentão Vermelho/Amarelo', defaultCost: 8.00, defaultPrice: 15.00, unit: 'kg' },
  { id: 'tp_22', name: 'Abobrinha Italiana', defaultCost: 3.20, defaultPrice: 6.00, unit: 'kg' },
  { id: 'tp_23', name: 'Abobrinha Menina', defaultCost: 3.50, defaultPrice: 6.50, unit: 'kg' },
  { id: 'tp_24', name: 'Chuchu', defaultCost: 2.00, defaultPrice: 4.50, unit: 'kg' },
  { id: 'tp_25', name: 'Pepino Japonês', defaultCost: 3.50, defaultPrice: 6.90, unit: 'kg' },
  { id: 'tp_26', name: 'Mandioca / Aipim Descascado', defaultCost: 4.00, defaultPrice: 8.00, unit: 'kg' },
  { id: 'tp_27', name: 'Alho Roxo', defaultCost: 18.00, defaultPrice: 32.00, unit: 'kg' },
  { id: 'tp_28', name: 'Banana Prata', defaultCost: 3.50, defaultPrice: 6.50, unit: 'kg' },
  { id: 'tp_29', name: 'Banana Nanica', defaultCost: 2.80, defaultPrice: 5.50, unit: 'kg' },
  { id: 'tp_30', name: 'Laranja Pera', defaultCost: 2.50, defaultPrice: 4.90, unit: 'kg' },
  { id: 'tp_31', name: 'Limão Taiti', defaultCost: 3.00, defaultPrice: 6.00, unit: 'kg' },
  { id: 'tp_32', name: 'Maçã Gala', defaultCost: 5.50, defaultPrice: 9.90, unit: 'kg' },
  { id: 'tp_33', name: 'Mamão Formosa', defaultCost: 3.80, defaultPrice: 7.00, unit: 'kg' },
  { id: 'tp_34', name: 'Melancia', defaultCost: 1.80, defaultPrice: 3.50, unit: 'kg' },
  { id: 'tp_35', name: 'Melão Amarelo', defaultCost: 3.80, defaultPrice: 7.00, unit: 'kg' },
  { id: 'tp_36', name: 'Ovos Caipira (Dúzia)', defaultCost: 9.00, defaultPrice: 15.00, unit: 'dz' }
];

const POPULAR_THIRD_PARTY_ITEMS = DEFAULT_POPULAR_THIRD_PARTY_ITEMS;

export default function KgSalesManager({
  sales,
  produceCatalog,
  inventory,
  customers
}: KgSalesManagerProps) {
  // Filtros principais
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'tomorrow' | 'week' | 'custom'>('all');
  const [customDate, setCustomDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'needs_purchase' | 'purchased' | 'delivered' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modais
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [isShoppingListModalOpen, setIsShoppingListModalOpen] = useState(false);
  const [isWeighingModalOpen, setIsWeighingModalOpen] = useState(false);
  const [selectedSaleForWeighing, setSelectedSaleForWeighing] = useState<Sale | null>(null);
  const [weighingInputs, setWeighingInputs] = useState<Record<number, number>>({});
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  
  // Feedback e Loading
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [expenseSavedFeedback, setExpenseSavedFeedback] = useState(false);

  // Estados do Formulário de Pedido por KG
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [isQuickAddCustomerOpen, setIsQuickAddCustomerOpen] = useState(false);
  const [newCustomerCompanyName, setNewCustomerCompanyName] = useState('');
  const [newCustomerContactName, setNewCustomerContactName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [quickSavingCustomer, setQuickSavingCustomer] = useState(false);

  const [clientPhone, setClientPhone] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [deliveryDateInput, setDeliveryDateInput] = useState(
    format(new Date(Date.now() + 86400000), 'yyyy-MM-dd')
  );
  const [orderItems, setOrderItems] = useState<SaleItem[]>([]);
  const [paymentOption, setPaymentOption] = useState('Pagar na Entrega');
  const [productOriginTab, setProductOriginTab] = useState<'own' | 'third_stock' | 'mixed' | 'third_custom'>('own');
  const [productSearch, setProductSearch] = useState('');

  // Compras de Terceiros reais do Firestore para cálculo de estoque
  const [thirdPartyPurchases, setThirdPartyPurchases] = useState<ThirdPartyPurchase[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'third_party_purchases'), orderBy('purchaseDate', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ThirdPartyPurchase));
      setThirdPartyPurchases(docs);
    }, (err) => {
      console.error("Erro ao escutar compras em KgSalesManager:", err);
    });
    return () => unsub();
  }, []);

  // Estoque Dinâmico Calculado de Produtos Comprados de Terceiros
  const calculatedThirdPartyStock = useMemo(() => {
    const stockMap = new Map<string, {
      name: string;
      canonicalName: string;
      unit: string;
      totalPurchased: number;
      totalSold: number;
      currentStock: number;
      averageCost: number;
      latestCost: number;
      lastSupplier?: string;
    }>();

    // 1. Somar compras cadastradas
    (thirdPartyPurchases || []).forEach(p => {
      (p.items || []).forEach(it => {
        const canonical = getCanonicalProductName(it.name);
        const key = `${normalizeProductName(canonical)}_${it.unit || 'kg'}`;
        if (!stockMap.has(key)) {
          stockMap.set(key, {
            name: it.name,
            canonicalName: canonical,
            unit: it.unit || 'kg',
            totalPurchased: 0,
            totalSold: 0,
            currentStock: 0,
            averageCost: it.unitCost || 0,
            latestCost: it.unitCost || 0,
            lastSupplier: p.supplierName
          });
        }
        const item = stockMap.get(key)!;
        const prevQty = item.totalPurchased;
        const newQty = prevQty + (Number(it.quantity) || 0);
        const prevVal = prevQty * item.averageCost;
        const newVal = prevVal + ((Number(it.quantity) || 0) * (Number(it.unitCost) || 0));
        item.totalPurchased = newQty;
        item.averageCost = newQty > 0 ? Number((newVal / newQty).toFixed(2)) : (it.unitCost || 0);
        item.latestCost = it.unitCost || item.averageCost;
        if (p.supplierName) item.lastSupplier = p.supplierName;
      });
    });

    // 2. Deduzir vendas realizadas
    (sales || []).forEach(s => {
      if (s.status === 'cancelled') return;
      (s.items || []).forEach(it => {
        if (it.source === 'third_party') {
          const canonical = getCanonicalProductName(it.name);
          const key = `${normalizeProductName(canonical)}_${it.unit || 'kg'}`;
          if (!stockMap.has(key)) {
            stockMap.set(key, {
              name: it.name,
              canonicalName: canonical,
              unit: it.unit || 'kg',
              totalPurchased: 0,
              totalSold: 0,
              currentStock: 0,
              averageCost: Number(it.cost || it.estimatedCost || 0),
              latestCost: Number(it.cost || it.estimatedCost || 0)
            });
          }
          const item = stockMap.get(key)!;
          item.totalSold += (Number(it.actualWeightedQty || it.quantity) || 0);
        }
      });
    });

    stockMap.forEach(item => {
      item.currentStock = Number((item.totalPurchased - item.totalSold).toFixed(2));
    });

    return Array.from(stockMap.values()).sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'pt-BR'));
  }, [thirdPartyPurchases, sales]);

  // Estados para Composição de Item Misto (Horta Própria + Estoque de Terceiros)
  const [mixedSelectedProduct, setMixedSelectedProduct] = useState('');
  const [mixedTotalRequestedQty, setMixedTotalRequestedQty] = useState<number | ''>('');
  const [mixedSalePrice, setMixedSalePrice] = useState<number | ''>('');
  const [mixedOwnQty, setMixedOwnQty] = useState<number | ''>('');
  const [mixedThirdQty, setMixedThirdQty] = useState<number | ''>('');
  const [mixedThirdCost, setMixedThirdCost] = useState<number | ''>('');
  const [mixedUnit, setMixedUnit] = useState('kg');

  // Clientes cadastrados filtrados
  const filteredRegisteredCustomers = useMemo(() => {
    const term = customerSearchTerm.toLowerCase().trim();
    if (!term) return customers;
    return customers.filter(c => 
      (c.companyName || '').toLowerCase().includes(term) ||
      (c.contactName || '').toLowerCase().includes(term) ||
      (c.phone || '').replace(/\D/g, '').includes(term.replace(/\D/g, ''))
    );
  }, [customers, customerSearchTerm]);

  // Cliente cadastrado selecionado
  const currentSelectedCustomer = useMemo(() => {
    if (selectedCustomerId) {
      return customers.find(c => c.id === selectedCustomerId) || null;
    }
    if (clientName) {
      return customers.find(c => 
        (c.companyName && c.companyName.trim().toLowerCase() === clientName.trim().toLowerCase()) ||
        (c.contactName && c.contactName.trim().toLowerCase() === clientName.trim().toLowerCase())
      ) || null;
    }
    return null;
  }, [customers, selectedCustomerId, clientName]);

  // Itens customizados de terceiros digitados na hora
  const [customItemName, setCustomItemName] = useState('');
  const [customItemQty, setCustomItemQty] = useState<number | ''>('');
  const [customItemUnit, setCustomItemUnit] = useState('kg');
  const [customItemCost, setCustomItemCost] = useState<number | ''>('');
  const [customItemPrice, setCustomItemPrice] = useState<number | ''>('');
  const [customItemSupplierNotes, setCustomItemSupplierNotes] = useState('');
  const [saveToPresets, setSaveToPresets] = useState(false);

  // Produtos pré-salvos de terceiros (armazenados em localStorage para permitir edição, exclusão e novos cadastros sem limites de valor)
  const [thirdPartyPresets, setThirdPartyPresets] = useState<ThirdPartyPreset[]>(() => {
    try {
      const saved = localStorage.getItem('kg_sales_third_party_presets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Error loading third party presets from localStorage', e);
    }
    return DEFAULT_POPULAR_THIRD_PARTY_ITEMS;
  });

  const [isPresetsManagerOpen, setIsPresetsManagerOpen] = useState(false);
  const [presetSearch, setPresetSearch] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetData, setEditingPresetData] = useState<{ name: string; defaultCost: number; defaultPrice: number; unit: string } | null>(null);
  const [newPresetForm, setNewPresetForm] = useState<{ name: string; defaultCost: number | ''; defaultPrice: number | ''; unit: string }>({
    name: '',
    defaultCost: '',
    defaultPrice: '',
    unit: 'kg'
  });

  // Edição de custos na lista consolidada de compras e nos cards de pedidos
  const [shoppingListCosts, setShoppingListCosts] = useState<Record<string, number>>({});
  const [editingCardItemCost, setEditingCardItemCost] = useState<{ saleId: string; itemIndex: number; cost: number } | null>(null);
  const [costUpdatedFeedbackKey, setCostUpdatedFeedbackKey] = useState<string | null>(null);

  // Catálogo deduplicado
  const uniqueCatalog = useMemo(() => {
    const map = new Map<string, ProduceCatalogItem>();
    produceCatalog.forEach(item => {
      const canonical = getCanonicalProductName(item.name);
      const key = normalizeProductName(canonical);
      if (!map.has(key)) {
        map.set(key, { ...item, name: canonical, unit: item.unit || 'kg' });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [produceCatalog]);

  // Lista de Vendas do Modo KG
  const kgSales = useMemo(() => {
    return sales.filter(s => s.isKgMode === true);
  }, [sales]);

  // Helper de Data do Pedido
  const getSaleDateObj = (sale: Sale): Date | null => {
    const d = sale.deliveryDate || sale.createdAt;
    if (!d) return null;
    if (typeof d.toDate === 'function') return d.toDate();
    return new Date(d);
  };

  // Filtragem dos pedidos por KG
  const filteredKgSales = useMemo(() => {
    return kgSales.filter(sale => {
      // 1. Busca textual
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchesClient = sale.customerName.toLowerCase().includes(q);
        const matchesPhone = (sale.customerPhone || '').includes(q);
        const matchesItems = sale.items.some(i => i.name.toLowerCase().includes(q));
        if (!matchesClient && !matchesPhone && !matchesItems) return false;
      }

      // 2. Filtro de Status
      if (statusFilter === 'needs_purchase') {
        const hasUnpurchased = sale.items.some(i => i.source === 'third_party' && !i.purchased);
        if (!hasUnpurchased || sale.status === 'paid' || sale.status === 'cancelled') return false;
      } else if (statusFilter === 'purchased') {
        const hasThird = sale.items.some(i => i.source === 'third_party');
        const allThirdPurchased = !sale.items.some(i => i.source === 'third_party' && !i.purchased);
        if (!hasThird || !allThirdPurchased || sale.status === 'paid') return false;
      } else if (statusFilter === 'delivered') {
        if (sale.status !== 'delivered' && sale.status !== 'pending_delivery') return false;
      } else if (statusFilter === 'paid') {
        if (sale.status !== 'paid' && sale.status !== 'confirmed') return false;
      }

      // 3. Filtro de Data
      if (dateFilter === 'all') return true;

      const saleDate = getSaleDateObj(sale);
      if (!saleDate) return false;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sDay = new Date(saleDate);
      sDay.setHours(0, 0, 0, 0);

      if (dateFilter === 'today') {
        return sDay.getTime() === today.getTime();
      }
      if (dateFilter === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return sDay.getTime() === tomorrow.getTime();
      }
      if (dateFilter === 'week') {
        const in7Days = new Date(today);
        in7Days.setDate(in7Days.getDate() + 7);
        return sDay >= today && sDay <= in7Days;
      }
      if (dateFilter === 'custom' && customDate) {
        const cDate = new Date(customDate + 'T00:00:00');
        return sDay.getTime() === cDate.getTime();
      }

      return true;
    });
  }, [kgSales, searchQuery, statusFilter, dateFilter, customDate]);

  // Métricas Consolidadas
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalThirdPartyCost = 0;
    let totalOwnKg = 0;
    let totalThirdPartyKg = 0;
    let pendingPurchasesCount = 0;

    filteredKgSales.forEach(sale => {
      if (sale.status === 'cancelled') return;
      totalRevenue += sale.total || 0;

      sale.items.forEach(item => {
        const qty = Number(item.quantity) || 0;
        if (item.source === 'third_party') {
          totalThirdPartyKg += qty;
          const cost = Number(item.cost || item.estimatedCost || 0);
          totalThirdPartyCost += cost * qty;
          if (!item.purchased) pendingPurchasesCount++;
        } else {
          totalOwnKg += qty;
        }
      });
    });

    const estimatedGrossProfit = totalRevenue - totalThirdPartyCost;
    const profitMargin = totalRevenue > 0 ? (estimatedGrossProfit / totalRevenue) * 100 : 0;

    return {
      totalOrders: filteredKgSales.length,
      totalRevenue,
      totalThirdPartyCost,
      estimatedGrossProfit,
      profitMargin,
      totalOwnKg,
      totalThirdPartyKg,
      totalKg: totalOwnKg + totalThirdPartyKg,
      pendingPurchasesCount
    };
  }, [filteredKgSales]);

  // Lista consolidada de compras de terceiros
  const consolidatedShoppingList = useMemo(() => {
    const productMap = new Map<string, {
      name: string;
      unit: string;
      totalQuantity: number;
      estimatedUnitCost: number;
      totalEstimatedCost: number;
      allPurchased: boolean;
      orders: { saleId: string; customerName: string; quantity: number; purchased: boolean }[];
    }>();

    filteredKgSales.forEach(sale => {
      if (sale.status === 'cancelled' || sale.status === 'paid') return;

      sale.items.forEach(item => {
        if (item.source === 'third_party') {
          const canonical = getCanonicalProductName(item.name);
          const key = normalizeProductName(canonical);
          const qty = Number(item.quantity) || 0;
          const cost = Number(item.cost || item.estimatedCost || 0);

          if (!productMap.has(key)) {
            productMap.set(key, {
              name: canonical,
              unit: item.unit || 'kg',
              totalQuantity: qty,
              estimatedUnitCost: cost,
              totalEstimatedCost: cost * qty,
              allPurchased: !!item.purchased,
              orders: [{
                saleId: sale.id,
                customerName: sale.customerName,
                quantity: qty,
                purchased: !!item.purchased
              }]
            });
          } else {
            const existing = productMap.get(key)!;
            existing.totalQuantity += qty;
            existing.totalEstimatedCost += cost * qty;
            if (cost > 0) existing.estimatedUnitCost = cost;
            if (!item.purchased) existing.allPurchased = false;
            existing.orders.push({
              saleId: sale.id,
              customerName: sale.customerName,
              quantity: qty,
              purchased: !!item.purchased
            });
          }
        }
      });
    });

    return Array.from(productMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredKgSales]);

  // Selecionar cliente cadastrado
  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    const displayName = customer.companyName || customer.contactName;
    setClientName(displayName);
    setClientPhone(customer.phone || '');
    setIsCustomerDropdownOpen(false);
    setCustomerSearchTerm('');
    setError(null);

    // Auto-preencher endereço de entregas anteriores deste cliente se disponível
    const prevSale = sales.find(s => 
      (s.customerName && s.customerName.toLowerCase() === displayName.toLowerCase()) ||
      (customer.phone && s.customerPhone && s.customerPhone.replace(/\D/g, '') === customer.phone.replace(/\D/g, ''))
    );
    if (prevSale) {
      if (prevSale.deliveryAddress && !clientAddress) setClientAddress(prevSale.deliveryAddress);
      if (prevSale.observations && !clientNotes) setClientNotes(prevSale.observations);
    }
  };

  // Cadastrar novo cliente rapidamente no Firestore
  const handleQuickCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerCompanyName.trim() && !newCustomerContactName.trim()) {
      setError('Informe a empresa / razão social ou contato do cliente.');
      return;
    }
    setQuickSavingCustomer(true);
    setError(null);
    try {
      const compName = newCustomerCompanyName.trim() || newCustomerContactName.trim();
      const contName = newCustomerContactName.trim() || newCustomerCompanyName.trim();
      const phoneVal = newCustomerPhone.trim() || '';

      const docRef = await addDoc(collection(db, 'customers'), {
        companyName: compName,
        contactName: contName,
        phone: phoneVal
      });

      setSelectedCustomerId(docRef.id);
      setClientName(compName);
      setClientPhone(phoneVal);
      setIsQuickAddCustomerOpen(false);
      setIsCustomerDropdownOpen(false);
      setNewCustomerCompanyName('');
      setNewCustomerContactName('');
      setNewCustomerPhone('');
    } catch (err: any) {
      console.error("Erro ao cadastrar cliente:", err);
      setError('Erro ao cadastrar cliente: ' + (err.message || 'Erro'));
      handleFirestoreError(err, OperationType.WRITE, 'customers');
    } finally {
      setQuickSavingCustomer(false);
    }
  };

  // Auto-preenchimento ao digitar telefone
  const handlePhoneChange = (phoneVal: string) => {
    setClientPhone(phoneVal);
    const clean = phoneVal.replace(/\D/g, '');
    if (clean.length >= 8) {
      // 1. Procura em clientes cadastrados
      const matchedCust = customers.find(c => c.phone && c.phone.replace(/\D/g, '').includes(clean));
      if (matchedCust) {
        handleSelectCustomer(matchedCust);
        return;
      }

      // 2. Procura em vendas anteriores
      const prevSale = sales.find(s => s.customerPhone && s.customerPhone.replace(/\D/g, '').includes(clean));
      if (prevSale) {
        if (!clientName && prevSale.customerName) {
          const cust = customers.find(c => c.companyName?.toLowerCase() === prevSale.customerName?.toLowerCase());
          if (cust) {
            handleSelectCustomer(cust);
          } else {
            setClientName(prevSale.customerName);
          }
        }
        if (!clientAddress && prevSale.deliveryAddress) setClientAddress(prevSale.deliveryAddress);
        if (!clientNotes && prevSale.observations) setClientNotes(prevSale.observations);
      }
    }
  };

  // Abrir Modal de Novo Pedido
  const handleOpenNewOrderModal = (saleToEdit?: Sale) => {
    setError(null);
    setIsQuickAddCustomerOpen(false);
    setIsCustomerDropdownOpen(false);
    setCustomerSearchTerm('');
    if (saleToEdit) {
      setEditingSale(saleToEdit);
      const matched = customers.find(c => 
        (c.companyName && saleToEdit.customerName && c.companyName.toLowerCase() === saleToEdit.customerName.toLowerCase()) ||
        (c.contactName && saleToEdit.customerName && c.contactName.toLowerCase() === saleToEdit.customerName.toLowerCase()) ||
        (c.phone && saleToEdit.customerPhone && c.phone.replace(/\D/g, '') === saleToEdit.customerPhone.replace(/\D/g, ''))
      );
      setSelectedCustomerId(matched ? matched.id : '');
      setClientName(saleToEdit.customerName || '');
      setClientPhone(saleToEdit.customerPhone || '');
      setClientAddress(saleToEdit.deliveryAddress || '');
      setClientNotes(saleToEdit.observations || '');
      const d = getSaleDateObj(saleToEdit);
      setDeliveryDateInput(d ? format(d, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
      setOrderItems(saleToEdit.items || []);
      setPaymentOption(saleToEdit.paymentMethods?.[0]?.method || 'Pagar na Entrega');
    } else {
      setEditingSale(null);
      setSelectedCustomerId('');
      setClientName('');
      setClientPhone('');
      setClientAddress('');
      setClientNotes('');
      setDeliveryDateInput(format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'));
      setOrderItems([]);
      setPaymentOption('Pagar na Entrega');
    }
    setIsNewOrderModalOpen(true);
  };

  // Adicionar item da Horta Própria ao pedido
  const handleAddOwnProduceItem = (produce: ProduceCatalogItem) => {
    const canonical = getCanonicalProductName(produce.name);
    const existingIndex = orderItems.findIndex(
      i => normalizeProductName(i.name) === normalizeProductName(canonical) && i.source === 'own_production'
    );

    if (existingIndex >= 0) {
      const updated = [...orderItems];
      updated[existingIndex].quantity = (Number(updated[existingIndex].quantity) || 0) + 1;
      setOrderItems(updated);
    } else {
      const newItem: SaleItem = {
        itemId: produce.id,
        name: canonical,
        quantity: 1,
        unit: 'kg', // No modo KG, alfaces e todas as folhosas e legumes são vendidos por kg
        price: produce.defaultPrice || 5.00,
        cost: 0, // Produção própria
        source: 'own_production',
        purchased: true, // Já é da horta
        originalRequestedQty: 1
      };
      setOrderItems([...orderItems, newItem]);
    }
  };

  // Salvar presets atualizados no LocalStorage
  const handleSavePresetsToStorage = (updated: ThirdPartyPreset[]) => {
    setThirdPartyPresets(updated);
    try {
      localStorage.setItem('kg_sales_third_party_presets', JSON.stringify(updated));
    } catch (e) {
      console.error('Erro ao salvar produtos pré-salvos no localStorage', e);
    }
  };

  // Cadastrar novo produto pré-salvo
  const handleAddPreset = () => {
    if (!newPresetForm.name.trim()) {
      return;
    }
    const cost = Number(newPresetForm.defaultCost) || 0;
    const price = Number(newPresetForm.defaultPrice) || 0;
    const canonical = getCanonicalProductName(newPresetForm.name.trim());

    const newPreset: ThirdPartyPreset = {
      id: `preset_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: canonical,
      defaultCost: cost,
      defaultPrice: price,
      unit: newPresetForm.unit || 'kg'
    };

    const updated = [newPreset, ...thirdPartyPresets];
    handleSavePresetsToStorage(updated);
    setNewPresetForm({ name: '', defaultCost: '', defaultPrice: '', unit: 'kg' });
  };

  // Atualizar produto pré-salvo existente
  const handleUpdatePreset = (id: string, updatedFields: Partial<ThirdPartyPreset>) => {
    const updated = thirdPartyPresets.map(p => p.id === id ? { ...p, ...updatedFields } : p);
    handleSavePresetsToStorage(updated);
    if (editingPresetId === id && editingPresetData) {
      setEditingPresetData({ ...editingPresetData, ...updatedFields });
    }
  };

  // Excluir produto pré-salvo
  const handleDeletePreset = (id: string) => {
    const updated = thirdPartyPresets.filter(p => p.id !== id);
    handleSavePresetsToStorage(updated);
    if (editingPresetId === id) {
      setEditingPresetId(null);
      setEditingPresetData(null);
    }
  };

  // Restaurar lista padrão de fábrica
  const handleResetPresetsToDefault = () => {
    if (window.confirm('Deseja restaurar a lista padrão de produtos de terceiros? Todas as suas edições e produtos personalizados serão redefinidos para os padrões de fábrica.')) {
      handleSavePresetsToStorage(DEFAULT_POPULAR_THIRD_PARTY_ITEMS);
      setEditingPresetId(null);
      setEditingPresetData(null);
    }
  };

  // Adicionar item direto do estoque comprado de terceiros
  const handleAddThirdPartyStockItem = (stockItem: { canonicalName: string; name: string; unit: string; currentStock: number; averageCost: number; latestCost: number; lastSupplier?: string }) => {
    const canonical = stockItem.canonicalName;
    const existingIndex = orderItems.findIndex(
      i => normalizeProductName(i.name) === normalizeProductName(canonical) && i.source === 'third_party'
    );

    const costToUse = stockItem.latestCost || stockItem.averageCost || 0;
    // Preço sugerido padrão de venda: busca preset ou dobra o custo
    const matchedPreset = thirdPartyPresets.find(p => normalizeProductName(p.name) === normalizeProductName(canonical));
    const suggestedPrice = matchedPreset?.defaultPrice || (costToUse > 0 ? costToUse * 1.8 : 10.00);

    if (existingIndex >= 0) {
      const updated = [...orderItems];
      updated[existingIndex].quantity = (Number(updated[existingIndex].quantity) || 0) + 1;
      setOrderItems(updated);
    } else {
      const newItem: SaleItem = {
        itemId: `third_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: `${canonical} (Revenda)`,
        quantity: 1,
        unit: stockItem.unit || 'kg',
        price: Number(suggestedPrice.toFixed(2)),
        cost: Number(costToUse.toFixed(2)),
        estimatedCost: Number(costToUse.toFixed(2)),
        source: 'third_party',
        purchased: stockItem.currentStock > 0, // se tem em estoque, já está comprado
        supplierNotes: stockItem.lastSupplier ? `Fornecedor: ${stockItem.lastSupplier}` : undefined,
        originalRequestedQty: 1
      };
      setOrderItems([...orderItems, newItem]);
    }
  };

  // Adicionar composição mista (X kg Horta Própria + Y kg Terceiro Comprado)
  const handleAddMixedItem = () => {
    if (!mixedSelectedProduct.trim()) {
      setError('Selecione ou digite o nome do produto para a composição.');
      return;
    }

    const ownQ = Number(mixedOwnQty) || 0;
    const thirdQ = Number(mixedThirdQty) || 0;
    const sPrice = Number(mixedSalePrice) || 0;
    const tCost = Number(mixedThirdCost) || 0;

    if (ownQ <= 0 && thirdQ <= 0) {
      setError('Informe a quantidade de produção própria ou a quantidade de terceiros.');
      return;
    }

    if (sPrice <= 0) {
      setError('Informe o preço unitário de venda por kg para o cliente.');
      return;
    }

    const canonical = getCanonicalProductName(mixedSelectedProduct.trim());
    const newItems: SaleItem[] = [];

    if (ownQ > 0) {
      newItems.push({
        itemId: `own_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: `${canonical} (Horta Própria)`,
        quantity: ownQ,
        unit: mixedUnit || 'kg',
        price: sPrice,
        cost: 0,
        source: 'own_production',
        purchased: true,
        originalRequestedQty: ownQ
      });
    }

    if (thirdQ > 0) {
      newItems.push({
        itemId: `third_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: `${canonical} (Revenda)`,
        quantity: thirdQ,
        unit: mixedUnit || 'kg',
        price: sPrice,
        cost: tCost,
        estimatedCost: tCost,
        source: 'third_party',
        purchased: false,
        originalRequestedQty: thirdQ
      });
    }

    setOrderItems([...orderItems, ...newItems]);

    // Limpar campos
    setMixedSelectedProduct('');
    setMixedTotalRequestedQty('');
    setMixedOwnQty('');
    setMixedThirdQty('');
    setMixedSalePrice('');
    setMixedThirdCost('');
    setError(null);
  };

  // Adicionar item sugerido de terceiros
  const handleAddSuggestedThirdParty = (item: ThirdPartyPreset) => {
    const canonical = getCanonicalProductName(item.name);
    const existingIndex = orderItems.findIndex(
      i => normalizeProductName(i.name) === normalizeProductName(canonical) && i.source === 'third_party'
    );

    if (existingIndex >= 0) {
      const updated = [...orderItems];
      updated[existingIndex].quantity = (Number(updated[existingIndex].quantity) || 0) + 1;
      setOrderItems(updated);
    } else {
      const newItem: SaleItem = {
        itemId: `third_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: canonical,
        quantity: 1,
        unit: item.unit || 'kg',
        price: Number(item.defaultPrice) || 0,
        cost: Number(item.defaultCost) || 0,
        estimatedCost: Number(item.defaultCost) || 0,
        source: 'third_party',
        purchased: false,
        originalRequestedQty: 1
      };
      setOrderItems([...orderItems, newItem]);
    }
  };

  // Adicionar item customizado de terceiros digitado livremente
  const handleAddCustomThirdParty = () => {
    if (!customItemName.trim()) {
      setError('Informe o nome do produto para compra externa.');
      return;
    }
    const qty = Number(customItemQty) || 1;
    const price = Number(customItemPrice) || 0;
    const cost = Number(customItemCost) || 0;

    const canonical = getCanonicalProductName(customItemName.trim());
    const newItem: SaleItem = {
      itemId: `third_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: canonical,
      quantity: qty,
      unit: customItemUnit.trim() || 'kg',
      price: price,
      cost: cost,
      estimatedCost: cost,
      source: 'third_party',
      purchased: false,
      supplierNotes: customItemSupplierNotes.trim(),
      originalRequestedQty: qty
    };

    setOrderItems([...orderItems, newItem]);

    // Se o usuário optou por salvar nos pré-salvos
    if (saveToPresets) {
      const alreadyExists = thirdPartyPresets.some(p => normalizeProductName(p.name) === normalizeProductName(canonical));
      if (!alreadyExists) {
        const newPreset: ThirdPartyPreset = {
          id: `preset_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: canonical,
          defaultCost: cost,
          defaultPrice: price,
          unit: customItemUnit.trim() || 'kg'
        };
        handleSavePresetsToStorage([newPreset, ...thirdPartyPresets]);
      }
    }

    setCustomItemName('');
    setCustomItemQty('');
    setCustomItemCost('');
    setCustomItemPrice('');
    setCustomItemSupplierNotes('');
    setSaveToPresets(false);
    setError(null);
  };

  // Atualizar campo de item no pedido
  const handleUpdateItemField = (index: number, field: keyof SaleItem, value: any) => {
    const updated = [...orderItems];
    updated[index] = { ...updated[index], [field]: value };
    setOrderItems(updated);
  };

  // Remover item do pedido
  const handleRemoveOrderItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  // Cálculos do Pedido em Edição
  const orderSummary = useMemo(() => {
    let subtotal = 0;
    let totalCost = 0;
    let ownKg = 0;
    let thirdPartyKg = 0;

    orderItems.forEach(item => {
      const q = Number(item.quantity) || 0;
      const p = Number(item.price) || 0;
      const c = Number(item.cost || item.estimatedCost || 0);

      subtotal += q * p;
      if (item.source === 'third_party') {
        thirdPartyKg += q;
        totalCost += q * c;
      } else {
        ownKg += q;
      }
    });

    const profit = subtotal - totalCost;
    const margin = subtotal > 0 ? (profit / subtotal) * 100 : 0;

    return {
      subtotal,
      totalCost,
      profit,
      margin,
      ownKg,
      thirdPartyKg,
      totalKg: ownKg + thirdPartyKg
    };
  }, [orderItems]);

  // Salvar Pedido por KG no Firestore
  const handleSaveKgOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validação obrigatória de cliente previamente cadastrado
    const matchedCustomer = customers.find(c => 
      (selectedCustomerId && c.id === selectedCustomerId) ||
      (clientName && c.companyName?.trim().toLowerCase() === clientName.trim().toLowerCase()) ||
      (clientName && c.contactName?.trim().toLowerCase() === clientName.trim().toLowerCase())
    );

    if (!matchedCustomer) {
      setError('⚠️ Na Venda por KG (vendas de alto valor), é obrigatório selecionar um cliente cadastrado. Selecione um cliente da lista ou clique em "+ Cadastrar Novo Cliente".');
      return;
    }

    if (orderItems.length === 0) {
      setError('Adicione pelo menos um produto ao pedido.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let deliveryDateObj: Date = new Date();
      if (deliveryDateInput && deliveryDateInput.trim()) {
        const d = new Date(deliveryDateInput + 'T12:00:00');
        if (!isNaN(d.getTime())) {
          deliveryDateObj = d;
        }
      }

      const allThirdPurchased = !orderItems.some(i => i.source === 'third_party' && !i.purchased);

      // Sanitiza rigorosamente cada item para evitar valores undefined que corrompem o Firestore
      const sanitizedItems: SaleItem[] = orderItems.map((item, idx) => {
        const qty = Number(item.quantity) || 1;
        const price = Number(item.price) || 0;
        const cost = Number(item.cost ?? item.estimatedCost ?? 0);
        const estimatedCost = Number(item.estimatedCost ?? item.cost ?? 0);

        const cleanItem: SaleItem = {
          itemId: String(item.itemId || `kg_item_${idx}_${Date.now()}`),
          name: String(item.name || 'Produto').trim(),
          quantity: qty,
          unit: String(item.unit || 'kg').trim(),
          price: price,
          cost: cost,
          estimatedCost: estimatedCost,
          source: item.source === 'third_party' ? 'third_party' : 'own_production',
          purchased: Boolean(item.purchased),
          supplierNotes: String(item.supplierNotes || '').trim(),
          originalRequestedQty: Number(item.originalRequestedQty ?? qty)
        };

        if (item.actualWeightedQty !== undefined && item.actualWeightedQty !== null) {
          cleanItem.actualWeightedQty = Number(item.actualWeightedQty);
        }

        return cleanItem;
      });

      const subtotal = Number(orderSummary.subtotal) || 0;
      const totalCost = Number(orderSummary.totalCost) || 0;
      const profit = Number(orderSummary.profit) || 0;
      const margin = isNaN(orderSummary.margin) ? 0 : Number(orderSummary.margin);

      const saleData: any = {
        customerName: clientName.trim(),
        customerPhone: clientPhone.trim() || '',
        deliveryAddress: clientAddress.trim() || '',
        observations: clientNotes.trim() || '',
        isDelivery: true,
        isKgMode: true,
        items: sanitizedItems,
        total: subtotal,
        totalCost: totalCost,
        estimatedProfit: profit,
        profitMargin: margin,
        thirdPartyPurchased: allThirdPurchased,
        deliveryDate: deliveryDateObj,
        status: editingSale ? editingSale.status : 'ordered',
        paymentMethods: [{ method: paymentOption || 'Pagar na Entrega', amount: subtotal }]
      };

      if (editingSale) {
        await updateDoc(doc(db, 'sales', editingSale.id), saleData);
      } else {
        const dateStr = format(new Date(), 'yyyyMMdd');
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        const saleNumber = `KG-${dateStr}-${randomStr}`;
        await addDoc(collection(db, 'sales'), {
          ...saleData,
          saleNumber,
          createdAt: serverTimestamp()
        });
      }

      setIsNewOrderModalOpen(false);
      setEditingSale(null);
    } catch (err: any) {
      console.error("Erro ao salvar pedido por KG:", err);
      const errMsg = err?.message || 'Erro desconhecido ao salvar pedido';
      setError('Erro ao salvar pedido: ' + errMsg);
      handleFirestoreError(err, OperationType.WRITE, 'sales');
    } finally {
      setSaving(false);
    }
  };

  // Marcar item de compra como "Comprado"
  const handleToggleItemPurchased = async (saleId: string, itemIndex: number, currentVal: boolean) => {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;

    try {
      const updatedItems = [...sale.items];
      if (updatedItems[itemIndex]) {
        updatedItems[itemIndex] = {
          ...updatedItems[itemIndex],
          purchased: !currentVal
        };
      }
      const allPurchased = !updatedItems.some(i => i.source === 'third_party' && !i.purchased);
      await updateDoc(doc(db, 'sales', saleId), {
        items: updatedItems,
        thirdPartyPurchased: allPurchased
      });
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, 'sales');
    }
  };

  // Atualizar Custo de Compra de um item específico de um pedido
  const handleUpdateSingleItemCost = async (saleId: string, itemIndex: number, newCost: number) => {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;

    try {
      const updatedItems = [...sale.items];
      if (updatedItems[itemIndex]) {
        updatedItems[itemIndex] = {
          ...updatedItems[itemIndex],
          cost: newCost,
          estimatedCost: newCost
        };
      }

      let newTotalCost = 0;
      updatedItems.forEach(i => {
        const q = Number(i.quantity) || 0;
        const c = Number(i.cost || i.estimatedCost || 0);
        if (i.source === 'third_party') {
          newTotalCost += q * c;
        }
      });

      const profit = (sale.total || 0) - newTotalCost;
      const margin = (sale.total || 0) > 0 ? (profit / (sale.total || 0)) * 100 : 0;

      await updateDoc(doc(db, 'sales', saleId), {
        items: updatedItems,
        totalCost: newTotalCost,
        estimatedProfit: profit,
        profitMargin: margin
      });

      setEditingCardItemCost(null);
      setCostUpdatedFeedbackKey(`${saleId}_${itemIndex}`);
      setTimeout(() => setCostUpdatedFeedbackKey(null), 3000);
    } catch (err: any) {
      console.error("Erro ao atualizar custo do item:", err);
      handleFirestoreError(err, OperationType.WRITE, 'sales');
    }
  };

  // Atualizar Custo de Compra de um produto consolidado (em todos os pedidos pendentes)
  const handleUpdateConsolidatedProductCost = async (productName: string, newCost: number) => {
    try {
      const normTarget = normalizeProductName(productName);
      for (const sale of sales) {
        if (sale.status === 'cancelled' || sale.status === 'paid') continue;
        let hasMatch = false;
        const updatedItems = sale.items.map(item => {
          if (item.source === 'third_party' && normalizeProductName(item.name) === normTarget) {
            hasMatch = true;
            return {
              ...item,
              cost: newCost,
              estimatedCost: newCost
            };
          }
          return item;
        });

        if (hasMatch) {
          let newTotalCost = 0;
          updatedItems.forEach(i => {
            const q = Number(i.quantity) || 0;
            const c = Number(i.cost || i.estimatedCost || 0);
            if (i.source === 'third_party') {
              newTotalCost += q * c;
            }
          });

          const profit = (sale.total || 0) - newTotalCost;
          const margin = (sale.total || 0) > 0 ? (profit / (sale.total || 0)) * 100 : 0;

          await updateDoc(doc(db, 'sales', sale.id), {
            items: updatedItems,
            totalCost: newTotalCost,
            estimatedProfit: profit,
            profitMargin: margin
          });
        }
      }

      setCostUpdatedFeedbackKey(normTarget);
      setTimeout(() => setCostUpdatedFeedbackKey(null), 3000);
    } catch (err: any) {
      console.error("Erro ao atualizar custo consolidado do produto:", err);
      handleFirestoreError(err, OperationType.WRITE, 'sales');
    }
  };

  // Marcar TODOS os itens de um produto consolidado como "Comprados"
  const handleToggleConsolidatedProduct = async (productName: string, productOrders: { saleId: string; quantity: number; purchased: boolean }[], targetPurchased: boolean) => {
    try {
      const normTarget = normalizeProductName(productName);
      for (const order of productOrders) {
        const sale = sales.find(s => s.id === order.saleId);
        if (!sale) continue;

        const updatedItems = sale.items.map(item => {
          if (item.source === 'third_party' && normalizeProductName(item.name) === normTarget) {
            return { ...item, purchased: targetPurchased };
          }
          return item;
        });

        const allPurchased = !updatedItems.some(i => i.source === 'third_party' && !i.purchased);
        await updateDoc(doc(db, 'sales', order.saleId), {
          items: updatedItems,
          thirdPartyPurchased: allPurchased
        });
      }
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, 'sales');
    }
  };

  // Abrir Modal de Pesagem Real
  const handleOpenWeighingModal = (sale: Sale) => {
    setSelectedSaleForWeighing(sale);
    const initialInputs: Record<number, number> = {};
    sale.items.forEach((item, idx) => {
      initialInputs[idx] = item.actualWeightedQty !== undefined ? item.actualWeightedQty : item.quantity;
    });
    setWeighingInputs(initialInputs);
    setIsWeighingModalOpen(true);
  };

  // Salvar Pesagem Real na Balança
  const handleSaveWeighing = async () => {
    if (!selectedSaleForWeighing) return;
    setSaving(true);
    setError(null);
    try {
      let newTotal = 0;
      let newTotalCost = 0;

      const updatedItems = selectedSaleForWeighing.items.map((item, idx) => {
        const weightedQty = weighingInputs[idx] !== undefined ? Number(weighingInputs[idx]) : item.quantity;
        const price = Number(item.price) || 0;
        const cost = Number(item.cost || item.estimatedCost || 0);

        newTotal += weightedQty * price;
        if (item.source === 'third_party') {
          newTotalCost += weightedQty * cost;
        }

        return {
          ...item,
          quantity: weightedQty,
          actualWeightedQty: weightedQty
        };
      });

      const profit = newTotal - newTotalCost;
      const margin = newTotal > 0 ? (profit / newTotal) * 100 : 0;

      await updateDoc(doc(db, 'sales', selectedSaleForWeighing.id), {
        items: updatedItems,
        total: newTotal,
        totalCost: newTotalCost,
        estimatedProfit: profit,
        profitMargin: margin,
        paymentMethods: [{ method: selectedSaleForWeighing.paymentMethods?.[0]?.method || 'Pagar na Entrega', amount: newTotal }]
      });

      setIsWeighingModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setError('Erro ao salvar pesagem: ' + (err.message || 'Erro desconhecido'));
      handleFirestoreError(err, OperationType.WRITE, 'sales');
    } finally {
      setSaving(false);
    }
  };

  // Lançar despesa de compras de terceiros direto no módulo financeiro
  const handleRecordThirdPartyExpense = async () => {
    if (consolidatedShoppingList.length === 0) return;
    const totalExpense = consolidatedShoppingList.reduce((acc, p) => acc + p.totalEstimatedCost, 0);
    if (totalExpense <= 0) return;

    setSaving(true);
    setError(null);
    try {
      const summaryText = consolidatedShoppingList.map(p => `${p.name} (${p.totalQuantity} ${p.unit})`).join(', ');
      await addDoc(collection(db, 'transactions'), {
        type: 'expense',
        amount: totalExpense,
        description: `Compras de Terceiros p/ Revenda: ${summaryText.slice(0, 100)}`,
        category: 'Mercadorias para Revenda',
        date: serverTimestamp()
      });

      setExpenseSavedFeedback(true);
      setTimeout(() => setExpenseSavedFeedback(false), 4000);
    } catch (err: any) {
      console.error(err);
      setError('Erro ao lançar despesa no financeiro: ' + (err.message || 'Erro'));
      handleFirestoreError(err, OperationType.WRITE, 'transactions');
    } finally {
      setSaving(false);
    }
  };

  // Avançar Status do Pedido
  const handleAdvanceStatus = async (sale: Sale) => {
    try {
      if (sale.status === 'ordered' || sale.status === 'pending') {
        await updateDoc(doc(db, 'sales', sale.id), { status: 'pending_delivery' });
      } else if (sale.status === 'pending_delivery') {
        await updateDoc(doc(db, 'sales', sale.id), { status: 'delivered' });
      } else if (sale.status === 'delivered') {
        // Concluir e registrar receita financeira
        await updateDoc(doc(db, 'sales', sale.id), { 
          status: 'paid',
          confirmedAt: serverTimestamp()
        });

        // Lança receita no financeiro se ainda não foi lançada
        await addDoc(collection(db, 'transactions'), {
          type: 'income',
          amount: Number(sale.total) || 0,
          description: `Venda por KG / Entrega - ${sale.customerName || 'Cliente'} (${sale.saleNumber || ''})`,
          category: 'Venda de Produção e Revenda',
          date: serverTimestamp(),
          relatedSaleId: sale.id
        });
      }
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, 'sales');
    }
  };

  // Excluir Pedido
  const handleDeleteSale = async (saleId: string) => {
    if (confirm('Deseja realmente excluir este pedido por KG?')) {
      try {
        await deleteDoc(doc(db, 'sales', saleId));
      } catch (err) {
        console.error(err);
        handleFirestoreError(err, OperationType.DELETE, 'sales');
      }
    }
  };

  // Copiar Romaneio para WhatsApp
  const handleCopyWhatsAppReceipt = (sale: Sale) => {
    const delDate = getSaleDateObj(sale);
    const formattedDate = delDate ? format(delDate, "dd/MM/yyyy (EEEE)", { locale: ptBR }) : 'A combinar';

    let text = `🌿 *HORTA & DISTRIBUIÇÃO - ROMANEIO DE PEDIDO*\n`;
    text += `📋 *Pedido:* ${sale.saleNumber || 'S/N'}\n`;
    text += `👤 *Cliente:* ${sale.customerName}\n`;
    if (sale.customerPhone) text += `📞 *Telefone:* ${sale.customerPhone}\n`;
    if (sale.deliveryAddress) text += `📍 *Endereço:* ${sale.deliveryAddress}\n`;
    text += `📅 *Data de Entrega:* ${formattedDate}\n\n`;
    text += `🛒 *ITENS DO PEDIDO:*\n`;

    sale.items.forEach((item, idx) => {
      const isWeighted = item.actualWeightedQty !== undefined;
      const qtyStr = Number(item.quantity).toFixed(item.unit === 'kg' ? 2 : 0);
      const sub = (Number(item.quantity) * Number(item.price)).toFixed(2);
      text += `${idx + 1}. *${item.name}* - ${qtyStr} ${item.unit || 'kg'} x R$ ${(item.price || 0).toFixed(2)} = *R$ ${sub}* ${isWeighted ? '⚖️ (Pesado)' : ''}\n`;
    });

    text += `\n💰 *TOTAL A PAGAR: R$ ${(sale.total || 0).toFixed(2)}*\n`;
    if (sale.observations) text += `📝 *Obs:* ${sale.observations}\n`;
    text += `\nMuito obrigado pela preferência! Ficamos à disposição. 🙏🌱`;

    navigator.clipboard.writeText(text);
    setCopiedMessageId(sale.id);
    setTimeout(() => setCopiedMessageId(null), 3000);
  };

  // Copiar Lista de Compras para WhatsApp (Para levar ao Ceasa/Mercado)
  const handleCopyShoppingListToWhatsApp = () => {
    let text = `🛒 *LISTA DE COMPRAS - FEIRA / CEASA / FORNECEDORES*\n`;
    text += `📅 *Data de Referência:* ${dateFilter === 'today' ? 'Hoje' : dateFilter === 'tomorrow' ? 'Amanhã' : 'Geral'}\n`;
    text += `📦 *Total de Itens:* ${consolidatedShoppingList.length} variedades\n\n`;

    consolidatedShoppingList.forEach((prod, i) => {
      const statusEmoji = prod.allPurchased ? '✅' : '⬜';
      text += `${statusEmoji} ${i + 1}. *${prod.name}*: *${prod.totalQuantity.toFixed(2)} ${prod.unit}* (Est. R$ ${prod.totalEstimatedCost.toFixed(2)})\n`;
    });

    const totalEst = consolidatedShoppingList.reduce((acc, p) => acc + p.totalEstimatedCost, 0);
    text += `\n💵 *Custo Total Estimado de Compras:* R$ ${totalEst.toFixed(2)}`;

    navigator.clipboard.writeText(text);
    setCopiedMessageId('shopping_list');
    setTimeout(() => setCopiedMessageId(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* CABEÇALHO E MÉTRICAS */}
      <div className="bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-950 p-6 md:p-8 rounded-3xl text-white shadow-xl border border-emerald-800/30">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-black uppercase tracking-wider">
              <Scale size={13} className="text-emerald-400" />
              Modo Venda por KG & Revenda
            </div>
            <h3 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2">
              Gestão de Pedidos por Peso (Horta + Terceiros)
            </h3>
            <p className="text-slate-300 text-xs md:text-sm max-w-2xl leading-relaxed">
              Venda por KG com itens da horta própria e mercadorias compradas de fornecedores. Controle custos, margem de lucro, lista consolidada de compras e pesagem na balança.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleOpenNewOrderModal()}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-5 py-3 rounded-2xl font-black text-sm transition-all shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95"
            >
              <Plus size={18} className="stroke-[3]" />
              Novo Pedido por KG
            </button>
            <button
              onClick={() => setIsShoppingListModalOpen(true)}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 px-4 py-3 rounded-2xl font-bold text-xs md:text-sm transition-all cursor-pointer active:scale-95"
            >
              <ShoppingCart size={16} className="text-amber-400" />
              Lista de Compras ({consolidatedShoppingList.length})
            </button>
          </div>
        </div>

        {/* CARDS DE RESUMO DO MODO KG */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mt-6">
          <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl">
            <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">Pedidos por KG</span>
            <span className="text-xl md:text-2xl font-black text-white mt-1 block">{metrics.totalOrders}</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{metrics.totalKg.toFixed(1)} kg no total</span>
          </div>

          <div className="bg-emerald-950/60 border border-emerald-800/50 p-4 rounded-2xl">
            <span className="text-[11px] font-bold text-emerald-300 block uppercase tracking-wider">🌿 Horta Própria</span>
            <span className="text-xl md:text-2xl font-black text-emerald-400 mt-1 block">{metrics.totalOwnKg.toFixed(1)} <span className="text-sm font-bold">kg</span></span>
            <span className="text-[10px] text-emerald-200/70 mt-0.5 block">Colheita direta</span>
          </div>

          <div className="bg-amber-950/60 border border-amber-800/50 p-4 rounded-2xl">
            <span className="text-[11px] font-bold text-amber-300 block uppercase tracking-wider">🛒 Compra de Terceiros</span>
            <span className="text-xl md:text-2xl font-black text-amber-400 mt-1 block">{metrics.totalThirdPartyKg.toFixed(1)} <span className="text-sm font-bold">kg</span></span>
            <span className="text-[10px] text-amber-200/70 mt-0.5 block">Custo: R$ {metrics.totalThirdPartyCost.toFixed(2)}</span>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl">
            <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">Faturamento Previsto</span>
            <span className="text-xl md:text-2xl font-black text-white mt-1 block">R$ {metrics.totalRevenue.toFixed(2)}</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Total a receber</span>
          </div>

          <div className="bg-emerald-900/50 border border-emerald-500/40 p-4 rounded-2xl col-span-2 sm:col-span-1">
            <span className="text-[11px] font-bold text-emerald-300 block uppercase tracking-wider">Lucro Bruto Previsto</span>
            <span className="text-xl md:text-2xl font-black text-emerald-300 mt-1 block">R$ {metrics.estimatedGrossProfit.toFixed(2)}</span>
            <span className="text-[10px] text-emerald-200 font-extrabold mt-0.5 block">Margem: {metrics.profitMargin.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Filtro de Datas */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setDateFilter('all')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              dateFilter === 'all' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            )}
          >
            Todas as Datas
          </button>
          <button
            onClick={() => setDateFilter('today')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              dateFilter === 'today' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            )}
          >
            Hoje
          </button>
          <button
            onClick={() => setDateFilter('tomorrow')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              dateFilter === 'tomorrow' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            )}
          >
            Amanhã
          </button>
          <button
            onClick={() => setDateFilter('week')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              dateFilter === 'week' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            )}
          >
            Esta Semana
          </button>
        </div>

        {/* Busca e Status */}
        <div className="flex flex-col sm:flex-row items-center gap-2 flex-1 md:justify-end">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Buscar cliente, tel, produto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">Todos os Status</option>
            <option value="needs_purchase">🛒 Compras Pendentes</option>
            <option value="purchased">✅ Compras Feitas</option>
            <option value="delivered">🚚 Em Entrega</option>
            <option value="paid">💰 Concluído & Pago</option>
          </select>
        </div>
      </div>

      {/* LISTA DE CARDS DE PEDIDOS POR KG */}
      <div className="space-y-4">
        {filteredKgSales.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400 space-y-3 shadow-sm">
            <Scale size={48} className="mx-auto text-slate-300 stroke-[1.5]" />
            <h4 className="text-lg font-bold text-slate-700">Nenhum pedido por KG encontrado</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Clique no botão "Novo Pedido por KG" para lançar uma entrega com produtos pesados e itens comprados de terceiros.
            </p>
            <button
              onClick={() => handleOpenNewOrderModal()}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              <Plus size={16} /> Criar Primeiro Pedido
            </button>
          </div>
        ) : (
          filteredKgSales.map(sale => {
            const delDate = getSaleDateObj(sale);
            const formattedDeliveryDate = delDate 
              ? format(delDate, "dd 'de' MMMM (EEEE)", { locale: ptBR }) 
              : 'Data não informada';

            const ownItems = sale.items.filter(i => i.source !== 'third_party');
            const thirdItems = sale.items.filter(i => i.source === 'third_party');
            const allThirdPurchased = !thirdItems.some(i => !i.purchased);

            let ownKg = 0;
            let thirdKg = 0;
            let totalCost = 0;

            sale.items.forEach(i => {
              const q = Number(i.quantity) || 0;
              if (i.source === 'third_party') {
                thirdKg += q;
                totalCost += q * Number(i.cost || i.estimatedCost || 0);
              } else {
                ownKg += q;
              }
            });

            const profit = sale.total - totalCost;
            const margin = sale.total > 0 ? (profit / sale.total) * 100 : 0;

            return (
              <div 
                key={sale.id}
                className={cn(
                  "bg-white rounded-3xl border transition-all p-5 md:p-6 shadow-sm space-y-4 hover:shadow-md",
                  sale.status === 'paid' ? "border-slate-200 bg-slate-50/40" : "border-slate-200"
                )}
              >
                {/* TOPO DO CARD */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 border",
                      sale.status === 'paid' 
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200" 
                        : "bg-emerald-50 text-emerald-700 border-emerald-100"
                    )}>
                      <Scale size={20} />
                    </div>
                    <div>
                      <div className="flex items-center flex-wrap gap-2">
                        <h4 className="text-base font-black text-slate-900">{sale.customerName}</h4>
                        <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg font-bold">
                          {sale.saleNumber || 'KG-S/N'}
                        </span>
                        {thirdItems.length > 0 && (
                          <span className={cn(
                            "text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider border",
                            allThirdPurchased 
                              ? "bg-blue-50 text-blue-700 border-blue-200" 
                              : "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                          )}>
                            {allThirdPurchased ? '🛒 Compras OK' : '🛒 Comprar no Ceasa/Fornecedor'}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500 mt-0.5">
                        {sale.customerPhone && <span>📞 {sale.customerPhone}</span>}
                        {sale.deliveryAddress && <span className="truncate max-w-xs">📍 {sale.deliveryAddress}</span>}
                        <span className="font-bold text-emerald-700">📅 Entrega: {formattedDeliveryDate}</span>
                      </div>
                    </div>
                  </div>

                  {/* VALORES E STATUS */}
                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <div className="text-left sm:text-right">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">Total do Pedido</span>
                      <span className="text-lg font-black text-slate-900 block">R$ {(sale.total || 0).toFixed(2)}</span>
                      {totalCost > 0 && (
                        <span className="text-[10px] font-extrabold text-emerald-600 block">
                          Lucro: R$ {profit.toFixed(2)} ({margin.toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* DISCRIMINAÇÃO DOS ITENS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Itens da Horta */}
                  <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-emerald-800 flex items-center gap-1.5">
                        🌿 Itens da Horta Própria ({ownKg.toFixed(1)} kg)
                      </span>
                    </div>
                    {ownItems.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic block">Nenhum item da horta</span>
                    ) : (
                      <div className="space-y-1.5">
                        {ownItems.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs bg-white p-2 rounded-xl border border-emerald-100/60 shadow-2xs">
                            <span className="font-bold text-slate-800">{item.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-600">{Number(item.quantity).toFixed(2)} {item.unit || 'kg'}</span>
                              <span className="text-slate-400">•</span>
                              <span className="font-bold text-emerald-700">R$ {(Number(item.quantity) * Number(item.price)).toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Itens de Terceiros */}
                  <div className="bg-amber-50/40 border border-amber-100 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-amber-800 flex items-center gap-1.5">
                        🛒 Itens de Terceiros / Revenda ({thirdKg.toFixed(1)} kg)
                      </span>
                    </div>
                    {thirdItems.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic block">Nenhum item de terceiros</span>
                    ) : (
                      <div className="space-y-1.5">
                        {thirdItems.map((item, idx) => {
                          const originalItemIdx = sale.items.indexOf(item);
                          const itemCost = Number(item.cost || item.estimatedCost || 0);
                          const itemTotal = Number(item.quantity) * Number(item.price);
                          const itemTotalCost = Number(item.quantity) * itemCost;
                          const itemProfit = itemTotal - itemTotalCost;

                          const isEditingThisCost = editingCardItemCost?.saleId === sale.id && editingCardItemCost?.itemIndex === originalItemIdx;
                          const feedbackKey = `${sale.id}_${originalItemIdx}`;
                          const isUpdatedFeedback = costUpdatedFeedbackKey === feedbackKey;

                          return (
                            <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between text-xs bg-white p-2.5 rounded-xl border border-amber-100/80 shadow-2xs gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() => handleToggleItemPurchased(sale.id, originalItemIdx, !!item.purchased)}
                                  className={cn(
                                    "w-5 h-5 rounded-md flex items-center justify-center transition-all shrink-0 cursor-pointer",
                                    item.purchased ? "bg-emerald-600 text-white" : "border border-slate-300 bg-slate-50 hover:bg-slate-100"
                                  )}
                                  title={item.purchased ? "Marcado como comprado" : "Clique para marcar como comprado"}
                                >
                                  {item.purchased && <Check size={12} className="stroke-[3]" />}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className={cn("font-bold block truncate", item.purchased ? "line-through text-slate-400" : "text-slate-800")}>
                                      {item.name}
                                    </span>
                                    {isUpdatedFeedback && (
                                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                        Custo salvo!
                                      </span>
                                    )}
                                  </div>

                                  {isEditingThisCost ? (
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <span className="text-[10px] font-bold text-amber-800">Custo R$:</span>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={editingCardItemCost.cost}
                                        onChange={(e) => setEditingCardItemCost({
                                          ...editingCardItemCost,
                                          cost: parseFloat(e.target.value) || 0
                                        })}
                                        className="w-24 px-2 py-0.5 bg-amber-50 border border-amber-300 rounded font-black text-xs text-slate-800 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateSingleItemCost(sale.id, originalItemIdx, editingCardItemCost.cost)}
                                        className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer"
                                        title="Salvar novo custo"
                                      >
                                        <Save size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingCardItemCost(null)}
                                        className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                                      <span className="font-semibold">
                                        Custo: <strong className="text-amber-800">R$ {itemCost.toFixed(2)}</strong>/{item.unit || 'kg'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setEditingCardItemCost({
                                          saleId: sale.id,
                                          itemIndex: originalItemIdx,
                                          cost: itemCost
                                        })}
                                        className="p-0.5 text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded transition-colors cursor-pointer"
                                        title="Editar custo de compra deste produto"
                                      >
                                        <Edit3 size={11} />
                                      </button>
                                      <span className="text-slate-300">|</span>
                                      <span>Venda: R$ {(item.price || 0).toFixed(2)}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="font-extrabold text-slate-700 block">{Number(item.quantity).toFixed(2)} {item.unit || 'kg'}</span>
                                <span className="font-bold text-amber-700 block">R$ {itemTotal.toFixed(2)} <span className="text-[10px] text-emerald-600">(+R$ {itemProfit.toFixed(2)})</span></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* BOTÕES DE AÇÃO DO CARD */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenWeighingModal(sale)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
                      title="Conferir pesagem real na balança"
                    >
                      <Scale size={14} className="text-emerald-600" />
                      Conferir Balança
                    </button>
                    <button
                      onClick={() => handleCopyWhatsAppReceipt(sale)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
                    >
                      {copiedMessageId === sale.id ? (
                        <>
                          <Check size={14} className="text-emerald-600" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Send size={14} />
                          <span>Comprovante WhatsApp</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenNewOrderModal(sale)}
                      className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-all"
                      title="Editar Pedido"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteSale(sale.id)}
                      className="p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all"
                      title="Excluir Pedido"
                    >
                      <Trash2 size={16} />
                    </button>

                    {sale.status !== 'paid' && sale.status !== 'confirmed' && (
                      <button
                        onClick={() => handleAdvanceStatus(sale)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-black text-xs transition-all shadow-md shadow-emerald-100 cursor-pointer active:scale-95"
                      >
                        {(sale.status === 'ordered' || sale.status === 'pending') && 'Pronto para Entrega'}
                        {sale.status === 'pending_delivery' && 'Confirmar Entrega'}
                        {sale.status === 'delivered' && 'Confirmar Pagamento & Concluir'}
                      </button>
                    )}

                    {(sale.status === 'paid' || sale.status === 'confirmed') && (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-black border border-emerald-200">
                        <CheckCircle2 size={14} /> Pago & Concluído
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ================= MODAL DE NOVO PEDIDO POR KG ================= */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-150 p-6 md:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 font-bold">
                  <Scale size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    {editingSale ? 'Editar Pedido por KG' : 'Novo Pedido de Entrega por KG'}
                  </h3>
                  <p className="text-xs text-slate-400">Monte o pedido com produtos da horta e produtos de compras externas.</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewOrderModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-2xl flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSaveKgOrder} className="space-y-6">
              {/* PASSO 1: DADOS DO CLIENTE CADASTRADO (OBRIGATÓRIO) */}
              <div className="bg-slate-50/80 p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="text-emerald-700" size={18} />
                    <span className="text-xs font-black uppercase text-slate-800 tracking-wider">
                      1. Cliente Cadastrado (Obrigatório - Vendas de Alto Valor)
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200/70 w-fit">
                    Exclusivo Clientes Registrados
                  </span>
                </div>

                {/* Exibição do Cliente Selecionado ou Campo de Busca/Seleção */}
                {currentSelectedCustomer ? (
                  <div className="bg-white border-2 border-emerald-500/40 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black shrink-0 border border-emerald-200">
                        <UserCheck size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-slate-900 text-base">
                            {currentSelectedCustomer.companyName}
                          </span>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-emerald-600 text-white rounded-md">
                            Cliente Cadastrado
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 font-semibold flex-wrap">
                          {currentSelectedCustomer.contactName && (
                            <span className="flex items-center gap-1">
                              <User size={13} className="text-slate-400" />
                              Contato: <strong className="text-slate-700">{currentSelectedCustomer.contactName}</strong>
                            </span>
                          )}
                          {currentSelectedCustomer.phone && (
                            <span className="text-emerald-700 font-bold">
                              📞 {currentSelectedCustomer.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomerId('');
                        setClientName('');
                        setClientPhone('');
                        setIsCustomerDropdownOpen(true);
                      }}
                      className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs transition-all cursor-pointer w-full sm:w-auto text-center shrink-0"
                    >
                      Trocar Cliente
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Botão de Busca / Dropdown e Botão de Novo Cliente */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type="text"
                          placeholder="Buscar cliente cadastrado por empresa, contato ou telefone..."
                          value={customerSearchTerm}
                          onChange={(e) => {
                            setCustomerSearchTerm(e.target.value);
                            setIsCustomerDropdownOpen(true);
                          }}
                          onFocus={() => setIsCustomerDropdownOpen(true)}
                          className="w-full pl-10 pr-10 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                        {isCustomerDropdownOpen && (
                          <button
                            type="button"
                            onClick={() => setIsCustomerDropdownOpen(false)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsQuickAddCustomerOpen(prev => !prev)}
                        className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer shrink-0"
                      >
                        <UserPlus size={16} />
                        + Cadastrar Novo Cliente
                      </button>
                    </div>

                    {/* Formulário Rápido de Cadastro de Cliente */}
                    {isQuickAddCustomerOpen && (
                      <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                            <UserPlus size={15} className="text-emerald-700" />
                            Cadastrar Novo Cliente Rápido:
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsQuickAddCustomerOpen(false)}
                            className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                          >
                            ✕ Fechar
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <input
                              type="text"
                              placeholder="Empresa / Razão Social *"
                              value={newCustomerCompanyName}
                              onChange={(e) => setNewCustomerCompanyName(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Nome do Contato"
                              value={newCustomerContactName}
                              onChange={(e) => setNewCustomerContactName(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Telefone / WhatsApp"
                              value={newCustomerPhone}
                              onChange={(e) => setNewCustomerPhone(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setIsQuickAddCustomerOpen(false)}
                            className="px-3 py-1.5 text-xs text-slate-600 font-bold hover:bg-slate-200/50 rounded-lg cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={quickSavingCustomer}
                            onClick={handleQuickCreateCustomer}
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                          >
                            {quickSavingCustomer ? 'Cadastrando...' : 'Salvar e Selecionar Cliente'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Menu Dropdown de Clientes Cadastrados */}
                    {isCustomerDropdownOpen && (
                      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                        {filteredRegisteredCustomers.length === 0 ? (
                          <div className="p-4 text-center text-slate-400 text-xs font-medium space-y-1">
                            <p>Nenhum cliente cadastrado encontrado com essa busca.</p>
                            <p className="text-[11px] text-emerald-700 font-bold">
                              Clique no botão "+ Cadastrar Novo Cliente" acima para registrar agora.
                            </p>
                          </div>
                        ) : (
                          filteredRegisteredCustomers.map(cust => (
                            <button
                              key={cust.id}
                              type="button"
                              onClick={() => handleSelectCustomer(cust)}
                              className="w-full text-left p-3 hover:bg-emerald-50/60 transition-colors flex items-center justify-between group cursor-pointer"
                            >
                              <div>
                                <div className="font-black text-slate-900 text-sm group-hover:text-emerald-800">
                                  {cust.companyName}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                  {cust.contactName && (
                                    <span>Contato: <strong>{cust.contactName}</strong></span>
                                  )}
                                  {cust.phone && (
                                    <span className="text-slate-400">({cust.phone})</span>
                                  )}
                                </div>
                              </div>
                              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                                Selecionar
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Campos complementares de Entrega */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Telefone / WhatsApp</label>
                    <input
                      type="text"
                      placeholder="Ex: (48) 99999-9999"
                      value={clientPhone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-slate-700">Endereço de Entrega</label>
                    <input
                      type="text"
                      placeholder="Rua, número, bairro..."
                      value={clientAddress}
                      onChange={(e) => setClientAddress(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-bold text-slate-700">Observações do Pedido</label>
                    <input
                      type="text"
                      placeholder="Instruções de entrega, detalhes..."
                      value={clientNotes}
                      onChange={(e) => setClientNotes(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Data de Entrega *</label>
                    <input
                      type="date"
                      value={deliveryDateInput}
                      onChange={(e) => setDeliveryDateInput(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* PASSO 2: ESCOLHER PRODUTOS (HORTA vs ESTOQUE TERCEIROS vs MISTO vs LIVRE) */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase text-slate-500 tracking-wider">
                    2. Escolha a Origem dos Produtos para o Pedido
                  </span>
                  
                  {/* Abas Modernas de Origem de Produtos */}
                  <div className="grid grid-cols-2 sm:flex bg-slate-100 p-1 rounded-xl gap-1">
                    <button
                      type="button"
                      onClick={() => setProductOriginTab('own')}
                      className={cn(
                        "px-2.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                        productOriginTab === 'own' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-900"
                      )}
                    >
                      🌿 Horta Própria
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductOriginTab('third_stock')}
                      className={cn(
                        "px-2.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer relative",
                        productOriginTab === 'third_stock' ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-900"
                      )}
                    >
                      📦 Estoque de Terceiros
                      {calculatedThirdPartyStock.filter(i => i.currentStock > 0).length > 0 && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 inline-block animate-pulse" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductOriginTab('mixed')}
                      className={cn(
                        "px-2.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                        productOriginTab === 'mixed' ? "bg-white text-purple-700 shadow-sm" : "text-slate-500 hover:text-slate-900"
                      )}
                    >
                      🔀 Item Misto (Próprio + Terceiro)
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductOriginTab('third_custom')}
                      className={cn(
                        "px-2.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                        productOriginTab === 'third_custom' ? "bg-white text-amber-700 shadow-sm" : "text-slate-500 hover:text-slate-900"
                      )}
                    >
                      🛒 Compra Livre / Pré-Salvos
                    </button>
                  </div>
                </div>

                {/* ========================================================================= */}
                {/* ABA 1: HORTA PRÓPRIA */}
                {/* ========================================================================= */}
                {productOriginTab === 'own' && (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        placeholder="Buscar produto do catálogo da horta própria..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1.5 bg-slate-50/50 rounded-2xl border border-slate-100">
                      {uniqueCatalog
                        .filter(i => i.name.toLowerCase().includes(productSearch.toLowerCase()))
                        .map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleAddOwnProduceItem(item)}
                            className="p-2.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/30 text-left transition-all group flex flex-col justify-between cursor-pointer"
                          >
                            <span className="font-bold text-xs text-slate-800 group-hover:text-emerald-800 block truncate">
                              {item.name}
                            </span>
                            <div className="flex items-center justify-between mt-1 text-[10px]">
                              <span className="text-slate-400 font-bold">R$ {(item.defaultPrice || 0).toFixed(2)}/kg</span>
                              <Plus size={14} className="text-emerald-600 group-hover:scale-125 transition-transform" />
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {/* ========================================================================= */}
                {/* ABA 2: ESTOQUE DE TERCEIROS COMPRADO */}
                {/* ========================================================================= */}
                {productOriginTab === 'third_stock' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-blue-50/70 p-3 rounded-2xl border border-blue-200 text-xs">
                      <div className="flex items-center gap-2 text-blue-900">
                        <Package size={16} className="text-blue-600 shrink-0" />
                        <div>
                          <span className="font-black">Produtos Comprados em Estoque:</span>
                          <p className="text-[11px] text-blue-700">
                            Itens registrados em compras anteriores de terceiros com saldo disponível.
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-black px-2.5 py-1 bg-white rounded-lg border border-blue-200 text-blue-800">
                        {calculatedThirdPartyStock.filter(i => i.currentStock > 0).length} itens com saldo
                      </span>
                    </div>

                    {calculatedThirdPartyStock.length === 0 ? (
                      <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center space-y-2">
                        <p className="text-xs font-bold text-slate-600">Nenhum produto comprado de terceiros registrado no estoque ainda.</p>
                        <p className="text-[11px] text-slate-400">
                          Lance compras na aba "Compras & Estoque Terceiros" ou adicione um item avulso na aba "🛒 Compra Livre".
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto p-1 bg-slate-50/50 rounded-2xl border border-slate-100">
                        {calculatedThirdPartyStock.map((stk) => {
                          const hasPositiveStock = stk.currentStock > 0;
                          return (
                            <button
                              key={stk.canonicalName}
                              type="button"
                              onClick={() => handleAddThirdPartyStockItem(stk)}
                              className={cn(
                                "p-3 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer group",
                                hasPositiveStock 
                                  ? "bg-white border-blue-200 hover:border-blue-500 hover:bg-blue-50/30 shadow-2xs" 
                                  : "bg-slate-50 border-slate-200 opacity-75 hover:opacity-100"
                              )}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <span className="font-black text-xs text-slate-900 group-hover:text-blue-800 block truncate">
                                  {stk.canonicalName}
                                </span>
                                <span className={cn(
                                  "px-2 py-0.5 rounded-full text-[10px] font-black",
                                  hasPositiveStock ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                                )}>
                                  {stk.currentStock} {stk.unit}
                                </span>
                              </div>

                              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[10px]">
                                <span className="text-amber-800 font-bold">
                                  Custo: R$ {(stk.latestCost || stk.averageCost || 0).toFixed(2)}/{stk.unit}
                                </span>
                                <span className="text-blue-600 font-black group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                                  + Usar <ArrowRight size={11} />
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ========================================================================= */}
                {/* ABA 3: ITEM MISTO (HORTA PRÓPRIA + ESTOQUE TERCEIRO) */}
                {/* ========================================================================= */}
                {productOriginTab === 'mixed' && (
                  <div className="bg-purple-50/70 p-4 rounded-2xl border border-purple-200 space-y-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0">
                        <Shuffle size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-purple-950">Compor Item Misto (Parte Próprio + Parte Terceiro)</h4>
                        <p className="text-[11px] text-purple-800">
                          Exemplo: Cliente pediu 15 kg. Você colheu 9 kg na horta e comprou 6 kg de terceiros.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-white p-3.5 rounded-xl border border-purple-100">
                      {/* Seleção do Produto */}
                      <div className="sm:col-span-6 space-y-1">
                        <label className="text-[10px] font-black text-slate-700 block">Produto Desejado *:</label>
                        <input
                          type="text"
                          placeholder="Ex: Rúcula, Tomate, Alface Americana..."
                          value={mixedSelectedProduct}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMixedSelectedProduct(val);
                            // Sugerir custo de terceiros se existir no estoque ou preset
                            const matchedStock = calculatedThirdPartyStock.find(s => normalizeProductName(s.canonicalName) === normalizeProductName(val));
                            if (matchedStock && (matchedStock.latestCost || matchedStock.averageCost)) {
                              setMixedThirdCost(matchedStock.latestCost || matchedStock.averageCost);
                            }
                            const matchedPreset = thirdPartyPresets.find(p => normalizeProductName(p.name) === normalizeProductName(val));
                            if (matchedPreset && matchedPreset.defaultPrice) {
                              setMixedSalePrice(matchedPreset.defaultPrice);
                            }
                          }}
                          list="mixed-products-list"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <datalist id="mixed-products-list">
                          {uniqueCatalog.map(c => <option key={c.id} value={c.name}>{c.name} (Horta)</option>)}
                          {calculatedThirdPartyStock.map(s => <option key={s.canonicalName} value={s.canonicalName}>{s.canonicalName} (Estoque: {s.currentStock} {s.unit})</option>)}
                          {thirdPartyPresets.map(p => <option key={p.id} value={p.name}>{p.name} (Revenda)</option>)}
                        </datalist>
                      </div>

                      {/* Preço de Venda cobrado do Cliente */}
                      <div className="sm:col-span-3 space-y-1">
                        <label className="text-[10px] font-black text-slate-700 block">Preço Venda p/ Cliente *:</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-700">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Ex: 10.00"
                            value={mixedSalePrice}
                            onChange={(e) => setMixedSalePrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                            className="w-full pl-7 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-emerald-950 focus:outline-none focus:ring-2 focus:ring-purple-500 text-right"
                          />
                        </div>
                      </div>

                      {/* Unidade */}
                      <div className="sm:col-span-3 space-y-1">
                        <label className="text-[10px] font-black text-slate-700 block">Unidade:</label>
                        <select
                          value={mixedUnit}
                          onChange={(e) => setMixedUnit(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                        >
                          <option value="kg">kg (Quilograma)</option>
                          <option value="un">un (Unidade)</option>
                          <option value="dz">dz (Dúzia)</option>
                          <option value="cx">cx (Caixa)</option>
                        </select>
                      </div>
                    </div>

                    {/* Divisão: Horta Própria vs Terceiros */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Parcela 1: Horta Própria */}
                      <div className="bg-emerald-50/80 p-3.5 rounded-xl border border-emerald-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-emerald-950 flex items-center gap-1">
                            🌿 Parcela Horta Própria:
                          </span>
                          <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded-md">
                            Custo R$ 0,00 (Próprio)
                          </span>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-emerald-900 block">Quantidade da Horta ({mixedUnit}):</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Ex: 8.0"
                            value={mixedOwnQty}
                            onChange={(e) => setMixedOwnQty(e.target.value === '' ? '' : parseFloat(e.target.value))}
                            className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-black text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-right"
                          />
                        </div>
                      </div>

                      {/* Parcela 2: Terceiros Comprado */}
                      <div className="bg-amber-50/80 p-3.5 rounded-xl border border-amber-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-amber-950 flex items-center gap-1">
                            🛒 Parcela de Terceiros (Revenda):
                          </span>
                          <span className="text-[10px] text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded-md">
                            Compra Externa
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-amber-900 block">Qtd Comprada ({mixedUnit}):</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Ex: 7.0"
                              value={mixedThirdQty}
                              onChange={(e) => setMixedThirdQty(e.target.value === '' ? '' : parseFloat(e.target.value))}
                              className="w-full px-2.5 py-2 bg-white border border-amber-300 rounded-xl text-xs font-black text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500 text-right"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-amber-900 block">Custo Unitário R$:</label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-amber-800">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="Ex: 5.50"
                                value={mixedThirdCost}
                                onChange={(e) => setMixedThirdCost(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                className="w-full pl-6 pr-2 py-2 bg-white border border-amber-300 rounded-xl text-xs font-black text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500 text-right"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Botão de Adicionar Composição */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="text-xs font-bold text-purple-900">
                        Total da Composição:{' '}
                        <strong>
                          {((Number(mixedOwnQty) || 0) + (Number(mixedThirdQty) || 0)).toFixed(2)} {mixedUnit}
                        </strong>
                        {Number(mixedSalePrice) > 0 && (
                          <span className="text-purple-700 ml-2">
                            • Valor Total:{' '}
                            <strong>
                              R$ {(((Number(mixedOwnQty) || 0) + (Number(mixedThirdQty) || 0)) * Number(mixedSalePrice)).toFixed(2)}
                            </strong>
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleAddMixedItem}
                        className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black rounded-xl shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Plus size={14} /> Adicionar Composição ao Pedido
                      </button>
                    </div>
                  </div>
                )}

                {/* ========================================================================= */}
                {/* ABA 4: COMPRA LIVRE / PRÉ-SALVOS */}
                {/* ========================================================================= */}
                {productOriginTab === 'third_custom' && (
                  <div className="space-y-4">
                    {/* Formulário de Inserção Livre com Custo e Preço de Venda sem limites */}
                    <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80 space-y-3 shadow-2xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                          🛒 Adicionar Produto de Terceiro (Compra Externa / Revenda):
                        </span>
                        <span className="text-[11px] text-amber-800 font-bold">
                          Informe o preço cobrado do cliente e o custo real pago no fornecedor
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                        <div className="sm:col-span-4">
                          <label className="text-[10px] font-extrabold text-amber-900 block mb-0.5">Nome do Produto *:</label>
                          <input
                            type="text"
                            placeholder="Ex: Tomate Carmem, Morango..."
                            value={customItemName}
                            onChange={(e) => setCustomItemName(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-extrabold text-amber-900 block mb-0.5">Qtd Pedida:</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Ex: 5"
                              value={customItemQty}
                              onChange={(e) => setCustomItemQty(e.target.value === '' ? '' : parseFloat(e.target.value))}
                              className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black outline-none focus:ring-2 focus:ring-amber-500 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <select
                              value={customItemUnit}
                              onChange={(e) => setCustomItemUnit(e.target.value)}
                              className="px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
                            >
                              <option value="kg">kg</option>
                              <option value="un">un</option>
                              <option value="dz">dz</option>
                              <option value="pct">pct</option>
                              <option value="cx">cx</option>
                            </select>
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-extrabold text-amber-900 block mb-0.5">Custo Compra R$:</label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-800">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Ex: 15.50"
                              value={customItemCost}
                              onChange={(e) => setCustomItemCost(e.target.value === '' ? '' : parseFloat(e.target.value))}
                              className="w-full pl-7 pr-2 py-2 bg-white border border-amber-300 rounded-xl text-xs font-black text-amber-950 outline-none focus:ring-2 focus:ring-amber-500 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-extrabold text-amber-900 block mb-0.5">Preço Venda R$ *:</label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-800">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Ex: 25.00"
                              value={customItemPrice}
                              onChange={(e) => setCustomItemPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                              className="w-full pl-7 pr-2 py-2 bg-white border border-emerald-400 rounded-xl text-xs font-black text-emerald-950 outline-none focus:ring-2 focus:ring-emerald-500 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-2 flex items-end">
                          <button
                            type="button"
                            onClick={handleAddCustomThirdParty}
                            className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm h-[38px]"
                          >
                            <Plus size={14} /> Adicionar
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-amber-200/50">
                        <label className="flex items-center gap-2 text-xs font-bold text-amber-900 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={saveToPresets}
                            onChange={(e) => setSaveToPresets(e.target.checked)}
                            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-amber-300 rounded cursor-pointer"
                          />
                          <span>Salvar este item nos meus produtos pré-salvos para usar nos próximos pedidos</span>
                        </label>
                      </div>
                    </div>

                    {/* Sugestões e Pré-Salvos com Botão para Gerenciar / Editar / Excluir */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                          Produtos Pré-Salvos de Terceiros ({thirdPartyPresets.length} itens cadastrados):
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsPresetsManagerOpen(true)}
                          className="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                        >
                          <SlidersHorizontal size={13} /> Gerenciar / Editar / Excluir Pré-Salvos
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-2xl border border-slate-200">
                        {thirdPartyPresets.map((sug) => (
                          <div
                            key={sug.id}
                            className="group bg-white hover:border-amber-400 border border-slate-200 rounded-xl p-2 text-xs transition-all shadow-2xs flex items-center gap-2"
                          >
                            <button
                              type="button"
                              onClick={() => handleAddSuggestedThirdParty(sug)}
                              className="text-left flex items-center gap-2 cursor-pointer"
                              title="Clique para adicionar ao pedido com preço e custo padrão"
                            >
                              <div>
                                <span className="font-bold text-slate-800 block text-xs">{sug.name}</span>
                                <div className="flex items-center gap-2 text-[10px] mt-0.5">
                                  <span className="text-amber-800 font-bold">Custo: R$ {(sug.defaultCost || 0).toFixed(2)}</span>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-emerald-700 font-black">Venda: R$ {(sug.defaultPrice || 0).toFixed(2)}/{sug.unit || 'kg'}</span>
                                </div>
                              </div>
                              <div className="w-6 h-6 rounded-lg bg-amber-50 group-hover:bg-amber-600 group-hover:text-white text-amber-700 flex items-center justify-center transition-colors shrink-0">
                                <Plus size={13} />
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Remover "${sug.name}" dos produtos pré-salvos?`)) {
                                  handleDeletePreset(sug.id);
                                }
                              }}
                              className="w-5 h-5 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
                              title="Excluir produto pré-salvo"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

                {/* PASSO 3: TABELA DE ITENS SELECIONADOS NO PEDIDO */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-slate-700 tracking-wider">
                      3. Itens Selecionados no Pedido ({orderItems.length})
                    </span>
                    <span className="text-xs font-extrabold text-slate-600">
                      Peso Total: {orderSummary.totalKg.toFixed(2)} kg
                    </span>
                  </div>

                  {orderItems.length === 0 ? (
                    <div className="p-6 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs font-medium">
                      Nenhum produto adicionado ainda. Escolha produtos da horta ou de terceiros acima.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto p-1">
                      {orderItems.map((item, idx) => {
                        const isThird = item.source === 'third_party';
                        const itemCost = Number(item.cost || item.estimatedCost || 0);
                        const itemTotal = Number(item.quantity) * Number(item.price);
                        const itemTotalCost = Number(item.quantity) * itemCost;
                        const itemProfit = itemTotal - itemTotalCost;

                        return (
                          <div 
                            key={idx}
                            className={cn(
                              "p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs",
                              isThird ? "bg-amber-50/40 border-amber-200" : "bg-emerald-50/40 border-emerald-200"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                type="button"
                                onClick={() => {
                                  const nextSource = isThird ? 'own_production' : 'third_party';
                                  handleUpdateItemField(idx, 'source', nextSource);
                                  if (nextSource === 'own_production') {
                                    handleUpdateItemField(idx, 'cost', 0);
                                    handleUpdateItemField(idx, 'estimatedCost', 0);
                                    handleUpdateItemField(idx, 'purchased', true);
                                  } else {
                                    handleUpdateItemField(idx, 'purchased', false);
                                  }
                                }}
                                className={cn(
                                  "text-[10px] px-2 py-0.5 rounded-lg font-black uppercase tracking-wider cursor-pointer border transition-all",
                                  isThird 
                                    ? "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200" 
                                    : "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200"
                                )}
                                title="Clique para alternar entre Horta e Terceiro"
                              >
                                {isThird ? '🛒 Terceiro' : '🌿 Horta'}
                              </button>
                              <span className="font-bold text-slate-900 text-sm truncate">{item.name}</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                              {/* Quantidade e Unidade */}
                              <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-xl border border-slate-200">
                                <label className="text-[10px] font-extrabold text-slate-400">Qtd:</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.quantity}
                                  onChange={(e) => handleUpdateItemField(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                  className="w-20 text-xs font-black text-slate-800 outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <select
                                  value={item.unit || 'kg'}
                                  onChange={(e) => handleUpdateItemField(idx, 'unit', e.target.value)}
                                  className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 outline-none cursor-pointer"
                                >
                                  <option value="kg">kg</option>
                                  <option value="un">un</option>
                                  <option value="pct">pct</option>
                                  <option value="dz">dz</option>
                                  <option value="cx">cx</option>
                                </select>
                              </div>

                              {/* Preço de Custo (se for terceiro) */}
                              {isThird && (
                                <div className="flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-xl border-2 border-amber-400">
                                  <label className="text-[10px] font-black text-amber-900">Custo R$:</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={item.cost !== undefined ? item.cost : (item.estimatedCost || 0)}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                      handleUpdateItemField(idx, 'cost', val);
                                      handleUpdateItemField(idx, 'estimatedCost', val);
                                    }}
                                    placeholder="0.00"
                                    className="w-24 text-xs font-black text-amber-950 bg-white px-2 py-0.5 rounded border border-amber-300 outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                </div>
                              )}

                              {/* Preço de Venda */}
                              <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-xl border border-slate-200">
                                <label className="text-[10px] font-extrabold text-slate-400">Venda:</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.price}
                                  onChange={(e) => handleUpdateItemField(idx, 'price', parseFloat(e.target.value) || 0)}
                                  className="w-20 text-xs font-black text-emerald-700 outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </div>

                              {/* Subtotal */}
                              <div className="text-right min-w-[70px]">
                                <span className="text-xs font-black text-slate-900 block">R$ {itemTotal.toFixed(2)}</span>
                                {isThird && (
                                  <span className="text-[9px] font-extrabold text-emerald-600 block">+R$ {itemProfit.toFixed(2)}</span>
                                )}
                              </div>

                              {/* Remover */}
                              <button
                                type="button"
                                onClick={() => handleRemoveOrderItem(idx)}
                                className="w-7 h-7 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center transition-all cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              {/* PASSO 4: RESUMO FINANCEIRO E BOTÃO SALVAR */}
              <div className="bg-slate-900 text-white p-5 md:p-6 rounded-3xl space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Horta Própria</span>
                    <span className="text-base font-black text-emerald-400">{orderSummary.ownKg.toFixed(2)} kg</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Terceiros (Revenda)</span>
                    <span className="text-base font-black text-amber-400">{orderSummary.thirdPartyKg.toFixed(2)} kg</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Custo de Compra</span>
                    <span className="text-base font-black text-slate-300">R$ {orderSummary.totalCost.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Lucro Estimado</span>
                    <span className="text-base font-black text-emerald-300">R$ {orderSummary.profit.toFixed(2)} ({orderSummary.margin.toFixed(0)}%)</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs text-slate-400 block">Total a Cobrar do Cliente:</span>
                    <span className="text-2xl md:text-3xl font-black text-emerald-400">R$ {orderSummary.subtotal.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsNewOrderModalOpen(false)}
                      className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                    >
                      {saving ? 'Salvando...' : editingSale ? 'Salvar Alterações' : 'Confirmar Pedido por KG'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: LISTA CONSOLIDADA DE COMPRAS (ROMANEIO DE FORNECEDORES) ================= */}
      {isShoppingListModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-150 p-6 md:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 font-bold">
                  <ShoppingCart size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    Lista Consolidada de Compras (Ceasa / Fornecedores)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Soma automática de todos os produtos de terceiros que você precisa comprar para atender os pedidos.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsShoppingListModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {expenseSavedFeedback && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                <span>Despesa de compras lançada com sucesso no módulo Financeiro!</span>
              </div>
            )}

            {consolidatedShoppingList.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 space-y-2">
                <ShoppingCart size={36} className="mx-auto text-slate-300" />
                <p className="font-bold text-sm text-slate-700">Nenhum item de terceiros para comprar</p>
                <p className="text-xs">Não há pedidos pendentes com mercadorias de compras externas no período filtrado.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-slate-500 tracking-wider">
                    Produtos Necessários ({consolidatedShoppingList.length} variedades)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyShoppingListToWhatsApp}
                      className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      {copiedMessageId === 'shopping_list' ? (
                        <>
                          <Check size={14} /> Copiado p/ WhatsApp!
                        </>
                      ) : (
                        <>
                          <Copy size={14} /> Copiar Lista p/ Celular
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 max-h-[420px] overflow-y-auto p-1">
                  {consolidatedShoppingList.map((prod, idx) => {
                    const normKey = normalizeProductName(prod.name);
                    const currentCost = shoppingListCosts[normKey] !== undefined 
                      ? shoppingListCosts[normKey] 
                      : (prod.totalQuantity > 0 ? prod.totalEstimatedCost / prod.totalQuantity : 0);
                    const isFeedback = costUpdatedFeedbackKey === normKey;
                    const itemTotalCost = prod.totalQuantity * currentCost;

                    return (
                      <div 
                        key={idx}
                        className={cn(
                          "p-4 rounded-2xl border transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4",
                          prod.allPurchased ? "bg-slate-50 border-slate-200 opacity-85" : "bg-white border-amber-200 shadow-2xs"
                        )}
                      >
                        {/* 1. Nome do Produto e Pedidos dos Clientes */}
                        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => handleToggleConsolidatedProduct(prod.name, prod.orders, !prod.allPurchased)}
                            className={cn(
                              "w-7 h-7 rounded-xl flex items-center justify-center transition-all shrink-0 cursor-pointer mt-0.5 sm:mt-0",
                              prod.allPurchased ? "bg-emerald-600 text-white shadow-sm" : "border-2 border-slate-300 bg-white hover:border-amber-500"
                            )}
                            title={prod.allPurchased ? "Mercadoria comprada" : "Marcar como comprado"}
                          >
                            {prod.allPurchased && <Check size={16} className="stroke-[3]" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn("text-base font-black truncate", prod.allPurchased ? "line-through text-slate-400" : "text-slate-900")}>
                                {prod.name}
                              </span>
                              {prod.allPurchased ? (
                                <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                  Comprado
                                </span>
                              ) : (
                                <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                                  A Comprar
                                </span>
                              )}
                              {isFeedback && (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-300 animate-pulse">
                                  ✓ Custo salvo nos pedidos!
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 block truncate mt-0.5">
                              Clientes: {prod.orders.map(o => `${o.customerName} (${o.quantity.toFixed(1)}${prod.unit})`).join(', ')}
                            </span>
                          </div>
                        </div>

                        {/* 2. Quantidade e Valor que Estou Pagando no Produto */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                          {/* Quantidade a Comprar */}
                          <div className="text-left sm:text-right bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 min-w-[90px]">
                            <span className="text-[10px] font-bold text-slate-400 block uppercase">Quantidade:</span>
                            <span className="text-sm font-black text-slate-800">
                              {prod.totalQuantity.toFixed(2)} {prod.unit}
                            </span>
                          </div>

                          {/* Valor que estou pagando no produto */}
                          <div className="flex items-center gap-2 bg-amber-50/90 px-3 py-1.5 rounded-xl border-2 border-amber-300">
                            <div>
                              <label className="text-[10px] font-black text-amber-900 block leading-tight">
                                Valor que estou pagando (R$/{prod.unit}):
                              </label>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-xs font-black text-amber-800">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={currentCost || ''}
                                  placeholder="0.00"
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                    setShoppingListCosts({
                                      ...shoppingListCosts,
                                      [normKey]: val
                                    });
                                  }}
                                  className="w-24 px-2 py-0.5 bg-white border border-amber-300 rounded font-black text-xs text-slate-900 outline-none text-right focus:ring-1 focus:ring-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleUpdateConsolidatedProductCost(prod.name, currentCost)}
                              className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                              title="Salvar valor pago neste produto"
                            >
                              <Save size={12} /> Salvar
                            </button>
                          </div>

                          {/* Total Pago */}
                          <div className="text-right min-w-[95px]">
                            <span className="text-[10px] font-bold text-slate-400 block uppercase">Total Pago:</span>
                            <span className="text-sm font-black text-amber-900 block">
                              R$ {itemTotalCost.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* RODAPÉ DO MODAL DE COMPRAS */}
                <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs text-slate-400 block">Custo Total Previsto das Compras:</span>
                    <span className="text-2xl font-black text-amber-400">
                      R$ {consolidatedShoppingList.reduce((acc, p) => acc + p.totalEstimatedCost, 0).toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={handleRecordThirdPartyExpense}
                    disabled={saving}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <DollarSign size={16} />
                    Lançar Despesa no Financeiro
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: GERENCIAMENTO DE PRODUTOS PRÉ-SALVOS ================= */}
      {isPresetsManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-150 p-6 md:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 font-bold">
                  <SlidersHorizontal size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    Gerenciar Produtos Pré-Salvos (Terceiros / Revenda)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Edite os custos de compra e preços de venda padrão, exclua itens antigos ou cadastre novos produtos.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPresetsManagerOpen(false);
                  setEditingPresetId(null);
                  setEditingPresetData(null);
                }}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Formulário: Cadastrar Novo Pré-Salvo */}
            <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4 space-y-3">
              <span className="text-xs font-black uppercase text-amber-950 tracking-wider block">
                + Cadastrar Novo Produto Pré-Salvo:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-4">
                  <label className="text-[10px] font-extrabold text-amber-900 block mb-0.5">Nome do Produto:</label>
                  <input
                    type="text"
                    placeholder="Ex: Pimentão Amarelo"
                    value={newPresetForm.name}
                    onChange={(e) => setNewPresetForm({ ...newPresetForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-extrabold text-amber-900 block mb-0.5">Custo R$:</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-800">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Ex: 12.00"
                      value={newPresetForm.defaultCost}
                      onChange={(e) => setNewPresetForm({
                        ...newPresetForm,
                        defaultCost: e.target.value === '' ? '' : parseFloat(e.target.value)
                      })}
                      className="w-full pl-7 pr-2 py-2 bg-white border border-amber-300 rounded-xl text-xs font-black text-amber-950 outline-none focus:ring-2 focus:ring-amber-500 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-extrabold text-amber-900 block mb-0.5">Venda R$:</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-800">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Ex: 24.00"
                      value={newPresetForm.defaultPrice}
                      onChange={(e) => setNewPresetForm({
                        ...newPresetForm,
                        defaultPrice: e.target.value === '' ? '' : parseFloat(e.target.value)
                      })}
                      className="w-full pl-7 pr-2 py-2 bg-white border border-emerald-400 rounded-xl text-xs font-black text-emerald-950 outline-none focus:ring-2 focus:ring-emerald-500 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-extrabold text-amber-900 block mb-0.5">Unidade:</label>
                  <select
                    value={newPresetForm.unit}
                    onChange={(e) => setNewPresetForm({ ...newPresetForm, unit: e.target.value })}
                    className="w-full px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer h-[38px]"
                  >
                    <option value="kg">kg</option>
                    <option value="un">un</option>
                    <option value="dz">dz</option>
                    <option value="pct">pct</option>
                    <option value="cx">cx</option>
                  </select>
                </div>
                <div className="sm:col-span-2 flex items-end">
                  <button
                    type="button"
                    onClick={handleAddPreset}
                    disabled={!newPresetForm.name.trim()}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm h-[38px] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus size={14} /> Salvar
                  </button>
                </div>
              </div>
            </div>

            {/* Barra de Busca e Restaurar Padrões */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar produto pré-salvo..."
                  value={presetSearch}
                  onChange={(e) => setPresetSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
                {presetSearch && (
                  <button
                    type="button"
                    onClick={() => setPresetSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleResetPresetsToDefault}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                title="Restaura a lista inicial de sugestões de fábrica"
              >
                <RotateCcw size={13} /> Restaurar Padrões de Fábrica
              </button>
            </div>

            {/* Lista de Produtos Cadastrados */}
            <div className="space-y-2 max-h-96 overflow-y-auto p-1">
              {thirdPartyPresets
                .filter(p => p.name.toLowerCase().includes(presetSearch.toLowerCase().trim()))
                .map((preset) => {
                  const isEditing = editingPresetId === preset.id;
                  const unitCost = Number(preset.defaultCost) || 0;
                  const unitPrice = Number(preset.defaultPrice) || 0;
                  const unitProfit = unitPrice - unitCost;
                  const profitMargin = unitPrice > 0 ? (unitProfit / unitPrice) * 100 : 0;

                  if (isEditing && editingPresetData) {
                    return (
                      <div
                        key={preset.id}
                        className="p-3 bg-amber-50/80 border-2 border-amber-400 rounded-2xl space-y-2 shadow-xs"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <div className="sm:col-span-4">
                            <label className="text-[10px] font-bold text-amber-900 block mb-0.5">Nome:</label>
                            <input
                              type="text"
                              value={editingPresetData.name}
                              onChange={(e) => setEditingPresetData({ ...editingPresetData, name: e.target.value })}
                              className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-900 outline-none"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-[10px] font-bold text-amber-900 block mb-0.5">Custo R$:</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editingPresetData.defaultCost}
                              onChange={(e) => setEditingPresetData({
                                ...editingPresetData,
                                defaultCost: parseFloat(e.target.value) || 0
                              })}
                              className="w-full px-2 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-black text-amber-950 outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-[10px] font-bold text-amber-900 block mb-0.5">Venda R$:</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editingPresetData.defaultPrice}
                              onChange={(e) => setEditingPresetData({
                                ...editingPresetData,
                                defaultPrice: parseFloat(e.target.value) || 0
                              })}
                              className="w-full px-2 py-1.5 bg-white border border-emerald-400 rounded-lg text-xs font-black text-emerald-950 outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-[10px] font-bold text-amber-900 block mb-0.5">Unidade:</label>
                            <select
                              value={editingPresetData.unit}
                              onChange={(e) => setEditingPresetData({ ...editingPresetData, unit: e.target.value })}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none cursor-pointer"
                            >
                              <option value="kg">kg</option>
                              <option value="un">un</option>
                              <option value="dz">dz</option>
                              <option value="pct">pct</option>
                              <option value="cx">cx</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2 flex items-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                handleUpdatePreset(preset.id, editingPresetData);
                                setEditingPresetId(null);
                                setEditingPresetData(null);
                              }}
                              className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                            >
                              <Save size={13} /> Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPresetId(null);
                                setEditingPresetData(null);
                              }}
                              className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={preset.id}
                      className="p-3 bg-white border border-slate-200 hover:border-amber-300 rounded-2xl flex items-center justify-between gap-3 shadow-2xs transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{preset.name}</span>
                          <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            {preset.unit || 'kg'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                          <span className="text-amber-900 font-extrabold">
                            Custo de Compra: <strong className="text-amber-950 font-black">R$ {unitCost.toFixed(2)}</strong>/{preset.unit || 'kg'}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-emerald-700 font-extrabold">
                            Preço de Venda: <strong className="text-emerald-900 font-black">R$ {unitPrice.toFixed(2)}</strong>/{preset.unit || 'kg'}
                          </span>
                          {unitPrice > 0 && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-600 font-semibold">
                                Margem: <strong className="text-emerald-600 font-bold">{profitMargin.toFixed(0)}%</strong> (Lucro R$ {unitProfit.toFixed(2)})
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPresetId(preset.id);
                            setEditingPresetData({
                              name: preset.name,
                              defaultCost: preset.defaultCost || 0,
                              defaultPrice: preset.defaultPrice || 0,
                              unit: preset.unit || 'kg'
                            });
                          }}
                          className="px-2.5 py-1.5 bg-slate-50 hover:bg-amber-50 hover:text-amber-900 text-slate-600 rounded-xl text-xs font-bold border border-slate-200 flex items-center gap-1 transition-all cursor-pointer"
                          title="Editar nome, custo ou preço"
                        >
                          <Edit2 size={13} /> Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Tem certeza que deseja excluir "${preset.name}" da lista de pré-salvos?`)) {
                              handleDeletePreset(preset.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                          title="Excluir produto pré-salvo"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}

              {thirdPartyPresets.filter(p => p.name.toLowerCase().includes(presetSearch.toLowerCase().trim())).length === 0 && (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                  Nenhum produto pré-salvo encontrado para "{presetSearch}". Cadastre um novo produto acima.
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Total de produtos cadastrados: <strong className="text-slate-700">{thirdPartyPresets.length}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsPresetsManagerOpen(false);
                  setEditingPresetId(null);
                  setEditingPresetData(null);
                }}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl transition-all cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CONFERÊNCIA DE BALANÇA & PESAGEM REAL ================= */}
      {isWeighingModalOpen && selectedSaleForWeighing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-150 p-6 md:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 font-bold">
                  <Scale size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    Conferência de Balança (Pesagem Real)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cliente: <b className="text-slate-700">{selectedSaleForWeighing.customerName}</b> ({selectedSaleForWeighing.saleNumber})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsWeighingModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-black uppercase text-slate-400 tracking-wider block">
                Ajuste o peso exato medido na balança:
              </span>

              <div className="space-y-2">
                {selectedSaleForWeighing.items.map((item, idx) => {
                  const currentVal = weighingInputs[idx] !== undefined ? weighingInputs[idx] : item.quantity;
                  const price = Number(item.price) || 0;
                  const currentSubtotal = currentVal * price;

                  return (
                    <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <span className="font-black text-slate-800 text-sm block truncate">{item.name}</span>
                        <span className="text-[10px] text-slate-400 block">
                          Preço: R$ {price.toFixed(2)}/{item.unit || 'kg'} | Solicitado: {item.originalRequestedQty || item.quantity} {item.unit || 'kg'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-300">
                          <Scale size={14} className="text-emerald-600" />
                          <input
                            type="number"
                            step="0.01"
                            value={currentVal}
                            onChange={(e) => setWeighingInputs({
                              ...weighingInputs,
                              [idx]: parseFloat(e.target.value) || 0
                            })}
                            className="w-16 font-black text-slate-900 text-xs text-right outline-none"
                          />
                          <span className="text-xs font-bold text-slate-400">{item.unit || 'kg'}</span>
                        </div>

                        <span className="font-black text-sm text-emerald-700 min-w-[70px] text-right block">
                          R$ {currentSubtotal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-900 text-white p-5 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">Novo Total Recalculado:</span>
                <span className="text-2xl font-black text-emerald-400">
                  R$ {selectedSaleForWeighing.items.reduce((acc, item, idx) => {
                    const q = weighingInputs[idx] !== undefined ? weighingInputs[idx] : item.quantity;
                    return acc + (q * (item.price || 0));
                  }, 0).toFixed(2)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsWeighingModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveWeighing}
                  disabled={saving}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Confirmar Pesagem'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
